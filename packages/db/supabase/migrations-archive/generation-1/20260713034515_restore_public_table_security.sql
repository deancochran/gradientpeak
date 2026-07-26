-- Relational access is backend-owned. Drizzle push can recreate tables without
-- Supabase-specific RLS and grants, so restore those controls for the complete
-- current public table catalog without adding direct-client policies.
do $$
declare
  table_record record;
begin
  for table_record in
    select n.nspname as schema_name, c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', table_record.schema_name, table_record.table_name);
    execute format('revoke all on table %I.%I from public, anon, authenticated', table_record.schema_name, table_record.table_name);
    execute format('grant select, insert, update, delete on table %I.%I to service_role', table_record.schema_name, table_record.table_name);
  end loop;
end $$;

-- Supabase Storage is platform-owned, but these buckets and policies are product
-- assets. Existing reconciled targets skip the baseline, so converge them here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png']::text[]),
  ('gpx-routes', 'gpx-routes', false, 10485760, array['application/gpx+xml', 'application/xml']::text[]),
  ('activity-files', 'activity-files', false, 52428800, array['application/fit', 'application/gpx+xml', 'application/octet-stream', 'application/tcx+xml', 'application/xml', 'text/xml']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can manage their own avatar" on storage.objects;
create policy "Users can manage their own avatar"
on storage.objects for all
using (bucket_id = 'profile-avatars' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'profile-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Anyone can view avatars" on storage.objects;

drop policy if exists "Users can manage their own routes" on storage.objects;
drop policy if exists "Users can view their own routes" on storage.objects;
create policy "Users can manage their own routes"
on storage.objects for all
using (bucket_id = 'gpx-routes' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'gpx-routes' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can upload their own activity files" on storage.objects;
drop policy if exists "Users can read their own activity files" on storage.objects;
drop policy if exists "Service role can manage all activity files" on storage.objects;
create policy "Users can upload their own activity files"
on storage.objects for insert
with check (
  bucket_id = 'activity-files'
  and (storage.foldername(name))[1] = 'activities'
  and auth.uid()::text = (storage.foldername(name))[2]
);
create policy "Users can read their own activity files"
on storage.objects for select
using (
  bucket_id = 'activity-files'
  and (storage.foldername(name))[1] = 'activities'
  and auth.uid()::text = (storage.foldername(name))[2]
);
create policy "Service role can manage all activity files"
on storage.objects for all to service_role
using (bucket_id = 'activity-files')
with check (bucket_id = 'activity-files');

do $$
declare
  sequence_record record;
begin
  for sequence_record in
    select n.nspname as schema_name, c.relname as sequence_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %I.%I from public, anon, authenticated', sequence_record.schema_name, sequence_record.sequence_name);
    execute format('grant usage, select on sequence %I.%I to service_role', sequence_record.schema_name, sequence_record.sequence_name);
  end loop;
end $$;

do $$
declare
  owner_role text;
begin
  -- Catalog inspection found postgres owns all current public tables/sequences and
  -- is the migration executor. Keep this guarded for reduced-role environments.
  foreach owner_role in array array['postgres', current_user]
  loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = owner_role) then
      execute format('alter default privileges for role %I in schema public revoke all on tables from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public grant select, insert, update, delete on tables to service_role', owner_role);
      execute format('alter default privileges for role %I in schema public revoke all on sequences from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public grant usage, select on sequences to service_role', owner_role);
    end if;
  end loop;
end $$;
