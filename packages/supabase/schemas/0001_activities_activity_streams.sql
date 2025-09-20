-- Enum
create type sync_status as enum (
  'local_only',
  'synced',
  'sync_failed'
);

-- Table
create table if not exists public.activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    notes text,
    local_file_path text not null,
    sync_status sync_status not null default 'local_only',
    started_at timestamp not null,
    total_time integer not null default 0,
    moving_time integer not null default 0,
    snapshot_weight_kg integer not null,
    snapshot_ftp integer not null,
    snapshot_threshold_hr integer not null,
    tss integer not null,
    if integer not null,
    normalized_power integer,
    avg_power integer,
    peak_power integer,
    avg_heart_rate integer,
    max_heart_rate integer,
    avg_cadence integer,
    max_cadence integer,
    distance integer,
    avg_speed numeric(5,2),
    max_speed numeric(5,2),
    total_ascent integer,
    total_descent integer,
    created_at timestamp not null default now()
);

create type public.activity_metric as enum (
    'heartrate',
    'power',
    'speed',
    'cadence',
    'distance',
    'latlng',      -- GPS coordinates
    'moving',      -- moving/not moving
    'altitude',    -- elevation
    'temperature', -- optional sensor metric
    'gradient'     -- optional hill grade
);
create type public.activity_metric_data_type as enum (
    'float',
    'boolean',
    'string',
    'integer',
    'latlng'
);

create table if not exists public.activity_streams (
    id uuid primary key default uuid_generate_v4(),
    activity_id uuid not null references public.activities(id) on delete cascade,
    type public.activity_metric not null,
    data_type public.activity_metric_data_type not null,
    chunk_index integer not null default 0,
    original_size integer not null,
    data jsonb not null,
    created_at timestamp not null default now()
);
