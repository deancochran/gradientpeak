create table if not exists public.profile_estimation_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  metrics_revision integer not null default 0,
  performance_revision integer not null default 0,
  fitness_revision integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_profile_estimation_state_updated_at
on public.profile_estimation_state (updated_at);
