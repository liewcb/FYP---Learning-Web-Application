-- Forum: study-buddy audience, topics and a personalised "For you" feed.
--
-- 1. A post can be shared with everyone ('community') or only with the
--    author's accepted study buddies ('connections'). The buddy check reads
--    the study-buddy module's peer_connections table; it does not change it.
-- 2. Every post carries 1-5 topic tags (lowercase, letters, numbers, '-').
-- 3. Students can follow topics. Follows and their own forum activity
--    (posts, comments, upvotes) are the signals the web app uses to rank the
--    "For you" feed. The ranking itself lives in the forum model.

-- ---------------------------------------------------------------- topics

alter table public.forum_threads
  add column topics text[] not null default '{}'::text[];

-- Up to five topics, each 1-30 characters of a-z, 0-9 and '-'.
alter table public.forum_threads
  add constraint forum_threads_topics_check check (
    cardinality(topics) <= 5
    and (
      cardinality(topics) = 0
      or array_to_string(topics, ',') ~ '^[a-z0-9][a-z0-9-]{0,29}(,[a-z0-9][a-z0-9-]{0,29}){0,4}$'
    )
  );

create index forum_threads_topics_idx
on public.forum_threads using gin (topics);

grant insert (topics) on public.forum_threads to authenticated;

-- ------------------------------------------------- study-buddy visibility

-- True when the signed-in student and p_other are accepted study buddies.
-- Security definer so the row-level policy below stays fast and does not
-- depend on peer_connections' own policies.
create or replace function public.is_study_buddy(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.peer_connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = (select auth.uid()) and c.addressee_id = p_other)
        or (c.addressee_id = (select auth.uid()) and c.requester_id = p_other)
      )
  );
$$;

revoke execute on function public.is_study_buddy(uuid) from public, anon;
grant execute on function public.is_study_buddy(uuid) to authenticated;

-- Replaces the placeholder from 20261020170924_forum_foundation.sql. Comments,
-- upvotes, attachments and reports all check the thread through this policy,
-- so a buddies-only post's comments and files are hidden from everyone else.
drop policy forum_threads_visible_select on public.forum_threads;

create policy forum_threads_visible_select
on public.forum_threads
for select
to authenticated
using (
  (select auth.uid()) = author_id
  or (
    status = 'published'
    and (
      visibility = 'community'
      or (visibility = 'connections' and public.is_study_buddy(author_id))
    )
  )
);

-- ----------------------------------------------------------- topic follows

create table public.forum_topic_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, topic),
  constraint forum_topic_follows_topic_check
    check (topic ~ '^[a-z0-9][a-z0-9-]{0,29}$')
);

alter table public.forum_topic_follows enable row level security;

create policy forum_topic_follows_owner_select
on public.forum_topic_follows
for select
to authenticated
using ((select auth.uid()) = user_id);

-- At most 30 followed topics per student.
create policy forum_topic_follows_owner_insert
on public.forum_topic_follows
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    select count(*)
    from public.forum_topic_follows f
    where f.user_id = (select auth.uid())
  ) < 30
);

create policy forum_topic_follows_owner_delete
on public.forum_topic_follows
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.forum_topic_follows from anon, authenticated;
grant select, insert, delete on public.forum_topic_follows to authenticated;
grant select, insert, update, delete on public.forum_topic_follows to service_role;

-- ------------------------------------------------------------ feed helpers

-- Topics used most in posts the viewer can see over the last 90 days.
-- Security invoker: row-level security decides which posts are counted.
create or replace function public.forum_popular_topics(p_limit integer default 12)
returns table (topic text, thread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.topic, count(*) as thread_count
  from public.forum_threads th
  cross join lateral unnest(th.topics) as t(topic)
  where th.status = 'published'
    and th.created_at > now() - interval '90 days'
  group by t.topic
  order by thread_count desc, t.topic
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

-- The signed-in student's interest signals for the "For you" ranking:
-- followed topics, and the topics of posts they wrote, commented on or
-- upvoted in the last 180 days. Security invoker, so only their own rows.
create or replace function public.my_forum_interest_signals()
returns table (topic text, source text, occurred_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.topic, 'followed', f.created_at
  from public.forum_topic_follows f
  where f.user_id = (select auth.uid())

  union all

  select t.topic, 'posted', th.created_at
  from public.forum_threads th
  cross join lateral unnest(th.topics) as t(topic)
  where th.author_id = (select auth.uid())
    and th.status = 'published'
    and th.created_at > now() - interval '180 days'

  union all

  select t.topic, 'commented', c.last_at
  from (
    select thread_id, max(created_at) as last_at
    from public.forum_comments
    where author_id = (select auth.uid())
      and created_at > now() - interval '180 days'
    group by thread_id
  ) c
  join public.forum_threads th on th.id = c.thread_id
  cross join lateral unnest(th.topics) as t(topic)

  union all

  select t.topic, 'upvoted', u.created_at
  from public.forum_thread_upvotes u
  join public.forum_threads th on th.id = u.thread_id
  cross join lateral unnest(th.topics) as t(topic)
  where u.user_id = (select auth.uid())
    and u.created_at > now() - interval '180 days';
$$;

revoke execute on function public.forum_popular_topics(integer) from public, anon;
revoke execute on function public.my_forum_interest_signals() from public, anon;
grant execute on function public.forum_popular_topics(integer) to authenticated;
grant execute on function public.my_forum_interest_signals() to authenticated;
