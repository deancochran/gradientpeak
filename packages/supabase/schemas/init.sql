-- ============================================================================
-- ENUMS
-- ============================================================================

-- Location where activity takes place
create type public.activity_location as enum (
    'outdoor',
    'indoor'
);

-- Category/type of activity (broad classification)
create type public.activity_category as enum (
    'run',
    'bike',
    'swim',
    'strength',
    'other'
);

create type public.activity_metric as enum (
    'heartrate',
    'power',
    'speed',
    'cadence',
    'distance',
    'latlng',
    'moving',
    'altitude',
    'elevation',
    'temperature',
    'gradient',
    'heading'
);

create type public.activity_metric_data_type as enum (
    'float',     -- default for numeric streams (hr, power, cadence, etc.)
    'latlng',    -- flattened float pairs
    'boolean'    -- stored as float 0/1 in compression
);

create type public.integration_provider as enum (
    'strava',
    'wahoo',
    'trainingpeaks',
    'garmin',
    'zwift'
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ============================================================================
-- PROFILES
-- ============================================================================
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    idx serial unique,
    dob date,
    username text unique,
    language text default 'en',
    preferred_units text default 'metric',
    avatar_url text,
    bio text,
    onboarded boolean default false,
    threshold_hr integer,
    ftp integer,
    weight_kg integer,
    created_at timestamp not null default now(),
    updated_at timestamptz not null default now()
);

create trigger update_profiles_updated_at
    before update on public.profiles
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- TRAINING PLANS
-- ============================================================================
create table if not exists public.training_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    description text,
    is_active boolean not null default true,
    structure jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_training_plans_profile_id
    on public.training_plans(profile_id);

create index if not exists idx_training_plans_is_active
    on public.training_plans(is_active) where is_active = true;

create trigger update_training_plans_updated_at
    before update on public.training_plans
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- ACTIVITY ROUTES
-- ============================================================================
create table if not exists public.activity_routes (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    description text,
    activity_category activity_category not null default 'run',
    file_path text not null,
    total_distance integer not null check (total_distance >= 0),
    total_ascent integer check (total_ascent >= 0),
    total_descent integer check (total_descent >= 0),
    polyline text not null,
    elevation_polyline text,
    source text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_routes_profile_id
    on public.activity_routes(profile_id);

create index if not exists idx_routes_name
    on public.activity_routes(name);

create index if not exists idx_routes_activity_category
    on public.activity_routes(activity_category);

create index if not exists idx_routes_created_at
    on public.activity_routes(created_at desc);

create trigger update_activity_routes_updated_at
    before update on public.activity_routes
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- ACTIVITY PLANS
-- ============================================================================
create table if not exists public.activity_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    version text not null default '1.0',
    name text not null,
    notes text,
    activity_location activity_location not null default 'indoor',
    activity_category activity_category not null default 'run',
    description text not null,
    structure jsonb not null,
    route_id uuid references public.activity_routes(id) on delete set null,
    estimated_tss integer not null check (estimated_tss >= 0),
    estimated_duration integer not null check (estimated_duration >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_activity_plans_profile_id
    on public.activity_plans(profile_id);

create index if not exists idx_activity_plans_route_id
    on public.activity_plans(route_id)
    where route_id is not null;

create trigger update_activity_plans_updated_at
    before update on public.activity_plans
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- PLANNED ACTIVITIES
-- ============================================================================
create table if not exists public.planned_activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    activity_plan_id uuid not null references public.activity_plans(id) on delete cascade,
    scheduled_date date not null,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_planned_activities_profile_id
    on public.planned_activities(profile_id);

create index if not exists idx_planned_activities_activity_plan_id
    on public.planned_activities(activity_plan_id);

create index if not exists idx_planned_activities_scheduled_date
    on public.planned_activities(scheduled_date);

create index if not exists idx_planned_activities_plan_date
    on public.planned_activities(activity_plan_id, scheduled_date);

create trigger update_planned_activities_updated_at
    before update on public.planned_activities
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- INTEGRATIONS
-- ============================================================================
create table public.integrations (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    provider integration_provider not null,
    external_id text not null,
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    scope text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unique_integration_type unique (profile_id, provider)
);

create index if not exists idx_integrations_profile_id
    on public.integrations(profile_id);

create index if not exists idx_integrations_external_id
    on public.integrations(external_id);

create index if not exists idx_integrations_provider
    on public.integrations(provider);

create index if not exists idx_integrations_expires_at
    on public.integrations(expires_at);

create trigger update_integrations_updated_at
    before update on public.integrations
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- OAUTH STATES
-- ============================================================================
create table public.oauth_states (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    state text not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    provider integration_provider not null,
    mobile_redirect_uri text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists idx_oauth_states_expires_at
    on public.oauth_states(expires_at);

create index if not exists idx_oauth_states_profile_id
    on public.oauth_states(profile_id);

-- ============================================================================
-- SYNCED PLANNED ACTIVITIES
-- ============================================================================
create table if not exists public.synced_planned_activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    planned_activity_id uuid not null references public.planned_activities(id) on delete cascade,
    provider integration_provider not null,
    external_id text not null,
    synced_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint unique_planned_activity_per_provider unique (planned_activity_id, provider)
);

create index if not exists idx_synced_planned_activities_profile
    on public.synced_planned_activities(profile_id);

create index if not exists idx_synced_planned_activities_planned
    on public.synced_planned_activities(planned_activity_id);

create index if not exists idx_synced_planned_activities_provider
    on public.synced_planned_activities(provider, external_id);

create trigger update_synced_planned_activities_updated_at
    before update on public.synced_planned_activities
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- ACTIVITIES
-- ============================================================================
create table if not exists public.activities (
    -- ============================================================================
    -- Core identity
    -- ============================================================================
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,

    -- ============================================================================
    -- Core metadata
    -- ============================================================================
    name text not null,
    notes text,
    type text not null, -- 'bike', 'run', 'swim', 'strength', 'other'
    location text, -- 'indoor', 'outdoor'
    is_private boolean not null default true,

    -- ============================================================================
    -- Core timing fields (indexed - kept as columns for performance)
    -- ============================================================================
    started_at timestamptz not null,
    finished_at timestamptz not null,
    duration_seconds integer not null default 0 check (duration_seconds >= 0),
    moving_seconds integer not null default 0 check (moving_seconds >= 0),

    -- ============================================================================
    -- Core distance (indexed - kept as column for performance)
    -- ============================================================================
    distance_meters integer not null default 0 check (distance_meters >= 0),

    -- ============================================================================
    -- All metrics as JSONB (flexible schema for future expansion)
    -- ============================================================================
    -- Structure:
    -- {
    --   "avg_power": 250, "max_power": 450, "normalized_power": 265,
    --   "avg_hr": 145, "max_hr": 178, "max_hr_pct_threshold": 0.92,
    --   "avg_cadence": 90, "max_cadence": 110,
    --   "avg_speed": 8.5, "max_speed": 15.2,
    --   "total_work": 900000, "calories": 625,
    --   "total_ascent": 450, "total_descent": 430,
    --   "avg_grade": 2.3, "elevation_gain_per_km": 45,
    --   "avg_temperature": 22.5, "max_temperature": 24.0, "weather_condition": "sunny",
    --   "tss": 85, "if": 0.82, "vi": 1.06, "ef": 1.72,
    --   "power_weight_ratio": 3.33, "power_hr_ratio": 1.72, "decoupling": 3.5
    -- }
    metrics jsonb not null default '{}'::jsonb,

    -- ============================================================================
    -- Zone times as arrays (much cleaner than individual columns)
    -- ============================================================================
    hr_zone_seconds integer[5], -- [z1, z2, z3, z4, z5]
    power_zone_seconds integer[7], -- [z1, z2, z3, z4, z5, z6, z7]

    -- ============================================================================
    -- Profile snapshot as JSONB (instead of 6 separate columns)
    -- ============================================================================
    -- Structure: { "ftp": 250, "weight_kg": 75, "threshold_hr": 165, "age": 32, "recovery_time": 48, "training_load": 150 }
    profile_snapshot jsonb,

    -- ============================================================================
    -- Planned workout adherence
    -- ============================================================================
    avg_target_adherence numeric(5,2) check (avg_target_adherence >= 0 and avg_target_adherence <= 100),

    -- ============================================================================
    -- References
    -- ============================================================================
    planned_activity_id uuid references public.planned_activities(id) on delete set null,
    route_id uuid references public.activity_routes(id) on delete set null,

    -- ============================================================================
    -- External integration
    -- ============================================================================
    provider integration_provider,
    external_id text,

    -- ============================================================================
    -- Audit timestamps
    -- ============================================================================
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- ============================================================================
    -- Constraints
    -- ============================================================================
    constraint chk_times check (finished_at >= started_at),
    constraint chk_moving_time check (moving_seconds >= 0 and moving_seconds <= duration_seconds)
);

-- Essential indexes (optimized for common queries)
create index if not exists idx_activities_profile_started
    on public.activities(profile_id, started_at desc);

create index if not exists idx_activities_type
    on public.activities(type);

create index if not exists idx_activities_location
    on public.activities(location)
    where location is not null;

create index if not exists idx_activities_started
    on public.activities(started_at desc);

create index if not exists idx_activities_planned
    on public.activities(planned_activity_id)
    where planned_activity_id is not null;

create index if not exists idx_activities_route
    on public.activities(route_id)
    where route_id is not null;

create index if not exists idx_activities_external
    on public.activities(provider, external_id)
    where provider is not null;

create unique index if not exists idx_activities_external_unique
    on public.activities(provider, external_id)
    where external_id is not null and provider is not null;

-- JSONB GIN indexes for common metric queries
create index if not exists idx_activities_metrics_power
    on public.activities using gin ((metrics -> 'avg_power'));

create index if not exists idx_activities_metrics_hr
    on public.activities using gin ((metrics -> 'avg_hr'));

create index if not exists idx_activities_metrics_tss
    on public.activities using gin ((metrics -> 'tss'));

create index if not exists idx_activities_metrics_all
    on public.activities using gin (metrics jsonb_path_ops);

-- Array GIN indexes for zone queries
create index if not exists idx_activities_hr_zones
    on public.activities using gin (hr_zone_seconds);

create index if not exists idx_activities_power_zones
    on public.activities using gin (power_zone_seconds);

-- Full-text search on activity names
create index if not exists idx_activities_name_search
    on public.activities using gin (to_tsvector('english', name));

-- Trigger for auto-updating updated_at timestamp
create trigger update_activities_updated_at
    before update on public.activities
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- ACTIVITY STREAMS
-- ============================================================================
create table if not exists public.activity_streams (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    activity_id uuid not null references public.activities(id) on delete cascade,
    type activity_metric not null,
    data_type activity_metric_data_type not null,
    -- compressed payloads
    compressed_values bytea not null,
    compressed_timestamps bytea not null,
    sample_count integer not null check (sample_count > 0),
    original_size integer not null check (original_size >= 0),
    -- stats
    min_value numeric(10,4),
    max_value numeric(10,4),
    avg_value numeric(10,4),
    -- audit
    created_at timestamptz not null default now(),
    -- constraints
    constraint unique_activity_type unique (activity_id, type)
);

create index if not exists idx_activity_streams_activity_id
    on public.activity_streams(activity_id);

create index if not exists idx_activity_streams_type
    on public.activity_streams(type);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- RLS is disabled for all tables because authorization is handled at the
-- application layer via tRPC's protectedProcedure middleware and explicit
-- profile_id filtering in all queries. The backend uses service role key.
--
-- Note: If you need to allow direct database access (e.g., for webhooks or
-- third-party integrations), enable RLS on specific tables and add policies.
