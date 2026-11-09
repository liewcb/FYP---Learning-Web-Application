-- Presenting documents in video calls
--
-- Anyone in a call may present one of their own documents from My Documents.
-- One document is presented at a time; presenting another replaces it. While
-- it is presented, everyone who may join the call can open it read-only. The
-- page each viewer sees is synced over the call's own data channel, not here.
--
-- The file stays in the presenter's private storage. The web server checks
-- get_call_share() and then signs a short-lived link to the file, so access
-- ends when the presentation or the call does.

create table public.video_call_shares (
  id bigint generated always as identity primary key,
  call_id bigint not null references public.video_calls (id) on delete cascade,
  document_id bigint not null references public.documents (id) on delete cascade,
  sharer_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint video_call_shares_ended_check check (ended_at is null or ended_at >= started_at)
);

-- One document presented per call.
create unique index video_call_shares_active_key
on public.video_call_shares (call_id)
where ended_at is null;

create index video_call_shares_document_idx on public.video_call_shares (document_id);
create index video_call_shares_sharer_idx on public.video_call_shares (sharer_id);

alter table public.video_call_shares enable row level security;

-- Presenters see their own shares; viewers go through get_call_share().
create policy video_call_shares_sharer_select
on public.video_call_shares
for select
to authenticated
using ((select auth.uid()) = sharer_id);

revoke all on public.video_call_shares from anon, authenticated;
grant select on public.video_call_shares to authenticated;
grant select, insert, update, delete on public.video_call_shares to service_role;
grant usage, select on sequence public.video_call_shares_id_seq to service_role;

-- Presents one of the student's own documents, replacing any other.
-- Returns: shared | not_allowed | not_found | rate_limited | unauthenticated
create or replace function public.start_call_share(p_call bigint, p_document bigint)
returns table (outcome text, share_id bigint)
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

  -- Locking the call serialises two students presenting at the same moment.
  perform 1 from public.video_calls v where v.id = p_call for update;

  if not private.can_join_call(p_call, v_me) then
    return query select 'not_allowed'::text, null::bigint;
    return;
  end if;

  if not exists (
    select 1 from public.documents d
    where d.id = p_document and d.owner_id = v_me
  ) then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.video_call_shares s
    where s.sharer_id = v_me and s.started_at > now() - interval '1 minute'
  ) >= 10 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  update public.video_call_shares
  set ended_at = now()
  where call_id = p_call and ended_at is null;

  insert into public.video_call_shares (call_id, document_id, sharer_id)
  values (p_call, p_document, v_me)
  returning id into v_id;

  return query select 'shared'::text, v_id;
end;
$$;

-- Stops the presentation. The presenter may always stop it; anyone else in
-- the call may stop one whose presenter has left (the web server checks the
-- room before passing p_presenter_gone).
-- Returns: stopped | not_found | unauthenticated
create or replace function public.stop_call_share(p_call bigint, p_presenter_gone boolean default false)
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

  update public.video_call_shares s
  set ended_at = now()
  where s.call_id = p_call
    and s.ended_at is null
    and (
      s.sharer_id = v_me
      or (coalesce(p_presenter_gone, false) and private.can_join_call(p_call, v_me))
    );

  return case when found then 'stopped' else 'not_found' end;
end;
$$;

-- The document presented in a call, for students who may join it. The
-- storage path is for the web server, which signs the link to the file.
create or replace function public.get_call_share(p_call bigint)
returns table (
  share_id bigint,
  sharer_id uuid,
  sharer_name text,
  document_title text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.sharer_id,
    coalesce(nullif(btrim(p.full_name), ''), p.username, 'A student'),
    d.title,
    d.file_name,
    d.mime_type,
    d.size_bytes,
    d.storage_path,
    s.started_at
  from public.video_call_shares s
  join public.documents d on d.id = s.document_id
  join public.profiles p on p.id = s.sharer_id
  where s.call_id = p_call
    and s.ended_at is null
    and private.can_join_call(p_call, (select auth.uid()));
$$;

-- Ending a call also ends its presentation.
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

  delete from public.notifications
  where video_call_id = p_call and read_at is null;
$$;

revoke execute on function public.start_call_share(bigint, bigint) from public, anon;
revoke execute on function public.stop_call_share(bigint, boolean) from public, anon;
revoke execute on function public.get_call_share(bigint) from public, anon;
revoke execute on function public.end_video_call(bigint) from public, anon, authenticated;

grant execute on function public.start_call_share(bigint, bigint) to authenticated;
grant execute on function public.stop_call_share(bigint, boolean) to authenticated;
grant execute on function public.get_call_share(bigint) to authenticated;
grant execute on function public.end_video_call(bigint) to service_role;
