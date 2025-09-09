insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,  -- 5MB
  array['image/jpeg', 'image/jpg', 'image/png']::text[]
) on conflict (id) do nothing;

-- Drop policy if exists
drop policy if exists "Users can manage their own avatar" on storage.objects;
create policy "Users can manage their own avatar"
on storage.objects
for all
using (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
on storage.objects
for select
using (bucket_id = 'profile-avatars');
