alter table public.profiles
  add column username text,
  add column year_of_study smallint,
  add column interests text[] not null default '{}',
  add column preferences jsonb not null default '{}'::jsonb,
  add column is_discoverable boolean not null default true,
  add column account_status text not null default 'active',
  add column suspended_at timestamptz,
  add column suspension_reason text,
  add column storage_quota_bytes bigint not null default 524288000,
  add column last_seen_at timestamptz;

alter table public.profiles
  add constraint profiles_username_format_check check (
    username is null or username ~ '^[a-z0-9_]{3,30}$'
  ),
  add constraint profiles_year_of_study_check check (
    year_of_study is null or year_of_study between 1 and 6
  ),
  add constraint profiles_interests_count_check check (cardinality(interests) <= 20),
  add constraint profiles_preferences_object_check check (jsonb_typeof(preferences) = 'object'),
  add constraint profiles_account_status_check check (
    account_status in ('active', 'suspended')
  ),
  add constraint profiles_suspension_consistency_check check (
    (account_status = 'suspended' and suspended_at is not null)
    or (account_status = 'active' and suspended_at is null and suspension_reason is null)
  ),
  add constraint profiles_suspension_reason_length_check check (
    suspension_reason is null or char_length(suspension_reason) <= 500
  ),
  add constraint profiles_storage_quota_check check (storage_quota_bytes > 0);

create unique index profiles_username_key on public.profiles (username);
create index profiles_interests_idx on public.profiles using gin (interests);
create index profiles_account_status_idx on public.profiles (account_status);

-- Supabase's default privileges grant table-wide access to anon and
-- authenticated, which would let a student update their own role, status or
-- quota. Reset and grant only the columns each role may touch. Admin-only
-- columns are changed server-side with the secret key.
revoke all on public.profiles from anon, authenticated;

grant select (
  id,
  full_name,
  academic_major,
  bio,
  avatar_path,
  role,
  username,
  year_of_study,
  interests,
  is_discoverable,
  created_at,
  updated_at
)
on public.profiles to authenticated;

grant update (
  full_name,
  academic_major,
  bio,
  avatar_path,
  username,
  year_of_study,
  interests,
  preferences,
  is_discoverable,
  last_seen_at,
  updated_at
)
on public.profiles to authenticated;

-- Private account fields are only readable by their owner.
create or replace function public.get_my_account()
returns table (
  preferences jsonb,
  account_status text,
  suspended_at timestamptz,
  suspension_reason text,
  storage_quota_bytes bigint,
  storage_used_bytes bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.preferences,
    p.account_status,
    p.suspended_at,
    p.suspension_reason,
    p.storage_quota_bytes,
    coalesce(
      (select sum(d.size_bytes) from public.documents d where d.owner_id = p.id),
      0
    )::bigint,
    p.last_seen_at
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke execute on function public.get_my_account() from public, anon;
grant execute on function public.get_my_account() to authenticated;
