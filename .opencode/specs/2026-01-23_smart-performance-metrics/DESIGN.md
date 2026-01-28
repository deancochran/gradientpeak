# Performance Tracking System: Design Document

## Core Concept

Auto-track fitness across all activity types, predict capabilities, and adapt workouts. Activity files (FIT) are the source of truth. Pre-compute metadata for fast queries, calculate performance metrics, training load, and compute estimates on-demand.

---

## Database Tables & Schemas Updates

### 1. `activities`

Pre-computed metadata from uploaded activity files for fast queries.

#### Schema Additions

```sql
alter table public.activities
    add column normalized_speed_mps numeric(6,2), -- Moving Time Adjusted Speed (meters per second)
    add column temperature numeric;
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
    activity_category activity_category not null,
    duration_seconds integer not null,
    effort_type effort_type not null,
    value numeric not null,
    unit text not null, -- 'watts' or 'meters_per_second'
    start_offset integer, -- Optional: seconds from activity start
    recorded_at timestam_ptz not null
);

```

### 3. `profile_metrics`

Tracks weight, sleep, HRV, resting heart rate for recovery and power-to-weight context.

#### SQL Schema

```sql
create type public.profile_metric_type as enum (
    'hrv_rmssd',           -- Heart Rate Variability (Root Mean Square of Successive Differences)
    'resting_hr',          -- Resting Heart Rate
    'weight_kg',              -- Body weight
    'body_fat_percentage', -- Body fat as a percentage of total weight
    'max_hr',              -- Maximum observed Heart Rate
    'vo2_max',             -- Estimated maximal oxygen consumption
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

### 4. `notifications`

System-generated alerts for auto-detected achievements (new personal records, fitness changes, recovery alerts).

#### SQL Schema

```sql

create table public.notifications (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    title text not null,
    message text not null,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

```
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

### When User Metric is logged or collected from thirdparty
- store metric in `profile_metrics` table

---
## New Fit File Analysis Requirements

The fit file analysis pipeline should be updated to include the following logic:

Detect New Max Heart Rate: When parsing an activity file, the system should identify the peak heart rate from the data. This value can then be compared to the user's existing max_hr stored in the profile_metrics table. If the new value is higher, a new max_hr entry should be created.

Calculate VO2 Max: The system should trigger a VO2 Max recalculation whenever a new max_hr or resting_hr is recorded in the profile_metrics table. This ensures the user's estimated VO2 Max is always up-to-date with the latest physiological data. VO2 max = 15.3 * (Maximum Heart Rate / Resting Heart Rate).
