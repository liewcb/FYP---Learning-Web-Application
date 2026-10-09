-- Sign-up now collects a username and study profile. With email confirmation
-- enabled there is no session after sign-up, so the trigger copies these
-- fields from the sign-up metadata. Only whitelisted fields are read; role,
-- status and quota always keep their defaults.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id,
    full_name,
    username,
    academic_major,
    year_of_study,
    interests,
    preferences,
    is_discoverable
  )
  values (
    new.id,
    coalesce(meta ->> 'full_name', ''),
    nullif(lower(trim(meta ->> 'username')), ''),
    nullif(trim(meta ->> 'academic_major'), ''),
    case
      when meta ->> 'year_of_study' ~ '^[1-6]$'
        then (meta ->> 'year_of_study')::smallint
    end,
    case
      when jsonb_typeof(meta -> 'interests') = 'array'
        then array(select jsonb_array_elements_text(meta -> 'interests'))
      else '{}'::text[]
    end,
    case
      when jsonb_typeof(meta -> 'preferences') = 'object'
        then meta -> 'preferences'
      else '{}'::jsonb
    end,
    coalesce(meta ->> 'is_discoverable', 'true') <> 'false'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- Lets the sign-up form check a username before an account exists. Usernames
-- are public profile information, so revealing whether one is taken is fine.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where username = lower(trim(p_username))
  );
$$;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Resolves a username to its login email. This would expose email addresses,
-- so only the server (service_role, via the secret key) may call it.
create or replace function public.get_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = lower(trim(p_username));
$$;

revoke execute on function public.get_login_email(text) from public, anon, authenticated;
grant execute on function public.get_login_email(text) to service_role;
