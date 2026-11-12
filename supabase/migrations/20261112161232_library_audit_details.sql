-- Library audit details
--
-- The admin audit log could only say "library material approved". It now
-- also records the material's title and the reviewer's reason, so the log
-- reads as "Approved “Safety notes”" with the reason underneath. The trigger
-- is otherwise unchanged from 20261107034407_library_workflow.sql.

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
      'submitted_by', new.submitted_by,
      'title', new.title,
      'reason', case when v_event_type = 'status_changed' then new.review_note else null end
    )
  );

  return null;
end;
$$;

revoke execute on function private.log_library_material_change() from public, anon, authenticated;
