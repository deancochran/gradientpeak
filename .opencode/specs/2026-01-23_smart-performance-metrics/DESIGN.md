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
    add column normalized_graded_speed_mps numeric(6,2), -- Moving Time Adjusted Speed (meters per second)
    add column temperature numeric;
    add column traing_effect training_effect_type -- "aerobic" | "anaerobic"
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
    recorded_at timestamptz not null
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
    'lthr'                 -- Lactate Threshold Heart Rate
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

## Key Metric Definitions & Calculation Logic

This section defines the core metrics and outlines their calculation methods.

### `avg_speed_mps` vs. `normalized_speed_mps`

- **`avg_speed_mps`**: the avg speed is calculated over the total duration of the activity
- **`normalized_graded_speed_mps`**: the normalized graded speed is calculated over the moving duration, adujsted for the elevation covered during of the activity

### `avg_power` vs. `normalized_power`

- **`avg_power`**: The average power is calculated over the total duration of the activity.
- **`normalized_power`**: the normalized power is calculated over the moving duration of the activity

## How It Works

### When Activity File Uploaded:

1. Parse file and extract metadata
2. Determine sport category
3. **Calculate and save all metrics to `activities` table (Avg, Normalized, EF, Decoupling, etc.)**
4. Extract best efforts for standard durations ranging from short durations 5seconds 10 seconds, 30 seconds, one minute, five minutes. 10 minutes. 20 minutes. 30 minutes. 60 minutes. 90 minutes. Three hours.
5. Save to `activity_efforts`
6. **Auto-detect new thresholds (FTP, LTHR) and update `profile_metrics`**
7. Compare to recent bests and create notifications if improvements detected

### When User Metric is logged or collected from thirdparty

- store metric in `profile_metrics` table

---

## Advanced Physiological Metrics

The fit file analysis pipeline should be updated to include the following logic:

- **Detect New Max Heart Rate:** Identify the peak heart rate from the data. If the new value is higher than the existing `max_hr` in `profile_metrics`, create a new entry.
- **Calculate VO2 Max:** Trigger a VO2 Max recalculation whenever a new `max_hr` or `resting_hr` is added to the `profile_metrics` table. Formula: `VO2 max = 15.3 * (Max HR / Resting HR)`.
- **Auto-Detect LTHR:** Analyze sustained, high-intensity efforts to detect the deflection point for LTHR. If a new, higher value is found, update `profile_metrics`.
- **Efficiency Factor (EF):** Calculate `Normalized Effort type / Average Heart Rate` for cycling this would be `normalized power / avg hr` for running this would be `normalized_graded_speed / avg_hr`, where if NGP isn't avilable `normalized_speed` is accepteable
- **Aerobic Decoupling:** Compare the EF of the first half of a long effort to the second half. A high percentage indicates a decline in aerobic endurance.
- **Training Effect:** Categorize the session as "Aerobic" or "Anaerobic" based on time spent in HR zones relative to detected thresholds.
- **Validate Payload:** Ensure the final `activities` insert payload is validated against the Zod schema.
