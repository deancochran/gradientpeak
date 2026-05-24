create table if not exists public.content_access_grants (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id uuid not null,
  grantee_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  access_level text not null,
  source_type text not null,
  source_id uuid not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_access_grants_content_type_check check (
    content_type in ('profile', 'event', 'activity_plan', 'activity_route', 'training_plan')
  ),
  constraint content_access_grants_access_level_check check (
    access_level in ('read', 'read_geometry')
  ),
  constraint content_access_grants_source_type_check check (
    source_type in ('event', 'training_plan')
  )
);

create unique index if not exists content_access_grants_source_unique
  on public.content_access_grants (
    content_type,
    content_id,
    grantee_profile_id,
    access_level,
    source_type,
    source_id
  );

create index if not exists idx_content_access_grants_grantee_content
  on public.content_access_grants (grantee_profile_id, content_type, content_id);

create index if not exists idx_content_access_grants_source
  on public.content_access_grants (source_type, source_id);

create index if not exists idx_content_access_grants_active_expiry
  on public.content_access_grants (expires_at)
  where expires_at is not null and revoked_at is null;
