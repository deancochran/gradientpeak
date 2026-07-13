create table if not exists public.derived_metric_projections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  estimator_version text not null,
  input_fingerprint text not null,
  estimated_tss integer,
  estimated_duration_seconds integer,
  intensity_factor real,
  estimated_calories integer,
  estimated_distance_meters integer,
  estimated_zones jsonb,
  confidence text,
  confidence_score integer,
  computed_at timestamp with time zone not null,
  last_accessed_at timestamp with time zone not null
);

create unique index if not exists activity_plan_derived_metrics_cache_lookup_key
on public.activity_plan_derived_metrics_cache (
  activity_plan_id,
  profile_id,
  estimator_version,
  input_fingerprint
);

create index if not exists idx_activity_plan_derived_metrics_cache_profile_plan
on public.activity_plan_derived_metrics_cache (profile_id, activity_plan_id);

create index if not exists idx_activity_plan_derived_metrics_cache_last_accessed_at
on public.activity_plan_derived_metrics_cache (last_accessed_at);
