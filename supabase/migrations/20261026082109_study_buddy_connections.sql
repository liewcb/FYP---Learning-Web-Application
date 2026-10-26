-- Study buddy (peer connection) module
--
-- Students discover each other through ranked recommendations and username
-- search, then connect with a request that the other student accepts.
-- Admin accounts, suspended accounts and students who turned off "Show me in
-- peer search" are never offered. The browser may only read its own
-- connections; every write goes through the functions below so the rules
-- cannot be bypassed through the Data API.

create table public.peer_connections (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint peer_connections_not_self_check check (requester_id <> addressee_id),
  constraint peer_connections_status_check check (status in ('pending', 'accepted')),
  constraint peer_connections_response_check check (
    (status = 'pending' and responded_at is null)
    or (status = 'accepted' and responded_at is not null)
  )
);

-- One row per pair of students, whichever of them sent the request.
create unique index peer_connections_pair_key
on public.peer_connections (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create index peer_connections_requester_idx
on public.peer_connections (requester_id, status);

create index peer_connections_addressee_idx
on public.peer_connections (addressee_id, status);

create trigger peer_connections_set_updated_at
before update on public.peer_connections
for each row execute function private.set_updated_at();

alter table public.peer_connections enable row level security;

create policy peer_connections_participant_select
on public.peer_connections
for select
to authenticated
using ((select auth.uid()) in (requester_id, addressee_id));

revoke all on public.peer_connections from anon, authenticated;
grant select on public.peer_connections to authenticated;
grant select, insert, update, delete on public.peer_connections to service_role;
grant usage, select on sequence public.peer_connections_id_seq to service_role;

-- Reads the study times saved by the profile form ({"study_times": [...]}).
create or replace function private.study_times(p_preferences jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_preferences -> 'study_times') = 'array'
      then array(select jsonb_array_elements_text(p_preferences -> 'study_times'))
    else '{}'::text[]
  end;
$$;

-- Every active student the viewer could see, with a 0-100 match score:
--   same major +40, same year +20 (one year apart +10),
--   +10 per shared interest (max 30), compatible study mode +5,
--   at least one shared study time +5.
create or replace function private.study_buddy_candidates(p_viewer uuid)
returns table (
  id uuid,
  full_name text,
  username text,
  academic_major text,
  year_of_study smallint,
  bio text,
  interests text[],
  study_times text[],
  study_mode text,
  created_at timestamptz,
  last_seen_at timestamptz,
  is_discoverable boolean,
  match_score integer,
  same_major boolean,
  year_gap integer,
  shared_interests text[],
  shared_study_times text[],
  compatible_study_mode boolean,
  connection_status text
)
language sql
stable
set search_path = ''
as $$
  with viewer as (
    select
      lower(nullif(trim(v.academic_major), '')) as major,
      v.year_of_study as study_year,
      array(select lower(trim(i)) from unnest(v.interests) as i) as interests,
      private.study_times(v.preferences) as study_times,
      nullif(v.preferences ->> 'study_mode', '') as study_mode
    from public.profiles v
    where v.id = p_viewer
  )
  select
    p.id,
    p.full_name,
    p.username,
    p.academic_major,
    p.year_of_study,
    p.bio,
    p.interests,
    prefs.study_times,
    prefs.study_mode,
    p.created_at,
    p.last_seen_at,
    p.is_discoverable,
    (
      case when scores.same_major then 40 else 0 end
      + case scores.year_gap when 0 then 20 when 1 then 10 else 0 end
      + least(cardinality(scores.shared_interests) * 10, 30)
      + case when scores.compatible_study_mode then 5 else 0 end
      + case when cardinality(scores.shared_study_times) > 0 then 5 else 0 end
    )::integer as match_score,
    scores.same_major,
    scores.year_gap,
    scores.shared_interests,
    scores.shared_study_times,
    scores.compatible_study_mode,
    case
      when c.id is null then 'none'
      when c.status = 'accepted' then 'accepted'
      when c.requester_id = p_viewer then 'pending_sent'
      else 'pending_received'
    end as connection_status
  from public.profiles p
  cross join viewer
  cross join lateral (
    select
      private.study_times(p.preferences) as study_times,
      nullif(p.preferences ->> 'study_mode', '') as study_mode
  ) as prefs
  cross join lateral (
    select
      coalesce(
        viewer.major is not null
          and lower(trim(p.academic_major)) = viewer.major,
        false
      ) as same_major,
      abs(p.year_of_study - viewer.study_year)::integer as year_gap,
      array(
        select i from unnest(p.interests) as i
        where lower(trim(i)) = any (viewer.interests)
      ) as shared_interests,
      array(
        select t from unnest(prefs.study_times) as t
        where t = any (viewer.study_times)
      ) as shared_study_times,
      coalesce(
        prefs.study_mode = viewer.study_mode
          or 'either' in (prefs.study_mode, viewer.study_mode),
        false
      ) as compatible_study_mode
  ) as scores
  left join public.peer_connections c
    on least(c.requester_id, c.addressee_id) = least(p.id, p_viewer)
   and greatest(c.requester_id, c.addressee_id) = greatest(p.id, p_viewer)
  where p.id <> p_viewer
    and p.role = 'student'
    and p.account_status = 'active';
$$;

revoke execute on function private.study_times(jsonb) from public, anon, authenticated;
revoke execute on function private.study_buddy_candidates(uuid) from public, anon, authenticated;

-- Recommendations (no filters) or search results for the signed-in student.
-- Recommendations leave out existing buddies; search and filters include them.
create or replace function public.discover_study_buddies(
  p_username text default null,
  p_major text default null,
  p_year smallint default null,
  p_interest text default null,
  p_study_mode text default null,
  p_limit integer default 24
)
returns table (
  id uuid,
  full_name text,
  username text,
  academic_major text,
  year_of_study smallint,
  bio text,
  interests text[],
  study_times text[],
  study_mode text,
  member_since timestamptz,
  match_score integer,
  same_major boolean,
  year_gap integer,
  shared_interests text[],
  shared_study_times text[],
  compatible_study_mode boolean,
  connection_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      lower(nullif(ltrim(trim(p_username), '@'), '')) as username,
      lower(nullif(trim(p_major), '')) as major,
      p_year as filter_year,
      lower(nullif(trim(p_interest), '')) as interest,
      nullif(trim(p_study_mode), '') as study_mode
  )
  select
    c.id,
    c.full_name,
    c.username,
    c.academic_major,
    c.year_of_study,
    c.bio,
    c.interests,
    c.study_times,
    c.study_mode,
    c.created_at,
    c.match_score,
    c.same_major,
    c.year_gap,
    c.shared_interests,
    c.shared_study_times,
    c.compatible_study_mode,
    c.connection_status
  from private.study_buddy_candidates((select auth.uid())) as c
  cross join params
  where c.is_discoverable
    and (params.username is null or position(params.username in c.username) > 0)
    and (
      params.major is null
      or position(params.major in lower(coalesce(c.academic_major, ''))) > 0
    )
    and (params.filter_year is null or c.year_of_study = params.filter_year)
    and (
      params.interest is null
      or exists (
        select 1 from unnest(c.interests) as i
        where position(params.interest in lower(i)) > 0
      )
    )
    and (
      params.study_mode is null
      or c.study_mode = params.study_mode
      or c.study_mode = 'either'
    )
    and (
      c.connection_status <> 'accepted'
      or num_nonnulls(
        params.username, params.major, params.filter_year, params.interest, params.study_mode
      ) > 0
    )
  order by c.match_score desc, c.last_seen_at desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

-- Buddies and pending requests in both directions, even if the other
-- student later hides themselves from peer search.
create or replace function public.list_my_study_buddies()
returns table (
  id uuid,
  full_name text,
  username text,
  academic_major text,
  year_of_study smallint,
  bio text,
  interests text[],
  study_times text[],
  study_mode text,
  member_since timestamptz,
  match_score integer,
  same_major boolean,
  year_gap integer,
  shared_interests text[],
  shared_study_times text[],
  compatible_study_mode boolean,
  connection_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.full_name,
    c.username,
    c.academic_major,
    c.year_of_study,
    c.bio,
    c.interests,
    c.study_times,
    c.study_mode,
    c.created_at,
    c.match_score,
    c.same_major,
    c.year_gap,
    c.shared_interests,
    c.shared_study_times,
    c.compatible_study_mode,
    c.connection_status
  from private.study_buddy_candidates((select auth.uid())) as c
  where c.connection_status <> 'none'
  order by lower(c.full_name), c.username;
$$;

-- Returns: pending | accepted | self | forbidden | unavailable | limit | unauthenticated
create or replace function public.send_study_buddy_request(p_addressee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_existing public.peer_connections%rowtype;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  if p_addressee is null or p_addressee = v_me then
    return 'self';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_me and role = 'student' and account_status = 'active'
  ) then
    return 'forbidden';
  end if;

  select * into v_existing
  from public.peer_connections c
  where least(c.requester_id, c.addressee_id) = least(v_me, p_addressee)
    and greatest(c.requester_id, c.addressee_id) = greatest(v_me, p_addressee)
  for update;

  if found then
    if v_existing.status = 'accepted' then
      return 'accepted';
    end if;

    -- They already asked us, so adding them back accepts their request.
    if v_existing.addressee_id = v_me then
      update public.peer_connections
      set status = 'accepted', responded_at = now()
      where id = v_existing.id;
      return 'accepted';
    end if;

    return 'pending';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_addressee
      and role = 'student'
      and account_status = 'active'
      and is_discoverable
  ) then
    return 'unavailable';
  end if;

  if (
    select count(*) from public.peer_connections
    where requester_id = v_me and status = 'pending'
  ) >= 50 then
    return 'limit';
  end if;

  insert into public.peer_connections (requester_id, addressee_id)
  values (v_me, p_addressee)
  on conflict do nothing;

  return 'pending';
end;
$$;

-- Returns: accepted | declined | not_found | unauthenticated
create or replace function public.respond_to_study_buddy_request(
  p_requester uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  if p_accept then
    update public.peer_connections
    set status = 'accepted', responded_at = now()
    where requester_id = p_requester
      and addressee_id = v_me
      and status = 'pending';

    return case when found then 'accepted' else 'not_found' end;
  end if;

  delete from public.peer_connections
  where requester_id = p_requester
    and addressee_id = v_me
    and status = 'pending';

  return case when found then 'declined' else 'not_found' end;
end;
$$;

-- Cancels a sent request or removes an existing buddy.
-- Returns: removed | not_found | unauthenticated
create or replace function public.remove_study_buddy(p_other uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  delete from public.peer_connections c
  where least(c.requester_id, c.addressee_id) = least(v_me, p_other)
    and greatest(c.requester_id, c.addressee_id) = greatest(v_me, p_other)
    and (c.status = 'accepted' or c.requester_id = v_me);

  return case when found then 'removed' else 'not_found' end;
end;
$$;

revoke execute on function public.discover_study_buddies(text, text, smallint, text, text, integer) from public, anon;
revoke execute on function public.list_my_study_buddies() from public, anon;
revoke execute on function public.send_study_buddy_request(uuid) from public, anon;
revoke execute on function public.respond_to_study_buddy_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_study_buddy(uuid) from public, anon;

grant execute on function public.discover_study_buddies(text, text, smallint, text, text, integer) to authenticated;
grant execute on function public.list_my_study_buddies() to authenticated;
grant execute on function public.send_study_buddy_request(uuid) to authenticated;
grant execute on function public.respond_to_study_buddy_request(uuid, boolean) to authenticated;
grant execute on function public.remove_study_buddy(uuid) to authenticated;
