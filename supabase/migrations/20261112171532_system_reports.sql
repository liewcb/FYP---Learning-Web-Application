-- System reports ("Generate System Report" use case, System Monitoring)
--
-- Live figures (service status, storage, current sessions) come from
-- admin_system_overview(). This function adds what happened during a chosen
-- period: user activity, learning activity, sign-ins and administrative
-- work. Generating a report is itself recorded in the audit log.

create or replace function public.admin_report_activity(
  p_days integer default 30,
  p_record boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_signed_in bigint := null;
  v_sessions_started bigint := null;
  v_reports jsonb := null;
  v_result jsonb;
begin
  begin
    select count(*) into v_signed_in from auth.users where last_sign_in_at >= v_from;
  exception when insufficient_privilege or undefined_table then
    v_signed_in := null;
  end;

  begin
    select count(*) into v_sessions_started from auth.sessions where created_at >= v_from;
  exception when insufficient_privilege or undefined_table or undefined_column then
    v_sessions_started := null;
  end;

  -- The unified reports table belongs to the report-review module and may
  -- not exist on older databases.
  if to_regclass('public.reports') is not null then
    execute $q$
      select jsonb_build_object(
        'submitted', count(*) filter (where created_at >= $1),
        'resolved', count(*) filter (where reviewed_at >= $1),
        'pending', count(*) filter (where status = 'pending')
      )
      from public.reports
    $q$ into v_reports using v_from;
  end if;

  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'to', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'students', (select count(*) from public.profiles where role = 'student'),
      'new', (select count(*) from public.profiles where created_at >= v_from),
      'active', (select count(*) from public.profiles where last_seen_at >= v_from),
      'signed_in', v_signed_in,
      'suspended_now', (select count(*) from public.profiles where account_status = 'suspended')
    ),
    'sessions', jsonb_build_object('started', v_sessions_started),
    'learning', jsonb_build_object(
      'documents_uploaded', (select count(*) from public.documents where created_at >= v_from),
      'bytes_uploaded', (select coalesce(sum(size_bytes), 0) from public.documents where created_at >= v_from),
      'documents_failed', (select count(*) from public.documents where created_at >= v_from and status = 'failed'),
      'analyses_ready', (select count(*) from public.document_analyses where created_at >= v_from and status = 'ready'),
      'analyses_failed', (select count(*) from public.document_analyses where created_at >= v_from and status = 'failed'),
      'quizzes_ready', (select count(*) from public.quizzes where created_at >= v_from and status = 'ready'),
      'quizzes_failed', (select count(*) from public.quizzes where created_at >= v_from and status = 'failed'),
      'quiz_attempts', (select count(*) from public.quiz_attempts where status = 'graded' and submitted_at >= v_from),
      'average_score', (
        select round(avg(100.0 * score / nullif(max_score, 0)))
        from public.quiz_attempts where status = 'graded' and submitted_at >= v_from
      ),
      'forum_threads', (select count(*) from public.forum_threads where created_at >= v_from),
      'forum_comments', (select count(*) from public.forum_comments where created_at >= v_from),
      'library_submissions', (select count(*) from public.library_materials where created_at >= v_from),
      'library_published', (select count(*) from public.library_materials where published_at >= v_from)
    ),
    'daily', (
      select coalesce(jsonb_agg(day_row order by day_row.day), '[]'::jsonb)
      from (
        select
          days.day::date as day,
          (select count(*) from public.profiles p where p.created_at::date = days.day::date) as new_users,
          (select count(*) from public.documents d where d.created_at::date = days.day::date) as uploads,
          (select count(*) from public.quiz_attempts a
            where a.status = 'graded' and a.submitted_at::date = days.day::date) as quiz_attempts,
          (select count(*) from public.forum_threads t where t.created_at::date = days.day::date)
            + (select count(*) from public.forum_comments c where c.created_at::date = days.day::date)
            as forum_posts
        from generate_series(v_from::date, current_date, interval '1 day') as days(day)
      ) day_row
    ),
    'top_students', (
      select coalesce(jsonb_agg(row_to_json(top) order by top.total desc), '[]'::jsonb)
      from (
        select
          coalesce(nullif(p.full_name, ''), p.username, 'Unknown student') as name,
          p.username,
          (select count(*) from public.documents d where d.owner_id = p.id and d.created_at >= v_from) as uploads,
          (select count(*) from public.quiz_attempts a
            where a.user_id = p.id and a.status = 'graded' and a.submitted_at >= v_from) as quiz_attempts,
          (select count(*) from public.forum_threads t where t.author_id = p.id and t.created_at >= v_from)
            + (select count(*) from public.forum_comments c where c.author_id = p.id and c.created_at >= v_from)
            as forum_posts,
          (select count(*) from public.library_materials l where l.submitted_by = p.id and l.created_at >= v_from)
            as library_submissions,
          (select count(*) from public.documents d where d.owner_id = p.id and d.created_at >= v_from)
            + (select count(*) from public.quiz_attempts a
                where a.user_id = p.id and a.status = 'graded' and a.submitted_at >= v_from)
            + (select count(*) from public.forum_threads t where t.author_id = p.id and t.created_at >= v_from)
            + (select count(*) from public.forum_comments c where c.author_id = p.id and c.created_at >= v_from)
            + (select count(*) from public.library_materials l where l.submitted_by = p.id and l.created_at >= v_from)
            as total
        from public.profiles p
        where p.role = 'student'
        order by total desc
        limit 10
      ) top
      where top.total > 0
    ),
    'administration', jsonb_build_object(
      'actions', (
        select coalesce(jsonb_object_agg(action, total), '{}'::jsonb)
        from (
          select action, count(*) as total
          from public.admin_audit_events
          where created_at >= v_from
          group by action
        ) grouped
      ),
      'storage_requests', jsonb_build_object(
        'submitted', (select count(*) from public.storage_requests where created_at >= v_from),
        'approved', (select count(*) from public.storage_requests where status = 'approved' and reviewed_at >= v_from),
        'rejected', (select count(*) from public.storage_requests where status = 'rejected' and reviewed_at >= v_from),
        'pending', (select count(*) from public.storage_requests where status = 'pending'),
        'bytes_granted', (
          select coalesce(sum(requested_bytes), 0) from public.storage_requests
          where status = 'approved' and reviewed_at >= v_from
        )
      ),
      'reports', v_reports
    )
  )
  into v_result;

  if p_record then
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
    values (v_admin, 'system_report_generated', 'system_report', null, jsonb_build_object('days', v_days));
  end if;

  return v_result;
end;
$$;

revoke execute on function public.admin_report_activity(integer, boolean) from public, anon;
grant execute on function public.admin_report_activity(integer, boolean) to authenticated;
