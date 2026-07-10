create table if not exists public.athlete_intelligence_snapshots (
  id uuid primary key default gen_random_uuid() not null,
  idx serial not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  input_fingerprint text not null,
  schema_version text not null,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  constraint athlete_intelligence_snapshots_id_profile_id_unique unique (id, profile_id),
  constraint athlete_intelligence_snapshots_profile_fingerprint_unique unique (profile_id, input_fingerprint)
);

create unique index if not exists athlete_intelligence_snapshots_idx_key
on public.athlete_intelligence_snapshots (idx);

create index if not exists idx_athlete_intelligence_snapshots_profile_created_at
on public.athlete_intelligence_snapshots (profile_id, created_at);

create table if not exists public.athlete_intelligence_predictions (
  id uuid primary key default gen_random_uuid() not null,
  idx serial not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_id uuid not null,
  model_version text not null,
  prediction_kind text not null,
  scenario_key text not null default '',
  schema_version text not null,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  constraint athlete_intelligence_predictions_idempotency_unique unique (
    snapshot_id, model_version, prediction_kind, scenario_key
  ),
  constraint athlete_intelligence_predictions_snapshot_profile_fkey
    foreign key (snapshot_id, profile_id)
    references public.athlete_intelligence_snapshots(id, profile_id)
    on delete cascade
);

create unique index if not exists athlete_intelligence_predictions_idx_key
on public.athlete_intelligence_predictions (idx);

create index if not exists idx_athlete_intelligence_predictions_profile_created_at
on public.athlete_intelligence_predictions (profile_id, created_at);

create table if not exists public.athlete_intelligence_recompute_jobs (
  id uuid primary key default gen_random_uuid() not null,
  idx serial not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_input_fingerprint text not null,
  reason_codes jsonb not null default '[]'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  run_at timestamp with time zone not null default now(),
  locked_at timestamp with time zone,
  lock_expires_at timestamp with time zone,
  locked_by text,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint athlete_intelligence_recompute_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed')),
  constraint athlete_intelligence_recompute_jobs_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= max_attempts)
);

create unique index if not exists athlete_intelligence_recompute_jobs_idx_key
on public.athlete_intelligence_recompute_jobs (idx);

create unique index if not exists athlete_intelligence_recompute_jobs_active_profile_unique
on public.athlete_intelligence_recompute_jobs (profile_id)
where status in ('queued', 'running');

create index if not exists idx_athlete_intelligence_recompute_jobs_claim
on public.athlete_intelligence_recompute_jobs (status, run_at, lock_expires_at);

create index if not exists idx_athlete_intelligence_recompute_jobs_profile_status
on public.athlete_intelligence_recompute_jobs (profile_id, status);
