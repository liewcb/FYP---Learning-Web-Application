-- Storage requests ("Grant Usage" use case, Admin Module)
--
-- A student asks for extra storage with a reason. An administrator approves
-- (the quota grows by the requested amount) or rejects with a note. Every
-- decision is written to admin_audit_events, and a student can have only one
-- pending request at a time.
--
-- Students never write the table directly: the functions below validate the
-- request and snapshot the quota and usage at request time, so the decision
-- is made on the facts the student saw.

create table public.storage_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_bytes bigint not null,
  reason text not null,
  status text not null default 'pending',
  quota_at_request bigint not null,
  used_at_request bigint not null,
  granted_quota_bytes bigint,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint storage_requests_amount_check
    check (requested_bytes in (524288000, 1073741824, 2147483648)),
  constraint storage_requests_reason_length_check
    check (char_length(btrim(reason)) between 10 and 500),
  constraint storage_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint storage_requests_review_note_length_check
    check (review_note is null or char_length(review_note) <= 500),
  constraint storage_requests_lifecycle_check check (
    (status = 'pending' and reviewed_at is null and granted_quota_bytes is null)
    or (status = 'cancelled' and granted_quota_bytes is null)
    or (status = 'rejected' and reviewed_at is not null and granted_quota_bytes is null)
    or (status = 'approved' and reviewed_at is not null and granted_quota_bytes is not null)
  )
);

-- One open request per student.
create unique index storage_requests_one_pending_key
on public.storage_requests (user_id)
where status = 'pending';

create index storage_requests_user_created_idx
on public.storage_requests (user_id, created_at desc);

create index storage_requests_pending_created_idx
on public.storage_requests (created_at)
where status = 'pending';

create index storage_requests_reviewed_by_idx
on public.storage_requests (reviewed_by)
where reviewed_by is not null;

alter table public.storage_requests enable row level security;

create policy storage_requests_owner_select
on public.storage_requests
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.storage_requests from anon, authenticated;
grant select on public.storage_requests to authenticated;
grant select, insert, update, delete on public.storage_requests to service_role;
grant usage, select on sequence public.storage_requests_id_seq to service_role;

-- Highest quota any student can reach through requests or the admin presets.
create or replace function private.max_storage_quota_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 10737418240::bigint $$;

revoke execute on function private.max_storage_quota_bytes() from public, anon, authenticated;

-- Student side ----------------------------------------------------------------

-- Returns: created | pending_exists | invalid_amount | reason_required |
--          over_limit | not_allowed | unauthenticated
create or replace function public.request_more_storage(
  p_additional_bytes bigint,
  p_reason text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_used bigint;
begin
  if v_user is null then
    return 'unauthenticated';
  end if;

  select * into v_profile from public.profiles where id = v_user for update;

  if not found or v_profile.role <> 'student' or v_profile.account_status <> 'active' then
    return 'not_allowed';
  end if;

  if p_additional_bytes is null or p_additional_bytes not in (524288000, 1073741824, 2147483648) then
    return 'invalid_amount';
  end if;

  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    return 'reason_required';
  end if;

  if v_profile.storage_quota_bytes + p_additional_bytes > private.max_storage_quota_bytes() then
    return 'over_limit';
  end if;

  if exists (select 1 from public.storage_requests where user_id = v_user and status = 'pending') then
    return 'pending_exists';
  end if;

  select coalesce(sum(size_bytes), 0)::bigint into v_used
  from public.documents where owner_id = v_user;

  insert into public.storage_requests (
    user_id, requested_bytes, reason, quota_at_request, used_at_request
  )
  values (v_user, p_additional_bytes, v_reason, v_profile.storage_quota_bytes, v_used);

  return 'created';
end;
$$;

-- Returns: cancelled | not_found
create or replace function public.cancel_storage_request(p_request bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.storage_requests
  set status = 'cancelled'
  where id = p_request
    and user_id = (select auth.uid())
    and status = 'pending';

  return case when found then 'cancelled' else 'not_found' end;
end;
$$;

-- Administrator side ------------------------------------------------------------

create or replace function public.admin_list_storage_requests(
  p_status text default 'pending',
  p_limit integer default 100
)
returns table (
  id bigint,
  user_id uuid,
  user_name text,
  username text,
  email text,
  account_status text,
  requested_bytes bigint,
  reason text,
  status text,
  quota_at_request bigint,
  used_at_request bigint,
  current_quota_bytes bigint,
  current_used_bytes bigint,
  granted_quota_bytes bigint,
  review_note text,
  reviewer_name text,
  reviewed_at timestamptz,
  created_at timestamptz
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
    r.user_id,
    coalesce(nullif(p.full_name, ''), p.username, 'Unknown student'),
    p.username,
    u.email::text,
    p.account_status,
    r.requested_bytes,
    r.reason,
    r.status,
    r.quota_at_request,
    r.used_at_request,
    p.storage_quota_bytes,
    coalesce((select sum(d.size_bytes) from public.documents d where d.owner_id = r.user_id), 0)::bigint,
    r.granted_quota_bytes,
    r.review_note,
    coalesce(nullif(reviewer.full_name, ''), reviewer.username),
    r.reviewed_at,
    r.created_at
  from public.storage_requests r
  join public.profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  left join public.profiles reviewer on reviewer.id = r.reviewed_by
  where p_status is null or p_status = '' or p_status = 'all' or r.status = p_status
  order by
    case when r.status = 'pending' then r.created_at end asc nulls last,
    coalesce(r.reviewed_at, r.created_at) desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- Returns: approved | rejected | not_found | note_required | over_limit
create or replace function public.admin_decide_storage_request(
  p_request bigint,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_request public.storage_requests%rowtype;
  v_old_quota bigint;
  v_new_quota bigint;
  v_name text;
begin
  select * into v_request
  from public.storage_requests
  where id = p_request and status = 'pending'
  for update;

  if not found then
    return 'not_found';
  end if;

  select storage_quota_bytes, coalesce(nullif(full_name, ''), username)
  into v_old_quota, v_name
  from public.profiles where id = v_request.user_id
  for update;

  if not p_approve then
    if v_note is null then
      return 'note_required';
    end if;

    update public.storage_requests
    set status = 'rejected', reviewed_by = v_admin, review_note = left(v_note, 500), reviewed_at = now()
    where id = p_request;

    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
    values (
      v_admin, 'storage_request_rejected', 'storage_request', p_request,
      jsonb_build_object(
        'user_id', v_request.user_id,
        'full_name', v_name,
        'requested_bytes', v_request.requested_bytes,
        'reason', v_note
      )
    );

    return 'rejected';
  end if;

  -- The quota only ever grows here (use case constraint C1).
  v_new_quota := v_old_quota + v_request.requested_bytes;

  if v_new_quota > private.max_storage_quota_bytes() then
    return 'over_limit';
  end if;

  update public.profiles set storage_quota_bytes = v_new_quota where id = v_request.user_id;

  update public.storage_requests
  set
    status = 'approved',
    reviewed_by = v_admin,
    review_note = left(v_note, 500),
    reviewed_at = now(),
    granted_quota_bytes = v_new_quota
  where id = p_request;

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin, 'storage_request_approved', 'storage_request', p_request,
    jsonb_build_object(
      'user_id', v_request.user_id,
      'full_name', v_name,
      'requested_bytes', v_request.requested_bytes,
      'from_bytes', v_old_quota,
      'to_bytes', v_new_quota,
      'reason', v_note
    )
  );

  return 'approved';
end;
$$;

revoke execute on function public.request_more_storage(bigint, text) from public, anon;
revoke execute on function public.cancel_storage_request(bigint) from public, anon;
revoke execute on function public.admin_list_storage_requests(text, integer) from public, anon;
revoke execute on function public.admin_decide_storage_request(bigint, boolean, text) from public, anon;

grant execute on function public.request_more_storage(bigint, text) to authenticated;
grant execute on function public.cancel_storage_request(bigint) to authenticated;
grant execute on function public.admin_list_storage_requests(text, integer) to authenticated;
grant execute on function public.admin_decide_storage_request(bigint, boolean, text) to authenticated;

-- Audit log: storage request decisions belong with user management. This is
-- the version from 20261112143606_user_reports.sql with that one change.
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
    or (p_area = 'users' and e.entity_type in ('user', 'storage_request'))
    or (p_area = 'forum' and e.entity_type like 'forum\_%')
    or (p_area = 'library' and e.entity_type like 'library\_%')
    or (p_area = 'reports' and e.entity_type = 'report')
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
