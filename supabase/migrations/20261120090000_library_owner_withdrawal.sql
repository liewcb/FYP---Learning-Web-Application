-- Library: authors can remove their own materials.
--
-- A student who submitted a material can withdraw it while it is pending
-- review, remove it after it was published, or clear away a rejected one.
-- The status becomes 'withdrawn' (separate from an administrator's
-- 'archived'), the library's private file copy is deleted by the server, and
-- the row stays as a record so history, download totals, reports and the
-- audit log remain correct. Sharing it again means a new submission, which is
-- reviewed again. The student's own document in My Documents is not touched.

-- 1. New status and the author's optional reason.
alter table public.library_materials
  drop constraint library_materials_status_check;

alter table public.library_materials
  add constraint library_materials_status_check
  check (status in ('draft', 'pending_review', 'published', 'rejected', 'archived', 'withdrawn'));

alter table public.library_materials
  add column withdrawn_at timestamptz,
  add column withdrawal_reason text;

alter table public.library_materials
  add constraint library_materials_withdrawal_reason_length_check
  check (withdrawal_reason is null or char_length(withdrawal_reason) <= 500);

alter table public.library_materials
  add constraint library_materials_withdrawn_check
  check (status <> 'withdrawn' or (withdrawn_at is not null and storage_path is null));

-- 2. History and audit log name the new action and record the author's reason
--    instead of the earlier moderator note. Otherwise unchanged from
--    20261112161232_library_audit_details.sql.
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
  v_note text;
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
      when 'withdrawn' then 'library_material_withdrawn'
      else 'library_material_status_changed'
    end;
    v_note := case
      when new.status = 'withdrawn' then new.withdrawal_reason
      else new.review_note
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
  values (new.id, v_actor, v_event_type, v_from, v_to, v_note);

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
      'submitted_by', new.submitted_by,
      'title', new.title,
      'reason', v_note
    )
  );

  return null;
end;
$$;

revoke execute on function private.log_library_material_change() from public, anon, authenticated;

-- 3. The author's remove action. Students may not update library rows
--    directly (only administrators can), so this function checks ownership
--    and the allowed statuses itself. It returns the path of the private file
--    copy so the server can delete it from the library-materials bucket.
create or replace function public.withdraw_library_material(
  p_material bigint,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_status text;
  v_path text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  select status, storage_path
  into v_status, v_path
  from public.library_materials
  where id = p_material
    and submitted_by = v_user
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending_review', 'published', 'rejected') then
    raise exception 'not_removable' using errcode = '22023';
  end if;

  update public.library_materials
  set status = 'withdrawn',
      withdrawn_at = now(),
      withdrawal_reason = v_reason,
      storage_path = null,
      file_name = null,
      mime_type = null,
      size_bytes = null
  where id = p_material;

  return v_path;
end;
$$;

revoke execute on function public.withdraw_library_material(bigint, text) from public, anon;
grant execute on function public.withdraw_library_material(bigint, text) to authenticated;
