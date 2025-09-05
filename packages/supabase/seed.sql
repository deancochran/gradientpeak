-- Supabase seed.sql for development data
-- This file is used to populate your database with sample data for development

-- Create storage bucket for profile avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
) on conflict (id) do nothing;


-- Policy: Users can upload their own avatar (folder structure: user_id/filename)
create policy "Users can upload their own avatar"
on storage.objects
for insert
with check (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Anyone can view avatars (since bucket is public)
create policy "Anyone can view avatars"
on storage.objects
for select
using (bucket_id = 'profile-avatars');

-- Policy: Users can update/replace their own avatar
create policy "Users can update their own avatar"
on storage.objects
for update
using (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own avatar
create policy "Users can delete their own avatar"
on storage.objects
for delete
using (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Create storage bucket for activity files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-files',
  'activity-files',
  false, -- keep private since these are user workouts
  104857600, -- 100MB per activity file, adjust if needed
  array['application/octet-stream', 'application/fit']::text[]
) on conflict (id) do nothing;

-- Policy: Users can upload their own activity files (folder structure: user_id/filename)
create policy "Users can upload their own activity file"
on storage.objects
for insert
with check (
  bucket_id = 'activity-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view their own activity files
create policy "Users can view their own activity file"
on storage.objects
for select
using (
  bucket_id = 'activity-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update/replace their own activity files
create policy "Users can update their own activity file"
on storage.objects
for update
using (
  bucket_id = 'activity-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own activity files
create policy "Users can delete their own activity file"
on storage.objects
for delete
using (
  bucket_id = 'activity-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);
