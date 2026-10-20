-- Failed-attempt counters for password login and password-reset codes.
-- The table lives in the unexposed private schema, and the functions below
-- can only be called by the server with the secret key. A browser therefore
-- cannot read, reset or inflate anyone's counter.
-- This table may already exist when the SQL was first tested manually. Keep
-- the migration safe to replay so the remaining functions and grants are not
-- skipped when migration history is synchronized.
create table if not exists private.login_attempts (
  key text primary key,
  failed_count integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  constraint login_attempts_key_length_check check (char_length(key) between 1 and 330),
  constraint login_attempts_failed_count_check check (failed_count >= 0)
);

alter table private.login_attempts enable row level security;

revoke all on private.login_attempts from public, anon, authenticated;

-- Returns when the key is locked until, or null if it is not locked.
create or replace function public.get_login_lock(p_key text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select la.locked_until
  from private.login_attempts la
  where la.key = lower(trim(p_key))
    and la.locked_until > now();
$$;

-- Records one failure. When the count reaches p_max_attempts the key is
-- locked for p_lock_minutes and the count starts again. Failures older than
-- the lock window are forgotten.
create or replace function public.record_failed_login(
  p_key text,
  p_max_attempts integer,
  p_lock_minutes integer
)
returns table (attempts_left integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key text := lower(trim(p_key));
  v_window interval := make_interval(mins => p_lock_minutes);
  v_count integer;
  v_locked_until timestamptz;
begin
  insert into private.login_attempts as la (key, failed_count, last_failed_at)
  values (v_key, 1, now())
  on conflict (key) do update
  set
    failed_count = case
      when la.locked_until is not null and la.locked_until <= now() then 1
      when la.last_failed_at < now() - v_window then 1
      else la.failed_count + 1
    end,
    last_failed_at = now(),
    locked_until = case
      when la.locked_until is not null and la.locked_until <= now() then null
      else la.locked_until
    end
  returning la.failed_count into v_count;

  if v_count >= p_max_attempts then
    v_locked_until := now() + v_window;

    update private.login_attempts la
    set failed_count = 0, locked_until = v_locked_until
    where la.key = v_key;

    return query select 0, v_locked_until;
  else
    return query select p_max_attempts - v_count, null::timestamptz;
  end if;
end;
$$;

-- Called after a successful login or password reset.
create or replace function public.clear_failed_logins(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.login_attempts la where la.key = lower(trim(p_key));
$$;

revoke execute on function public.get_login_lock(text) from public, anon, authenticated;
revoke execute on function public.record_failed_login(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.clear_failed_logins(text) from public, anon, authenticated;

grant execute on function public.get_login_lock(text) to service_role;
grant execute on function public.record_failed_login(text, integer, integer) to service_role;
grant execute on function public.clear_failed_logins(text) to service_role;
