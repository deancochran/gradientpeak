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
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    name text not null,
    notes text,
    activity_location activity_location not null default 'indoor',
    activity_category activity_category not null default 'run',
    is_private boolean not null default true,
    provider integration_provider,
    external_id text,

    -- ============================================================================
    -- General Time
    -- ============================================================================
    started_at timestamptz not null,
    finished_at timestamptz not null,
    elapsed_time integer not null check (elapsed_time >= 0),
    moving_time integer not null check (moving_time >= 0),

    -- ============================================================================
    -- Structured Plan
    -- ============================================================================
    planned_activity_id uuid references public.planned_activities(id) on delete set null,

    -- ============================================================================
    -- profile Info
    -- ============================================================================
    profile_id uuid not null references public.profiles(id) on delete cascade,
    profile_age integer check (profile_age >= 0),
    profile_weight_kg integer check (profile_weight_kg > 0),
    profile_ftp integer check (profile_ftp >= 0),
    profile_threshold_hr integer check (profile_threshold_hr >= 0),
    profile_recovery_time integer check (profile_recovery_time >= 0),
    profile_training_load integer check (profile_training_load >= 0),

    -- ============================================================================
    -- environmental
    -- ============================================================================
    avg_temperature numeric(5,2),
    max_temperature numeric(5,2),
    weather_condition text,
    elevation_gain_per_km numeric(5,2),
    avg_grade numeric(5,2),
    total_ascent integer not null default 0 check (total_ascent >= 0),
    total_descent integer not null default 0 check (total_descent >= 0),

    -- ============================================================================
    -- distance metrics
    -- ============================================================================
    distance integer not null default 0 check (distance >= 0),
    avg_speed numeric(5,2) check (avg_speed >= 0),
    max_speed numeric(5,2) check (max_speed >= 0),

    -- ============================================================================
    -- calories
    -- ============================================================================
    calories integer check (calories >= 0),

    -- ============================================================================
    -- heart rate
    -- ============================================================================
    avg_heart_rate integer check (avg_heart_rate >= 0),
    max_heart_rate integer check (max_heart_rate >= 0),
    max_hr_pct_threshold numeric(5,2),
    hr_zone_1_time integer default 0 check (hr_zone_1_time >= 0),
    hr_zone_2_time integer default 0 check (hr_zone_2_time >= 0),
    hr_zone_3_time integer default 0 check (hr_zone_3_time >= 0),
    hr_zone_4_time integer default 0 check (hr_zone_4_time >= 0),
    hr_zone_5_time integer default 0 check (hr_zone_5_time >= 0),

    -- ============================================================================
    -- cadence
    -- ============================================================================
    avg_cadence integer check (avg_cadence >= 0),
    max_cadence integer check (max_cadence >= 0),

    -- ============================================================================
    -- power metrics
    -- ============================================================================
    total_work integer check (total_work >= 0),
    avg_power integer check (avg_power >= 0),
    max_power integer check (max_power >= 0),
    normalized_power integer check (normalized_power >= 0),
    power_zone_1_time integer default 0 check (power_zone_1_time >= 0),
    power_zone_2_time integer default 0 check (power_zone_2_time >= 0),
    power_zone_3_time integer default 0 check (power_zone_3_time >= 0),
    power_zone_4_time integer default 0 check (power_zone_4_time >= 0),
    power_zone_5_time integer default 0 check (power_zone_5_time >= 0),
    power_zone_6_time integer default 0 check (power_zone_6_time >= 0),
    power_zone_7_time integer default 0 check (power_zone_7_time >= 0),
    power_heart_rate_ratio numeric(5,2),

    -- ============================================================================
    -- analysis metrics
    -- ============================================================================
    intensity_factor integer check (intensity_factor >= 0 and intensity_factor <= 200),
    efficiency_factor integer check (efficiency_factor >= 0 and efficiency_factor <= 100),
    power_weight_ratio numeric(5,2) check (power_weight_ratio >= 0),
    decoupling integer check (decoupling >= 0 and decoupling <= 100),
    training_stress_score integer check (training_stress_score >= 0),
    variability_index integer check (variability_index >= 0),

    -- ============================================================================
    -- audit
    -- ============================================================================
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- ============================================================================
    -- constraints
    -- ============================================================================
    constraint chk_times check (finished_at >= started_at)
);

create index if not exists idx_activities_profile_id
    on public.activities(profile_id);

create index if not exists idx_activities_activity_location
    on public.activities(activity_location);

create index if not exists idx_activities_activity_category
    on public.activities(activity_category);

create index if not exists idx_activities_started_at
    on public.activities(started_at);

create index if not exists idx_activities_planned_activity_id
    on public.activities(planned_activity_id);

create index if not exists idx_activities_provider_external
    on public.activities(provider, external_id)
    where external_id is not null;

create unique index if not exists idx_activities_external_unique
    on public.activities(provider, external_id)
    where external_id is not null and provider is not null;

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
