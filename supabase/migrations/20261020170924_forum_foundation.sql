create table public.forum_threads (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  content text not null,
  visibility text not null default 'community',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_threads_title_length_check check (
    char_length(btrim(title)) between 5 and 160
  ),
  constraint forum_threads_content_length_check check (
    char_length(btrim(content)) between 10 and 5000
  ),
  constraint forum_threads_visibility_check check (
    visibility in ('community', 'connections')
  ),
  constraint forum_threads_status_check check (
    status in ('published', 'hidden', 'deleted')
  )
);

create index forum_threads_feed_idx
on public.forum_threads (status, visibility, created_at desc, id desc);

create index forum_threads_author_created_idx
on public.forum_threads (author_id, created_at desc);

create trigger forum_threads_set_updated_at
before update on public.forum_threads
for each row execute function private.set_updated_at();

create table public.forum_comments (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.forum_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id bigint references public.forum_comments (id) on delete cascade,
  content text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_comments_content_length_check check (
    char_length(btrim(content)) between 1 and 1500
  ),
  constraint forum_comments_status_check check (
    status in ('published', 'hidden', 'deleted')
  )
);

create index forum_comments_thread_created_idx
on public.forum_comments (thread_id, created_at, id);

create index forum_comments_author_id_idx
on public.forum_comments (author_id);

create index forum_comments_parent_comment_id_idx
on public.forum_comments (parent_comment_id)
where parent_comment_id is not null;

create trigger forum_comments_set_updated_at
before update on public.forum_comments
for each row execute function private.set_updated_at();

create table public.forum_thread_upvotes (
  thread_id bigint not null references public.forum_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index forum_thread_upvotes_user_id_idx
on public.forum_thread_upvotes (user_id);

create table public.forum_attachments (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.forum_threads (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint forum_attachments_file_name_length_check check (
    char_length(file_name) between 1 and 255
  ),
  constraint forum_attachments_size_check check (
    size_bytes between 1 and 10485760
  ),
  constraint forum_attachments_mime_type_check check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint forum_attachments_position_check check (position between 0 and 3),
  constraint forum_attachments_thread_position_key unique (thread_id, position)
);

create index forum_attachments_uploader_id_idx
on public.forum_attachments (uploader_id);

create table public.forum_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  thread_id bigint references public.forum_threads (id) on delete cascade,
  comment_id bigint references public.forum_comments (id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint forum_reports_one_target_check check (
    num_nonnulls(thread_id, comment_id) = 1
  ),
  constraint forum_reports_reason_length_check check (
    char_length(btrim(reason)) between 5 and 500
  ),
  constraint forum_reports_status_check check (
    status in ('pending', 'reviewed', 'dismissed', 'actioned')
  )
);

create index forum_reports_reporter_id_idx
on public.forum_reports (reporter_id);

create index forum_reports_thread_id_idx
on public.forum_reports (thread_id)
where thread_id is not null;

create index forum_reports_comment_id_idx
on public.forum_reports (comment_id)
where comment_id is not null;

create index forum_reports_status_created_idx
on public.forum_reports (status, created_at);

alter table public.forum_threads enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_thread_upvotes enable row level security;
alter table public.forum_attachments enable row level security;
alter table public.forum_reports enable row level security;

-- A community thread is visible to every signed-in student. A connections-only
-- thread remains owner-only until the peer-connection module adds its real
-- relationship predicate to this single policy.
create policy forum_threads_visible_select
on public.forum_threads
for select
to authenticated
using (
  (select auth.uid()) = author_id
  or (status = 'published' and visibility = 'community')
);

create policy forum_threads_owner_insert
on public.forum_threads
for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy forum_threads_owner_update
on public.forum_threads
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy forum_threads_owner_delete
on public.forum_threads
for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy forum_comments_visible_select
on public.forum_comments
for select
to authenticated
using (
  (
    (select auth.uid()) = author_id
    or status = 'published'
  )
  and exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_comments.thread_id
  )
);

create policy forum_comments_author_insert
on public.forum_comments
for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_comments.thread_id
      and thread.status = 'published'
  )
);

create policy forum_comments_author_update
on public.forum_comments
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy forum_comments_author_delete
on public.forum_comments
for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy forum_thread_upvotes_visible_select
on public.forum_thread_upvotes
for select
to authenticated
using (
  exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_thread_upvotes.thread_id
  )
);

create policy forum_thread_upvotes_owner_insert
on public.forum_thread_upvotes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_thread_upvotes.thread_id
      and thread.status = 'published'
  )
);

create policy forum_thread_upvotes_owner_delete
on public.forum_thread_upvotes
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy forum_attachments_visible_select
on public.forum_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_attachments.thread_id
  )
);

create policy forum_attachments_owner_insert
on public.forum_attachments
for insert
to authenticated
with check (
  (select auth.uid()) = uploader_id
  and exists (
    select 1
    from public.forum_threads thread
    where thread.id = forum_attachments.thread_id
      and thread.author_id = (select auth.uid())
  )
);

create policy forum_attachments_owner_delete
on public.forum_attachments
for delete
to authenticated
using ((select auth.uid()) = uploader_id);

create policy forum_reports_owner_select
on public.forum_reports
for select
to authenticated
using ((select auth.uid()) = reporter_id);

create policy forum_reports_owner_insert
on public.forum_reports
for insert
to authenticated
with check (
  (select auth.uid()) = reporter_id
  and (
    (
      thread_id is not null
      and exists (
        select 1
        from public.forum_threads thread
        where thread.id = forum_reports.thread_id
      )
    )
    or (
      comment_id is not null
      and exists (
        select 1
        from public.forum_comments comment
        where comment.id = forum_reports.comment_id
      )
    )
  )
);

-- Grants are explicit because new public tables are no longer automatically
-- exposed through the Supabase Data API after the October 2026 change.
grant select on public.forum_threads to authenticated;
grant insert (author_id, title, content, visibility)
on public.forum_threads to authenticated;
grant update (title, content, updated_at)
on public.forum_threads to authenticated;
grant delete on public.forum_threads to authenticated;

grant select on public.forum_comments to authenticated;
grant insert (thread_id, author_id, parent_comment_id, content)
on public.forum_comments to authenticated;
grant update (content, updated_at)
on public.forum_comments to authenticated;
grant delete on public.forum_comments to authenticated;

grant select, insert, delete on public.forum_thread_upvotes to authenticated;
grant select, insert, delete on public.forum_attachments to authenticated;
grant select, insert on public.forum_reports to authenticated;

grant select, insert, update, delete on
  public.forum_threads,
  public.forum_comments,
  public.forum_thread_upvotes,
  public.forum_attachments,
  public.forum_reports
to service_role;

grant usage, select on sequence
  public.forum_threads_id_seq,
  public.forum_comments_id_seq,
  public.forum_attachments_id_seq,
  public.forum_reports_id_seq
to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'forum-attachments',
  'forum-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy forum_attachments_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'forum-attachments'
  and exists (
    select 1
    from public.forum_attachments attachment
    where attachment.storage_path = name
  )
);

create policy forum_attachments_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'forum-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy forum_attachments_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'forum-attachments'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'forum-attachments'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy forum_attachments_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'forum-attachments'
  and owner_id = (select auth.uid()::text)
);
