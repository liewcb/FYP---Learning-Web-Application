-- Small group chats
--
-- A group is a chat_conversations row of kind 'group' with up to five
-- members. Its creator is the group admin, who invites their own study
-- buddies, removes members, renames, hands over or disbands the group. An
-- invited student joins only after accepting the invitation.
--
-- Members who leave or are removed keep their chat_members row with left_at
-- set: they can still read the history up to that moment but nothing newer.
-- A student who joins sees messages from their joined_at onwards. Disbanding
-- keeps the history readable and refuses new messages, like a removed buddy.
--
-- Membership changes are posted as event messages ("Aina added Wei"), so
-- every member's open chat updates through the existing chat_messages
-- Realtime stream. chat_conversations is not published, because it changes
-- on every message.
--
-- Policies cannot query chat_members from chat_members, so each group keeps
-- its current members in chat_conversations.member_ids, maintained by a
-- trigger. Direct chats keep using user_low / user_high.

-- Conversations ---------------------------------------------------------------

alter table public.chat_conversations
  drop constraint chat_conversations_kind_check,
  drop constraint chat_conversations_pair_order_check,
  alter column user_low drop not null,
  alter column user_high drop not null,
  add column title text,
  add column admin_id uuid references public.profiles (id) on delete set null,
  add column member_ids uuid[],
  add column disbanded_at timestamptz;

alter table public.chat_conversations
  add constraint chat_conversations_kind_check check (kind in ('direct', 'group')),
  add constraint chat_conversations_shape_check check (
    (
      kind = 'direct'
      and user_low is not null
      and user_high is not null
      and user_low < user_high
      and title is null
      and admin_id is null
      and member_ids is null
      and disbanded_at is null
    )
    or (
      kind = 'group'
      and user_low is null
      and user_high is null
      and title is not null
      and char_length(title) between 1 and 60
      and member_ids is not null
      and cardinality(member_ids) <= 5
    )
  );

create index chat_conversations_admin_idx
on public.chat_conversations (admin_id)
where admin_id is not null;

-- Members ---------------------------------------------------------------------

alter table public.chat_members
  add column left_at timestamptz,
  add column left_reason text,
  add constraint chat_members_left_check check (
    (left_at is null and left_reason is null)
    or (left_at is not null and left_reason in ('left', 'removed'))
  );

-- Messages --------------------------------------------------------------------

alter table public.chat_messages
  add column event text,
  add column event_user_id uuid references public.profiles (id) on delete set null,
  add constraint chat_messages_event_check check (
    event is null
    or event in (
      'group_created',
      'member_joined',
      'member_left',
      'member_removed',
      'group_renamed',
      'admin_changed',
      'group_disbanded'
    )
  ),
  add constraint chat_messages_event_shape_check check (
    event is null or (attachment_path is null and reply_to_id is null)
  ),
  drop constraint chat_messages_content_check,
  add constraint chat_messages_content_check check (
    deleted_at is not null
    or event is not null
    or char_length(btrim(body, E' \t\r\n')) > 0
    or attachment_path is not null
  );

create index chat_messages_event_user_idx
on public.chat_messages (event_user_id)
where event_user_id is not null;

-- Unread counts and the membership window filter by time, so give them a
-- range scan instead of reading every message in the conversation.
create index chat_messages_conversation_created_idx
on public.chat_messages (conversation_id, created_at);

-- Invitations -----------------------------------------------------------------

create table public.chat_group_invites (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.chat_conversations (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint chat_group_invites_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint chat_group_invites_not_self_check check (inviter_id <> invitee_id),
  constraint chat_group_invites_responded_check check (
    (status = 'pending') = (responded_at is null)
  )
);

create unique index chat_group_invites_pending_key
on public.chat_group_invites (conversation_id, invitee_id)
where status = 'pending';

create index chat_group_invites_conversation_idx on public.chat_group_invites (conversation_id);
create index chat_group_invites_inviter_idx on public.chat_group_invites (inviter_id);

create index chat_group_invites_invitee_pending_idx
on public.chat_group_invites (invitee_id)
where status = 'pending';

alter table public.chat_group_invites enable row level security;

create policy chat_group_invites_party_select
on public.chat_group_invites
for select
to authenticated
using ((select auth.uid()) in (inviter_id, invitee_id));

revoke all on public.chat_group_invites from anon, authenticated;
grant select on public.chat_group_invites to authenticated;
grant select, insert, update, delete on public.chat_group_invites to service_role;
grant usage, select on sequence public.chat_group_invites_id_seq to service_role;

-- Row-level security ----------------------------------------------------------

drop policy chat_conversations_member_select on public.chat_conversations;

create policy chat_conversations_member_select
on public.chat_conversations
for select
to authenticated
using (
  (select auth.uid()) in (user_low, user_high)
  or (select auth.uid()) = any (member_ids)
);

-- Students always see their own row. Other members' rows (read receipts)
-- are visible only to current members.
drop policy chat_members_member_select on public.chat_members;

create policy chat_members_member_select
on public.chat_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.chat_conversations c
    where c.id = conversation_id
      and (
        (select auth.uid()) in (c.user_low, c.user_high)
        or (select auth.uid()) = any (c.member_ids)
      )
  )
);

-- Messages are visible within the student's own membership window.
drop policy chat_messages_member_select on public.chat_messages;

create policy chat_messages_member_select
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_members mem
    where mem.conversation_id = chat_messages.conversation_id
      and mem.user_id = (select auth.uid())
      and chat_messages.created_at >= mem.joined_at
      and (mem.left_at is null or chat_messages.created_at <= mem.left_at)
  )
);

drop policy chat_typing_member_select on realtime.messages;

create policy chat_typing_member_select
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.chat_conversations c
    where c.id = case
        when (select realtime.topic()) ~ '^chat:[0-9]{1,18}$'
          then substr((select realtime.topic()), 6)::bigint
      end
      and (
        (select auth.uid()) in (c.user_low, c.user_high)
        or (select auth.uid()) = any (c.member_ids)
      )
  )
);

drop policy chat_typing_member_insert on realtime.messages;

create policy chat_typing_member_insert
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.chat_conversations c
    where c.id = case
        when (select realtime.topic()) ~ '^chat:[0-9]{1,18}$'
          then substr((select realtime.topic()), 6)::bigint
      end
      and (
        (select auth.uid()) in (c.user_low, c.user_high)
        or (select auth.uid()) = any (c.member_ids)
      )
  )
);

drop policy chat_attachments_objects_insert on storage.objects;

create policy chat_attachments_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and exists (
    select 1
    from public.chat_conversations c
    where c.id = case
        when (storage.foldername(name))[1] ~ '^[0-9]{1,18}$'
          then ((storage.foldername(name))[1])::bigint
      end
      and c.disbanded_at is null
      and (
        (select auth.uid()) in (c.user_low, c.user_high)
        or (select auth.uid()) = any (c.member_ids)
      )
  )
);

-- Helpers ---------------------------------------------------------------------

-- Keeps chat_conversations.member_ids equal to the group's current members.
create or replace function private.sync_group_member_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation bigint;
begin
  if tg_op = 'DELETE' then
    v_conversation := old.conversation_id;
  else
    v_conversation := new.conversation_id;
  end if;

  update public.chat_conversations c
  set member_ids = array(
    select m.user_id
    from public.chat_members m
    where m.conversation_id = v_conversation
      and m.left_at is null
    order by m.joined_at, m.user_id
  )
  where c.id = v_conversation
    and c.kind = 'group';

  return null;
end;
$$;

-- Read receipts update other columns, so they never fire this trigger.
create trigger chat_members_sync_group_member_ids
after insert or delete or update of left_at on public.chat_members
for each row execute function private.sync_group_member_ids();

-- Posts a membership event into the group and moves it to the top of lists.
create or replace function private.post_chat_event(
  p_conversation bigint,
  p_actor uuid,
  p_event text,
  p_target uuid default null,
  p_body text default ''
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.chat_messages (conversation_id, sender_id, body, event, event_user_id)
  values (p_conversation, p_actor, coalesce(p_body, ''), p_event, p_target);

  update public.chat_conversations
  set last_message_at = now()
  where id = p_conversation;
$$;

-- Cancels a group's open invitations, e.g. when it is disbanded.
create or replace function private.cancel_group_invites(p_conversation bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.chat_group_invites
  set status = 'cancelled', responded_at = now()
  where conversation_id = p_conversation and status = 'pending';
$$;

revoke execute on function private.sync_group_member_ids() from public, anon, authenticated;
revoke execute on function private.post_chat_event(bigint, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function private.cancel_group_invites(bigint) from public, anon, authenticated;

-- Chat list -------------------------------------------------------------------

-- Groups have no single "other" student: their receipts are those of the
-- slowest current member, and the list shows who sent the last message.
-- Everything respects the student's membership window. The return type
-- changes, so the function is dropped and recreated.
drop function if exists public.list_my_chats(bigint);

create function public.list_my_chats(p_conversation bigint default null)
returns table (
  conversation_id bigint,
  kind text,
  group_title text,
  group_admin_id uuid,
  group_member_count integer,
  group_disbanded boolean,
  my_left_reason text,
  other_id uuid,
  other_full_name text,
  other_username text,
  other_academic_major text,
  other_year_of_study smallint,
  other_last_seen_at timestamptz,
  can_send boolean,
  is_buddy boolean,
  blocked_by_me boolean,
  blocked_me boolean,
  my_last_read_at timestamptz,
  other_last_delivered_at timestamptz,
  other_last_read_at timestamptz,
  pinned_at timestamptz,
  muted boolean,
  cleared_at timestamptz,
  hidden boolean,
  last_message_id bigint,
  last_message_sender_id uuid,
  last_message_sender_name text,
  last_message_body text,
  last_message_attachment_name text,
  last_message_deleted boolean,
  last_message_event text,
  last_message_event_user_id uuid,
  last_message_event_user_name text,
  last_message_at timestamptz,
  unread_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.title,
    c.admin_id,
    case when c.kind = 'group' then cardinality(c.member_ids) end,
    c.disbanded_at is not null,
    mine.left_reason,
    other.id,
    other.full_name,
    other.username,
    other.academic_major,
    other.year_of_study,
    case when c.kind = 'direct' and state.can_send then other.last_seen_at end,
    state.can_send,
    rel.is_buddy,
    rel.blocked_by_me,
    rel.blocked_me,
    mine.last_read_at,
    receipt.last_delivered_at,
    receipt.last_read_at,
    mine.pinned_at,
    mine.muted,
    mine.cleared_at,
    mine.hidden_at is not null
      and (latest.created_at is null or latest.created_at <= mine.hidden_at),
    latest.id,
    latest.sender_id,
    coalesce(nullif(btrim(sender.full_name), ''), sender.username),
    latest.body,
    latest.attachment_name,
    latest.deleted_at is not null,
    latest.event,
    latest.event_user_id,
    coalesce(nullif(btrim(target.full_name), ''), target.username),
    latest.created_at,
    (
      select count(*)::integer
      from public.chat_messages u
      where u.conversation_id = c.id
        and u.sender_id <> mine.user_id
        and u.deleted_at is null
        and u.event is null
        and u.created_at >= mine.joined_at
        and (mine.left_at is null or u.created_at <= mine.left_at)
        and (mine.last_read_at is null or u.created_at > mine.last_read_at)
        and (mine.cleared_at is null or u.created_at > mine.cleared_at)
    ),
    c.created_at
  from public.chat_members mine
  join public.chat_conversations c on c.id = mine.conversation_id
  left join public.profiles other
    on c.kind = 'direct'
    and other.id = case when c.user_low = mine.user_id then c.user_high else c.user_low end
  -- Direct: the other student. Group: every other current member.
  cross join lateral (
    select
      case when bool_and(t.last_delivered_at is not null) then min(t.last_delivered_at) end
        as last_delivered_at,
      case when bool_and(t.last_read_at is not null) then min(t.last_read_at) end
        as last_read_at
    from public.chat_members t
    where t.conversation_id = c.id
      and t.user_id <> mine.user_id
      and t.left_at is null
  ) as receipt
  cross join lateral (
    select
      c.kind = 'direct' and private.are_study_buddies(mine.user_id, other.id) as is_buddy,
      c.kind = 'direct' and exists (
        select 1 from public.chat_blocks b
        where b.blocker_id = mine.user_id and b.blocked_id = other.id
      ) as blocked_by_me,
      c.kind = 'direct' and exists (
        select 1 from public.chat_blocks b
        where b.blocker_id = other.id and b.blocked_id = mine.user_id
      ) as blocked_me
  ) as rel
  cross join lateral (
    select
      case
        when c.kind = 'direct' then
          private.is_active_student(mine.user_id)
          and private.is_active_student(other.id)
          and rel.is_buddy
          and not rel.blocked_by_me
          and not rel.blocked_me
        else
          private.is_active_student(mine.user_id)
          and mine.left_at is null
          and c.disbanded_at is null
      end as can_send
  ) as state
  left join lateral (
    select
      m.id,
      m.sender_id,
      m.body,
      m.attachment_name,
      m.deleted_at,
      m.created_at,
      m.event,
      m.event_user_id
    from public.chat_messages m
    where m.conversation_id = c.id
      and m.created_at >= mine.joined_at
      and (mine.left_at is null or m.created_at <= mine.left_at)
      and (mine.cleared_at is null or m.created_at > mine.cleared_at)
    order by m.id desc
    limit 1
  ) as latest on true
  left join public.profiles sender on sender.id = latest.sender_id
  left join public.profiles target on target.id = latest.event_user_id
  where mine.user_id = (select auth.uid())
    and (p_conversation is null or c.id = p_conversation)
  order by mine.pinned_at desc nulls last, coalesce(latest.created_at, c.created_at) desc
  limit 200;
$$;

-- Messages --------------------------------------------------------------------

-- Same as before for direct chats. Group messages need a current member of
-- a group that has not been disbanded.
-- Returns: sent | not_found | not_buddies | blocked | not_member | closed |
--          empty | too_long | invalid_attachment | invalid_reply |
--          rate_limited | unauthenticated
create or replace function public.send_chat_message(
  p_conversation bigint,
  p_body text,
  p_reply_to bigint default null,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null,
  p_attachment_size bigint default null
)
returns table (outcome text, message_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_disbanded_at timestamptz;
  v_joined_at timestamptz;
  v_left_at timestamptz;
  v_other uuid;
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_id bigint;
begin
  if v_me is null then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  select
    c.kind,
    c.disbanded_at,
    mem.joined_at,
    mem.left_at,
    case when c.kind = 'direct' then
      case when c.user_low = v_me then c.user_high else c.user_low end
    end
  into v_kind, v_disbanded_at, v_joined_at, v_left_at, v_other
  from public.chat_conversations c
  join public.chat_members mem on mem.conversation_id = c.id and mem.user_id = v_me
  where c.id = p_conversation;

  if not found then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

  if v_kind = 'direct' then
    if not private.is_active_student(v_me)
      or not private.is_active_student(v_other)
      or not private.are_study_buddies(v_me, v_other) then
      return query select 'not_buddies'::text, null::bigint;
      return;
    end if;

    if private.is_chat_blocked(v_me, v_other) then
      return query select 'blocked'::text, null::bigint;
      return;
    end if;
  else
    if v_left_at is not null or not private.is_active_student(v_me) then
      return query select 'not_member'::text, null::bigint;
      return;
    end if;

    if v_disbanded_at is not null then
      return query select 'closed'::text, null::bigint;
      return;
    end if;
  end if;

  if char_length(v_body) > 4000 then
    return query select 'too_long'::text, null::bigint;
    return;
  end if;

  if v_body = '' and p_attachment_path is null then
    return query select 'empty'::text, null::bigint;
    return;
  end if;

  if p_attachment_path is not null and (
    num_nulls(p_attachment_name, p_attachment_type, p_attachment_size) > 0
    or split_part(p_attachment_path, '/', 1) <> p_conversation::text
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'chat-attachments'
        and o.name = p_attachment_path
        and o.owner_id = v_me::text
    )
    or exists (
      select 1 from public.chat_messages m
      where m.attachment_path = p_attachment_path
    )
  ) then
    return query select 'invalid_attachment'::text, null::bigint;
    return;
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.chat_messages r
    where r.id = p_reply_to
      and r.conversation_id = p_conversation
      and r.event is null
      and r.created_at >= v_joined_at
  ) then
    return query select 'invalid_reply'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.chat_messages m
    where m.sender_id = v_me
      and m.event is null
      and m.created_at > now() - interval '1 minute'
  ) >= 30 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_id,
    body,
    reply_to_id,
    attachment_path,
    attachment_name,
    attachment_type,
    attachment_size
  )
  values (
    p_conversation,
    v_me,
    v_body,
    p_reply_to,
    p_attachment_path,
    p_attachment_name,
    p_attachment_type,
    p_attachment_size
  )
  returning id into v_id;

  update public.chat_conversations
  set last_message_at = now()
  where id = p_conversation;

  update public.chat_members
  set last_read_at = now(), last_delivered_at = now()
  where conversation_id = p_conversation and user_id = v_me;

  return query select 'sent'::text, v_id;
end;
$$;

-- Event messages cannot be deleted.
-- Returns: deleted | not_found | unauthenticated
create or replace function public.delete_chat_message(p_message bigint)
returns table (outcome text, removed_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_path text;
begin
  if v_me is null then
    return query select 'unauthenticated'::text, null::text;
    return;
  end if;

  select m.attachment_path into v_path
  from public.chat_messages m
  where m.id = p_message
    and m.sender_id = v_me
    and m.deleted_at is null
    and m.event is null
  for update;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  update public.chat_messages
  set
    body = '',
    attachment_path = null,
    attachment_name = null,
    attachment_type = null,
    attachment_size = null,
    deleted_at = now()
  where id = p_message;

  return query select 'deleted'::text, v_path;
end;
$$;

-- Former group members no longer receive new messages, so they are neither
-- marked delivered nor counted as unread.
create or replace function public.sync_my_chats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return 0;
  end if;

  update public.profiles
  set last_seen_at = now()
  where id = v_me
    and (last_seen_at is null or last_seen_at < now() - interval '15 seconds');

  update public.chat_members m
  set last_delivered_at = now()
  from public.chat_conversations c
  where c.id = m.conversation_id
    and m.user_id = v_me
    and m.left_at is null
    and c.last_message_at is not null
    and (m.last_delivered_at is null or m.last_delivered_at < c.last_message_at);

  return (
    select count(*)::integer
    from public.chat_members m
    where m.user_id = v_me
      and not m.muted
      and exists (
        select 1 from public.chat_messages x
        where x.conversation_id = m.conversation_id
          and x.sender_id <> v_me
          and x.deleted_at is null
          and x.event is null
          and x.created_at >= m.joined_at
          and (m.left_at is null or x.created_at <= m.left_at)
          and (m.last_read_at is null or x.created_at > m.last_read_at)
          and (m.cleared_at is null or x.created_at > m.cleared_at)
      )
  );
end;
$$;

-- Groups ----------------------------------------------------------------------

-- Creates a group with the signed-in student as admin and invites up to four
-- of their study buddies.
-- Returns: created | invalid_title | no_members | too_many | not_buddies |
--          rate_limited | unauthenticated
create or replace function public.create_group_chat(p_title text, p_invitees uuid[])
returns table (outcome text, group_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := btrim(coalesce(p_title, ''));
  v_invitees uuid[];
  v_id bigint;
begin
  if v_me is null or not private.is_active_student(v_me) then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  if char_length(v_title) not between 1 and 60 then
    return query select 'invalid_title'::text, null::bigint;
    return;
  end if;

  select coalesce(array_agg(distinct x), '{}')
  into v_invitees
  from unnest(coalesce(p_invitees, '{}'::uuid[])) as x
  where x is not null and x <> v_me;

  if cardinality(v_invitees) = 0 then
    return query select 'no_members'::text, null::bigint;
    return;
  end if;

  if cardinality(v_invitees) > 4 then
    return query select 'too_many'::text, null::bigint;
    return;
  end if;

  if exists (
    select 1 from unnest(v_invitees) as x
    where not private.is_active_student(x)
      or not private.are_study_buddies(v_me, x)
      or private.is_chat_blocked(v_me, x)
  ) then
    return query select 'not_buddies'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.chat_conversations c
    where c.kind = 'group'
      and c.admin_id = v_me
      and c.created_at > now() - interval '1 hour'
  ) >= 5 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.chat_conversations (kind, title, admin_id, member_ids)
  values ('group', v_title, v_me, '{}')
  returning id into v_id;

  insert into public.chat_members (conversation_id, user_id, last_read_at, last_delivered_at)
  values (v_id, v_me, now(), now());

  insert into public.chat_group_invites (conversation_id, inviter_id, invitee_id)
  select v_id, v_me, x from unnest(v_invitees) as x;

  perform private.post_chat_event(v_id, v_me, 'group_created', null, v_title);

  return query select 'created'::text, v_id;
end;
$$;

-- The admin invites one of their study buddies. Members plus open
-- invitations may not exceed five.
-- Returns: invited | not_found | not_admin | closed | not_buddies |
--          already_member | already_invited | recently_declined | full |
--          unauthenticated
create or replace function public.invite_to_group(p_conversation bigint, p_invitee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_admin uuid;
  v_disbanded_at timestamptz;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  -- Locking the group serialises invitations and acceptances, so the
  -- five-member limit holds under concurrent requests.
  select c.admin_id, c.disbanded_at
  into v_admin, v_disbanded_at
  from public.chat_conversations c
  where c.id = p_conversation
    and c.kind = 'group'
    and v_me = any (c.member_ids)
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_admin is distinct from v_me then
    return 'not_admin';
  end if;

  if v_disbanded_at is not null then
    return 'closed';
  end if;

  if p_invitee is null
    or p_invitee = v_me
    or not private.is_active_student(p_invitee)
    or not private.are_study_buddies(v_me, p_invitee)
    or private.is_chat_blocked(v_me, p_invitee) then
    return 'not_buddies';
  end if;

  if exists (
    select 1 from public.chat_members m
    where m.conversation_id = p_conversation
      and m.user_id = p_invitee
      and m.left_at is null
  ) then
    return 'already_member';
  end if;

  if exists (
    select 1 from public.chat_group_invites i
    where i.conversation_id = p_conversation
      and i.invitee_id = p_invitee
      and i.status = 'pending'
  ) then
    return 'already_invited';
  end if;

  -- A declined invitation cannot be repeated straight away.
  if exists (
    select 1 from public.chat_group_invites i
    where i.conversation_id = p_conversation
      and i.invitee_id = p_invitee
      and i.status = 'declined'
      and i.responded_at > now() - interval '1 day'
  ) then
    return 'recently_declined';
  end if;

  if (
    select cardinality(c.member_ids) from public.chat_conversations c where c.id = p_conversation
  ) + (
    select count(*) from public.chat_group_invites i
    where i.conversation_id = p_conversation and i.status = 'pending'
  ) >= 5 then
    return 'full';
  end if;

  insert into public.chat_group_invites (conversation_id, inviter_id, invitee_id)
  values (p_conversation, v_me, p_invitee);

  return 'invited';
end;
$$;

-- Returns: cancelled | not_found | unauthenticated
create or replace function public.cancel_group_invite(p_invite bigint)
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

  update public.chat_group_invites i
  set status = 'cancelled', responded_at = now()
  from public.chat_conversations c
  where i.id = p_invite
    and i.status = 'pending'
    and c.id = i.conversation_id
    and c.admin_id = v_me;

  return case when found then 'cancelled' else 'not_found' end;
end;
$$;

-- The invited student accepts or declines. Rejoining starts a fresh
-- membership window, so messages from while they were away stay hidden.
-- Returns: joined | declined | not_found | closed | full | unauthenticated
create or replace function public.respond_to_group_invite(p_invite bigint, p_accept boolean)
returns table (outcome text, group_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation bigint;
  v_disbanded_at timestamptz;
  v_members integer;
begin
  if v_me is null or not private.is_active_student(v_me) then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  select i.conversation_id into v_conversation
  from public.chat_group_invites i
  where i.id = p_invite and i.invitee_id = v_me and i.status = 'pending';

  if not found then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

  select c.disbanded_at, cardinality(c.member_ids)
  into v_disbanded_at, v_members
  from public.chat_conversations c
  where c.id = v_conversation
  for update;

  if not coalesce(p_accept, false) then
    update public.chat_group_invites
    set status = 'declined', responded_at = now()
    where id = p_invite;

    return query select 'declined'::text, v_conversation;
    return;
  end if;

  if v_disbanded_at is not null then
    update public.chat_group_invites
    set status = 'cancelled', responded_at = now()
    where id = p_invite;

    return query select 'closed'::text, null::bigint;
    return;
  end if;

  if v_members >= 5 then
    return query select 'full'::text, null::bigint;
    return;
  end if;

  insert into public.chat_members (
    conversation_id,
    user_id,
    joined_at,
    last_read_at,
    last_delivered_at
  )
  values (v_conversation, v_me, now(), now(), now())
  on conflict (conversation_id, user_id) do update
  set
    joined_at = now(),
    left_at = null,
    left_reason = null,
    last_read_at = now(),
    last_delivered_at = now(),
    pinned_at = null,
    muted = false,
    cleared_at = null,
    hidden_at = null;

  update public.chat_group_invites
  set status = 'accepted', responded_at = now()
  where id = p_invite;

  perform private.post_chat_event(v_conversation, v_me, 'member_joined');

  return query select 'joined'::text, v_conversation;
end;
$$;

-- Admin-only changes to a group the admin still belongs to.
-- p_action: remove | make_admin | rename | disband
-- Returns: done | invalid_title | not_found | not_admin | closed |
--          unauthenticated
create or replace function public.manage_group(
  p_conversation bigint,
  p_action text,
  p_member uuid default null,
  p_title text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_admin uuid;
  v_title text;
  v_disbanded_at timestamptz;
  v_new_title text := btrim(coalesce(p_title, ''));
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  select c.admin_id, c.title, c.disbanded_at
  into v_admin, v_title, v_disbanded_at
  from public.chat_conversations c
  where c.id = p_conversation
    and c.kind = 'group'
    and v_me = any (c.member_ids)
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_admin is distinct from v_me then
    return 'not_admin';
  end if;

  if v_disbanded_at is not null then
    return 'closed';
  end if;

  if p_action in ('remove', 'make_admin') and (
    p_member is null
    or p_member = v_me
    or not exists (
      select 1 from public.chat_members m
      where m.conversation_id = p_conversation
        and m.user_id = p_member
        and m.left_at is null
    )
  ) then
    return 'not_found';
  end if;

  case p_action
    when 'remove' then
      update public.chat_members
      set left_at = now(), left_reason = 'removed', pinned_at = null
      where conversation_id = p_conversation and user_id = p_member;

      perform private.post_chat_event(p_conversation, v_me, 'member_removed', p_member);
    when 'make_admin' then
      update public.chat_conversations
      set admin_id = p_member
      where id = p_conversation;

      perform private.post_chat_event(p_conversation, v_me, 'admin_changed', p_member);
    when 'rename' then
      if char_length(v_new_title) not between 1 and 60 then
        return 'invalid_title';
      end if;

      if v_new_title is distinct from v_title then
        update public.chat_conversations
        set title = v_new_title
        where id = p_conversation;

        perform private.post_chat_event(p_conversation, v_me, 'group_renamed', null, v_new_title);
      end if;
    when 'disband' then
      update public.chat_conversations
      set disbanded_at = now()
      where id = p_conversation;

      perform private.cancel_group_invites(p_conversation);
      perform private.post_chat_event(p_conversation, v_me, 'group_disbanded');
    else
      return 'not_found';
  end case;

  return 'done';
end;
$$;

-- Any member may leave. An admin who leaves hands the group to the member
-- who joined earliest; the last member to leave disbands it.
-- Returns: left | not_found | unauthenticated
create or replace function public.leave_group(p_conversation bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_admin uuid;
  v_disbanded_at timestamptz;
  v_next uuid;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  select c.admin_id, c.disbanded_at
  into v_admin, v_disbanded_at
  from public.chat_conversations c
  where c.id = p_conversation
    and c.kind = 'group'
    and v_me = any (c.member_ids)
  for update;

  if not found then
    return 'not_found';
  end if;

  update public.chat_members
  set left_at = now(), left_reason = 'left', pinned_at = null
  where conversation_id = p_conversation and user_id = v_me;

  if v_disbanded_at is not null then
    return 'left';
  end if;

  perform private.post_chat_event(p_conversation, v_me, 'member_left');

  if v_admin is not distinct from v_me then
    select m.user_id into v_next
    from public.chat_members m
    where m.conversation_id = p_conversation and m.left_at is null
    order by m.joined_at, m.user_id
    limit 1;

    if v_next is null then
      update public.chat_conversations
      set disbanded_at = now()
      where id = p_conversation;

      perform private.cancel_group_invites(p_conversation);
    else
      update public.chat_conversations
      set admin_id = v_next
      where id = p_conversation;

      perform private.post_chat_event(p_conversation, v_me, 'admin_changed', v_next);
    end if;
  end if;

  return 'left';
end;
$$;

-- Members (and open invitations) of a group the student belongs to.
-- Former members get the names only, so they can still read the history.
-- Last-seen times are shared between study buddies only, as in direct chats.
create or replace function public.list_group_members(p_conversation bigint)
returns table (
  user_id uuid,
  full_name text,
  username text,
  academic_major text,
  year_of_study smallint,
  last_seen_at timestamptz,
  is_buddy boolean,
  status text,
  invite_id bigint,
  since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select m.left_at is null as active
    from public.chat_members m
    join public.chat_conversations c on c.id = m.conversation_id and c.kind = 'group'
    where m.conversation_id = p_conversation
      and m.user_id = (select auth.uid())
  )
  select
    p.id,
    p.full_name,
    p.username,
    p.academic_major,
    p.year_of_study,
    case
      when viewer.active
        and m.left_at is null
        and rel.is_buddy
        and not private.is_chat_blocked((select auth.uid()), p.id)
        then p.last_seen_at
    end,
    rel.is_buddy,
    case when m.left_at is null then 'member' else m.left_reason end,
    null::bigint,
    m.joined_at
  from viewer
  join public.chat_members m on m.conversation_id = p_conversation
  join public.profiles p on p.id = m.user_id
  cross join lateral (
    select
      p.id <> (select auth.uid())
      and private.are_study_buddies((select auth.uid()), p.id) as is_buddy
  ) as rel

  union all

  select
    p.id,
    p.full_name,
    p.username,
    p.academic_major,
    p.year_of_study,
    null::timestamptz,
    private.are_study_buddies((select auth.uid()), p.id),
    'invited',
    i.id,
    i.created_at
  from viewer
  join public.chat_group_invites i
    on i.conversation_id = p_conversation and i.status = 'pending'
  join public.profiles p on p.id = i.invitee_id
  where viewer.active;
$$;

-- Open invitations for the signed-in student.
create or replace function public.list_my_group_invites()
returns table (
  invite_id bigint,
  group_id bigint,
  group_title text,
  inviter_id uuid,
  inviter_full_name text,
  inviter_username text,
  member_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    c.id,
    c.title,
    i.inviter_id,
    p.full_name,
    p.username,
    cardinality(c.member_ids),
    i.created_at
  from public.chat_group_invites i
  join public.chat_conversations c on c.id = i.conversation_id
  join public.profiles p on p.id = i.inviter_id
  where i.invitee_id = (select auth.uid())
    and i.status = 'pending'
    and c.disbanded_at is null
  order by i.created_at desc
  limit 50;
$$;

revoke execute on function public.list_my_chats(bigint) from public, anon;
revoke execute on function public.send_chat_message(bigint, text, bigint, text, text, text, bigint) from public, anon;
revoke execute on function public.delete_chat_message(bigint) from public, anon;
revoke execute on function public.sync_my_chats() from public, anon;
revoke execute on function public.create_group_chat(text, uuid[]) from public, anon;
revoke execute on function public.invite_to_group(bigint, uuid) from public, anon;
revoke execute on function public.cancel_group_invite(bigint) from public, anon;
revoke execute on function public.respond_to_group_invite(bigint, boolean) from public, anon;
revoke execute on function public.manage_group(bigint, text, uuid, text) from public, anon;
revoke execute on function public.leave_group(bigint) from public, anon;
revoke execute on function public.list_group_members(bigint) from public, anon;
revoke execute on function public.list_my_group_invites() from public, anon;

grant execute on function public.list_my_chats(bigint) to authenticated;
grant execute on function public.send_chat_message(bigint, text, bigint, text, text, text, bigint) to authenticated;
grant execute on function public.delete_chat_message(bigint) to authenticated;
grant execute on function public.sync_my_chats() to authenticated;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
grant execute on function public.invite_to_group(bigint, uuid) to authenticated;
grant execute on function public.cancel_group_invite(bigint) to authenticated;
grant execute on function public.respond_to_group_invite(bigint, boolean) to authenticated;
grant execute on function public.manage_group(bigint, text, uuid, text) to authenticated;
grant execute on function public.leave_group(bigint) to authenticated;
grant execute on function public.list_group_members(bigint) to authenticated;
grant execute on function public.list_my_group_invites() to authenticated;

-- Notifications ---------------------------------------------------------------

alter table public.notifications
  add column conversation_id bigint references public.chat_conversations (id) on delete cascade,
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'study_buddy_request',
      'study_buddy_accepted',
      'group_invite',
      'group_invite_accepted'
    )
  );

create index notifications_conversation_idx
on public.notifications (conversation_id)
where conversation_id is not null;

-- New invitation -> notify the invitee. Accepted -> notify the inviter.
-- Declined or cancelled -> withdraw the unread invitation notification.
create or replace function private.notify_group_invite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (recipient_id, actor_id, type, conversation_id)
    values (new.invitee_id, new.inviter_id, 'group_invite', new.conversation_id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    update public.notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = new.invitee_id
      and conversation_id = new.conversation_id
      and type = 'group_invite';

    insert into public.notifications (recipient_id, actor_id, type, conversation_id)
    values (new.inviter_id, new.invitee_id, 'group_invite_accepted', new.conversation_id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    delete from public.notifications
    where recipient_id = new.invitee_id
      and conversation_id = new.conversation_id
      and type = 'group_invite'
      and read_at is null;
  end if;

  return null;
end;
$$;

revoke execute on function private.notify_group_invite_change() from public, anon, authenticated;

create trigger chat_group_invites_notify
after insert or update of status on public.chat_group_invites
for each row execute function private.notify_group_invite_change();
