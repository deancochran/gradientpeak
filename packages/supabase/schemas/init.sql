-- ============================================================================
-- ENUMS
-- ============================================================================

-- Category/type of activity (broad classification)
create type public.activity_category as enum (
    'run',
    'bike',
    'swim',
    'strength',
    'other'
);

create type public.gender as enum (
    'male',
    'female',
    'other'
);


create type public.integration_provider as enum (
    'strava',
    'wahoo',
    'trainingpeaks',
    'garmin',
    'zwift'
);

create type public.training_effect_label as enum (
    'recovery',
    'base',
    'tempo',
    'threshold',
    'vo2max'
);

create type public.event_type as enum (
    'planned_activity',
    'rest_day',
    'race',
    'custom',
    'imported'
);

create type public.event_status as enum (
    'scheduled',
    'completed',
    'cancelled'
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
-- Note: Performance metrics (FTP, threshold HR, weight) removed in Phase 1
-- These are now tracked temporally in profile_performance_metric_logs and
-- profile_metric_logs tables for better historical tracking and flexibility
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    idx serial unique,
    dob date,
    gender text check (gender in ('male', 'female')),
    username text unique,
    language text default 'en',
    preferred_units text default 'metric',
    avatar_url text,
    bio text,
    onboarded boolean default false,
    is_public boolean default false,
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
-- Training Plans Table
-- Supports both user-created plans and system templates:
-- 1. User plans: profile_id set, is_system_template = false
-- 2. System templates: profile_id = null, is_system_template = true
create table if not exists public.training_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid references public.profiles(id) on delete cascade,
    is_system_template boolean not null default false,
    template_visibility text not null default 'private',
    name text not null,
    description text,
    structure jsonb not null,
    is_public boolean not null default false,
    sessions_per_week_target integer,
    duration_hours numeric,
    likes_count integer default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint training_plans_template_visibility_check check (
        template_visibility in ('private', 'public')
    ),

    constraint training_plans_system_templates_public_check check (
        is_system_template = false or template_visibility = 'public'
    ),

    -- Constraint: system templates must have null profile_id, user plans must have profile_id
    constraint training_plans_template_profile_check check (
        (is_system_template = true and profile_id is null) or
        (is_system_template = false and profile_id is not null)
    )
);

create index if not exists idx_training_plans_profile_id
    on public.training_plans(profile_id);

create index if not exists idx_training_plans_is_system_template
    on public.training_plans(is_system_template)
    where is_system_template = true;

create index if not exists idx_training_plans_visibility
    on public.training_plans(template_visibility);

create index if not exists idx_training_plans_name
    on public.training_plans(name);

create trigger update_training_plans_updated_at
    before update on public.training_plans
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- PROFILE TRAINING SETTINGS
-- ============================================================================
create table if not exists public.profile_training_settings (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create trigger update_profile_training_settings_updated_at
    before update on public.profile_training_settings
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- USER TRAINING PLANS
-- ============================================================================
create table if not exists public.user_training_plans (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    training_plan_id uuid not null references public.training_plans(id) on delete cascade,
    status text not null check (status in ('active', 'paused', 'completed', 'abandoned')) default 'active',
    start_date date not null,
    target_date date,
    snapshot_structure jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_user_training_plans_profile_id
    on public.user_training_plans(profile_id);

create index if not exists idx_user_training_plans_training_plan_id
    on public.user_training_plans(training_plan_id);

create index if not exists idx_user_training_plans_status
    on public.user_training_plans(profile_id) where status = 'active';

create trigger update_user_training_plans_updated_at
    before update on public.user_training_plans
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
    likes_count integer default 0,
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
-- Activity plans can be one of:
-- 1. User-created plans (profile_id set, is_system_template = false)
-- 2. System templates (profile_id = null, is_system_template = true)
--
-- Plans can be:
-- 1. Structured workouts (intervals/steps with optional route)
-- 2. Route-following activities (route with optional structure)
-- 3. Casual activities (description only, no structure or route)
-- At least one of structure, route_id, or description must be present.
-- ============================================================================
create table if not exists public.activity_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid references public.profiles(id) on delete cascade,
    is_system_template boolean not null default false,
    template_visibility text not null default 'private',
    import_provider text,
    import_external_id text,
    version text not null default '1.0',
    name text not null,
    notes text,
    activity_category activity_category not null default 'run',
    description text not null,
    structure jsonb,
    route_id uuid references public.activity_routes(id) on delete set null,
    likes_count integer default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint activity_plans_has_content check (
        structure is not null or
        route_id is not null
    ),
    constraint activity_plans_template_visibility_check check (
        template_visibility in ('private', 'public')
    ),
    constraint activity_plans_system_templates_public_check check (
        is_system_template = false or template_visibility = 'public'
    ),
    constraint activity_plans_import_provider_non_empty_check check (
        import_provider is null or btrim(import_provider) <> ''
    ),
    constraint activity_plans_import_external_id_non_empty_check check (
        import_external_id is null or btrim(import_external_id) <> ''
    ),
    constraint activity_plans_system_template_check check (
        (is_system_template = true and profile_id is null) or
        (is_system_template = false and profile_id is not null)
    )
);

create index if not exists idx_activity_plans_profile_id
    on public.activity_plans(profile_id)
    where profile_id is not null;

create index if not exists idx_activity_plans_system_templates
    on public.activity_plans(is_system_template)
    where is_system_template = true;

create index if not exists idx_activity_plans_route_id
    on public.activity_plans(route_id)
    where route_id is not null;

create index if not exists idx_activity_plans_visibility
    on public.activity_plans(template_visibility);

create unique index if not exists idx_activity_plans_import_identity
    on public.activity_plans(profile_id, import_provider, import_external_id)
    where import_provider is not null and import_external_id is not null;

create trigger update_activity_plans_updated_at
    before update on public.activity_plans
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- LIBRARY ITEMS
-- ============================================================================
create table if not exists public.library_items (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    item_type text not null check (item_type in ('training_plan', 'activity_plan')),
    item_id uuid not null,
    created_at timestamptz not null default now(),
    unique (profile_id, item_type, item_id)
);

create index if not exists idx_library_items_profile_type_created
    on public.library_items(profile_id, item_type, created_at desc);

create index if not exists idx_library_items_item_lookup
    on public.library_items(item_type, item_id);

-- ============================================================================
-- EVENTS
-- ============================================================================
create table if not exists public.events (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,

    event_type event_type not null,
    status event_status not null default 'scheduled',
    title text not null,
    description text,
    all_day boolean not null default false,
    starts_at timestamptz not null,
    ends_at timestamptz,
    timezone text not null default 'UTC',

    -- Optional linkage fields for planned-activity and broader event modeling
    activity_plan_id uuid references public.activity_plans(id) on delete set null,
    training_plan_id uuid references public.training_plans(id) on delete set null,
    user_training_plan_id uuid references public.user_training_plans(id) on delete set null,
    linked_activity_id uuid,

    -- Recurrence fields (series + occurrence identity)
    series_id uuid references public.events(id) on delete cascade,
    recurrence_rule text,
    recurrence_timezone text,
    occurrence_key text not null default '',
    original_starts_at timestamptz,

    -- Imported-source identity fields (idempotent upsert baseline)
    source_provider text,
    integration_account_id uuid,
    external_calendar_id text,
    external_event_id text,

    -- Schedule lineage metadata for template-apply batches
    schedule_batch_id uuid,

    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint events_time_window check (ends_at is null or ends_at > starts_at),
    constraint events_series_not_self check (series_id is null or series_id <> id),
    constraint events_recurrence_timezone_requires_rule check (
        recurrence_timezone is null or recurrence_rule is not null
    ),
    constraint events_series_occurrence_key_required check (
        series_id is null or btrim(occurrence_key) <> ''
    ),
    constraint events_source_identity_complete check (
        (source_provider is null and integration_account_id is null and external_calendar_id is null and external_event_id is null) or
        (source_provider is not null and integration_account_id is not null and external_calendar_id is not null and external_event_id is not null)
    ),
    constraint events_source_provider_non_empty check (
        source_provider is null or btrim(source_provider) <> ''
    ),
    constraint events_external_calendar_non_empty check (
        external_calendar_id is null or btrim(external_calendar_id) <> ''
    ),
    constraint events_external_event_non_empty check (
        external_event_id is null or btrim(external_event_id) <> ''
    )
);

create index if not exists idx_events_profile_starts_at
    on public.events(profile_id, starts_at);

create index if not exists idx_events_profile_status_starts_at
    on public.events(profile_id, status, starts_at);

create index if not exists idx_events_event_type_starts_at
    on public.events(event_type, starts_at);

create index if not exists idx_events_activity_plan
    on public.events(activity_plan_id)
    where activity_plan_id is not null;

create index if not exists idx_events_training_plan
    on public.events(training_plan_id)
    where training_plan_id is not null;

create index if not exists idx_events_user_training_plan
    on public.events(user_training_plan_id)
    where user_training_plan_id is not null;

create unique index if not exists idx_events_series_occurrence_unique
    on public.events(series_id, occurrence_key)
    where series_id is not null;

create unique index if not exists idx_events_external_identity_unique
    on public.events(
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

create index if not exists idx_events_integration_calendar_updated
    on public.events(integration_account_id, external_calendar_id, updated_at)
    where integration_account_id is not null and external_calendar_id is not null;

create index if not exists idx_events_schedule_batch
    on public.events(profile_id, schedule_batch_id)
    where schedule_batch_id is not null;

create trigger update_events_updated_at
    before update on public.events
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- PROFILE GOALS
-- ============================================================================
create table if not exists public.profile_goals (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    milestone_event_id uuid not null references public.events(id) on delete cascade,
    title text not null,
    priority integer not null default 5 check (priority >= 0 and priority <= 10),
    activity_category text,
    target_payload jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profile_goals_profile_id
    on public.profile_goals(profile_id);

create index if not exists idx_profile_goals_milestone_event_id
    on public.profile_goals(milestone_event_id);

create trigger update_profile_goals_updated_at
    before update on public.profile_goals
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
-- SYNCED EVENTS
-- ============================================================================
create table if not exists public.synced_events (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    event_id uuid not null references public.events(id) on delete cascade,
    provider integration_provider not null,
    external_id text not null,
    synced_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint unique_event_per_provider unique (event_id, provider)
);

create index if not exists idx_synced_events_profile
    on public.synced_events(profile_id);

create index if not exists idx_synced_events_event
    on public.synced_events(event_id);

create index if not exists idx_synced_events_provider
    on public.synced_events(provider, external_id);

create trigger update_synced_events_updated_at
    before update on public.synced_events
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
    -- All metrics as individual typed columns (no JSONB for performance)
    -- ============================================================================
    -- Basic metrics (calories - duration/distance already defined above)
    calories integer,
    avg_temperature numeric,

    -- Elevation metrics
    elevation_gain_meters numeric(10,2),
    elevation_loss_meters numeric(10,2),

    -- Heart rate metrics
    avg_heart_rate integer,
    max_heart_rate integer,

    -- Power metrics (cycling)
    avg_power integer,
    max_power integer,
    normalized_power integer,
    intensity_factor numeric(4,3),
    training_stress_score integer,
    trimp numeric(10,2),
    trimp_source text check (trimp_source in ('hr', 'power_proxy')),

    -- Cadence metrics
    avg_cadence integer,
    max_cadence integer,

    -- Speed metrics
    avg_speed_mps numeric(6,2),
    max_speed_mps numeric(6,2),
    normalized_speed_mps numeric(6,2),
    normalized_graded_speed_mps numeric(6,2),

    -- Efficiency & Training Effect
    efficiency_factor numeric,
    aerobic_decoupling numeric,
    training_effect training_effect_label,

    -- Zone times as individual columns (for efficient queries)
    hr_zone_1_seconds integer,
    hr_zone_2_seconds integer,
    hr_zone_3_seconds integer,
    hr_zone_4_seconds integer,
    hr_zone_5_seconds integer,

    power_zone_1_seconds integer,
    power_zone_2_seconds integer,
    power_zone_3_seconds integer,
    power_zone_4_seconds integer,
    power_zone_5_seconds integer,
    power_zone_6_seconds integer,
    power_zone_7_seconds integer,


    -- ============================================================================
    -- References
    -- ============================================================================
    activity_plan_id uuid references public.activity_plans(id) on delete set null,

    -- ============================================================================
    -- External integration
    -- ============================================================================
    provider integration_provider,
    external_id text,

    -- ============================================================================
    -- FIT file processing
    -- ============================================================================
    fit_file_path text,
    fit_file_size integer,

    -- ============================================================================
    -- Extended Metadata (Maps, Laps, Device)
    -- ============================================================================
    polyline text,
    map_bounds jsonb,
    laps jsonb,
    total_strokes integer,
    avg_swolf numeric,
    pool_length numeric,
    device_manufacturer text,
    device_product text,
    likes_count integer default 0,

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

create index if not exists idx_activities_started
    on public.activities(started_at desc);

create index if not exists idx_activities_activity_plan
    on public.activities(activity_plan_id)
    where activity_plan_id is not null;

create index if not exists idx_activities_external
    on public.activities(provider, external_id)
    where provider is not null;

create unique index if not exists idx_activities_external_unique
    on public.activities(provider, external_id)
    where external_id is not null and provider is not null;

-- Metric column indexes for filtering and sorting
create index if not exists idx_activities_tss
    on public.activities(training_stress_score desc)
    where training_stress_score is not null;

create index if not exists idx_activities_trimp
    on public.activities(trimp desc)
    where trimp is not null;

create index if not exists idx_activities_trimp_source
    on public.activities(trimp_source)
    where trimp_source is not null;

create index if not exists idx_activities_duration
    on public.activities(duration_seconds desc);

create index if not exists idx_activities_distance
    on public.activities(distance_meters desc);

create index if not exists idx_activities_avg_heart_rate
    on public.activities(avg_heart_rate desc)
    where avg_heart_rate is not null;

create index if not exists idx_activities_max_heart_rate
    on public.activities(max_heart_rate desc)
    where max_heart_rate is not null;

create index if not exists idx_activities_avg_power
    on public.activities(avg_power desc)
    where avg_power is not null;

create index if not exists idx_activities_max_power
    on public.activities(max_power desc)
    where max_power is not null;

create index if not exists idx_activities_normalized_power
    on public.activities(normalized_power desc)
    where normalized_power is not null;

create index if not exists idx_activities_intensity_factor
    on public.activities(intensity_factor desc)
    where intensity_factor is not null;

create index if not exists idx_activities_avg_cadence
    on public.activities(avg_cadence desc)
    where avg_cadence is not null;

create index if not exists idx_activities_avg_speed
    on public.activities(avg_speed_mps desc)
    where avg_speed_mps is not null;

create index if not exists idx_activities_elevation_gain
    on public.activities(elevation_gain_meters desc)
    where elevation_gain_meters is not null;

create index if not exists idx_activities_calories
    on public.activities(calories desc)
    where calories is not null;

-- Composite indexes for user activity lists
create index if not exists idx_activities_profile_tss
    on public.activities(profile_id, training_stress_score desc)
    where training_stress_score is not null;

create index if not exists idx_activities_profile_duration
    on public.activities(profile_id, duration_seconds desc);

create index if not exists idx_activities_profile_distance
    on public.activities(profile_id, distance_meters desc);

create index if not exists idx_activities_profile_power
    on public.activities(profile_id, avg_power desc)
    where avg_power is not null;

-- Full-text search on activity names
create index if not exists idx_activities_name_search
    on public.activities using gin (to_tsvector('english', name));

-- Trigger for auto-updating updated_at timestamp
create trigger update_activities_updated_at
    before update on public.activities
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- ACTIVITY EFFORTS
-- ============================================================================
create type public.effort_type as enum (
    'power',
    'speed'
);

create table public.activity_efforts (
    id uuid primary key default uuid_generate_v4(),
    -- Nullable for onboarding/manual efforts that are not tied to a recorded activity
    activity_id uuid references public.activities(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    activity_category activity_category not null,

    duration_seconds integer not null,
    effort_type effort_type not null,
    value numeric not null,
    unit text not null, -- 'watts' or 'meters_per_second'
    start_offset integer, -- Optional: seconds from activity start
    recorded_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_activity_efforts_activity_id
    on public.activity_efforts(activity_id);

create index if not exists idx_activity_efforts_profile_lookup
    on public.activity_efforts(profile_id, activity_category, effort_type, duration_seconds, value desc);


-- ============================================================================
-- PERFORMANCE METRICS PLATFORM - PHASE 1
-- ============================================================================
-- Purpose: Separate athlete capabilities from activity data
-- Tables: profile_performance_metric_logs, profile_metric_logs
-- Architecture: Activities record what happened; metrics define who the athlete is
-- ============================================================================

-- ============================================================================
-- ENUMS - PERFORMANCE METRICS
-- ============================================================================

-- Profile metric types (biometric & lifestyle - simple tracking)
create type public.profile_metric_type as enum (
    'weight_kg',
    'resting_hr',
    'sleep_hours',
    'hrv_rmssd',
    'vo2_max',
    'body_fat_percentage',
    'hydration_level',
    'stress_score',
    'soreness_level',
    'wellness_score',
    'max_hr',
    'lthr'
);

-- ============================================================================
-- PROFILE METRICS
-- ============================================================================
-- Purpose: Track biometric and lifestyle metrics that influence training
-- but can't be used for performance curves
--
-- Examples:
-- - Weight tracking: 75.0kg → 74.5kg → 74.8kg
-- - Sleep: 7.5h → 8.0h → 6.5h
-- - HRV: 65ms → 68ms → 62ms
-- - Resting HR: 52bpm → 50bpm → 51bpm
-- ============================================================================
create table if not exists public.profile_metrics (
    -- ============================================================================
    -- Identity
    -- ============================================================================
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,

    -- ============================================================================
    -- Metric (simple: type + value)
    -- ============================================================================
    metric_type profile_metric_type not null,
    value numeric not null check (value >= 0),
    unit text not null,

    -- ============================================================================
    -- Provenance (optional reference to activity)
    -- ============================================================================
    reference_activity_id uuid references public.activities(id) on delete set null,
    notes text,

    -- ============================================================================
    -- Timestamps
    -- ============================================================================
    recorded_at timestamptz not null, -- When metric was measured (can be backdated)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES - PROFILE METRICS
-- ============================================================================
-- Critical for temporal queries: "What was weight on 2024-03-15?"
create index if not exists idx_profile_metrics_temporal_lookup
    on public.profile_metrics(profile_id, metric_type, recorded_at desc);

-- Profile metrics list
create index if not exists idx_profile_metrics_profile
    on public.profile_metrics(profile_id, recorded_at desc);

-- Time-series queries
create index if not exists idx_profile_metrics_recorded_at
    on public.profile_metrics(recorded_at desc);

-- Reference activity lookup
create index if not exists idx_profile_metrics_reference_activity
    on public.profile_metrics(reference_activity_id)
    where reference_activity_id is not null;

-- Trigger for auto-updating updated_at timestamp
create trigger update_profile_metrics_updated_at
    before update on public.profile_metrics
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- PHASE 7 DATA BACKFILL
-- ============================================================================
update public.training_plans
set template_visibility = 'public'
where is_system_template = true and template_visibility <> 'public';

update public.activity_plans
set template_visibility = 'public'
where is_system_template = true and template_visibility <> 'public';

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
create table public.notifications (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    title text not null,
    message text not null,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_notifications_profile_id
    on public.notifications(profile_id);

create index if not exists idx_notifications_is_read
    on public.notifications(is_read);

-- ============================================================================
-- SOCIAL NETWORK (FOLLOWS & LIKES)
-- ============================================================================
create table public.follows (
    follower_id uuid references public.profiles(id) on delete cascade,
    following_id uuid references public.profiles(id) on delete cascade,
    status text check (status in ('pending', 'accepted')),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    primary key (follower_id, following_id)
);

create trigger update_follows_updated_at
    before update on public.follows
    for each row
    execute function update_updated_at_column();

create table public.likes (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid references public.profiles(id) on delete cascade,
    entity_type text check (entity_type in ('activity', 'training_plan', 'activity_plan', 'route')),
    entity_id uuid not null,
    created_at timestamptz default now(),
    unique (profile_id, entity_type, entity_id)
);

create index idx_likes_entity on public.likes(entity_type, entity_id);

create or replace function public.update_likes_count()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        if new.entity_type = 'activity' then
            update public.activities set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'training_plan' then
            update public.training_plans set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'activity_plan' then
            update public.activity_plans set likes_count = likes_count + 1 where id = new.entity_id;
        elsif new.entity_type = 'route' then
            update public.activity_routes set likes_count = likes_count + 1 where id = new.entity_id;
        end if;
        return new;
    elsif tg_op = 'DELETE' then
        if old.entity_type = 'activity' then
            update public.activities set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'training_plan' then
            update public.training_plans set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'activity_plan' then
            update public.activity_plans set likes_count = likes_count - 1 where id = old.entity_id;
        elsif old.entity_type = 'route' then
            update public.activity_routes set likes_count = likes_count - 1 where id = old.entity_id;
        end if;
        return old;
    end if;
    return null;
end;
$$ language plpgsql;

create trigger likes_insert_trigger
    after insert on public.likes
    for each row execute function public.update_likes_count();

create trigger likes_delete_trigger
    after delete on public.likes
    for each row execute function public.update_likes_count();

-- ============================================================================
-- COMMENTS
-- ============================================================================
create table public.comments (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid references public.profiles(id) on delete cascade,
    entity_type text not null check (entity_type in ('activity', 'training_plan', 'activity_plan', 'route')),
    entity_id uuid not null,
    content text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    constraint comments_content_non_empty check (btrim(content) <> '')
);

create index idx_comments_entity on public.comments(entity_type, entity_id);
create index idx_comments_profile_id on public.comments(profile_id, created_at desc);
create index idx_comments_created_at on public.comments(created_at desc);

create trigger update_comments_updated_at
    before update on public.comments
    for each row
    execute function update_updated_at_column();

-- ============================================================================
-- RPC FUNCTIONS (AUTH & SECURITY)
-- ============================================================================

-- Function to check user status (verified vs unverified/pending email change)
create or replace function public.get_user_status()
returns text
security definer
language plpgsql
as $$
begin
  -- Check if there is a pending email change
  if exists (
    select 1
    from auth.users
    where id = auth.uid()
    and email_change is not null
  ) then
    return 'unverified';
  else
    return 'verified';
  end if;
end;
$$;

-- Function to allow users to delete their own account
-- This triggers cascading deletes on all related tables
create or replace function public.delete_own_account()
returns void
security definer
language plpgsql
as $$
begin
  -- Delete the user from auth.users
  -- Postgres ON DELETE CASCADE constraints on related tables (profiles, activities, etc.)
  -- will automatically remove all associated user data.
  delete from auth.users where id = auth.uid();
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- RLS is DISABLED for all tables because:
-- 1. Backend uses SERVICE ROLE KEY (bypasses RLS anyway)
-- 2. Authorization is handled at application layer via tRPC protectedProcedure
-- 3. All queries explicitly filter by profile_id = ctx.session.user.id
-- 4. Simpler development and debugging for MVP
--
-- This architecture is secure because:
-- - Service role key is never exposed to clients
-- - Authentication middleware validates all requests
-- - Business logic enforces data isolation
--
-- If you need RLS in the future (e.g., for direct client access or third-party
-- integrations), enable it per table and add appropriate policies.

alter table public.activities disable row level security;
alter table public.activity_efforts disable row level security;
alter table public.activity_plans disable row level security;
alter table public.activity_routes disable row level security;

alter table public.integrations disable row level security;
alter table public.events disable row level security;
alter table public.library_items disable row level security;
alter table public.notifications disable row level security;
alter table public.oauth_states disable row level security;
alter table public.profiles disable row level security;
alter table public.profile_goals disable row level security;
alter table public.profile_training_settings disable row level security;
alter table public.profile_metrics disable row level security;
alter table public.synced_events disable row level security;
alter table public.training_plans disable row level security;
alter table public.user_training_plans disable row level security;
alter table public.follows disable row level security;
alter table public.likes disable row level security;
alter table public.comments disable row level security;
