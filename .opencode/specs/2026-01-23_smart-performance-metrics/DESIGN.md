# Performance Tracking System: Design Document

## Core Concept

Auto-track fitness across all activity types, predict capabilities, and adapt workouts. Activity files (FIT) are the source of truth. Pre-compute metadata for fast queries, calculate performance metrics, training load, and compute estimates on-demand.

---

## Database Tables & Schemas

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
    'weight_kg',
    'resting_hr_bpm',
    'sleep_seconds',
    'hrv_ms',
    'max_hr_bpm'
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

