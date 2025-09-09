insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-json-files',
  'activity-json-files',
  false,  -- private
  104857600,  -- 100MB per file
  array['application/json']::text[]
) on conflict (id) do nothing;

drop policy if exists "Users can manage their own activity files" on storage.objects;
create policy "Users can manage their own activity files"
on storage.objects
for all
using (
  bucket_id = 'activity-json-files'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'activity-json-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Service role can manage activity files" on storage.objects;
create policy "Service role can manage activity files"
on storage.objects
for all
using (
  bucket_id = 'activity-json-files'
  and auth.role() = 'service_role'
);
