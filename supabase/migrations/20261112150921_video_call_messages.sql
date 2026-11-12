-- Video calls as chat messages
--
-- The "started a video call" message now names its call and records when
-- the call ended, so the chat can show it as ongoing (with Join) or ended
-- (with its length). end_video_call() stamps the message, and because
-- chat_messages is published to Realtime, open chats see the change at once.

alter table public.chat_messages
  add column video_call_id bigint references public.video_calls (id) on delete set null,
  add column call_ended_at timestamptz,
  add constraint chat_messages_call_shape_check check (
    (video_call_id is null and call_ended_at is null)
    -- "is not distinct from": event is null on ordinary messages, and a
    -- null check would let them through.
    or event is not distinct from 'call_started'
  );

create index chat_messages_video_call_idx
on public.chat_messages (video_call_id)
where video_call_id is not null;

-- Earlier call messages: the call started in the same chat by the same
-- student at that moment.
update public.chat_messages m
set
  video_call_id = v.id,
  call_ended_at = v.ended_at
from public.video_calls v
where m.event = 'call_started'
  and m.video_call_id is null
  and v.conversation_id = m.conversation_id
  and v.started_by = m.sender_id
  and v.started_at between m.created_at - interval '10 seconds' and m.created_at + interval '10 seconds';

-- As in the video_calls migration, with the call's id on its message.
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

  insert into public.chat_messages (conversation_id, sender_id, body, event, video_call_id)
  values (p_conversation, v_me, '', 'call_started', v_id);

  update public.chat_conversations
  set last_message_at = now()
  where id = p_conversation;

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

-- As in the shared-documents migration, and the call's message is stamped.
create or replace function public.end_video_call(p_call bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.video_calls
  set ended_at = now()
  where id = p_call and ended_at is null;

  update public.video_call_shares
  set ended_at = now()
  where call_id = p_call and ended_at is null;

  update public.chat_messages
  set call_ended_at = (select v.ended_at from public.video_calls v where v.id = p_call)
  where video_call_id = p_call and call_ended_at is null;

  delete from public.notifications
  where video_call_id = p_call and read_at is null;
$$;

revoke execute on function public.open_video_call(bigint, boolean) from public, anon;
revoke execute on function public.end_video_call(bigint) from public, anon, authenticated;

grant execute on function public.open_video_call(bigint, boolean) to authenticated;
grant execute on function public.end_video_call(bigint) to service_role;
