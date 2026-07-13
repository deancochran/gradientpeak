alter table public.activity_routes
alter column profile_id drop not null;

alter table public.activity_routes
add column if not exists source_page_url text,
add column if not exists source_download_url text,
add column if not exists source_license text,
add column if not exists source_attribution text,
add column if not exists import_provider text,
add column if not exists import_external_id text,
add column if not exists checksum_sha256 text,
add column if not exists is_system_template boolean not null default false;

drop index if exists public.idx_routes_profile_id;

create index if not exists idx_routes_profile_id
on public.activity_routes (profile_id)
where profile_id is not null;

create index if not exists idx_routes_is_system_template
on public.activity_routes (is_system_template)
where is_system_template = true;

create unique index if not exists idx_activity_routes_system_import_identity
on public.activity_routes (import_provider, import_external_id)
where is_system_template = true and import_provider is not null and import_external_id is not null;

alter table public.activity_routes
drop constraint if exists activity_routes_import_provider_non_empty_check,
drop constraint if exists activity_routes_import_external_id_non_empty_check,
drop constraint if exists activity_routes_source_page_url_non_empty_check,
drop constraint if exists activity_routes_source_download_url_non_empty_check,
drop constraint if exists activity_routes_system_templates_public_check,
drop constraint if exists activity_routes_system_template_check;

alter table public.activity_routes
add constraint activity_routes_import_provider_non_empty_check
check (import_provider is null or btrim(import_provider) <> ''),
add constraint activity_routes_import_external_id_non_empty_check
check (import_external_id is null or btrim(import_external_id) <> ''),
add constraint activity_routes_source_page_url_non_empty_check
check (source_page_url is null or btrim(source_page_url) <> ''),
add constraint activity_routes_source_download_url_non_empty_check
check (source_download_url is null or btrim(source_download_url) <> ''),
add constraint activity_routes_system_templates_public_check
check (is_system_template = false or is_public = true),
add constraint activity_routes_system_template_check
check (
  (is_system_template = true and profile_id is null)
  or (is_system_template = false and profile_id is not null)
);
