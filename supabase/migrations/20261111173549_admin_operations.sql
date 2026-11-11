-- Admin operations: user management, forum moderation, audit log and
-- system monitoring.
--
-- Every function below is SECURITY DEFINER because it reads columns or rows
-- that students must never see (other users' account status, quotas, e-mail
-- addresses, hidden forum posts, storage usage). Each one first checks that
-- the caller's profile has role = 'admin', so the Data API cannot be used to
-- bypass the admin pages. Every change writes an admin_audit_events row.

-- Shared guard -----------------------------------------------------------------

create or replace function private.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.role = 'admin'
  );
$$;

create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.is_admin(v_user) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke execute on function private.is_admin(uuid) from public, anon, authenticated;
revoke execute on function private.require_admin() from public, anon, authenticated;

-- User management ----------------------------------------------------------------

create or replace function public.admin_list_users(
  p_search text default null,
  p_status text default null,
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  username text,
  full_name text,
  role text,
  account_status text,
  suspended_at timestamptz,
  suspension_reason text,
  storage_quota_bytes bigint,
  storage_used_bytes bigint,
  document_count bigint,
  last_seen_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();

  return query
  with usage as (
    select d.owner_id, sum(d.size_bytes)::bigint as used, count(*)::bigint as documents
    from public.documents d
    group by d.owner_id
  ),
  filtered as (
    select
      p.id,
      u.email::text as email,
      p.username,
      p.full_name,
      p.role,
      p.account_status,
      p.suspended_at,
      p.suspension_reason,
      p.storage_quota_bytes,
      coalesce(usage.used, 0)::bigint as storage_used_bytes,
      coalesce(usage.documents, 0)::bigint as document_count,
      p.last_seen_at,
      u.last_sign_in_at,
      p.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join usage on usage.owner_id = p.id
    where (p_status is null or p_status = '' or p_status = 'all'
           or (p_status in ('active', 'suspended') and p.account_status = p_status)
           or (p_status in ('student', 'admin') and p.role = p_status))
      and (
        v_search is null
        or p.full_name ilike '%' || v_search || '%'
        or p.username ilike '%' || v_search || '%'
        or u.email ilike '%' || v_search || '%'
      )
  )
  select f.*, count(*) over ()::bigint
  from filtered f
  order by
    case when p_sort = 'storage' then f.storage_used_bytes end desc nulls last,
    case when p_sort = 'storage' then f.storage_used_bytes::numeric / greatest(f.storage_quota_bytes, 1) end desc nulls last,
    case when p_sort = 'active' then coalesce(f.last_seen_at, f.last_sign_in_at) end desc nulls last,
    f.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Returns: updated | unchanged | not_found | self | admin_target | reason_required
create or replace function public.admin_set_account_status(
  p_user uuid,
  p_suspend boolean,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_profile public.profiles%rowtype;
begin
  if p_user = v_admin then
    return 'self';
  end if;

  select * into v_profile from public.profiles where id = p_user for update;

  if not found then
    return 'not_found';
  end if;

  if v_profile.role = 'admin' then
    return 'admin_target';
  end if;

  if p_suspend and v_reason is null then
    return 'reason_required';
  end if;

  if (p_suspend and v_profile.account_status = 'suspended')
     or (not p_suspend and v_profile.account_status = 'active') then
    return 'unchanged';
  end if;

  update public.profiles
  set
    account_status = case when p_suspend then 'suspended' else 'active' end,
    suspended_at = case when p_suspend then now() else null end,
    suspension_reason = case when p_suspend then left(v_reason, 500) else null end
  where id = p_user;

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    case when p_suspend then 'user_suspended' else 'user_reactivated' end,
    'user',
    null,
    jsonb_build_object(
      'user_id', p_user,
      'username', v_profile.username,
      'full_name', v_profile.full_name,
      'reason', v_reason
    )
  );

  return 'updated';
end;
$$;

-- Ends a suspended user's open sessions. Best effort: on projects where the
-- database role cannot write auth.sessions, the Auth ban applied by the web
-- server still blocks new sign-ins and token refreshes.
create or replace function public.admin_end_user_sessions(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  perform private.require_admin();

  begin
    delete from auth.sessions where user_id = p_user;
    get diagnostics v_count = row_count;
  exception when insufficient_privilege or undefined_table then
    v_count := -1;
  end;

  return v_count;
end;
$$;

-- Returns: updated | unchanged | not_found | invalid
create or replace function public.admin_set_storage_quota(p_user uuid, p_quota_bytes bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_old bigint;
  v_name text;
begin
  -- 100 MB to 10 GB keeps a typo from granting unlimited storage.
  if p_quota_bytes is null or p_quota_bytes < 104857600 or p_quota_bytes > 10737418240 then
    return 'invalid';
  end if;

  select storage_quota_bytes, coalesce(nullif(full_name, ''), username)
  into v_old, v_name
  from public.profiles where id = p_user for update;

  if not found then
    return 'not_found';
  end if;

  if v_old = p_quota_bytes then
    return 'unchanged';
  end if;

  update public.profiles set storage_quota_bytes = p_quota_bytes where id = p_user;

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'user_storage_quota_changed',
    'user',
    null,
    jsonb_build_object(
      'user_id', p_user,
      'full_name', v_name,
      'from_bytes', v_old,
      'to_bytes', p_quota_bytes
    )
  );

  return 'updated';
end;
$$;

-- Forum moderation ---------------------------------------------------------------

create or replace function public.admin_list_forum_threads(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  title text,
  content text,
  status text,
  visibility text,
  author_id uuid,
  author_name text,
  comment_count bigint,
  upvote_count bigint,
  pending_report_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();

  return query
  select
    t.id,
    t.title,
    t.content,
    t.status,
    t.visibility,
    t.author_id,
    coalesce(nullif(p.full_name, ''), p.username, 'Unknown student'),
    (select count(*) from public.forum_comments c where c.thread_id = t.id)::bigint,
    (select count(*) from public.forum_thread_upvotes v where v.thread_id = t.id)::bigint,
    (select count(*) from public.forum_reports r
      where r.thread_id = t.id and r.status = 'pending')::bigint,
    t.created_at,
    t.updated_at
  from public.forum_threads t
  left join public.profiles p on p.id = t.author_id
  where (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
    and (v_search is null or t.title ilike '%' || v_search || '%' or t.content ilike '%' || v_search || '%')
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_list_forum_comments(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  thread_id bigint,
  thread_title text,
  content text,
  status text,
  author_id uuid,
  author_name text,
  pending_report_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();

  return query
  select
    c.id,
    c.thread_id,
    t.title,
    c.content,
    c.status,
    c.author_id,
    coalesce(nullif(p.full_name, ''), p.username, 'Unknown student'),
    (select count(*) from public.forum_reports r
      where r.comment_id = c.id and r.status = 'pending')::bigint,
    c.created_at
  from public.forum_comments c
  join public.forum_threads t on t.id = c.thread_id
  left join public.profiles p on p.id = c.author_id
  where (p_status is null or p_status = '' or p_status = 'all' or c.status = p_status)
    and (v_search is null or c.content ilike '%' || v_search || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_list_forum_reports(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  id bigint,
  target_kind text,
  target_id bigint,
  thread_id bigint,
  thread_title text,
  target_content text,
  target_status text,
  target_author_name text,
  reporter_name text,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    r.id,
    case when r.thread_id is not null then 'thread' else 'comment' end,
    coalesce(r.thread_id, r.comment_id),
    coalesce(r.thread_id, c.thread_id),
    coalesce(t.title, ct.title),
    coalesce(t.content, c.content),
    coalesce(t.status, c.status),
    coalesce(nullif(author.full_name, ''), author.username, 'Unknown student'),
    coalesce(nullif(reporter.full_name, ''), reporter.username, 'Unknown student'),
    r.reason,
    r.status,
    r.created_at,
    r.reviewed_at
  from public.forum_reports r
  left join public.forum_threads t on t.id = r.thread_id
  left join public.forum_comments c on c.id = r.comment_id
  left join public.forum_threads ct on ct.id = c.thread_id
  left join public.profiles author on author.id = coalesce(t.author_id, c.author_id)
  left join public.profiles reporter on reporter.id = r.reporter_id
  where p_status is null or p_status = '' or p_status = 'all' or r.status = p_status
  order by (r.status = 'pending') desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- p_kind: thread | comment. p_action: hide | restore | delete.
-- Content is never physically removed here: 'deleted' and 'hidden' keep the
-- evidence for appeals while the student feed shows only 'published' posts.
-- Returns: updated | unchanged | not_found | invalid | reason_required
create or replace function public.admin_moderate_forum_content(
  p_kind text,
  p_id bigint,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new_status text;
  v_old_status text;
  v_author uuid;
  v_excerpt text;
begin
  if p_kind not in ('thread', 'comment') or p_action not in ('hide', 'restore', 'delete') then
    return 'invalid';
  end if;

  if p_action <> 'restore' and v_reason is null then
    return 'reason_required';
  end if;

  v_new_status := case p_action
    when 'hide' then 'hidden'
    when 'delete' then 'deleted'
    else 'published'
  end;

  if p_kind = 'thread' then
    select status, author_id, left(title, 160)
    into v_old_status, v_author, v_excerpt
    from public.forum_threads where id = p_id for update;
  else
    select status, author_id, left(content, 160)
    into v_old_status, v_author, v_excerpt
    from public.forum_comments where id = p_id for update;
  end if;

  if not found then
    return 'not_found';
  end if;

  if v_old_status = v_new_status then
    return 'unchanged';
  end if;

  if p_kind = 'thread' then
    update public.forum_threads set status = v_new_status where id = p_id;
  else
    update public.forum_comments set status = v_new_status where id = p_id;
  end if;

  -- Acting on content resolves the reports about it.
  update public.forum_reports
  set
    status = case when p_action = 'restore' then 'dismissed' else 'actioned' end,
    reviewed_at = now()
  where status = 'pending'
    and ((p_kind = 'thread' and thread_id = p_id) or (p_kind = 'comment' and comment_id = p_id));

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'forum_' || p_kind || '_' || case p_action
      when 'hide' then 'hidden'
      when 'delete' then 'deleted'
      else 'restored'
    end,
    'forum_' || p_kind,
    p_id,
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_new_status,
      'author_id', v_author,
      'excerpt', v_excerpt,
      'reason', v_reason
    )
  );

  return 'updated';
end;
$$;

-- Returns: updated | not_found
create or replace function public.admin_dismiss_forum_report(p_report bigint, p_note text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.forum_reports%rowtype;
begin
  update public.forum_reports
  set status = 'dismissed', reviewed_at = now()
  where id = p_report and status = 'pending'
  returning * into v_report;

  if not found then
    return 'not_found';
  end if;

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'forum_report_dismissed',
    'forum_report',
    p_report,
    jsonb_build_object(
      'thread_id', v_report.thread_id,
      'comment_id', v_report.comment_id,
      'report_reason', v_report.reason,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  return 'updated';
end;
$$;

-- Audit log ------------------------------------------------------------------------

create or replace function public.admin_list_audit_events(
  p_area text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id bigint,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    e.id,
    e.actor_id,
    coalesce(nullif(p.full_name, ''), p.username, 'System'),
    e.action,
    e.entity_type,
    e.entity_id,
    e.metadata,
    e.created_at,
    count(*) over ()::bigint
  from public.admin_audit_events e
  left join public.profiles p on p.id = e.actor_id
  where p_area is null or p_area = '' or p_area = 'all'
    or (p_area = 'users' and e.entity_type = 'user')
    or (p_area = 'forum' and e.entity_type like 'forum\_%')
    or (p_area = 'library' and e.entity_type like 'library\_%')
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- System monitoring ------------------------------------------------------------

-- One round trip for the monitoring page and the admin dashboard. Sections
-- that read Supabase-managed schemas (auth, storage) degrade to null instead
-- of failing the whole overview.
create or replace function public.admin_system_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sessions jsonb := null;
  v_buckets jsonb := null;
begin
  perform private.require_admin();

  begin
    select jsonb_build_object(
      'active', count(*) filter (where s.not_after is null or s.not_after > now()),
      'refreshed_last_hour', count(*) filter (
        where coalesce(s.refreshed_at::timestamptz, s.updated_at) > now() - interval '1 hour'
      ),
      'users_with_sessions', count(distinct s.user_id) filter (where s.not_after is null or s.not_after > now())
    )
    into v_sessions
    from auth.sessions s;
  exception when insufficient_privilege or undefined_table or undefined_column then
    v_sessions := null;
  end;

  begin
    select coalesce(jsonb_agg(b order by b.bytes desc), '[]'::jsonb)
    into v_buckets
    from (
      select
        o.bucket_id as bucket,
        count(*)::bigint as objects,
        coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes
      from storage.objects o
      group by o.bucket_id
    ) b;
  exception when insufficient_privilege or undefined_table then
    v_buckets := null;
  end;

  select jsonb_build_object(
    'generated_at', now(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'students', count(*) filter (where role = 'student'),
        'admins', count(*) filter (where role = 'admin'),
        'suspended', count(*) filter (where account_status = 'suspended'),
        'new_last_7_days', count(*) filter (where created_at > now() - interval '7 days'),
        'seen_last_15_minutes', count(*) filter (where last_seen_at > now() - interval '15 minutes'),
        'seen_last_24_hours', count(*) filter (where last_seen_at > now() - interval '24 hours')
      )
      from public.profiles
    ),
    'sessions', v_sessions,
    'storage', jsonb_build_object(
      'buckets', v_buckets,
      'document_bytes', (select coalesce(sum(size_bytes), 0) from public.documents),
      'quota_bytes', (select coalesce(sum(storage_quota_bytes), 0) from public.profiles where role = 'student'),
      'users_over_80_percent', (
        select count(*) from (
          select p.id
          from public.profiles p
          join public.documents d on d.owner_id = p.id
          group by p.id, p.storage_quota_bytes
          having sum(d.size_bytes) >= 0.8 * p.storage_quota_bytes
        ) heavy
      )
    ),
    'documents', (
      select jsonb_build_object(
        'total', count(*),
        'ready', count(*) filter (where status = 'ready'),
        'processing', count(*) filter (where status in ('uploaded', 'processing')),
        'failed', count(*) filter (where status = 'failed'),
        'uploaded_last_24_hours', count(*) filter (where created_at > now() - interval '24 hours')
      )
      from public.documents
    ),
    'ai', jsonb_build_object(
      'analyses_ready', (select count(*) from public.document_analyses where status = 'ready'),
      'analyses_failed', (select count(*) from public.document_analyses where status = 'failed'),
      'analyses_stuck', (select count(*) from public.document_analyses
        where status in ('pending', 'processing') and created_at < now() - interval '15 minutes'),
      'quizzes_ready', (select count(*) from public.quizzes where status = 'ready'),
      'quizzes_failed', (select count(*) from public.quizzes where status = 'failed'),
      'quiz_attempts', (select count(*) from public.quiz_attempts where status = 'graded'),
      'quiz_attempts_last_24_hours', (select count(*) from public.quiz_attempts
        where status = 'graded' and submitted_at > now() - interval '24 hours')
    ),
    'community', jsonb_build_object(
      'forum_threads', (select count(*) from public.forum_threads where status = 'published'),
      'forum_comments', (select count(*) from public.forum_comments where status = 'published'),
      'pending_forum_reports', (select count(*) from public.forum_reports where status = 'pending'),
      'pending_library_materials', (select count(*) from public.library_materials where status = 'pending_review')
    ),
    'activity', (
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
        from generate_series(current_date - 13, current_date, interval '1 day') as days(day)
      ) day_row
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- Permissions ----------------------------------------------------------------------

revoke execute on function public.admin_list_users(text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_set_account_status(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_end_user_sessions(uuid) from public, anon;
revoke execute on function public.admin_set_storage_quota(uuid, bigint) from public, anon;
revoke execute on function public.admin_list_forum_threads(text, text, integer) from public, anon;
revoke execute on function public.admin_list_forum_comments(text, text, integer) from public, anon;
revoke execute on function public.admin_list_forum_reports(text, integer) from public, anon;
revoke execute on function public.admin_moderate_forum_content(text, bigint, text, text) from public, anon;
revoke execute on function public.admin_dismiss_forum_report(bigint, text) from public, anon;
revoke execute on function public.admin_list_audit_events(text, integer, integer) from public, anon;
revoke execute on function public.admin_system_overview() from public, anon;

-- Authenticated callers reach the functions, which then refuse non-admins.
grant execute on function public.admin_list_users(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
grant execute on function public.admin_end_user_sessions(uuid) to authenticated;
grant execute on function public.admin_set_storage_quota(uuid, bigint) to authenticated;
grant execute on function public.admin_list_forum_threads(text, text, integer) to authenticated;
grant execute on function public.admin_list_forum_comments(text, text, integer) to authenticated;
grant execute on function public.admin_list_forum_reports(text, integer) to authenticated;
grant execute on function public.admin_moderate_forum_content(text, bigint, text, text) to authenticated;
grant execute on function public.admin_dismiss_forum_report(bigint, text) to authenticated;
grant execute on function public.admin_list_audit_events(text, integer, integer) to authenticated;
grant execute on function public.admin_system_overview() to authenticated;

create index if not exists forum_comments_status_created_idx
on public.forum_comments (status, created_at desc);

create index if not exists admin_audit_events_entity_type_created_idx
on public.admin_audit_events (entity_type, created_at desc);
