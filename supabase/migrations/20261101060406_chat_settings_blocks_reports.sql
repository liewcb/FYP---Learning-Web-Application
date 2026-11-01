-- Chat settings, blocking and reporting
--
-- Each student can pin, mute, clear or delete a chat for themselves; these
-- settings live on their own chat_members row and never affect the other
-- student. "Clear" hides earlier messages; "delete" also removes the chat
-- from the list until a new message arrives.
--
-- Blocking stops both students from sending in that chat and hides presence.
-- Reports are stored for the admin moderation milestone and are readable by
-- the reporter only (administrators use the service role).

alter table public.chat_members
  add column pinned_at timestamptz,
  add column muted boolean not null default false,
  add column cleared_at timestamptz,
  add column hidden_at timestamptz;

create index chat_members_user_pinned_idx
on public.chat_members (user_id)
where pinned_at is not null;

create table public.chat_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint chat_blocks_not_self_check check (blocker_id <> blocked_id)
);

create index chat_blocks_blocked_idx on public.chat_blocks (blocked_id);

create table public.chat_reports (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.chat_conversations (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint chat_reports_not_self_check check (reporter_id <> reported_id),
  constraint chat_reports_reason_check check (
    reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')
  ),
  constraint chat_reports_details_length_check check (
    details is null or char_length(details) <= 1000
  ),
  constraint chat_reports_status_check check (
    status in ('pending', 'reviewed', 'dismissed', 'actioned')
  )
);

create index chat_reports_reporter_idx on public.chat_reports (reporter_id);
create index chat_reports_reported_idx on public.chat_reports (reported_id);
create index chat_reports_conversation_idx on public.chat_reports (conversation_id);
create index chat_reports_status_created_idx on public.chat_reports (status, created_at);

alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;

create policy chat_blocks_blocker_select
on public.chat_blocks
for select
to authenticated
using ((select auth.uid()) = blocker_id);

create policy chat_reports_reporter_select
on public.chat_reports
for select
to authenticated
using ((select auth.uid()) = reporter_id);

revoke all on public.chat_blocks, public.chat_reports from anon, authenticated;
grant select on public.chat_blocks, public.chat_reports to authenticated;
grant select, insert, update, delete on public.chat_blocks, public.chat_reports to service_role;
grant usage, select on sequence public.chat_reports_id_seq to service_role;

-- Helpers used only by the security-definer functions below.
create or replace function private.chat_other_member(p_conversation bigint, p_me uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when c.user_low = p_me then c.user_high else c.user_low end
  from public.chat_conversations c
  where c.id = p_conversation
    and p_me in (c.user_low, c.user_high);
$$;

create or replace function private.is_chat_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function private.chat_other_member(bigint, uuid) from public, anon, authenticated;
revoke execute on function private.is_chat_blocked(uuid, uuid) from public, anon, authenticated;

-- The list now carries the student's own settings, hides messages from before
-- "clear chat", and puts pinned chats first. The return type changes, so the
-- function is dropped and recreated.
drop function if exists public.list_my_chats(bigint);

create function public.list_my_chats(p_conversation bigint default null)
returns table (
  conversation_id bigint,
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
  last_message_body text,
  last_message_attachment_name text,
  last_message_deleted boolean,
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
    other.id,
    other.full_name,
    other.username,
    other.academic_major,
    other.year_of_study,
    case when state.can_send then other.last_seen_at end,
    state.can_send,
    state.is_buddy,
    state.blocked_by_me,
    state.blocked_me,
    mine.last_read_at,
    theirs.last_delivered_at,
    theirs.last_read_at,
    mine.pinned_at,
    mine.muted,
    mine.cleared_at,
    mine.hidden_at is not null
      and (c.last_message_at is null or c.last_message_at <= mine.hidden_at),
    latest.id,
    latest.sender_id,
    latest.body,
    latest.attachment_name,
    latest.deleted_at is not null,
    latest.created_at,
    (
      select count(*)::integer
      from public.chat_messages u
      where u.conversation_id = c.id
        and u.sender_id <> mine.user_id
        and u.deleted_at is null
        and (mine.last_read_at is null or u.created_at > mine.last_read_at)
        and (mine.cleared_at is null or u.created_at > mine.cleared_at)
    ),
    c.created_at
  from public.chat_members mine
  join public.chat_conversations c on c.id = mine.conversation_id
  join public.chat_members theirs
    on theirs.conversation_id = c.id and theirs.user_id <> mine.user_id
  join public.profiles other on other.id = theirs.user_id
  cross join lateral (
    select
      private.are_study_buddies(mine.user_id, other.id) as is_buddy,
      exists (
        select 1 from public.chat_blocks b
        where b.blocker_id = mine.user_id and b.blocked_id = other.id
      ) as blocked_by_me,
      exists (
        select 1 from public.chat_blocks b
        where b.blocker_id = other.id and b.blocked_id = mine.user_id
      ) as blocked_me
  ) as rel
  cross join lateral (
    select
      rel.is_buddy,
      rel.blocked_by_me,
      rel.blocked_me,
      private.is_active_student(mine.user_id)
        and private.is_active_student(other.id)
        and rel.is_buddy
        and not rel.blocked_by_me
        and not rel.blocked_me as can_send
  ) as state
  left join lateral (
    select m.id, m.sender_id, m.body, m.attachment_name, m.deleted_at, m.created_at
    from public.chat_messages m
    where m.conversation_id = c.id
      and (mine.cleared_at is null or m.created_at > mine.cleared_at)
    order by m.id desc
    limit 1
  ) as latest on true
  where mine.user_id = (select auth.uid())
    and (p_conversation is null or c.id = p_conversation)
  order by mine.pinned_at desc nulls last, coalesce(c.last_message_at, c.created_at) desc
  limit 200;
$$;

-- Same as before, plus: blocked chats refuse new messages.
-- Returns: sent | not_found | not_buddies | blocked | empty | too_long |
--          invalid_attachment | invalid_reply | rate_limited | unauthenticated
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
  v_other uuid;
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_id bigint;
begin
  if v_me is null then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  v_other := private.chat_other_member(p_conversation, v_me);

  if v_other is null then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

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
    where r.id = p_reply_to and r.conversation_id = p_conversation
  ) then
    return query select 'invalid_reply'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.chat_messages m
    where m.sender_id = v_me and m.created_at > now() - interval '1 minute'
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

-- Muted chats and cleared messages no longer count towards the Chats badge.
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
          and (m.last_read_at is null or x.created_at > m.last_read_at)
          and (m.cleared_at is null or x.created_at > m.cleared_at)
      )
  );
end;
$$;

-- Returns: pinned | unpinned | limit | not_found | unauthenticated
create or replace function public.set_chat_pinned(p_conversation bigint, p_pinned boolean)
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

  if not exists (
    select 1 from public.chat_members
    where conversation_id = p_conversation and user_id = v_me
  ) then
    return 'not_found';
  end if;

  if not p_pinned then
    update public.chat_members
    set pinned_at = null
    where conversation_id = p_conversation and user_id = v_me;

    return 'unpinned';
  end if;

  -- Like WhatsApp, up to three chats can be pinned.
  if (
    select count(*) from public.chat_members
    where user_id = v_me
      and pinned_at is not null
      and conversation_id <> p_conversation
  ) >= 3 then
    return 'limit';
  end if;

  update public.chat_members
  set pinned_at = now(), hidden_at = null
  where conversation_id = p_conversation and user_id = v_me;

  return 'pinned';
end;
$$;

-- Returns: muted | unmuted | not_found | unauthenticated
create or replace function public.set_chat_muted(p_conversation bigint, p_muted boolean)
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

  update public.chat_members
  set muted = coalesce(p_muted, false)
  where conversation_id = p_conversation and user_id = v_me;

  if not found then
    return 'not_found';
  end if;

  return case when p_muted then 'muted' else 'unmuted' end;
end;
$$;

-- Hides every message so far for this student only.
-- Returns: cleared | not_found | unauthenticated
create or replace function public.clear_chat(p_conversation bigint)
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

  update public.chat_members
  set
    cleared_at = now(),
    last_read_at = now(),
    last_delivered_at = now()
  where conversation_id = p_conversation and user_id = v_me;

  return case when found then 'cleared' else 'not_found' end;
end;
$$;

-- Clears the chat and removes it from the list until a new message arrives.
-- Returns: deleted | not_found | unauthenticated
create or replace function public.delete_chat_for_me(p_conversation bigint)
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

  update public.chat_members
  set
    cleared_at = now(),
    hidden_at = now(),
    pinned_at = null,
    last_read_at = now(),
    last_delivered_at = now()
  where conversation_id = p_conversation and user_id = v_me;

  return case when found then 'deleted' else 'not_found' end;
end;
$$;

-- Returns: blocked | unblocked | not_found | unauthenticated
create or replace function public.set_chat_blocked(p_conversation bigint, p_blocked boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  v_other := private.chat_other_member(p_conversation, v_me);

  if v_other is null then
    return 'not_found';
  end if;

  if p_blocked then
    insert into public.chat_blocks (blocker_id, blocked_id)
    values (v_me, v_other)
    on conflict do nothing;

    return 'blocked';
  end if;

  delete from public.chat_blocks
  where blocker_id = v_me and blocked_id = v_other;

  return 'unblocked';
end;
$$;

-- Records a report for administrators and optionally blocks the student.
-- Returns: reported | duplicate | invalid | not_found | unauthenticated
create or replace function public.report_chat(
  p_conversation bigint,
  p_reason text,
  p_details text default null,
  p_block boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  v_other := private.chat_other_member(p_conversation, v_me);

  if v_other is null then
    return 'not_found';
  end if;

  if p_reason is null
    or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')
    or char_length(coalesce(v_details, '')) > 1000 then
    return 'invalid';
  end if;

  if p_block then
    insert into public.chat_blocks (blocker_id, blocked_id)
    values (v_me, v_other)
    on conflict do nothing;
  end if;

  -- One open report per chat a day is enough for moderators.
  if exists (
    select 1 from public.chat_reports r
    where r.conversation_id = p_conversation
      and r.reporter_id = v_me
      and r.status = 'pending'
      and r.created_at > now() - interval '1 day'
  ) then
    return 'duplicate';
  end if;

  insert into public.chat_reports (conversation_id, reporter_id, reported_id, reason, details)
  values (p_conversation, v_me, v_other, p_reason, v_details);

  return 'reported';
end;
$$;

-- Profile details for the contact-info panel of a chat the student belongs to.
create or replace function public.get_chat_profile(p_conversation bigint)
returns table (
  bio text,
  interests text[],
  member_since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bio, p.interests, p.created_at
  from public.profiles p
  where p.id = private.chat_other_member(p_conversation, (select auth.uid()));
$$;

revoke execute on function public.list_my_chats(bigint) from public, anon;
revoke execute on function public.set_chat_pinned(bigint, boolean) from public, anon;
revoke execute on function public.set_chat_muted(bigint, boolean) from public, anon;
revoke execute on function public.clear_chat(bigint) from public, anon;
revoke execute on function public.delete_chat_for_me(bigint) from public, anon;
revoke execute on function public.set_chat_blocked(bigint, boolean) from public, anon;
revoke execute on function public.report_chat(bigint, text, text, boolean) from public, anon;
revoke execute on function public.get_chat_profile(bigint) from public, anon;

grant execute on function public.list_my_chats(bigint) to authenticated;
grant execute on function public.set_chat_pinned(bigint, boolean) to authenticated;
grant execute on function public.set_chat_muted(bigint, boolean) to authenticated;
grant execute on function public.clear_chat(bigint) to authenticated;
grant execute on function public.delete_chat_for_me(bigint) to authenticated;
grant execute on function public.set_chat_blocked(bigint, boolean) to authenticated;
grant execute on function public.report_chat(bigint, text, text, boolean) to authenticated;
grant execute on function public.get_chat_profile(bigint) to authenticated;
