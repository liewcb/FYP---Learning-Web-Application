-- Re-inviting former group members
--
-- The admin may now invite anyone who left or was removed from the group,
-- not only their own study buddies, so members added by an earlier admin can
-- come back. The five-member limit, blocking and the one-day wait after a
-- declined invitation still apply. Rejoining starts a fresh membership window.

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
  v_former_member boolean;
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

  if exists (
    select 1 from public.chat_members m
    where m.conversation_id = p_conversation
      and m.user_id = p_invitee
      and m.left_at is null
  ) then
    return 'already_member';
  end if;

  v_former_member := exists (
    select 1 from public.chat_members m
    where m.conversation_id = p_conversation
      and m.user_id = p_invitee
      and m.left_at is not null
  );

  if p_invitee is null
    or p_invitee = v_me
    or not private.is_active_student(p_invitee)
    or not (v_former_member or private.are_study_buddies(v_me, p_invitee))
    or private.is_chat_blocked(v_me, p_invitee) then
    return 'not_buddies';
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

revoke execute on function public.invite_to_group(bigint, uuid) from public, anon;
grant execute on function public.invite_to_group(bigint, uuid) to authenticated;
