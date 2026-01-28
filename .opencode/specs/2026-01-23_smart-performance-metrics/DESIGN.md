# Performance Tracking System: Design Document

## Core Concept

Auto-track fitness across all activity types, predict capabilities, and adapt workouts. Activity files (FIT/GPX/TCX) are the source of truth. Pre-compute metadata for fast queries, calculate performance metrics on-demand.

---

## Database Tables & Schemas

### 1. `activities`

Pre-computed metadata from uploaded activity files for fast queries.

#### SQL Schema

```sql
create table public.activities (
    -- Core Identity
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,

    -- Core Metadata
    name text not null,
    notes text,
    type text not null, -- e.g., 'bike', 'run', 'swim'
    started_at timestamptz not null,
    fit_file_path text not null, -- Path to the source of truth file

    -- Core Metrics (pre-computed for performance)
    duration_seconds integer not null default 0,
    moving_seconds integer not null default 0,
    distance_meters integer not null default 0,
    calories integer,

    -- Elevation Metrics
    elevation_gain_meters numeric(10,2),
    elevation_loss_meters numeric(10,2),

    -- Heart Rate Metrics
    avg_heart_rate integer,
    max_heart_rate integer,

    -- Power Metrics (Cycling)
    avg_power integer,
    max_power integer,
    normalized_power integer,

    -- Speed Metrics (stored as m/s for efficiency)
    avg_speed_mps numeric(6,2),
    max_speed_mps numeric(6,2),
    grade_adjusted_speed_mps numeric(6,2), -- Grade Adjusted Speed (meters per second)

    -- Cadence Metrics
    avg_cadence integer,
    max_cadence integer,

    -- Performance Scores
    intensity_factor numeric(4,3),
    training_stress_score integer,

    -- Optional Metrics
    temperature numeric,

    -- Audit Timestamps
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_activities_profile_started on public.activities(profile_id, started_at desc);
```

### 2. `activity_efforts`

Tracks athlete performance capabilities over time (power curves, speed records, etc.) across all activity types.

#### SQL Schema

```sql
create type public.effort_type as enum (
    'power',
    'speed'
);

create table public.activity_efforts (
    id uuid primary key default uuid_generate_v4(),
    activity_id uuid not null references public.activities(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    duration_seconds integer not null,
    effort_type effort_type not null,
    value numeric not null,
    unit text not null, -- 'watts' or 'meters_per_second'
    start_offset integer, -- Optional: seconds from activity start
    recorded_at timestamptz not null
);

create index idx_activity_efforts_lookup on public.activity_efforts(profile_id, effort_type, duration_seconds, recorded_at desc);
```

### 3. `profile_metrics`

Tracks weight, sleep, HRV, resting heart rate for recovery and power-to-weight context.

#### SQL Schema

```sql
create type public.profile_metric_type as enum (
    'weight_kg',
    'resting_hr_bpm',
    'sleep_hours',
    'hrv_ms'
);

create table public.profile_metrics (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    metric_type profile_metric_type not null,
    value numeric not null,
    unit text not null,
    recorded_at timestamptz not null
);

create index idx_profile_metrics_lookup on public.profile_metrics(profile_id, metric_type, recorded_at desc);
```

### 4. `notifications` (Planned)

System-generated alerts for auto-detected achievements (new personal records, fitness changes, recovery alerts).

#### SQL Schema

```sql
create type public.notification_type as enum (
    'personal_record',
    'milestone',
    'recovery_alert'
);

create table public.notifications (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    type notification_type not null,
    title text not null,
    message text not null,
    data jsonb,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create index idx_notifications_profile_created_at on public.notifications(profile_id, created_at desc);
```

---

## Effort Types by Sport

- **Power-based sports** (Cycling, Rowing): Power (watts) for standard durations
- **Speed-based sports** (Running, Swimming, Hiking): Speed (meters/second) for standard durations
  - _Note: Speed stored as meters/second for computational efficiency; convert to pace for display_

---

## How It Works

### When Activity File Uploaded:

1. Parse file and extract metadata
1. Determine sport category
1. Save to `activities` table
1. Extract best efforts for standard durations based on sport
1. Save to `activity_efforts`
1. Store source file
1. Compare to recent bests and create notifications if improvements detected

### Auto-Detection:

- Compare new efforts to recent bests (last 90 days)
- If significant improvement detected, create notification with details

### Performance Queries:

- **Threshold calculation:** Use recent best efforts to fit sport-specific models (e.g., Critical Power for cycling, Critical Speed for running)
- **Fitness progression:** Compare current vs historical CTL and key effort metrics
