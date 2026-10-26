-- In-app notifications
--
-- Rows are created only by database triggers, so students cannot fake them.
-- A student can read their own notifications and mark them as read; no other
-- column can be changed through the Data API.

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    type in ('study_buddy_request', 'study_buddy_accepted')
  ),
  constraint notifications_not_self_check check (actor_id is null or actor_id <> recipient_id)
);

create index notifications_recipient_created_idx
on public.notifications (recipient_id, created_at desc);

create index notifications_recipient_unread_idx
on public.notifications (recipient_id)
where read_at is null;

create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;

create policy notifications_recipient_select
on public.notifications
for select
to authenticated
using ((select auth.uid()) = recipient_id);

create policy notifications_recipient_mark_read
on public.notifications
for update
to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

-- New request -> notify the recipient. Accepted -> notify the requester.
-- Cancelled or declined request -> withdraw its unread notification.
create or replace function private.notify_study_buddy_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.addressee_id, new.requester_id, 'study_buddy_request');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    -- The request has been handled, so it no longer needs attention.
    update public.notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = new.addressee_id
      and actor_id = new.requester_id
      and type = 'study_buddy_request';

    insert into public.notifications (recipient_id, actor_id, type)
    values (new.requester_id, new.addressee_id, 'study_buddy_accepted');
  elsif tg_op = 'DELETE' and old.status = 'pending' then
    delete from public.notifications
    where recipient_id = old.addressee_id
      and actor_id = old.requester_id
      and type = 'study_buddy_request'
      and read_at is null;
  end if;

  return null;
end;
$$;

revoke execute on function private.notify_study_buddy_change() from public, anon, authenticated;

create trigger peer_connections_notify
after insert or update of status or delete on public.peer_connections
for each row execute function private.notify_study_buddy_change();
