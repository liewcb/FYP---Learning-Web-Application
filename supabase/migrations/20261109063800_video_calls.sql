-- Video calls
--
-- A call belongs to a direct or group chat. Anyone who may send in that chat
-- can start one or join the one in progress; starting posts a "call_started"
-- event message, so open chats show it through Realtime, and notifies the
-- other members. Members can also invite individual study buddies who are
-- not in the chat. Chat members plus invited students never exceed five, and
-- the media server refuses a sixth participant as well.
--
-- Audio and video go through LiveKit, never through this database. The web
-- server checks access here before it signs a short-lived LiveKit token, and
-- marks a call ended (with the service role) once its room is empty.

create table public.video_calls (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.chat_conversations (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint video_calls_ended_check check (ended_at is null or ended_at >= started_at)
);

-- One call in progress per chat.
create unique index video_calls_active_key
on public.video_calls (conversation_id)
where ended_at is null;

create index video_calls_conversation_idx on public.video_calls (conversation_id);
create index video_calls_started_by_idx on public.video_calls (started_by, started_at desc);

create table public.video_call_invites (
  call_id bigint not null references public.video_calls (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (call_id, invitee_id),
  constraint video_call_invites_not_self_check check (invitee_id <> inviter_id)
);

create index video_call_invites_invitee_idx on public.video_call_invites (invitee_id);
create index video_call_invites_inviter_idx on public.video_call_invites (inviter_id);

alter table public.video_calls enable row level security;
alter table public.video_call_invites enable row level security;

create policy video_call_invites_party_select
on public.video_call_invites
for select
to authenticated
using ((select auth.uid()) in (invitee_id, inviter_id));

-- Current chat members (through chat_conversations' own policy) and invited
-- students may read a call.
create policy video_calls_party_select
on public.video_calls
for select
to authenticated
using (
  exists (
    select 1 from public.chat_conversations c
    where c.id = conversation_id
  )
  or exists (
    select 1 from public.video_call_invites i
    where i.call_id = video_calls.id and i.invitee_id = (select auth.uid())
  )
);

revoke all on public.video_calls, public.video_call_invites from anon, authenticated;
grant select on public.video_calls, public.video_call_invites to authenticated;
grant select, insert, update, delete on public.video_calls, public.video_call_invites to service_role;
grant usage, select on sequence public.video_calls_id_seq to service_role;

-- Chat events and notifications -----------------------------------------------

alter table public.chat_messages
  drop constraint chat_messages_event_check,
  add constraint chat_messages_event_check check (
    event is null
    or event in (
      'group_created',
      'member_joined',
      'member_left',
      'member_removed',
      'group_renamed',
      'admin_changed',
      'group_disbanded',
      'call_started'
    )
  );

alter table public.notifications
  add column video_call_id bigint references public.video_calls (id) on delete cascade,
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'study_buddy_request',
      'study_buddy_accepted',
      'group_invite',
      'group_invite_accepted',
      'video_call_started',
      'video_call_invite'
    )
  );

create index notifications_video_call_idx
on public.notifications (video_call_id)
where video_call_id is not null;

-- Helpers ---------------------------------------------------------------------

-- Whether a student may send in a chat right now: the same rules as
-- list_my_chats.can_send (buddies and not blocked, or a current member of a
-- group that still exists).
create or replace function private.can_use_chat(p_conversation bigint, p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select
      case
        when c.kind = 'direct' then
          private.is_active_student(c.user_low)
          and private.is_active_student(c.user_high)
          and private.are_study_buddies(c.user_low, c.user_high)
          and not private.is_chat_blocked(c.user_low, c.user_high)
        else
          private.is_active_student(p_user)
          and c.disbanded_at is null
      end
    from public.chat_conversations c
    where c.id = p_conversation
      and (p_user in (c.user_low, c.user_high) or p_user = any (c.member_ids))
  ), false);
$$;

-- Whether a student may join a call: it is still in progress and they may
-- use its chat or were invited to it.
create or replace function private.can_join_call(p_call bigint, p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select
      v.ended_at is null
      and private.is_active_student(p_user)
      and (
        private.can_use_chat(v.conversation_id, p_user)
        or exists (
          select 1 from public.video_call_invites i
          where i.call_id = v.id and i.invitee_id = p_user
        )
      )
    from public.video_calls v
    where v.id = p_call
  ), false);
$$;

revoke execute on function private.can_use_chat(bigint, uuid) from public, anon, authenticated;
revoke execute on function private.can_join_call(bigint, uuid) from public, anon, authenticated;

-- Calls -----------------------------------------------------------------------

-- Returns the chat's call in progress, or starts one when p_start is true.
-- Returns: started | joined | none | not_allowed | rate_limited |
--          unauthenticated
create or replace function public.open_video_call(p_conversation bigint, p_start boolean)
returns table (outcome text, opened_call_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id bigint;
begin
  if v_me is null then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  if not private.can_use_chat(p_conversation, v_me) then
    return query select 'not_allowed'::text, null::bigint;
    return;
  end if;

  select v.id into v_id
  from public.video_calls v
  where v.conversation_id = p_conversation and v.ended_at is null;

  if found then
    return query select 'joined'::text, v_id;
    return;
  end if;

  if not coalesce(p_start, false) then
    return query select 'none'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.video_calls v
    where v.started_by = v_me and v.started_at > now() - interval '1 hour'
  ) >= 10 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.video_calls (conversation_id, started_by)
  values (p_conversation, v_me)
  on conflict (conversation_id) where ended_at is null do nothing
  returning id into v_id;

  -- Someone else started it a moment earlier; join theirs.
  if v_id is null then
    select v.id into v_id
    from public.video_calls v
    where v.conversation_id = p_conversation and v.ended_at is null;

    return query select 'joined'::text, v_id;
    return;
  end if;

  perform private.post_chat_event(p_conversation, v_me, 'call_started');

  insert into public.notifications (recipient_id, actor_id, type, conversation_id, video_call_id)
  select m.user_id, v_me, 'video_call_started', p_conversation, v_id
  from public.chat_members m
  where m.conversation_id = p_conversation
    and m.user_id <> v_me
    and m.left_at is null
    and not m.muted;

  return query select 'started'::text, v_id;
end;
$$;

-- A chat member invites one of their study buddies who is not in the chat.
-- Returns: invited | not_found | ended | not_allowed | not_buddies |
--          already_in | full | unauthenticated
create or replace function public.invite_to_video_call(p_call bigint, p_invitee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation bigint;
  v_ended_at timestamptz;
  v_chat_members integer;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  -- Locking the call serialises invitations, so the limit of five holds.
  select v.conversation_id, v.ended_at
  into v_conversation, v_ended_at
  from public.video_calls v
  where v.id = p_call
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_ended_at is not null then
    return 'ended';
  end if;

  if not private.can_use_chat(v_conversation, v_me) then
    return 'not_allowed';
  end if;

  if p_invitee is null
    or p_invitee = v_me
    or not private.is_active_student(p_invitee)
    or not private.are_study_buddies(v_me, p_invitee)
    or private.is_chat_blocked(v_me, p_invitee) then
    return 'not_buddies';
  end if;

  select case when c.kind = 'direct' then 2 else cardinality(c.member_ids) end
  into v_chat_members
  from public.chat_conversations c
  where c.id = v_conversation;

  if exists (
    select 1 from public.chat_conversations c
    where c.id = v_conversation
      and (p_invitee in (c.user_low, c.user_high) or p_invitee = any (c.member_ids))
  ) or exists (
    select 1 from public.video_call_invites i
    where i.call_id = p_call and i.invitee_id = p_invitee
  ) then
    return 'already_in';
  end if;

  if v_chat_members + (
    select count(*) from public.video_call_invites i where i.call_id = p_call
  ) >= 5 then
    return 'full';
  end if;

  insert into public.video_call_invites (call_id, invitee_id, inviter_id)
  values (p_call, p_invitee, v_me);

  insert into public.notifications (recipient_id, actor_id, type, video_call_id)
  values (p_invitee, v_me, 'video_call_invite', p_call);

  return 'invited';
end;
$$;

-- A call as one of its parties sees it: chat members (current or former)
-- and invited students. No row for anyone else.
create or replace function public.get_video_call(p_call bigint)
returns table (
  call_id bigint,
  conversation_id bigint,
  kind text,
  title text,
  started_by_name text,
  started_at timestamptz,
  ended_at timestamptz,
  can_join boolean,
  can_invite boolean,
  is_chat_member boolean,
  party_ids uuid[],
  invited_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select (select auth.uid()) as id
  ),
  vc as (
    select v.*, c.kind, c.title as group_title, c.user_low, c.user_high, c.member_ids
    from public.video_calls v
    join public.chat_conversations c on c.id = v.conversation_id
    where v.id = p_call
  ),
  party as (
    select
      exists (
        select 1 from public.chat_members m, viewer
        where m.conversation_id = vc.conversation_id and m.user_id = viewer.id
      ) as member,
      exists (
        select 1 from public.video_call_invites i, viewer
        where i.call_id = vc.id and i.invitee_id = viewer.id
      ) as invited
    from vc
  )
  select
    vc.id,
    vc.conversation_id,
    vc.kind,
    case
      when vc.kind = 'group' then vc.group_title
      else (
        select string_agg(coalesce(nullif(btrim(p.full_name), ''), p.username, 'Student'), ' & ')
        from public.profiles p, viewer
        where p.id in (vc.user_low, vc.user_high) and p.id <> viewer.id
      )
    end,
    (
      select coalesce(nullif(btrim(p.full_name), ''), p.username, 'Student')
      from public.profiles p
      where p.id = vc.started_by
    ),
    vc.started_at,
    vc.ended_at,
    private.can_join_call(vc.id, viewer.id),
    vc.ended_at is null and private.can_use_chat(vc.conversation_id, viewer.id),
    party.member,
    array(
      select x from unnest(
        case when vc.kind = 'direct' then array[vc.user_low, vc.user_high] else vc.member_ids end
      ) as x
      union
      select i.invitee_id from public.video_call_invites i where i.call_id = vc.id
    ),
    array(
      select coalesce(nullif(btrim(p.full_name), ''), p.username, 'Student')
      from public.video_call_invites i
      join public.profiles p on p.id = i.invitee_id
      where i.call_id = vc.id
      order by i.created_at
    )
  from vc, party, viewer
  where party.member or party.invited;
$$;

-- Called by the web server (service role) once the call's room is empty.
-- Stale "join the call" notifications that were never opened go too.
create or replace function public.end_video_call(p_call bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.video_calls
  set ended_at = now()
  where id = p_call and ended_at is null;

  delete from public.notifications
  where video_call_id = p_call and read_at is null;
$$;

revoke execute on function public.open_video_call(bigint, boolean) from public, anon;
revoke execute on function public.invite_to_video_call(bigint, uuid) from public, anon;
revoke execute on function public.get_video_call(bigint) from public, anon;
revoke execute on function public.end_video_call(bigint) from public, anon, authenticated;

grant execute on function public.open_video_call(bigint, boolean) to authenticated;
grant execute on function public.invite_to_video_call(bigint, uuid) to authenticated;
grant execute on function public.get_video_call(bigint) to authenticated;
grant execute on function public.end_video_call(bigint) to service_role;
