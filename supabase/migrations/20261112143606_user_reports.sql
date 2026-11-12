-- Reports
--
-- One model for everything a student can report: another student's profile,
-- a chat message (direct or group), a forum post, a forum comment and a
-- library material. It replaces forum_reports and chat_reports, whose rows
-- are moved here.
--
-- Each report keeps a snapshot of what was reported, taken when it was sent,
-- so moderators see the evidence even after it is edited or deleted. For a
-- chat message the snapshot includes the few messages before it that the
-- reporter could see, as context.
--
-- Administrators decide a report from the Report review page: no violation,
-- remove the content, suspend the account, or both. A decision closes every
-- open report about the same thing, notifies each reporter and writes an
-- admin_audit_events row. Suspension itself goes through the web server
-- (it also blocks sign-in), which suspends first and then records the
-- decision here.
--
-- Students may read their own reports (not the moderator's identity or
-- internal note) and create them only through submit_report().

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  -- The reported content's id; null when a profile is reported.
  target_id bigint,
  -- The reported student, or the author of the reported content.
  target_user_id uuid references public.profiles (id) on delete cascade,
  -- The chat a message or chat-based profile report came from.
  conversation_id bigint references public.chat_conversations (id) on delete set null,
  target_label text not null,
  reason text not null,
  details text,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  resolution text,
  -- Shown to the reporter with the decision.
  reporter_message text,
  -- For moderators and the audit log only.
  internal_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_target_type_check check (
    target_type in ('user', 'chat_message', 'forum_thread', 'forum_comment', 'library_material')
  ),
  constraint reports_target_shape_check check (
    (target_type = 'user' and target_id is null and target_user_id is not null)
    or (target_type <> 'user' and target_id is not null)
  ),
  constraint reports_not_self_check check (target_user_id is distinct from reporter_id),
  constraint reports_reason_check check (
    reason in (
      'spam',
      'harassment',
      'hate_speech',
      'inappropriate',
      'impersonation',
      'academic_dishonesty',
      'copyright',
      'other'
    )
  ),
  constraint reports_label_length_check check (char_length(target_label) between 1 and 200),
  constraint reports_details_length_check check (details is null or char_length(details) <= 1000),
  constraint reports_snapshot_object_check check (jsonb_typeof(snapshot) = 'object'),
  constraint reports_reporter_message_length_check check (
    reporter_message is null or char_length(reporter_message) <= 500
  ),
  constraint reports_internal_note_length_check check (
    internal_note is null or char_length(internal_note) <= 500
  ),
  constraint reports_decision_check check (
    (status = 'pending' and resolution is null and reviewed_at is null)
    or (status = 'dismissed' and resolution = 'no_violation' and reviewed_at is not null)
    or (
      status = 'actioned'
      and resolution in ('content_removed', 'user_suspended', 'removed_and_suspended')
      and reviewed_at is not null
    )
  )
);

-- One open report per student and target.
create unique index reports_pending_per_reporter_key
on public.reports (reporter_id, target_type, coalesce(target_id::text, target_user_id::text))
where status = 'pending';

create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id) where target_id is not null;
create index reports_target_user_idx on public.reports (target_user_id);
create index reports_conversation_idx on public.reports (conversation_id) where conversation_id is not null;
create index reports_reviewed_by_idx on public.reports (reviewed_by) where reviewed_by is not null;

alter table public.reports enable row level security;

create policy reports_reporter_select
on public.reports
for select
to authenticated
using ((select auth.uid()) = reporter_id);

revoke all on public.reports from anon, authenticated;

-- Not reviewed_by or internal_note: who decided and why stays with moderators.
grant select (
  id,
  target_type,
  target_label,
  reason,
  details,
  status,
  resolution,
  reporter_message,
  created_at,
  reviewed_at
) on public.reports to authenticated;

grant select, insert, update, delete on public.reports to service_role;
grant usage, select on sequence public.reports_id_seq to service_role;

-- Notifications --------------------------------------------------------------

alter table public.notifications
  add column report_id bigint references public.reports (id) on delete cascade,
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'study_buddy_request',
      'study_buddy_accepted',
      'group_invite',
      'group_invite_accepted',
      'video_call_started',
      'video_call_invite',
      'report_resolved'
    )
  );

create index notifications_report_idx
on public.notifications (report_id)
where report_id is not null;

-- Helpers --------------------------------------------------------------------

create or replace function private.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.username, 'A student')
  from public.profiles p
  where p.id = p_user;
$$;

-- Messages of a chat that a student could see, newest last.
create or replace function private.chat_context(
  p_conversation bigint,
  p_viewer uuid,
  p_before_id bigint,
  p_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by item_id), '[]'::jsonb)
  from (
    select
      m.id as item_id,
      jsonb_build_object(
        'id', m.id,
        'sender_name', private.display_name(m.sender_id),
        'body', m.body,
        'attachment_name', m.attachment_name,
        'sent_at', m.created_at,
        'deleted', m.deleted_at is not null
      ) as item
    from public.chat_messages m
    join public.chat_members mem
      on mem.conversation_id = m.conversation_id and mem.user_id = p_viewer
    where m.conversation_id = p_conversation
      and m.event is null
      and m.created_at >= mem.joined_at
      and (mem.left_at is null or m.created_at <= mem.left_at)
      and (p_before_id is null or m.id < p_before_id)
    order by m.id desc
    limit p_limit
  ) recent;
$$;

-- Closes the open reports about one target, or only p_only_report, and
-- notifies each reporter. Returns how many were closed.
create or replace function private.close_reports(
  p_target_type text,
  p_target_id bigint,
  p_target_user uuid,
  p_only_report bigint,
  p_resolution text,
  p_admin uuid,
  p_reporter_message text,
  p_internal_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with closed as (
    update public.reports r
    set
      status = case when p_resolution = 'no_violation' then 'dismissed' else 'actioned' end,
      resolution = p_resolution,
      reporter_message = nullif(btrim(coalesce(p_reporter_message, '')), ''),
      internal_note = nullif(btrim(coalesce(p_internal_note, '')), ''),
      reviewed_by = p_admin,
      reviewed_at = now()
    where r.status = 'pending'
      and (
        (p_only_report is not null and r.id = p_only_report)
        or (
          p_only_report is null
          and r.target_type = p_target_type
          and (
            (p_target_type = 'user' and r.target_user_id = p_target_user)
            or (p_target_type <> 'user' and r.target_id = p_target_id)
          )
        )
      )
    returning r.id, r.reporter_id
  ),
  notified as (
    insert into public.notifications (recipient_id, actor_id, type, report_id)
    select c.reporter_id, null, 'report_resolved', c.id from closed c
    returning 1
  )
  select count(*) into v_count from notified;

  return v_count;
end;
$$;

revoke execute on function private.display_name(uuid) from public, anon, authenticated;
revoke execute on function private.chat_context(bigint, uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function private.close_reports(text, bigint, uuid, bigint, text, uuid, text, text) from public, anon, authenticated;

-- Reporting ------------------------------------------------------------------

-- p_target_type: user (p_target_user) | chat_message | forum_thread |
-- forum_comment | library_material (p_target_id). p_conversation adds the
-- recent messages of that chat to a profile report made from a chat.
-- Returns: reported | duplicate | not_found | own_content | invalid |
--          rate_limited | unauthenticated
create or replace function public.submit_report(
  p_target_type text,
  p_target_id bigint,
  p_target_user uuid,
  p_reason text,
  p_details text default null,
  p_conversation bigint default null
)
returns table (outcome text, report_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_author uuid;
  v_label text;
  v_snapshot jsonb;
  v_conversation bigint;
  v_id bigint;
  v_message public.chat_messages%rowtype;
  v_chat public.chat_conversations%rowtype;
begin
  if v_me is null or not private.is_active_student(v_me) then
    return query select 'unauthenticated'::text, null::bigint;
    return;
  end if;

  if p_reason is null
    or p_reason not in (
      'spam', 'harassment', 'hate_speech', 'inappropriate',
      'impersonation', 'academic_dishonesty', 'copyright', 'other'
    )
    or char_length(coalesce(v_details, '')) > 1000
    or (p_reason = 'other' and v_details is null) then
    return query select 'invalid'::text, null::bigint;
    return;
  end if;

  case p_target_type
    when 'user' then
      select
        p.id,
        format('%s''s profile', private.display_name(p.id)),
        jsonb_build_object(
          'full_name', p.full_name,
          'username', p.username,
          'bio', p.bio,
          'academic_major', p.academic_major,
          'year_of_study', p.year_of_study,
          'interests', to_jsonb(p.interests)
        )
      into v_author, v_label, v_snapshot
      from public.profiles p
      where p.id = p_target_user and p.role = 'student';

      if found and p_conversation is not null and exists (
        select 1 from public.chat_members mem
        where mem.conversation_id = p_conversation and mem.user_id = v_me
      ) then
        v_conversation := p_conversation;
        v_snapshot := v_snapshot || jsonb_build_object(
          'context', private.chat_context(p_conversation, v_me, null, 10)
        );
      end if;

    when 'chat_message' then
      select m.* into v_message
      from public.chat_messages m
      join public.chat_members mem
        on mem.conversation_id = m.conversation_id and mem.user_id = v_me
      where m.id = p_target_id
        and m.event is null
        and m.deleted_at is null
        and m.created_at >= mem.joined_at
        and (mem.left_at is null or m.created_at <= mem.left_at);

      if found then
        select * into v_chat from public.chat_conversations where id = v_message.conversation_id;
        v_author := v_message.sender_id;
        v_conversation := v_message.conversation_id;
        v_label := format('A message from %s', private.display_name(v_message.sender_id));
        v_snapshot := jsonb_build_object(
          'body', v_message.body,
          'attachment_name', v_message.attachment_name,
          'sent_at', v_message.created_at,
          'sender_name', private.display_name(v_message.sender_id),
          'chat', v_chat.kind,
          'group_title', v_chat.title,
          'context', private.chat_context(v_message.conversation_id, v_me, v_message.id, 5)
        );
      end if;

    when 'forum_thread' then
      select
        t.author_id,
        format('Forum post "%s"', left(t.title, 120)),
        jsonb_build_object('title', t.title, 'content', t.content)
      into v_author, v_label, v_snapshot
      from public.forum_threads t
      where t.id = p_target_id and t.status = 'published';

    when 'forum_comment' then
      select
        c.author_id,
        format('A comment by %s on "%s"', private.display_name(c.author_id), left(t.title, 80)),
        jsonb_build_object('content', c.content, 'thread_id', t.id, 'thread_title', t.title)
      into v_author, v_label, v_snapshot
      from public.forum_comments c
      join public.forum_threads t on t.id = c.thread_id
      where c.id = p_target_id and c.status = 'published' and t.status = 'published';

    when 'library_material' then
      select
        l.submitted_by,
        format('Library material "%s"', left(l.title, 120)),
        jsonb_build_object(
          'title', l.title,
          'description', l.description,
          'subject_name', l.subject_name,
          'module_code', l.module_code
        )
      into v_author, v_label, v_snapshot
      from public.library_materials l
      where l.id = p_target_id and l.status = 'published';

    else
      return query select 'invalid'::text, null::bigint;
      return;
  end case;

  if v_label is null then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

  if v_author = v_me then
    return query select 'own_content'::text, null::bigint;
    return;
  end if;

  if exists (
    select 1 from public.reports r
    where r.reporter_id = v_me
      and r.status = 'pending'
      and r.target_type = p_target_type
      and (
        (p_target_type = 'user' and r.target_user_id = p_target_user)
        or (p_target_type <> 'user' and r.target_id = p_target_id)
      )
  ) then
    return query select 'duplicate'::text, null::bigint;
    return;
  end if;

  if (
    select count(*) from public.reports r
    where r.reporter_id = v_me and r.created_at > now() - interval '1 day'
  ) >= 20 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.reports (
    reporter_id,
    target_type,
    target_id,
    target_user_id,
    conversation_id,
    target_label,
    reason,
    details,
    snapshot
  )
  values (
    v_me,
    p_target_type,
    case when p_target_type = 'user' then null else p_target_id end,
    v_author,
    v_conversation,
    left(v_label, 200),
    p_reason,
    v_details,
    v_snapshot
  )
  returning id into v_id;

  return query select 'reported'::text, v_id;
end;
$$;

-- The chat's contact-info "Report" now files a profile report with the
-- chat's recent messages as context. It still blocks when asked.
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
  v_outcome text;
begin
  if v_me is null then
    return 'unauthenticated';
  end if;

  v_other := private.chat_other_member(p_conversation, v_me);

  if v_other is null then
    return 'not_found';
  end if;

  if p_block then
    insert into public.chat_blocks (blocker_id, blocked_id)
    values (v_me, v_other)
    on conflict do nothing;
  end if;

  select s.outcome into v_outcome
  from public.submit_report('user', null, v_other, p_reason, p_details, p_conversation) s;

  return case
    when v_outcome in ('reported', 'duplicate', 'invalid', 'not_found', 'unauthenticated') then v_outcome
    else 'invalid'
  end;
end;
$$;

-- Moderators -------------------------------------------------------------------

create or replace function public.admin_list_reports(
  p_status text default 'pending',
  p_target_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  target_type text,
  target_label text,
  reason text,
  details text,
  status text,
  resolution text,
  reporter_name text,
  reported_user_id uuid,
  reported_name text,
  reported_account_status text,
  open_reports_on_target bigint,
  reviewer_name text,
  created_at timestamptz,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    r.id,
    r.target_type,
    r.target_label,
    r.reason,
    r.details,
    r.status,
    r.resolution,
    private.display_name(r.reporter_id),
    r.target_user_id,
    private.display_name(r.target_user_id),
    reported.account_status,
    (
      select count(*) from public.reports o
      where o.status = 'pending'
        and o.target_type = r.target_type
        and (
          (r.target_type = 'user' and o.target_user_id = r.target_user_id)
          or (r.target_type <> 'user' and o.target_id = r.target_id)
        )
    )::bigint,
    private.display_name(r.reviewed_by),
    r.created_at,
    r.reviewed_at,
    count(*) over ()::bigint
  from public.reports r
  left join public.profiles reported on reported.id = r.target_user_id
  where (p_status is null or p_status in ('', 'all') or r.status = p_status)
    and (p_target_type is null or p_target_type in ('', 'all') or r.target_type = p_target_type)
  order by (r.status = 'pending') desc, r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Everything a moderator needs to decide one report, or null.
create or replace function public.admin_get_report(p_report bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_current jsonb;
begin
  perform private.require_admin();

  select * into v_report from public.reports where id = p_report;

  if not found then
    return null;
  end if;

  -- Where the reported thing stands now.
  v_current := case v_report.target_type
    when 'user' then (
      select jsonb_build_object('exists', true, 'state', p.account_status)
      from public.profiles p where p.id = v_report.target_user_id
    )
    when 'chat_message' then (
      select jsonb_build_object(
        'exists', true,
        'state', case when m.deleted_at is null then 'visible' else 'removed' end
      )
      from public.chat_messages m where m.id = v_report.target_id
    )
    when 'forum_thread' then (
      select jsonb_build_object('exists', true, 'state', t.status)
      from public.forum_threads t where t.id = v_report.target_id
    )
    when 'forum_comment' then (
      select jsonb_build_object('exists', true, 'state', c.status)
      from public.forum_comments c where c.id = v_report.target_id
    )
    when 'library_material' then (
      select jsonb_build_object('exists', true, 'state', l.status)
      from public.library_materials l where l.id = v_report.target_id
    )
  end;

  return jsonb_build_object(
    'id', v_report.id,
    'target_type', v_report.target_type,
    'target_id', v_report.target_id,
    'target_label', v_report.target_label,
    'reason', v_report.reason,
    'details', v_report.details,
    'snapshot', v_report.snapshot,
    'status', v_report.status,
    'resolution', v_report.resolution,
    'reporter_message', v_report.reporter_message,
    'internal_note', v_report.internal_note,
    'created_at', v_report.created_at,
    'reviewed_at', v_report.reviewed_at,
    'reviewer_name', private.display_name(v_report.reviewed_by),
    'reporter', (
      select jsonb_build_object('id', p.id, 'name', private.display_name(p.id), 'username', p.username)
      from public.profiles p where p.id = v_report.reporter_id
    ),
    'reported_user', (
      select jsonb_build_object(
        'id', p.id,
        'name', private.display_name(p.id),
        'username', p.username,
        'account_status', p.account_status,
        'role', p.role
      )
      from public.profiles p where p.id = v_report.target_user_id
    ),
    'current', coalesce(v_current, jsonb_build_object('exists', false, 'state', null)),
    'other_reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'reporter_name', private.display_name(o.reporter_id),
        'reason', o.reason,
        'details', o.details,
        'status', o.status,
        'created_at', o.created_at
      ) order by o.created_at desc), '[]'::jsonb)
      from public.reports o
      where o.id <> v_report.id
        and o.target_type = v_report.target_type
        and (
          (v_report.target_type = 'user' and o.target_user_id = v_report.target_user_id)
          or (v_report.target_type <> 'user' and o.target_id = v_report.target_id)
        )
    )
  );
end;
$$;

-- p_decision: no_violation | remove_content | suspend_user | remove_and_suspend.
-- The web server suspends the account first (it also blocks sign-in), so a
-- decision that suspends requires the account to be suspended already.
-- Returns: resolved | not_found | already_resolved | invalid |
--          not_applicable | not_suspended | reason_required
-- removed_path: a removed chat attachment, for the server to delete.
create or replace function public.admin_resolve_report(
  p_report bigint,
  p_decision text,
  p_reporter_message text default null,
  p_note text default null
)
returns table (outcome text, closed_reports integer, removed_path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_message text := nullif(btrim(coalesce(p_reporter_message, '')), '');
  v_resolution text;
  v_removes boolean := p_decision in ('remove_content', 'remove_and_suspend');
  v_suspends boolean := p_decision in ('suspend_user', 'remove_and_suspend');
  v_path text;
  v_closed integer;
begin
  if p_decision is null
    or p_decision not in ('no_violation', 'remove_content', 'suspend_user', 'remove_and_suspend')
    or char_length(coalesce(v_note, '')) > 500
    or char_length(coalesce(v_message, '')) > 500 then
    return query select 'invalid'::text, 0, null::text;
    return;
  end if;

  select * into v_report from public.reports where id = p_report for update;

  if not found then
    return query select 'not_found'::text, 0, null::text;
    return;
  end if;

  if v_report.status <> 'pending' then
    return query select 'already_resolved'::text, 0, null::text;
    return;
  end if;

  if (v_removes and v_report.target_type = 'user')
    or (v_suspends and v_report.target_user_id is null) then
    return query select 'not_applicable'::text, 0, null::text;
    return;
  end if;

  if p_decision <> 'no_violation' and v_note is null then
    return query select 'reason_required'::text, 0, null::text;
    return;
  end if;

  if v_suspends and not exists (
    select 1 from public.profiles p
    where p.id = v_report.target_user_id and p.account_status = 'suspended'
  ) then
    return query select 'not_suspended'::text, 0, null::text;
    return;
  end if;

  if v_removes then
    case v_report.target_type
      when 'forum_thread' then
        update public.forum_threads set status = 'deleted'
        where id = v_report.target_id and status <> 'deleted';
      when 'forum_comment' then
        update public.forum_comments set status = 'deleted'
        where id = v_report.target_id and status <> 'deleted';
      when 'chat_message' then
        select m.attachment_path into v_path
        from public.chat_messages m
        where m.id = v_report.target_id and m.deleted_at is null
        for update;

        update public.chat_messages
        set
          body = '',
          attachment_path = null,
          attachment_name = null,
          attachment_type = null,
          attachment_size = null,
          deleted_at = now()
        where id = v_report.target_id and deleted_at is null;
      when 'library_material' then
        update public.library_materials
        set
          status = 'archived',
          archived_at = now(),
          review_note = left('Removed after a report: ' || v_note, 2000)
        where id = v_report.target_id and status <> 'archived';
    end case;
  end if;

  v_resolution := case p_decision
    when 'no_violation' then 'no_violation'
    when 'remove_content' then 'content_removed'
    when 'suspend_user' then 'user_suspended'
    else 'removed_and_suspended'
  end;

  v_closed := private.close_reports(
    v_report.target_type,
    v_report.target_id,
    v_report.target_user_id,
    null,
    v_resolution,
    v_admin,
    v_message,
    v_note
  );

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'report_' || v_resolution,
    'report',
    v_report.id,
    jsonb_build_object(
      'target_type', v_report.target_type,
      'target_id', v_report.target_id,
      'target_user_id', v_report.target_user_id,
      'target_label', v_report.target_label,
      'reason', v_report.reason,
      'reports_closed', v_closed,
      'note', v_note
    )
  );

  return query select 'resolved'::text, v_closed, v_path;
end;
$$;

revoke execute on function public.submit_report(text, bigint, uuid, text, text, bigint) from public, anon;
revoke execute on function public.report_chat(bigint, text, text, boolean) from public, anon;
revoke execute on function public.admin_list_reports(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_get_report(bigint) from public, anon;
revoke execute on function public.admin_resolve_report(bigint, text, text, text) from public, anon;

grant execute on function public.submit_report(text, bigint, uuid, text, text, bigint) to authenticated;
grant execute on function public.report_chat(bigint, text, text, boolean) to authenticated;
-- Authenticated callers reach the admin functions, which then refuse non-admins.
grant execute on function public.admin_list_reports(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_report(bigint) to authenticated;
grant execute on function public.admin_resolve_report(bigint, text, text, text) to authenticated;

-- Moving the old reports ---------------------------------------------------------

insert into public.reports (
  reporter_id,
  target_type,
  target_id,
  target_user_id,
  target_label,
  reason,
  details,
  snapshot,
  status,
  resolution,
  reviewed_at,
  created_at
)
select
  fr.reporter_id,
  case when fr.thread_id is not null then 'forum_thread' else 'forum_comment' end,
  coalesce(fr.thread_id, fr.comment_id),
  nullif(coalesce(t.author_id, c.author_id), fr.reporter_id),
  case
    when fr.thread_id is not null then format('Forum post "%s"', left(t.title, 120))
    else format('A comment by %s on "%s"', private.display_name(c.author_id), left(ct.title, 80))
  end,
  'other',
  left(fr.reason, 1000),
  case
    when fr.thread_id is not null then jsonb_build_object('title', t.title, 'content', t.content)
    else jsonb_build_object('content', c.content, 'thread_id', ct.id, 'thread_title', ct.title)
  end,
  case fr.status when 'pending' then 'pending' when 'actioned' then 'actioned' else 'dismissed' end,
  case fr.status when 'pending' then null when 'actioned' then 'content_removed' else 'no_violation' end,
  case when fr.status = 'pending' then null else coalesce(fr.reviewed_at, fr.created_at) end,
  fr.created_at
from public.forum_reports fr
left join public.forum_threads t on t.id = fr.thread_id
left join public.forum_comments c on c.id = fr.comment_id
left join public.forum_threads ct on ct.id = c.thread_id
-- Keep one open report per student and post, as the new index requires.
where fr.status <> 'pending' or fr.id = (
  select min(d.id) from public.forum_reports d
  where d.reporter_id = fr.reporter_id
    and d.status = 'pending'
    and d.thread_id is not distinct from fr.thread_id
    and d.comment_id is not distinct from fr.comment_id
);

insert into public.reports (
  reporter_id,
  target_type,
  target_user_id,
  conversation_id,
  target_label,
  reason,
  details,
  snapshot,
  status,
  resolution,
  reviewed_at,
  created_at
)
select
  cr.reporter_id,
  'user',
  cr.reported_id,
  cr.conversation_id,
  format('%s''s profile', private.display_name(cr.reported_id)),
  cr.reason,
  cr.details,
  jsonb_build_object(
    'full_name', p.full_name,
    'username', p.username,
    'bio', p.bio,
    'academic_major', p.academic_major,
    'year_of_study', p.year_of_study,
    'interests', to_jsonb(p.interests)
  ),
  case cr.status when 'pending' then 'pending' when 'actioned' then 'actioned' else 'dismissed' end,
  case cr.status when 'pending' then null when 'actioned' then 'user_suspended' else 'no_violation' end,
  case when cr.status = 'pending' then null else cr.created_at end,
  cr.created_at
from public.chat_reports cr
join public.profiles p on p.id = cr.reported_id
where cr.status <> 'pending' or cr.id = (
  select max(d.id) from public.chat_reports d
  where d.reporter_id = cr.reporter_id and d.reported_id = cr.reported_id and d.status = 'pending'
);

drop table public.forum_reports;
drop table public.chat_reports;

-- Forum moderation reads the new table ---------------------------------------------
-- The bodies below are those of the admin_operations migration with
-- forum_reports replaced by reports; acting on a post also notifies its
-- reporters.

create or replace function public.admin_list_forum_threads(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  title text,
  content text,
  status text,
  visibility text,
  author_id uuid,
  author_name text,
  comment_count bigint,
  upvote_count bigint,
  pending_report_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();

  return query
  select
    t.id,
    t.title,
    t.content,
    t.status,
    t.visibility,
    t.author_id,
    coalesce(nullif(p.full_name, ''), p.username, 'Unknown student'),
    (select count(*) from public.forum_comments c where c.thread_id = t.id)::bigint,
    (select count(*) from public.forum_thread_upvotes v where v.thread_id = t.id)::bigint,
    (select count(*) from public.reports r
      where r.target_type = 'forum_thread' and r.target_id = t.id and r.status = 'pending')::bigint,
    t.created_at,
    t.updated_at
  from public.forum_threads t
  left join public.profiles p on p.id = t.author_id
  where (p_status is null or p_status = '' or p_status = 'all' or t.status = p_status)
    and (v_search is null or t.title ilike '%' || v_search || '%' or t.content ilike '%' || v_search || '%')
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_list_forum_comments(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  thread_id bigint,
  thread_title text,
  content text,
  status text,
  author_id uuid,
  author_name text,
  pending_report_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_admin();

  return query
  select
    c.id,
    c.thread_id,
    t.title,
    c.content,
    c.status,
    c.author_id,
    coalesce(nullif(p.full_name, ''), p.username, 'Unknown student'),
    (select count(*) from public.reports r
      where r.target_type = 'forum_comment' and r.target_id = c.id and r.status = 'pending')::bigint,
    c.created_at
  from public.forum_comments c
  join public.forum_threads t on t.id = c.thread_id
  left join public.profiles p on p.id = c.author_id
  where (p_status is null or p_status = '' or p_status = 'all' or c.status = p_status)
    and (v_search is null or c.content ilike '%' || v_search || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_list_forum_reports(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  id bigint,
  target_kind text,
  target_id bigint,
  thread_id bigint,
  thread_title text,
  target_content text,
  target_status text,
  target_author_name text,
  reporter_name text,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    r.id,
    case when r.target_type = 'forum_thread' then 'thread' else 'comment' end,
    r.target_id,
    coalesce(t.id, c.thread_id),
    coalesce(t.title, ct.title),
    coalesce(t.content, c.content),
    coalesce(t.status, c.status),
    coalesce(nullif(author.full_name, ''), author.username, 'Unknown student'),
    coalesce(nullif(reporter.full_name, ''), reporter.username, 'Unknown student'),
    -- The forum page shows one line: the category, then the reporter's words.
    case
      when r.details is null then initcap(replace(r.reason, '_', ' '))
      else initcap(replace(r.reason, '_', ' ')) || ': ' || r.details
    end,
    r.status,
    r.created_at,
    r.reviewed_at
  from public.reports r
  left join public.forum_threads t on r.target_type = 'forum_thread' and t.id = r.target_id
  left join public.forum_comments c on r.target_type = 'forum_comment' and c.id = r.target_id
  left join public.forum_threads ct on ct.id = c.thread_id
  left join public.profiles author on author.id = coalesce(t.author_id, c.author_id)
  left join public.profiles reporter on reporter.id = r.reporter_id
  where r.target_type in ('forum_thread', 'forum_comment')
    and (p_status is null or p_status = '' or p_status = 'all' or r.status = p_status)
  order by (r.status = 'pending') desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- p_kind: thread | comment. p_action: hide | restore | delete.
-- Returns: updated | unchanged | not_found | invalid | reason_required
create or replace function public.admin_moderate_forum_content(
  p_kind text,
  p_id bigint,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new_status text;
  v_old_status text;
  v_author uuid;
  v_excerpt text;
begin
  if p_kind not in ('thread', 'comment') or p_action not in ('hide', 'restore', 'delete') then
    return 'invalid';
  end if;

  if p_action <> 'restore' and v_reason is null then
    return 'reason_required';
  end if;

  v_new_status := case p_action
    when 'hide' then 'hidden'
    when 'delete' then 'deleted'
    else 'published'
  end;

  if p_kind = 'thread' then
    select status, author_id, left(title, 160)
    into v_old_status, v_author, v_excerpt
    from public.forum_threads where id = p_id for update;
  else
    select status, author_id, left(content, 160)
    into v_old_status, v_author, v_excerpt
    from public.forum_comments where id = p_id for update;
  end if;

  if not found then
    return 'not_found';
  end if;

  if v_old_status = v_new_status then
    return 'unchanged';
  end if;

  if p_kind = 'thread' then
    update public.forum_threads set status = v_new_status where id = p_id;
  else
    update public.forum_comments set status = v_new_status where id = p_id;
  end if;

  -- Acting on content decides the reports about it and tells the reporters.
  perform private.close_reports(
    'forum_' || p_kind,
    p_id,
    null,
    null,
    case when p_action = 'restore' then 'no_violation' else 'content_removed' end,
    v_admin,
    null,
    v_reason
  );

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'forum_' || p_kind || '_' || case p_action
      when 'hide' then 'hidden'
      when 'delete' then 'deleted'
      else 'restored'
    end,
    'forum_' || p_kind,
    p_id,
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_new_status,
      'author_id', v_author,
      'excerpt', v_excerpt,
      'reason', v_reason
    )
  );

  return 'updated';
end;
$$;

-- Returns: updated | not_found
create or replace function public.admin_dismiss_forum_report(p_report bigint, p_note text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_report
  from public.reports
  where id = p_report
    and status = 'pending'
    and target_type in ('forum_thread', 'forum_comment')
  for update;

  if not found then
    return 'not_found';
  end if;

  perform private.close_reports(null, null, null, p_report, 'no_violation', v_admin, null, v_note);

  insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_admin,
    'forum_report_dismissed',
    'forum_report',
    p_report,
    jsonb_build_object(
      'thread_id', case when v_report.target_type = 'forum_thread' then v_report.target_id end,
      'comment_id', case when v_report.target_type = 'forum_comment' then v_report.target_id end,
      'report_reason', v_report.reason,
      'note', v_note
    )
  );

  return 'updated';
end;
$$;

-- System overview: as in the admin_operations migration, with forum reports
-- counted from the new table and every open report counted as well.
create or replace function public.admin_system_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sessions jsonb := null;
  v_buckets jsonb := null;
begin
  perform private.require_admin();

  begin
    select jsonb_build_object(
      'active', count(*) filter (where s.not_after is null or s.not_after > now()),
      'refreshed_last_hour', count(*) filter (
        where coalesce(s.refreshed_at::timestamptz, s.updated_at) > now() - interval '1 hour'
      ),
      'users_with_sessions', count(distinct s.user_id) filter (where s.not_after is null or s.not_after > now())
    )
    into v_sessions
    from auth.sessions s;
  exception when insufficient_privilege or undefined_table or undefined_column then
    v_sessions := null;
  end;

  begin
    select coalesce(jsonb_agg(b order by b.bytes desc), '[]'::jsonb)
    into v_buckets
    from (
      select
        o.bucket_id as bucket,
        count(*)::bigint as objects,
        coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes
      from storage.objects o
      group by o.bucket_id
    ) b;
  exception when insufficient_privilege or undefined_table then
    v_buckets := null;
  end;

  select jsonb_build_object(
    'generated_at', now(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'students', count(*) filter (where role = 'student'),
        'admins', count(*) filter (where role = 'admin'),
        'suspended', count(*) filter (where account_status = 'suspended'),
        'new_last_7_days', count(*) filter (where created_at > now() - interval '7 days'),
        'seen_last_15_minutes', count(*) filter (where last_seen_at > now() - interval '15 minutes'),
        'seen_last_24_hours', count(*) filter (where last_seen_at > now() - interval '24 hours')
      )
      from public.profiles
    ),
    'sessions', v_sessions,
    'storage', jsonb_build_object(
      'buckets', v_buckets,
      'document_bytes', (select coalesce(sum(size_bytes), 0) from public.documents),
      'quota_bytes', (select coalesce(sum(storage_quota_bytes), 0) from public.profiles where role = 'student'),
      'users_over_80_percent', (
        select count(*) from (
          select p.id
          from public.profiles p
          join public.documents d on d.owner_id = p.id
          group by p.id, p.storage_quota_bytes
          having sum(d.size_bytes) >= 0.8 * p.storage_quota_bytes
        ) heavy
      )
    ),
    'documents', (
      select jsonb_build_object(
        'total', count(*),
        'ready', count(*) filter (where status = 'ready'),
        'processing', count(*) filter (where status in ('uploaded', 'processing')),
        'failed', count(*) filter (where status = 'failed'),
        'uploaded_last_24_hours', count(*) filter (where created_at > now() - interval '24 hours')
      )
      from public.documents
    ),
    'ai', jsonb_build_object(
      'analyses_ready', (select count(*) from public.document_analyses where status = 'ready'),
      'analyses_failed', (select count(*) from public.document_analyses where status = 'failed'),
      'analyses_stuck', (select count(*) from public.document_analyses
        where status in ('pending', 'processing') and created_at < now() - interval '15 minutes'),
      'quizzes_ready', (select count(*) from public.quizzes where status = 'ready'),
      'quizzes_failed', (select count(*) from public.quizzes where status = 'failed'),
      'quiz_attempts', (select count(*) from public.quiz_attempts where status = 'graded'),
      'quiz_attempts_last_24_hours', (select count(*) from public.quiz_attempts
        where status = 'graded' and submitted_at > now() - interval '24 hours')
    ),
    'community', jsonb_build_object(
      'forum_threads', (select count(*) from public.forum_threads where status = 'published'),
      'forum_comments', (select count(*) from public.forum_comments where status = 'published'),
      'pending_forum_reports', (select count(*) from public.reports
        where status = 'pending' and target_type in ('forum_thread', 'forum_comment')),
      'pending_reports', (select count(*) from public.reports where status = 'pending'),
      'pending_library_materials', (select count(*) from public.library_materials where status = 'pending_review')
    ),
    'activity', (
      select coalesce(jsonb_agg(day_row order by day_row.day), '[]'::jsonb)
      from (
        select
          days.day::date as day,
          (select count(*) from public.profiles p where p.created_at::date = days.day::date) as new_users,
          (select count(*) from public.documents d where d.created_at::date = days.day::date) as uploads,
          (select count(*) from public.quiz_attempts a
            where a.status = 'graded' and a.submitted_at::date = days.day::date) as quiz_attempts,
          (select count(*) from public.forum_threads t where t.created_at::date = days.day::date)
            + (select count(*) from public.forum_comments c where c.created_at::date = days.day::date)
            as forum_posts
        from generate_series(current_date - 13, current_date, interval '1 day') as days(day)
      ) day_row
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- The audit log's area filter learns about reports.
create or replace function public.admin_list_audit_events(
  p_area text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id bigint,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    e.id,
    e.actor_id,
    coalesce(nullif(p.full_name, ''), p.username, 'System'),
    e.action,
    e.entity_type,
    e.entity_id,
    e.metadata,
    e.created_at,
    count(*) over ()::bigint
  from public.admin_audit_events e
  left join public.profiles p on p.id = e.actor_id
  where p_area is null or p_area = '' or p_area = 'all'
    or (p_area = 'users' and e.entity_type = 'user')
    or (p_area = 'forum' and e.entity_type like 'forum\_%')
    or (p_area = 'library' and e.entity_type like 'library\_%')
    or (p_area = 'reports' and e.entity_type = 'report')
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
