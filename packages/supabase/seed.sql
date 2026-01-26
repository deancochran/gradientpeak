drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
    base_username text;
    unique_suffix text;
    final_username text;
begin
    base_username := coalesce(
        nullif(concat_ws('',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        ), ''),
        split_part(new.email, '@', 1)
    );

    unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
    final_username := left(base_username || unique_suffix, 50);

    insert into public.profiles (id, username, avatar_url)
    values (
        new.id,
        final_username,
        new.raw_user_meta_data->>'avatar_url'
    );

    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- PROFILE AVATAR BUCKET
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



-- GPX ROUTES BUCKET
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-routes',
  'profile-routes',
  false,  -- keep private by default
  10485760,  -- 10MB limit
  array['application/gpx+xml', 'application/xml']::text[]
) on conflict (id) do nothing;

-- Drop existing policies if any
drop policy if exists "Users can manage their own routes" on storage.objects;
drop policy if exists "Users can view their own routes" on storage.objects;

-- Users can manage their own GPX files
create policy "Users can manage their own routes"
on storage.objects
for all
using (
  bucket_id = 'profile-routes'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-routes'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- FIT FILES BUCKET
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fit-files',
  'fit-files',
  false,  -- keep private by default
  52428800,  -- 50MB limit
  array['application/fit', 'application/octet-stream']::text[]
) on conflict (id) do nothing;

-- Drop existing FIT file policies if any
drop policy if exists "Users can upload their own FIT files" on storage.objects;
drop policy if exists "Users can read their own FIT files" on storage.objects;
drop policy if exists "Service role can manage all FIT files" on storage.objects;

-- Users can upload their own FIT files
create policy "Users can upload their own FIT files"
on storage.objects
for insert
with check (
  bucket_id = 'fit-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own FIT files
create policy "Users can read their own FIT files"
on storage.objects
for select
using (
  bucket_id = 'fit-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role can manage all FIT files
create policy "Service role can manage all FIT files"
on storage.objects
for all
using (bucket_id = 'fit-files')
with check (bucket_id = 'fit-files');

-- ============================================================================
-- SYSTEM ACTIVITY PLAN TEMPLATES
-- ============================================================================
-- Templates are now seeded via TypeScript script for better maintainability.
-- Run: pnpm seed-templates
--
-- See: packages/supabase/scripts/seed-templates.ts
-- Template definitions: packages/core/samples/index.ts
