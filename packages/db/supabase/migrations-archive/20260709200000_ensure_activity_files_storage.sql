insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-files',
  'activity-files',
  false,
  52428800,
  array[
    'application/fit',
    'application/gpx+xml',
    'application/octet-stream',
    'application/tcx+xml',
    'application/xml',
    'text/xml'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own activity files" on storage.objects;
create policy "Users can upload their own activity files"
on storage.objects
for insert
with check (
  bucket_id = 'activity-files'
  and (storage.foldername(name))[1] = 'activities'
  and auth.uid()::text = (storage.foldername(name))[2]
);

drop policy if exists "Users can read their own activity files" on storage.objects;
create policy "Users can read their own activity files"
on storage.objects
for select
using (
  bucket_id = 'activity-files'
  and (storage.foldername(name))[1] = 'activities'
  and auth.uid()::text = (storage.foldername(name))[2]
);

drop policy if exists "Service role can manage all activity files" on storage.objects;
create policy "Service role can manage all activity files"
on storage.objects
for all
to service_role
using (bucket_id = 'activity-files')
with check (bucket_id = 'activity-files');
