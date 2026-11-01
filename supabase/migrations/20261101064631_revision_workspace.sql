-- Revision workspace (dashboard, step 1)
--
-- Students group their documents into subjects, read the extracted text,
-- highlight passages, write notes linked to a passage and keep their reading
-- position. Everything here belongs to one student and is private to them.
--
-- Passages are referenced by the sentence index already stored in
-- document_contents.sentences, so no copy of the document text is kept apart
-- from the short quote saved with a note.

create table public.study_subjects (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  colour text not null default 'navy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_subjects_name_length_check check (char_length(btrim(name)) between 1 and 60),
  constraint study_subjects_colour_check check (
    colour in ('navy', 'gold', 'green', 'blue', 'red', 'purple')
  )
);

create unique index study_subjects_owner_name_key
on public.study_subjects (owner_id, lower(btrim(name)));

create trigger study_subjects_set_updated_at
before update on public.study_subjects
for each row execute function private.set_updated_at();

alter table public.documents
  add column subject_id bigint references public.study_subjects (id) on delete set null;

create index documents_subject_idx
on public.documents (subject_id)
where subject_id is not null;

create table public.study_notes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  subject_id bigint references public.study_subjects (id) on delete set null,
  document_id bigint references public.documents (id) on delete set null,
  sentence_index integer,
  quote text,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_notes_title_length_check check (char_length(title) <= 200),
  constraint study_notes_body_length_check check (char_length(body) <= 20000),
  constraint study_notes_quote_length_check check (quote is null or char_length(quote) <= 1000),
  constraint study_notes_sentence_index_check check (sentence_index is null or sentence_index >= 0)
);

create index study_notes_owner_updated_idx on public.study_notes (owner_id, updated_at desc);
create index study_notes_subject_idx on public.study_notes (subject_id) where subject_id is not null;
create index study_notes_document_idx on public.study_notes (document_id) where document_id is not null;

create trigger study_notes_set_updated_at
before update on public.study_notes
for each row execute function private.set_updated_at();

create table public.study_highlights (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  document_id bigint not null references public.documents (id) on delete cascade,
  sentence_index integer not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, document_id, sentence_index),
  constraint study_highlights_sentence_index_check check (sentence_index >= 0)
);

create index study_highlights_document_idx on public.study_highlights (document_id);

create table public.reading_progress (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  document_id bigint not null references public.documents (id) on delete cascade,
  -- Where the student stopped (to resume) and how far they have ever read.
  last_sentence integer not null default 0,
  furthest_sentence integer not null default 0,
  sentence_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, document_id),
  constraint reading_progress_positions_check check (
    last_sentence >= 0 and furthest_sentence >= 0 and sentence_count >= 1
  )
);

create index reading_progress_document_idx on public.reading_progress (document_id);
create index reading_progress_owner_updated_idx on public.reading_progress (owner_id, updated_at desc);

-- One row per day a student revised (read, highlighted or wrote a note), in
-- Malaysian time. The dashboard's streak is counted from these rows.
create table public.study_activity (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (owner_id, day)
);

alter table public.study_subjects enable row level security;
alter table public.study_notes enable row level security;
alter table public.study_highlights enable row level security;
alter table public.reading_progress enable row level security;
alter table public.study_activity enable row level security;

create policy study_subjects_owner_select
on public.study_subjects for select to authenticated
using ((select auth.uid()) = owner_id);

create policy study_subjects_owner_insert
on public.study_subjects for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy study_subjects_owner_update
on public.study_subjects for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy study_subjects_owner_delete
on public.study_subjects for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy study_notes_owner_select
on public.study_notes for select to authenticated
using ((select auth.uid()) = owner_id);

create policy study_notes_owner_insert
on public.study_notes for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy study_notes_owner_update
on public.study_notes for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy study_notes_owner_delete
on public.study_notes for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy study_highlights_owner_select
on public.study_highlights for select to authenticated
using ((select auth.uid()) = owner_id);

create policy study_highlights_owner_insert
on public.study_highlights for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.documents d
    where d.id = document_id and d.owner_id = (select auth.uid())
  )
);

create policy study_highlights_owner_delete
on public.study_highlights for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy reading_progress_owner_select
on public.reading_progress for select to authenticated
using ((select auth.uid()) = owner_id);

create policy study_activity_owner_select
on public.study_activity for select to authenticated
using ((select auth.uid()) = owner_id);

revoke all on
  public.study_subjects,
  public.study_notes,
  public.study_highlights,
  public.reading_progress,
  public.study_activity
from anon, authenticated;

grant select, delete on public.study_subjects to authenticated;
grant insert (owner_id, name, colour) on public.study_subjects to authenticated;
grant update (name, colour) on public.study_subjects to authenticated;

grant select, delete on public.study_notes to authenticated;
grant insert (owner_id, subject_id, document_id, sentence_index, quote, title, body)
on public.study_notes to authenticated;
grant update (subject_id, title, body) on public.study_notes to authenticated;

grant select, delete on public.study_highlights to authenticated;
grant insert (owner_id, document_id, sentence_index) on public.study_highlights to authenticated;

-- Reading progress and activity are written only by the functions below.
grant select on public.reading_progress, public.study_activity to authenticated;

grant select, insert, update, delete on
  public.study_subjects,
  public.study_notes,
  public.study_highlights,
  public.reading_progress,
  public.study_activity
to service_role;

grant usage, select on sequence
  public.study_subjects_id_seq,
  public.study_notes_id_seq
to authenticated, service_role;

-- A document or note may only point at the same student's subject and
-- documents. Row-level security alone would not stop an id from someone else.
create or replace function private.check_document_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_id is not null and not exists (
    select 1 from public.study_subjects s
    where s.id = new.subject_id and s.owner_id = new.owner_id
  ) then
    raise exception 'Subject % does not belong to this student.', new.subject_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.check_study_note_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_id is not null and not exists (
    select 1 from public.study_subjects s
    where s.id = new.subject_id and s.owner_id = new.owner_id
  ) then
    raise exception 'Subject % does not belong to this student.', new.subject_id
      using errcode = '42501';
  end if;

  if new.document_id is not null and not exists (
    select 1 from public.documents d
    where d.id = new.document_id and d.owner_id = new.owner_id
  ) then
    raise exception 'Document % does not belong to this student.', new.document_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_document_subject() from public, anon, authenticated;
revoke execute on function private.check_study_note_links() from public, anon, authenticated;

create trigger documents_check_subject
before insert or update of subject_id on public.documents
for each row execute function private.check_document_subject();

create trigger study_notes_check_links
before insert or update of subject_id, document_id on public.study_notes
for each row execute function private.check_study_note_links();

create or replace function private.record_study_activity(p_owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.study_activity (owner_id, day)
  values (p_owner, (now() at time zone 'Asia/Kuala_Lumpur')::date)
  on conflict do nothing;
$$;

revoke execute on function private.record_study_activity(uuid) from public, anon, authenticated;

create or replace function private.track_study_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_study_activity(new.owner_id);
  return null;
end;
$$;

revoke execute on function private.track_study_activity() from public, anon, authenticated;

-- Only writing counts, not the note losing its link when a document is deleted.
create trigger study_notes_track_activity
after insert or update of title, body on public.study_notes
for each row execute function private.track_study_activity();

create trigger study_highlights_track_activity
after insert on public.study_highlights
for each row execute function private.track_study_activity();

-- Saves where the student is in a document and returns the percentage read,
-- or null when the document is not theirs or has no extracted text yet.
create or replace function public.record_reading_progress(
  p_document bigint,
  p_sentence integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
  v_sentence integer;
  v_percent integer;
begin
  if v_me is null or not exists (
    select 1 from public.documents d
    where d.id = p_document and d.owner_id = v_me
  ) then
    return null;
  end if;

  select jsonb_array_length(c.sentences) into v_count
  from public.document_contents c
  where c.document_id = p_document;

  if v_count is null or v_count = 0 then
    return null;
  end if;

  v_sentence := least(greatest(coalesce(p_sentence, 0), 0), v_count - 1);

  insert into public.reading_progress as rp (
    owner_id, document_id, last_sentence, furthest_sentence, sentence_count
  )
  values (v_me, p_document, v_sentence, v_sentence, v_count)
  on conflict (owner_id, document_id) do update
  set
    last_sentence = excluded.last_sentence,
    furthest_sentence = greatest(rp.furthest_sentence, excluded.furthest_sentence),
    sentence_count = excluded.sentence_count,
    updated_at = now()
  returning least(100, ((rp.furthest_sentence + 1) * 100) / rp.sentence_count)
  into v_percent;

  perform private.record_study_activity(v_me);

  return v_percent;
end;
$$;

revoke execute on function public.record_reading_progress(bigint, integer) from public, anon;
grant execute on function public.record_reading_progress(bigint, integer) to authenticated;
