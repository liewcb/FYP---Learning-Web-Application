create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  academic_major text,
  bio text,
  avatar_path text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('student', 'admin')),
  constraint profiles_full_name_length_check check (char_length(full_name) <= 120),
  constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 500)
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;

create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (true);

create policy profiles_owner_update
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, academic_major, bio, avatar_path, updated_at)
on public.profiles to authenticated;

create table public.documents (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_length_check check (char_length(title) between 1 and 200),
  constraint documents_size_check check (size_bytes between 1 and 26214400),
  constraint documents_mime_type_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint documents_status_check check (
    status in ('uploaded', 'processing', 'ready', 'failed')
  )
);

create index documents_owner_id_idx on public.documents (owner_id);
create index documents_owner_status_idx on public.documents (owner_id, status);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function private.set_updated_at();

alter table public.documents enable row level security;

create policy documents_owner_select
on public.documents
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy documents_owner_insert
on public.documents
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy documents_owner_update
on public.documents
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy documents_owner_delete
on public.documents
for delete
to authenticated
using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.documents to authenticated;
grant usage, select on sequence public.documents_id_seq to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'learning-materials',
  'learning-materials',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy learning_materials_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'learning-materials'
  and owner_id = (select auth.uid()::text)
);

create policy learning_materials_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy learning_materials_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'learning-materials'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'learning-materials'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy learning_materials_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'learning-materials'
  and owner_id = (select auth.uid()::text)
);
