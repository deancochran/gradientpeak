create table if not exists public.activity_plan_derived_metrics_cache (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  activity_plan_id uuid not null references public.activity_plans(id) on delete cascade,
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

do $$
begin
  if to_regclass('public.derived_metric_projections') is not null then
    insert into public.activity_plan_derived_metrics_cache (
      id,
      created_at,
      updated_at,
      activity_plan_id,
      profile_id,
      estimator_version,
      input_fingerprint,
      estimated_tss,
      estimated_duration_seconds,
      intensity_factor,
      estimated_calories,
      estimated_distance_meters,
      estimated_zones,
      confidence,
      confidence_score,
      computed_at,
      last_accessed_at
    )
    select
      id,
      created_at,
      updated_at,
      entity_id,
      profile_id,
      estimator_version,
      input_fingerprint,
      estimated_tss,
      estimated_duration_seconds,
      intensity_factor,
      estimated_calories,
      estimated_distance_meters,
      estimated_zones,
      confidence,
      confidence_score,
      computed_at,
      last_accessed_at
    from public.derived_metric_projections
    where entity_type = 'activity_plan'
    on conflict (activity_plan_id, profile_id, estimator_version, input_fingerprint)
    do update set
      updated_at = excluded.updated_at,
      estimated_tss = excluded.estimated_tss,
      estimated_duration_seconds = excluded.estimated_duration_seconds,
      intensity_factor = excluded.intensity_factor,
      estimated_calories = excluded.estimated_calories,
      estimated_distance_meters = excluded.estimated_distance_meters,
      estimated_zones = excluded.estimated_zones,
      confidence = excluded.confidence,
      confidence_score = excluded.confidence_score,
      computed_at = excluded.computed_at,
      last_accessed_at = excluded.last_accessed_at;
  end if;
end $$;

create table if not exists public.profile_estimation_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  metrics_revision integer not null default 0,
  performance_revision integer not null default 0,
  fitness_revision integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_profile_estimation_state_updated_at
on public.profile_estimation_state (updated_at);

create table if not exists public.activity_plan_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  queued_at timestamp with time zone not null default now(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_plan_id uuid not null references public.activity_plans(id) on delete cascade
);

create unique index if not exists activity_plan_refresh_queue_profile_plan_unique
on public.activity_plan_refresh_queue (profile_id, activity_plan_id);

create index if not exists idx_activity_plan_refresh_queue_profile_queued_at
on public.activity_plan_refresh_queue (profile_id, queued_at);
