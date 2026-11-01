-- Study buddy chat
--
-- One-to-one chats between accepted study buddies. A conversation is created
-- the first time either student opens it, and is kept when the buddies later
-- disconnect so the history stays readable; only sending is refused then.
--
-- The browser may only read conversations it belongs to. Every write goes
-- through the functions below, so the buddy, length and attachment rules
-- cannot be bypassed through the Data API.
--
-- Ticks and unread counts come from two timestamps per member:
--   delivered: the other member's last_delivered_at >= message created_at
--   read:      the other member's last_read_at      >= message created_at

create table public.chat_conversations (
  id bigint generated always as identity primary key,
  kind text not null default 'direct',
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  -- Group chats for study groups will add another kind later.
  constraint chat_conversations_kind_check check (kind in ('direct')),
  constraint chat_conversations_pair_order_check check (user_low < user_high)
);

-- One conversation per pair of students, like peer_connections.
create unique index chat_conversations_pair_key
on public.chat_conversations (user_low, user_high);

create index chat_conversations_user_high_idx
on public.chat_conversations (user_high);

create table public.chat_members (
  conversation_id bigint not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_delivered_at timestamptz,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.chat_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  reply_to_id bigint references public.chat_messages (id) on delete set null,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_messages_body_length_check check (char_length(body) <= 4000),
  constraint chat_messages_attachment_shape_check check (
    num_nulls(attachment_path, attachment_name, attachment_type, attachment_size) in (0, 4)
  ),
  constraint chat_messages_attachment_name_check check (
    attachment_name is null or char_length(attachment_name) between 1 and 255
  ),
  constraint chat_messages_attachment_type_check check (
    attachment_type is null
    or attachment_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  -- Uploads are limited to 10 MB by the app; documents shared from
  -- My Documents may be up to the 25 MB document limit.
  constraint chat_messages_attachment_size_check check (
    attachment_size is null or attachment_size between 1 and 26214400
  ),
  constraint chat_messages_content_check check (
    deleted_at is not null
    or char_length(btrim(body, E' \t\r\n')) > 0
    or attachment_path is not null
  ),
  -- "Delete for everyone" clears the content instead of removing the row.
  constraint chat_messages_deleted_cleared_check check (
    deleted_at is null or (body = '' and attachment_path is null)
  )
);

create index chat_messages_conversation_idx
on public.chat_messages (conversation_id, id desc);

create index chat_messages_sender_created_idx
on public.chat_messages (sender_id, created_at desc);

create index chat_messages_reply_to_idx
on public.chat_messages (reply_to_id)
where reply_to_id is not null;

create unique index chat_messages_attachment_path_key
on public.chat_messages (attachment_path)
where attachment_path is not null;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- Membership is checked through chat_conversations so that the chat_members
-- policy never has to query chat_members itself.
create policy chat_conversations_member_select
on public.chat_conversations
for select
to authenticated
using ((select auth.uid()) in (user_low, user_high));

create policy chat_members_member_select
on public.chat_members
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.user_low, c.user_high)
  )
);

create policy chat_messages_member_select
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.user_low, c.user_high)
  )
);

revoke all on public.chat_conversations, public.chat_members, public.chat_messages
from anon, authenticated;

grant select on public.chat_conversations, public.chat_members, public.chat_messages
to authenticated;

grant select, insert, update, delete
on public.chat_conversations, public.chat_members, public.chat_messages
to service_role;

grant usage, select on sequence
  public.chat_conversations_id_seq,
  public.chat_messages_id_seq
to service_role;

-- Helpers used only by the security-definer functions below.
create or replace function private.is_active_student(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and role = 'student' and account_status = 'active'
  );
$$;

create or replace function private.are_study_buddies(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.peer_connections c
    where least(c.requester_id, c.addressee_id) = least(p_a, p_b)
      and greatest(c.requester_id, c.addressee_id) = greatest(p_a, p_b)
      and c.status = 'accepted'
  );
$$;

revoke execute on function private.is_active_student(uuid) from public, anon, authenticated;
revoke execute on function private.are_study_buddies(uuid, uuid) from public, anon, authenticated;

-- Returns the conversation with another student, creating it for study
-- buddies. An existing conversation is returned even after the buddies
-- disconnect, so its history can still be read. Null when not allowed.
create or replace function public.open_direct_chat(p_other uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_low uuid;
  v_high uuid;
  v_id bigint;
begin
  if v_me is null or p_other is null or p_other = v_me then
    return null;
  end if;

  v_low := least(v_me, p_other);
  v_high := greatest(v_me, p_other);

  select id into v_id
  from public.chat_conversations
  where user_low = v_low and user_high = v_high;

  if found then
    return v_id;
  end if;

  if not private.is_active_student(v_me)
    or not private.is_active_student(p_other)
    or not private.are_study_buddies(v_me, p_other) then
    return null;
  end if;

  insert into public.chat_conversations (user_low, user_high)
  values (v_low, v_high)
  on conflict (user_low, user_high) do nothing
  returning id into v_id;

  -- Both students opened the chat at the same moment; use the other insert.
  if v_id is null then
    select id into v_id
    from public.chat_conversations
    where user_low = v_low and user_high = v_high;

    return v_id;
  end if;

  insert into public.chat_members (conversation_id, user_id)
  values (v_id, v_me), (v_id, p_other);

  return v_id;
end;
$$;

-- The signed-in student's conversations, newest activity first, or a single
-- conversation when p_conversation is given. The other student's last-seen
-- time is shared only while they are still study buddies.
create or replace function public.list_my_chats(p_conversation bigint default null)
returns table (
  conversation_id bigint,
  other_id uuid,
  other_full_name text,
  other_username text,
  other_academic_major text,
  other_year_of_study smallint,
  other_last_seen_at timestamptz,
  can_send boolean,
  my_last_read_at timestamptz,
  other_last_delivered_at timestamptz,
  other_last_read_at timestamptz,
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
    case when allowed.can_send then other.last_seen_at end,
    allowed.can_send,
    mine.last_read_at,
    theirs.last_delivered_at,
    theirs.last_read_at,
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
    ),
    c.created_at
  from public.chat_members mine
  join public.chat_conversations c on c.id = mine.conversation_id
  join public.chat_members theirs
    on theirs.conversation_id = c.id and theirs.user_id <> mine.user_id
  join public.profiles other on other.id = theirs.user_id
  cross join lateral (
    select
      private.is_active_student(mine.user_id)
      and private.is_active_student(other.id)
      and private.are_study_buddies(mine.user_id, other.id) as can_send
  ) as allowed
  left join lateral (
    select m.id, m.sender_id, m.body, m.attachment_name, m.deleted_at, m.created_at
    from public.chat_messages m
    where m.conversation_id = c.id
    order by m.id desc
    limit 1
  ) as latest on true
  where mine.user_id = (select auth.uid())
    and (p_conversation is null or c.id = p_conversation)
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 200;
$$;

-- Returns: sent | not_found | not_buddies | empty | too_long |
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

  select case when c.user_low = v_me then c.user_high else c.user_low end
  into v_other
  from public.chat_conversations c
  where c.id = p_conversation
    and v_me in (c.user_low, c.user_high);

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

  if char_length(v_body) > 4000 then
    return query select 'too_long'::text, null::bigint;
    return;
  end if;

  if v_body = '' and p_attachment_path is null then
    return query select 'empty'::text, null::bigint;
    return;
  end if;

  -- The file must already be uploaded by this student into this
  -- conversation's folder and not belong to another message.
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

  -- The sender has obviously seen everything up to their own message.
  update public.chat_members
  set last_read_at = now(), last_delivered_at = now()
  where conversation_id = p_conversation and user_id = v_me;

  return query select 'sent'::text, v_id;
end;
$$;

-- "Delete for everyone": clears the sender's own message and returns the
-- attachment path so the web app can remove the stored file.
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
  where m.id = p_message and m.sender_id = v_me and m.deleted_at is null
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

-- Marks a conversation as read when the student has it open.
create or replace function public.mark_chat_read(p_conversation bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return;
  end if;

  -- Only write when something new arrived, to avoid needless Realtime events.
  update public.chat_members m
  set last_read_at = now(), last_delivered_at = now()
  where m.conversation_id = p_conversation
    and m.user_id = v_me
    and exists (
      select 1 from public.chat_messages x
      where x.conversation_id = p_conversation
        and x.sender_id <> v_me
        and (m.last_read_at is null or x.created_at > m.last_read_at)
    );
end;
$$;

-- Called while a student has any page open: records that they are online,
-- marks waiting messages as delivered, and returns how many chats are unread.
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
      and exists (
        select 1 from public.chat_messages x
        where x.conversation_id = m.conversation_id
          and x.sender_id <> v_me
          and x.deleted_at is null
          and (m.last_read_at is null or x.created_at > m.last_read_at)
      )
  );
end;
$$;

revoke execute on function public.open_direct_chat(uuid) from public, anon;
revoke execute on function public.list_my_chats(bigint) from public, anon;
revoke execute on function public.send_chat_message(bigint, text, bigint, text, text, text, bigint) from public, anon;
revoke execute on function public.delete_chat_message(bigint) from public, anon;
revoke execute on function public.mark_chat_read(bigint) from public, anon;
revoke execute on function public.sync_my_chats() from public, anon;

grant execute on function public.open_direct_chat(uuid) to authenticated;
grant execute on function public.list_my_chats(bigint) to authenticated;
grant execute on function public.send_chat_message(bigint, text, bigint, text, text, text, bigint) to authenticated;
grant execute on function public.delete_chat_message(bigint) to authenticated;
grant execute on function public.mark_chat_read(bigint) to authenticated;
grant execute on function public.sync_my_chats() to authenticated;

-- Realtime: members receive new messages, deletions and read receipts.
-- Row-level security above decides who receives each change.
do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    alter publication supabase_realtime add table public.chat_messages, public.chat_members;
  end if;
end;
$$;

-- Realtime private channels "chat:<conversation id>" carry the typing
-- indicator. Only the two members may join or send on them.
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
      and (select auth.uid()) in (c.user_low, c.user_high)
  )
);

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
      and (select auth.uid()) in (c.user_low, c.user_high)
  )
);

-- Private chat attachments, stored as <conversation id>/<uuid>-<file name>.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Readable by members once a message refers to the file (chat_messages RLS
-- applies inside the subquery). Uploaders can always read their own files,
-- which Storage also needs in order to delete them.
create policy chat_attachments_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.chat_messages m
      where m.attachment_path = name
    )
  )
);

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
      and (select auth.uid()) in (c.user_low, c.user_high)
  )
);

create policy chat_attachments_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and owner_id = (select auth.uid()::text)
);
