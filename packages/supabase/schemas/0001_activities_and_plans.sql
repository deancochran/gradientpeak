create type activity_type as enum (
    'outdoor_run',
    'outdoor_bike',
    'indoor_treadmill',
    'indoor_strength',
    'indoor_swim',
    'other'
);


create type activity_metric as enum (
    'heartrate',
    'power',
    'speed',
    'cadence',
    'distance',
    'latlng',      -- GPS coordinates
    'moving',      -- moving/not moving
    'altitude',
    'elevation',
    'temperature', -- optional sensor metric
    'gradient'     -- optional hill grade
);
create type activity_metric_data_type as enum (
    'float',
    'real',
    'numeric',
    'boolean',
    'string',
    'integer',
    'latlng'
);



create table if not exists public.activities (
    id uuid primary key default uuid_generate_v4(), -- identifiers
    idx serial unique,

    name text not null, -- metadata
    notes text,
    activity_type activity_type not null default 'other',
    started_at timestamp not null,
    finished_at timestamp not null,
    planned_activity_id uuid references public.planned_activities(id) on delete set null,

    profile_id uuid not null references public.profiles(id) on delete cascade, -- profile metadata
    profile_age integer,
    profile_weight_kg integer,
    profile_ftp integer,
    profile_threshold_hr integer,

    total_time integer,
    moving_time integer, -- activity aggregates
    distance integer,
    total_ascent integer,
    total_descent integer,
    calories integer,
    avg_speed numeric(5,2), -- activity metadata avgs
    avg_heart_rate integer,
    avg_cadence integer,
    avg_power integer,
    norm_speed numeric(5,2), -- activity metadata norms
    norm_heart_rate integer,
    norm_cadence integer,
    norm_power integer,
    max_speed numeric(5,2), -- activity metadata maxes
    max_heart_rate integer,
    max_power integer,
    max_cadence integer,

    created_at timestamp not null default now()
);


create table if not exists public.activity_streams (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique,
    activity_id uuid references public.activities(id) on delete cascade,
    metric activity_metric not null,
    data_type activity_metric_data_type not null,
    original_size integer not null,
    compressed_data bytea NOT NULL,
    created_at timestamp not null default now()
);


create table if not exists public.planned_activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique,
    profile_id uuid references public.profiles(id) on delete cascade,
    completed_activity_id uuid,
    scheduled_date date,
    name text not null,
    activity_type activity_type not null,
    description text,
    structure jsonb not null,
    estimated_duration integer,
    estimated_distance integer,
    estimated_tss integer,
    created_at timestamp not null default now()
);
