do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activities_id_profile_id_unique'
  ) then
    alter table public.activities
      add constraint activities_id_profile_id_unique unique (id, profile_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'events_id_profile_id_unique'
  ) then
    alter table public.events
      add constraint events_id_profile_id_unique unique (id, profile_id);
  end if;
end $$;

create table if not exists public.activity_summaries (
  activity_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  duration_seconds integer not null default 0,
  moving_seconds integer not null default 0,
  distance_meters integer not null default 0,
  elevation_gain_meters numeric(10, 2),
  elevation_loss_meters numeric(10, 2),
  calories integer,
  avg_heart_rate integer,
  max_heart_rate integer,
  avg_power integer,
  max_power integer,
  normalized_power integer,
  avg_cadence integer,
  max_cadence integer,
  avg_speed_mps numeric(6, 2),
  max_speed_mps numeric(6, 2),
  normalized_speed_mps numeric(6, 2),
  normalized_graded_speed_mps numeric(6, 2),
  avg_temperature numeric,
  avg_swolf numeric,
  efficiency_factor numeric,
  aerobic_decoupling numeric,
  pool_length numeric,
  total_strokes integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint activity_summaries_distance_meters_check check (distance_meters >= 0),
  constraint activity_summaries_duration_seconds_check check (duration_seconds >= 0),
  constraint activity_summaries_moving_seconds_check check (moving_seconds >= 0),
  constraint activity_summaries_moving_time_check check (
    moving_seconds >= 0 and moving_seconds <= duration_seconds
  ),
  constraint activity_summaries_activity_profile_fkey foreign key (activity_id, profile_id)
    references public.activities(id, profile_id) on delete cascade
);

create table if not exists public.activity_imports (
  activity_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider public.integration_provider,
  external_id text,
  device_manufacturer text,
  device_product text,
  activity_file_path text,
  activity_file_size integer,
  import_source text,
  import_file_type text,
  import_original_file_name text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint activity_imports_import_file_type_non_empty_check check (
    import_file_type is null or btrim(import_file_type) <> ''
  ),
  constraint activity_imports_import_original_file_name_non_empty_check check (
    import_original_file_name is null or btrim(import_original_file_name) <> ''
  ),
  constraint activity_imports_import_source_check check (
    import_source is null or import_source = 'manual_historical'
  ),
  constraint activity_imports_activity_profile_fkey foreign key (activity_id, profile_id)
    references public.activities(id, profile_id) on delete cascade
);

create table if not exists public.activity_geometry (
  activity_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  polyline text,
  map_bounds jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint activity_geometry_activity_profile_fkey foreign key (activity_id, profile_id)
    references public.activities(id, profile_id) on delete cascade
);

create table if not exists public.activity_laps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lap_index integer not null,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint activity_laps_activity_index_unique unique (activity_id, lap_index),
  constraint activity_laps_lap_index_check check (lap_index >= 0),
  constraint activity_laps_activity_profile_fkey foreign key (activity_id, profile_id)
    references public.activities(id, profile_id) on delete cascade
);

create table if not exists public.event_schedule_links (
  event_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  training_plan_id uuid references public.training_plans(id) on delete set null,
  activity_plan_id uuid references public.activity_plans(id) on delete set null,
  linked_activity_id uuid references public.activities(id),
  route_id uuid references public.activity_routes(id),
  schedule_batch_id uuid,
  user_training_plan_id uuid references public.user_training_plans(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint event_schedule_links_event_profile_fkey foreign key (event_id, profile_id)
    references public.events(id, profile_id) on delete cascade
);

create table if not exists public.event_external_links (
  event_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_provider text,
  integration_account_id uuid references public.integrations(id),
  external_calendar_id text,
  external_event_id text,
  occurrence_key text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint event_external_links_calendar_non_empty check (
    external_calendar_id is null or btrim(external_calendar_id) <> ''
  ),
  constraint event_external_links_event_non_empty check (
    external_event_id is null or btrim(external_event_id) <> ''
  ),
  constraint event_external_links_source_identity_complete check (
    (
      source_provider is null
      and integration_account_id is null
      and external_calendar_id is null
      and external_event_id is null
    ) or (
      source_provider is not null
      and integration_account_id is not null
      and external_calendar_id is not null
      and external_event_id is not null
    )
  ),
  constraint event_external_links_source_provider_non_empty check (
    source_provider is null or btrim(source_provider) <> ''
  ),
  constraint event_external_links_event_profile_fkey foreign key (event_id, profile_id)
    references public.events(id, profile_id) on delete cascade
);

create table if not exists public.event_recurrence (
  event_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recurrence_rule text,
  recurrence_timezone text,
  series_id uuid references public.events(id) on delete cascade,
  occurrence_key text not null default '',
  original_starts_at timestamp with time zone,
  recurrence jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint event_recurrence_rule_non_empty check (
    recurrence_rule is null or btrim(recurrence_rule) <> ''
  ),
  constraint event_recurrence_timezone_non_empty check (
    recurrence_timezone is null or btrim(recurrence_timezone) <> ''
  ),
  constraint event_recurrence_timezone_requires_rule check (
    recurrence_timezone is null or recurrence_rule is not null
  ),
  constraint event_recurrence_series_occurrence_key_required check (
    series_id is null or btrim(occurrence_key) <> ''
  ),
  constraint event_recurrence_series_not_self check (series_id is null or series_id <> event_id),
  constraint event_recurrence_event_profile_fkey foreign key (event_id, profile_id)
    references public.events(id, profile_id) on delete cascade
);

create table if not exists public.event_payloads (
  event_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lifecycle jsonb,
  payload jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint event_payloads_event_profile_fkey foreign key (event_id, profile_id)
    references public.events(id, profile_id) on delete cascade
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_summaries_activity_profile_fkey'
  ) then
    alter table public.activity_summaries
      add constraint activity_summaries_activity_profile_fkey
      foreign key (activity_id, profile_id) references public.activities(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'activity_imports_activity_profile_fkey'
  ) then
    alter table public.activity_imports
      add constraint activity_imports_activity_profile_fkey
      foreign key (activity_id, profile_id) references public.activities(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'activity_geometry_activity_profile_fkey'
  ) then
    alter table public.activity_geometry
      add constraint activity_geometry_activity_profile_fkey
      foreign key (activity_id, profile_id) references public.activities(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'activity_laps_activity_profile_fkey'
  ) then
    alter table public.activity_laps
      add constraint activity_laps_activity_profile_fkey
      foreign key (activity_id, profile_id) references public.activities(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_schedule_links_event_profile_fkey'
  ) then
    alter table public.event_schedule_links
      add constraint event_schedule_links_event_profile_fkey
      foreign key (event_id, profile_id) references public.events(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_external_links_event_profile_fkey'
  ) then
    alter table public.event_external_links
      add constraint event_external_links_event_profile_fkey
      foreign key (event_id, profile_id) references public.events(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_recurrence_event_profile_fkey'
  ) then
    alter table public.event_recurrence
      add constraint event_recurrence_event_profile_fkey
      foreign key (event_id, profile_id) references public.events(id, profile_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_payloads_event_profile_fkey'
  ) then
    alter table public.event_payloads
      add constraint event_payloads_event_profile_fkey
      foreign key (event_id, profile_id) references public.events(id, profile_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_activity_summaries_profile_id
  on public.activity_summaries(profile_id);
create unique index if not exists idx_activity_imports_external_unique
  on public.activity_imports(provider, external_id)
  where external_id is not null and provider is not null;
create index if not exists idx_activity_imports_profile_id
  on public.activity_imports(profile_id);
create index if not exists idx_activity_imports_provider_external
  on public.activity_imports(provider, external_id)
  where external_id is not null;
create index if not exists idx_activity_geometry_profile_id
  on public.activity_geometry(profile_id);
create index if not exists idx_activity_laps_activity_id
  on public.activity_laps(activity_id);
create index if not exists idx_activity_laps_profile_id
  on public.activity_laps(profile_id);

create index if not exists idx_event_schedule_links_profile_id
  on public.event_schedule_links(profile_id);
create index if not exists idx_event_schedule_links_training_plan_id
  on public.event_schedule_links(training_plan_id)
  where training_plan_id is not null;
create index if not exists idx_event_schedule_links_activity_plan_id
  on public.event_schedule_links(activity_plan_id)
  where activity_plan_id is not null;
create index if not exists idx_event_schedule_links_linked_activity_id
  on public.event_schedule_links(linked_activity_id)
  where linked_activity_id is not null;
create index if not exists idx_event_schedule_links_route_id
  on public.event_schedule_links(route_id)
  where route_id is not null;
create index if not exists idx_event_schedule_links_schedule_batch
  on public.event_schedule_links(profile_id, schedule_batch_id)
  where schedule_batch_id is not null;
create index if not exists idx_event_schedule_links_user_training_plan_id
  on public.event_schedule_links(user_training_plan_id)
  where user_training_plan_id is not null;
create unique index if not exists idx_event_external_links_identity_unique
  on public.event_external_links(
    source_provider,
    integration_account_id,
    external_calendar_id,
    external_event_id,
    occurrence_key
  )
  where source_provider is not null
    and integration_account_id is not null
    and external_calendar_id is not null
    and external_event_id is not null;
create index if not exists idx_event_external_links_profile_id
  on public.event_external_links(profile_id);
create index if not exists idx_event_external_links_integration_calendar_updated
  on public.event_external_links(integration_account_id, external_calendar_id, updated_at)
  where integration_account_id is not null and external_calendar_id is not null;
create index if not exists idx_event_recurrence_profile_id
  on public.event_recurrence(profile_id);
create unique index if not exists idx_event_recurrence_series_occurrence_unique
  on public.event_recurrence(series_id, occurrence_key)
  where series_id is not null;
create index if not exists idx_event_payloads_profile_id
  on public.event_payloads(profile_id);

insert into public.activity_summaries (
  activity_id,
  profile_id,
  duration_seconds,
  moving_seconds,
  distance_meters,
  elevation_gain_meters,
  elevation_loss_meters,
  calories,
  avg_heart_rate,
  max_heart_rate,
  avg_power,
  max_power,
  normalized_power,
  avg_cadence,
  max_cadence,
  avg_speed_mps,
  max_speed_mps,
  normalized_speed_mps,
  normalized_graded_speed_mps,
  avg_temperature,
  avg_swolf,
  efficiency_factor,
  aerobic_decoupling,
  pool_length,
  total_strokes,
  created_at,
  updated_at
)
select
  id,
  profile_id,
  duration_seconds,
  moving_seconds,
  distance_meters,
  elevation_gain_meters,
  elevation_loss_meters,
  calories,
  avg_heart_rate,
  max_heart_rate,
  avg_power,
  max_power,
  normalized_power,
  avg_cadence,
  max_cadence,
  avg_speed_mps,
  max_speed_mps,
  normalized_speed_mps,
  normalized_graded_speed_mps,
  avg_temperature,
  avg_swolf,
  efficiency_factor,
  aerobic_decoupling,
  pool_length,
  total_strokes,
  created_at,
  updated_at
from public.activities
on conflict (activity_id) do nothing;

insert into public.activity_imports (
  activity_id,
  profile_id,
  provider,
  external_id,
  device_manufacturer,
  device_product,
  activity_file_path,
  activity_file_size,
  import_source,
  import_file_type,
  import_original_file_name,
  created_at,
  updated_at
)
select
  id,
  profile_id,
  provider,
  external_id,
  device_manufacturer,
  device_product,
  activity_file_path,
  activity_file_size,
  import_source,
  import_file_type,
  import_original_file_name,
  created_at,
  updated_at
from public.activities
on conflict (activity_id) do nothing;

insert into public.activity_geometry (
  activity_id,
  profile_id,
  polyline,
  map_bounds,
  created_at,
  updated_at
)
select id, profile_id, polyline, map_bounds, created_at, updated_at
from public.activities
on conflict (activity_id) do nothing;

insert into public.activity_laps (
  activity_id,
  profile_id,
  lap_index,
  payload,
  created_at,
  updated_at
)
select
  activities.id,
  activities.profile_id,
  lap.lap_index,
  lap.payload,
  activities.created_at,
  activities.updated_at
from public.activities
cross join lateral (
  select (array_lap.ordinality - 1)::integer as lap_index, array_lap.value as payload
  from jsonb_array_elements(
    case when jsonb_typeof(activities.laps) = 'array' then activities.laps else '[]'::jsonb end
  ) with ordinality as array_lap(value, ordinality)
  union all
  select 0, activities.laps
  where activities.laps is not null and jsonb_typeof(activities.laps) <> 'array'
) as lap
where activities.laps is not null
on conflict (activity_id, lap_index) do nothing;

insert into public.event_schedule_links (
  event_id,
  profile_id,
  training_plan_id,
  activity_plan_id,
  linked_activity_id,
  route_id,
  schedule_batch_id,
  user_training_plan_id,
  created_at,
  updated_at
)
select
  id,
  profile_id,
  training_plan_id,
  activity_plan_id,
  linked_activity_id,
  route_id,
  schedule_batch_id,
  user_training_plan_id,
  created_at,
  updated_at
from public.events
on conflict (event_id) do nothing;

insert into public.event_external_links (
  event_id,
  profile_id,
  source_provider,
  integration_account_id,
  external_calendar_id,
  external_event_id,
  occurrence_key,
  created_at,
  updated_at
)
select
  id,
  profile_id,
  source_provider,
  integration_account_id,
  external_calendar_id,
  external_event_id,
  occurrence_key,
  created_at,
  updated_at
from public.events
on conflict (event_id) do nothing;

insert into public.event_recurrence (
  event_id,
  profile_id,
  recurrence_rule,
  recurrence_timezone,
  series_id,
  occurrence_key,
  original_starts_at,
  recurrence,
  created_at,
  updated_at
)
select
  id,
  profile_id,
  recurrence_rule,
  recurrence_timezone,
  series_id,
  occurrence_key,
  original_starts_at,
  recurrence,
  created_at,
  updated_at
from public.events
on conflict (event_id) do nothing;

insert into public.event_payloads (
  event_id,
  profile_id,
  lifecycle,
  payload,
  created_at,
  updated_at
)
select id, profile_id, lifecycle, payload, created_at, updated_at
from public.events
on conflict (event_id) do nothing;

alter table if exists public.activity_summaries enable row level security;
alter table if exists public.activity_imports enable row level security;
alter table if exists public.activity_geometry enable row level security;
alter table if exists public.activity_laps enable row level security;
alter table if exists public.event_schedule_links enable row level security;
alter table if exists public.event_external_links enable row level security;
alter table if exists public.event_recurrence enable row level security;
alter table if exists public.event_payloads enable row level security;

revoke all on public.activity_summaries from public, anon, authenticated;
revoke all on public.activity_imports from public, anon, authenticated;
revoke all on public.activity_geometry from public, anon, authenticated;
revoke all on public.activity_laps from public, anon, authenticated;
revoke all on public.event_schedule_links from public, anon, authenticated;
revoke all on public.event_external_links from public, anon, authenticated;
revoke all on public.event_recurrence from public, anon, authenticated;
revoke all on public.event_payloads from public, anon, authenticated;

grant select, insert, update, delete on public.activity_summaries to service_role;
grant select, insert, update, delete on public.activity_imports to service_role;
grant select, insert, update, delete on public.activity_geometry to service_role;
grant select, insert, update, delete on public.activity_laps to service_role;
grant select, insert, update, delete on public.event_schedule_links to service_role;
grant select, insert, update, delete on public.event_external_links to service_role;
grant select, insert, update, delete on public.event_recurrence to service_role;
grant select, insert, update, delete on public.event_payloads to service_role;
