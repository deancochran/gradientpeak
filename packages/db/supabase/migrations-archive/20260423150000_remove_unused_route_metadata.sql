drop index if exists public.idx_routes_is_system_template;

alter table public.activity_routes
drop constraint if exists activity_routes_system_templates_public_check,
drop constraint if exists activity_routes_system_template_check;

alter table public.activity_routes
drop column if exists source,
drop column if exists source_page_url,
drop column if exists source_download_url,
drop column if exists source_license,
drop column if exists source_attribution,
drop column if exists import_provider,
drop column if exists import_external_id,
drop column if exists checksum_sha256;

alter table public.activity_routes
add constraint activity_routes_system_templates_public_check
check (is_system_template = false or is_public = true),
add constraint activity_routes_system_template_check
check (
  (is_system_template = true and profile_id is null)
  or (is_system_template = false and profile_id is not null)
);

create index if not exists idx_routes_is_system_template
on public.activity_routes (is_system_template)
where is_system_template = true;
