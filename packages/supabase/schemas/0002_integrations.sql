-- enum for third-party providers
create type public.integration_provider as enum (
  'strava',
  'wahoo',
  'trainingpeaks',
  'garmin',
  'zwift'
);

-- table to store oauth integrations per profile
create table public.integrations (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    provider integration_provider not null,
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    scope text,
    created_at timestamptz not null default now(),
    constraint unique_integration_type unique (profile_id, provider)
);

-- optional indexes
create index if not exists idx_integrations_provider on public.integrations (provider);
create index if not exists idx_integrations_expires_at on public.integrations (expires_at);
