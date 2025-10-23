-- ============================================================================
-- ENUMS
-- ============================================================================
create type public.activity_type as enum (
    'outdoor_run',
    'outdoor_bike',
    'indoor_treadmill',
    'indoor_bike_trainer',
    'indoor_strength',
    'indoor_swim',
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
    updated_at timestamptz not null default now(),

    -- Constraint: Only one training plan per user
    constraint unique_training_plan_per_user unique (profile_id)
);

create index if not exists idx_training_plans_profile_id
    on public.training_plans(profile_id);

-- ============================================================================
-- ACTIVITY PLANS
-- ============================================================================
create table if not exists public.activity_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    version text not null default '1.0',
    name text not null,
    activity_type activity_type not null,
    description text not null,
    structure jsonb not null,
    estimated_tss integer not null check (estimated_tss >= 0),
    estimated_duration integer not null check (estimated_duration >= 0),
    created_at timestamptz not null default now()
);

create index if not exists idx_activity_plans_profile_id
    on public.activity_plans(profile_id);

-- ============================================================================
-- PLANNED ACTIVITIES (scheduled instantiations of a plan)
-- ============================================================================
create table if not exists public.planned_activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    activity_plan_id uuid not null references public.activity_plans(id) on delete cascade,
    scheduled_date date not null,
    notes text,
    created_at timestamptz not null default now(),
    constraint chk_planned_activities_date check (scheduled_date >= current_date)
);

create index if not exists idx_planned_activities_profile_id
    on public.planned_activities(profile_id);

create index if not exists idx_planned_activities_activity_plan_id
    on public.planned_activities(activity_plan_id);

-- ============================================================================
-- ACTIVITIES
-- ============================================================================
create table if not exists public.activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    name text not null,
    notes text,
    activity_type activity_type not null default 'other',
    is_private boolean not null default true,

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
    total_ascent integer not null check (total_ascent >= 0),
    total_descent integer not null check (total_descent >= 0),

    -- ============================================================================
    -- distance metrics
    -- ============================================================================
    distance integer not null check (distance >= 0),
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
    power_zone_1_time    integer default 0 check (power_zone_1_time >= 0),
    power_zone_2_time    integer default 0 check (power_zone_2_time >= 0),
    power_zone_3_time    integer default 0 check (power_zone_3_time >= 0),
    power_zone_4_time    integer default 0 check (power_zone_4_time >= 0),
    power_zone_5_time    integer default 0 check (power_zone_5_time >= 0),
    power_zone_6_time    integer default 0 check (power_zone_6_time >= 0),
    power_zone_7_time    integer default 0 check (power_zone_7_time >= 0),
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

    -- ============================================================================
    -- constraints
    -- ============================================================================
    constraint chk_times check (finished_at >= started_at)
);
create index if not exists idx_activities_profile_id
    on public.activities(profile_id);

create index if not exists idx_activities_activity_type
    on public.activities(activity_type);

create index if not exists idx_activities_started_at
    on public.activities(started_at);

create index if not exists idx_activities_planned_activity_id
    on public.activities(planned_activity_id);


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
    compressed_values bytea not null,        -- values (floats, bool-as-float, latlng pairs, etc.)
    compressed_timestamps bytea not null,    -- elapsed ms from activity start, delta encoded
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
