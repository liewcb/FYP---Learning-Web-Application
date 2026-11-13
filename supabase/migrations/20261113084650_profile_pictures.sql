-- Profile pictures. Students upload a small square picture (the browser
-- crops and shrinks it first) to the private `avatars` bucket, under a folder
-- named after their own id, and point profiles.avatar_path at it. Every
-- signed-in user may view pictures, as they may view profiles; the app shows
-- them through short-lived signed links.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  1048576,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_authenticated_select
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

-- A new picture always gets a new name, so there is no update policy.
create policy avatars_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy avatars_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- avatar_path was free text that nothing wrote. It may now only name a
-- picture in the student's own folder: <their id>/<random id>.<webp|jpg|png>.
update public.profiles
set avatar_path = null
where avatar_path is not null
  and avatar_path !~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$');

alter table public.profiles
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$')
  );
