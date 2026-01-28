# Performance Tracking System: Design Document

## 1. Core Concept & Architectural Impact

This system is designed to auto-track fitness, predict capabilities, and adapt workouts using activity files (FIT/GPX/TCX) as the single source of truth. The architecture is founded on a key principle: **decoupling raw activity data from derived, query-optimized performance metrics.**

This approach provides significant advantages in scalability, performance, and maintainability.

### Architectural Benefits

- **Scalability:** Separating `activities` from `activity_efforts` allows for decoupled workloads. The `activities` table handles high-frequency, simple queries (like a user's activity feed), while `activity_efforts` supports complex, analytical queries (like power curves). This separation allows for independent optimization and prevents analytical workloads from slowing down the user experience. It also enables a scalable, asynchronous processing pipeline where background workers can handle CPU-intensive calculations without blocking user-facing services.

- **Performance:** The design prioritizes a responsive user experience by pre-computing metadata into the `activities` table. This avoids slow, on-the-fly parsing of large activity files for common queries. The `activity_efforts` table acts as a pre-computed cache for performance data, allowing for sub-second responses to analytical queries that would otherwise be prohibitively slow.

- **Maintainability & Extensibility:** The decoupled design makes the system easy to evolve. New performance metrics can be added without altering the core `activities` schema. New activity file types can be supported by extending only the parsing logic, with no changes needed for the UI or notification systems. If calculation logic improves, the `activity_efforts` table can be rebuilt from the raw files without downtime.

- **Data Integrity:** Using the raw activity file as the immutable source of truth makes the system highly resilient. The database tables are treated as a materialized view of the data in these files. If a bug leads to data corruption, the tables can be cleared and rebuilt by re-processing the original files, ensuring no data is permanently lost.

---

## 2. Database Tables & Schemas

### 2.1. `activities`

Stores pre-computed metadata from uploaded activity files for fast queries. This table answers the question: "What did the user do?"

#### SQL Schema

```sql
create table public.activities (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    notes text,
    type text not null, -- e.g., 'bike', 'run', 'swim'
    started_at timestamptz not null,
    duration_seconds integer not null default 0,
    moving_seconds integer not null default 0,
    distance_meters integer not null default 0,
    temperature numeric, -- Optional temperature reading
    fit_file_path text not null, -- Path to the source of truth file
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_activities_profile_started on public.activities(profile_id, started_at desc);
```

### 2.2. `activity_efforts`

Tracks athlete performance capabilities over time (power curves, speed records, etc.) derived from activities. This table answers the question: "How well did the user perform?"

#### SQL Schema

```sql
create type public.effort_type as enum (
    'power',
    'speed',
    'pace'
);

create table public.activity_efforts (
    id uuid primary key default uuid_generate_v4(),
    activity_id uuid not null references public.activities(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    duration_seconds integer not null,
    effort_type effort_type not null,
    value numeric not null,
    unit text not null,
    start_offset integer, -- Optional: seconds from activity start
    recorded_at timestamptz not null
);

create index idx_activity_efforts_lookup on public.activity_efforts(profile_id, effort_type, duration_seconds, recorded_at desc);
```

### 2.3. `profile_metrics`

Tracks weight, sleep, HRV, and resting heart rate to provide context for recovery and power-to-weight ratio.

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

### 2.4. `notifications` (Planned)

System-generated alerts for auto-detected achievements like new personal records, fitness changes, and recovery alerts.

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

## 3. How It Works

### When an Activity File is Uploaded:

1.  **Parse & Pre-compute:** Parse the file and extract key metadata.
2.  **Determine Sport:** Identify the sport category (e.g., power-based vs. speed-based).
3.  **Save Activity:** Save the pre-computed metadata to the `activities` table.
4.  **Extract Efforts:** Calculate the best efforts for standard durations based on the sport (e.g., best 5-minute power, best 1-mile pace).
5.  **Save Efforts:** Save these derived metrics to the `activity_efforts` table.
6.  **Store Source File:** Archive the original activity file as the source of truth.
7.  **Detect Achievements:** Compare the new efforts to recent bests (e.g., last 90 days) and create notifications for any significant improvements.

### Performance Queries:

- **Threshold Calculation:** Use recent best efforts from `activity_efforts` to fit sport-specific models (e.g., Critical Power for cycling, Critical Speed for running).
- **Fitness Progression:** Compare current vs. historical data to track fitness progression over time.
