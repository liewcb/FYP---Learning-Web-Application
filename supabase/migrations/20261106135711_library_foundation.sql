-- Shared learning library foundation
--
-- Personal documents remain private in `learning-materials`. A student can
-- submit one ready personal document for review, but it is not visible in the
-- shared Library until an administrator publishes it. Published copies will
-- later live in the private `library-materials` bucket and be served through
-- short-lived signed URLs by trusted server code.

create table public.library_materials (
  id bigint generated always as identity primary key,
  source_document_id bigint not null
    references public.documents (id) on delete restrict,
  submitted_by uuid not null
    references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  subject_name text not null,
  module_code text,
  tags text[] not null default '{}'::text[],
  status text not null default 'pending_review',
  visibility_scope text not null default 'authenticated',
  -- These fields stay null while a material is waiting for review. They are
  -- populated by an administrator once a moderation decision is made.
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  -- The private Library copy is intentionally optional during phase 1. The
  -- publish action in the next phase will copy the approved source file here.
  storage_path text unique,
  file_name text,
  mime_type text,
  size_bytes bigint,
  view_count integer not null default 0,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_materials_title_length_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint library_materials_description_length_check
    check (char_length(description) <= 4000),
  constraint library_materials_subject_name_length_check
    check (char_length(btrim(subject_name)) between 1 and 120),
  constraint library_materials_module_code_length_check
    check (module_code is null or char_length(btrim(module_code)) between 1 and 40),
  constraint library_materials_tags_count_check
    check (cardinality(tags) <= 10),
  constraint library_materials_status_check
    check (status in ('draft', 'pending_review', 'published', 'rejected', 'archived')),
  constraint library_materials_visibility_scope_check
    check (visibility_scope in ('authenticated', 'connections')),
  constraint library_materials_review_note_length_check
    check (review_note is null or char_length(review_note) <= 2000),
  constraint library_materials_published_review_check
    check (
      status <> 'published'
      or (reviewed_by is not null and reviewed_at is not null and published_at is not null)
    ),
  constraint library_materials_storage_metadata_check
    check (
      (storage_path is null and file_name is null and mime_type is null and size_bytes is null)
      or (
        storage_path is not null
        and char_length(file_name) between 1 and 255
        and mime_type in (
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        and size_bytes between 1 and 26214400
      )
    ),
  constraint library_materials_view_count_check check (view_count >= 0),
  constraint library_materials_download_count_check check (download_count >= 0)
);

create index library_materials_published_created_idx
on public.library_materials (published_at desc, id desc)
where status = 'published' and visibility_scope = 'authenticated';

create index library_materials_submitter_created_idx
on public.library_materials (submitted_by, created_at desc);

create index library_materials_pending_created_idx
on public.library_materials (created_at asc)
where status = 'pending_review';

create index library_materials_subject_published_idx
on public.library_materials (subject_name, published_at desc)
where status = 'published';

create trigger library_materials_set_updated_at
before update on public.library_materials
for each row execute function private.set_updated_at();

-- A student must only submit a document that they own and whose text
-- extraction has completed. This trigger still protects the data if a caller
-- bypasses the normal Next.js form and uses the Data API directly.
create or replace function private.check_library_material_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.documents document
    where document.id = new.source_document_id
      and document.owner_id = new.submitted_by
      and document.status = 'ready'
  ) then
    raise exception 'A library submission must reference a ready document owned by its submitter.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_library_material_source() from public, anon, authenticated;

create trigger library_materials_check_source
before insert or update of source_document_id, submitted_by
on public.library_materials
for each row execute function private.check_library_material_source();

-- History is append-only. It gives the student a transparent record of the
-- submission and gives administrators a compact moderation timeline.
create table public.library_material_events (
  id bigint generated always as identity primary key,
  material_id bigint not null
    references public.library_materials (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint library_material_events_type_check
    check (event_type in ('submitted', 'status_changed', 'metadata_updated')),
  constraint library_material_events_note_length_check
    check (note is null or char_length(note) <= 2000)
);

create index library_material_events_material_created_idx
on public.library_material_events (material_id, created_at desc);

-- The general audit log is deliberately separate from material history. It
-- will also be reused by User Management and Forum Moderation later.
create table public.admin_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_events_action_length_check
    check (char_length(btrim(action)) between 1 and 100),
  constraint admin_audit_events_entity_type_length_check
    check (char_length(btrim(entity_type)) between 1 and 100),
  constraint admin_audit_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index admin_audit_events_created_idx
on public.admin_audit_events (created_at desc, id desc);

create index admin_audit_events_entity_idx
on public.admin_audit_events (entity_type, entity_id, created_at desc);

-- Triggers write the immutable history so students never need permission to
-- insert audit rows directly. auth.uid() remains available inside the
-- function and is recorded when a request is made through an authenticated
-- session; trusted server jobs fall back to the reviewer or submitter.
create or replace function private.log_library_material_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.reviewed_by, new.submitted_by);
  v_event_type text;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'submitted';
    v_action := 'library_material_submitted';
  elsif new.status is distinct from old.status then
    v_event_type := 'status_changed';
    v_action := 'library_material_status_changed';
  else
    v_event_type := 'metadata_updated';
    v_action := 'library_material_metadata_updated';
  end if;

  insert into public.library_material_events (material_id, actor_id, event_type, note)
  values (
    new.id,
    v_actor,
    v_event_type,
    case when v_event_type = 'status_changed' then new.review_note else null end
  );

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    v_action,
    'library_material',
    new.id,
    jsonb_build_object(
      'status', new.status,
      'source_document_id', new.source_document_id,
      'submitted_by', new.submitted_by
    )
  );

  return null;
end;
$$;

revoke execute on function private.log_library_material_change() from public, anon, authenticated;

create trigger library_materials_log_change
after insert or update on public.library_materials
for each row execute function private.log_library_material_change();

alter table public.library_materials enable row level security;
alter table public.library_material_events enable row level security;
alter table public.admin_audit_events enable row level security;

-- Students can browse published materials and see their own submissions.
-- Administrators can see every row; the role is stored in profiles rather
-- than in mutable user metadata.
create policy library_materials_read
on public.library_materials
for select
to authenticated
using (
  (
    status = 'published'
    and visibility_scope = 'authenticated'
  )
  or submitted_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

-- A student can create a pending submission only from their own ready source
-- document. No client-side policy allows a student to publish or review it.
create policy library_materials_submitter_insert
on public.library_materials
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending_review'
  and visibility_scope = 'authenticated'
  and exists (
    select 1
    from public.documents document
    where document.id = source_document_id
      and document.owner_id = (select auth.uid())
      and document.status = 'ready'
  )
);

create policy library_materials_admin_update
on public.library_materials
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

create policy library_material_events_read
on public.library_material_events
for select
to authenticated
using (
  exists (
    select 1
    from public.library_materials material
    where material.id = library_material_events.material_id
      and (
        material.submitted_by = (select auth.uid())
        or exists (
          select 1
          from public.profiles profile
          where profile.id = (select auth.uid())
            and profile.role = 'admin'
        )
      )
  )
);

create policy admin_audit_events_admin_read
on public.admin_audit_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

-- Explicit grants are required for newly created public tables. All writing
-- not listed here is limited to trusted server code or the audit triggers.
revoke all on
  public.library_materials,
  public.library_material_events,
  public.admin_audit_events
from anon, authenticated;

grant select on public.library_materials to authenticated;
grant insert (source_document_id, submitted_by, title, description, subject_name, module_code, tags)
on public.library_materials to authenticated;
grant update (status, reviewed_by, review_note, reviewed_at, published_at, archived_at, updated_at)
on public.library_materials to authenticated;

grant select on public.library_material_events to authenticated;
grant select on public.admin_audit_events to authenticated;

grant usage, select on sequence
  public.library_materials_id_seq,
  public.library_material_events_id_seq,
  public.admin_audit_events_id_seq
to authenticated;

grant select, insert, update, delete on
  public.library_materials,
  public.library_material_events,
  public.admin_audit_events
to service_role;

grant usage, select on sequence
  public.library_materials_id_seq,
  public.library_material_events_id_seq,
  public.admin_audit_events_id_seq
to service_role;

-- This remains private even after a material is published. The next phase
-- will use a trusted server route to issue expiring signed URLs after it has
-- checked the material's published status.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'library-materials',
  'library-materials',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
