  -- Report review: tell people apart
  --
  -- admin_get_report now returns the reporter's and the author's email, which
  -- the Report review window shows when a student has no username. Only
  -- administrators can call it (private.require_admin), as before.

  -- Everything a moderator needs to decide one report, or null. Reporter and
  -- author carry their email too, so two students with the same name (and no
  -- username) can be told apart.
  create or replace function public.admin_get_report(p_report bigint)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_report public.reports%rowtype;
    v_current jsonb;
  begin
    perform private.require_admin();

    select * into v_report from public.reports where id = p_report;

    if not found then
      return null;
    end if;

    -- Where the reported thing stands now.
    v_current := case v_report.target_type
      when 'user' then (
        select jsonb_build_object('exists', true, 'state', p.account_status)
        from public.profiles p where p.id = v_report.target_user_id
      )
      when 'chat_message' then (
        select jsonb_build_object(
          'exists', true,
          'state', case when m.deleted_at is null then 'visible' else 'removed' end
        )
        from public.chat_messages m where m.id = v_report.target_id
      )
      when 'forum_thread' then (
        select jsonb_build_object('exists', true, 'state', t.status)
        from public.forum_threads t where t.id = v_report.target_id
      )
      when 'forum_comment' then (
        select jsonb_build_object('exists', true, 'state', c.status)
        from public.forum_comments c where c.id = v_report.target_id
      )
      when 'library_material' then (
        select jsonb_build_object('exists', true, 'state', l.status)
        from public.library_materials l where l.id = v_report.target_id
      )
    end;

    return jsonb_build_object(
      'id', v_report.id,
      'target_type', v_report.target_type,
      'target_id', v_report.target_id,
      'target_label', v_report.target_label,
      'reason', v_report.reason,
      'details', v_report.details,
      'snapshot', v_report.snapshot,
      'status', v_report.status,
      'resolution', v_report.resolution,
      'reporter_message', v_report.reporter_message,
      'internal_note', v_report.internal_note,
      'created_at', v_report.created_at,
      'reviewed_at', v_report.reviewed_at,
      'reviewer_name', private.display_name(v_report.reviewed_by),
      'reporter', (
        select jsonb_build_object(
          'id', p.id,
          'name', private.display_name(p.id),
          'username', p.username,
          'email', u.email
        )
        from public.profiles p
        left join auth.users u on u.id = p.id
        where p.id = v_report.reporter_id
      ),
      'reported_user', (
        select jsonb_build_object(
          'id', p.id,
          'name', private.display_name(p.id),
          'username', p.username,
          'account_status', p.account_status,
          'role', p.role,
          'email', u.email
        )
        from public.profiles p
        left join auth.users u on u.id = p.id
        where p.id = v_report.target_user_id
      ),
      'current', coalesce(v_current, jsonb_build_object('exists', false, 'state', null)),
      'other_reports', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'reporter_name', private.display_name(o.reporter_id),
          'reason', o.reason,
          'details', o.details,
          'status', o.status,
          'created_at', o.created_at
        ) order by o.created_at desc), '[]'::jsonb)
        from public.reports o
        where o.id <> v_report.id
          and o.target_type = v_report.target_type
          and (
            (v_report.target_type = 'user' and o.target_user_id = v_report.target_user_id)
            or (v_report.target_type <> 'user' and o.target_id = v_report.target_id)
          )
      )
    );
  end;
  $$;
