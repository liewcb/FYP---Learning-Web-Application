-- Library workflow (submission, moderation, counters)
--
-- A submission keeps its own private copy of the file in `library-materials`,
-- so the source document can later be deleted from My Documents without being
-- blocked by a library submission.

-- 1. Source document becomes optional (set null when the document is deleted).
alter table public.library_materials
  alter column source_document_id drop not null;

alter table public.library_materials
  drop constraint if exists library_materials_source_document_id_fkey;

alter table public.library_materials
  add constraint library_materials_source_document_id_fkey
  foreign key (source_document_id)
  references public.documents (id)
  on delete set null;

create or replace function private.check_library_material_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The source document may have been deleted since the submission.
  if new.source_document_id is null then
    return new;
  end if;

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

-- 2. One active (pending or published) submission per source document,
--    plus indexes for foreign keys.
create unique index if not exists library_materials_active_source_key
on public.library_materials (source_document_id)
where source_document_id is not null
  and status in ('pending_review', 'published');

create index if not exists library_materials_source_document_idx
on public.library_materials (source_document_id)
where source_document_id is not null;

create index if not exists library_materials_reviewed_by_idx
on public.library_materials (reviewed_by)
where reviewed_by is not null;

create index if not exists library_material_events_actor_idx
on public.library_material_events (actor_id)
where actor_id is not null;

create index if not exists admin_audit_events_actor_idx
on public.admin_audit_events (actor_id)
where actor_id is not null;

-- 3. Events remember the status change, so students can see their history.
alter table public.library_material_events
  add column if not exists from_status text,
  add column if not exists to_status text;

-- 4. Only real changes are logged. View and download counters are not.
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
  v_from text;
  v_to text := new.status;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'submitted';
    v_action := 'library_material_submitted';
  elsif new.status is distinct from old.status then
    v_event_type := 'status_changed';
    v_from := old.status;
    v_action := case new.status
      when 'published' then 'library_material_approved'
      when 'rejected' then 'library_material_rejected'
      when 'archived' then 'library_material_archived'
      else 'library_material_status_changed'
    end;
  elsif row(new.title, new.description, new.subject_name, new.module_code, new.tags)
        is distinct from
        row(old.title, old.description, old.subject_name, old.module_code, old.tags) then
    v_event_type := 'metadata_updated';
    v_action := 'library_material_metadata_updated';
  else
    -- Counters, storage fields or a deleted source document: nothing to log.
    return null;
  end if;

  insert into public.library_material_events (
    material_id, actor_id, event_type, from_status, to_status, note
  )
  values (
    new.id,
    v_actor,
    v_event_type,
    v_from,
    v_to,
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
      'previous_status', v_from,
      'source_document_id', new.source_document_id,
      'submitted_by', new.submitted_by
    )
  );

  return null;
end;
$$;

revoke execute on function private.log_library_material_change() from public, anon, authenticated;

-- 5. Counters. Only published materials count, and only signed-in users.
create or replace function public.record_library_view(p_material bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.library_materials
  set view_count = view_count + 1
  where id = p_material
    and status = 'published'
    and visibility_scope = 'authenticated'
    and (select auth.uid()) is not null;
$$;

create or replace function public.record_library_download(p_material bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.library_materials
  set download_count = download_count + 1
  where id = p_material
    and status = 'published'
    and visibility_scope = 'authenticated'
    and (select auth.uid()) is not null;
$$;

revoke execute on function public.record_library_view(bigint) from public, anon;
revoke execute on function public.record_library_download(bigint) from public, anon;
grant execute on function public.record_library_view(bigint) to authenticated;
grant execute on function public.record_library_download(bigint) to authenticated;