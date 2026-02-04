# Performance Tracking System: Design Document

## Core Concept

This system automatically tracks fitness across all activity types, predicts athlete capabilities, and adapts workouts accordingly. Activity files (FIT format) serve as the source of truth. The system pre-computes metadata for fast queries, calculates performance metrics and training load, and generates estimates on demand.

-----

## Database Tables & Schema Updates

### 1. `activities`

Stores pre-computed metadata from uploaded activity files to enable fast queries.

#### Schema Additions

```sql
ALTER TABLE public.activities
    ADD COLUMN normalized_speed_mps NUMERIC(6,2), -- Normalized Speed
    ADD COLUMN normalized_graded_speed_mps NUMERIC(6,2), -- Normalized Graded Speed
    ADD COLUMN avg_temperature NUMERIC,
    ADD COLUMN efficiency_factor NUMERIC,
    ADD COLUMN aerobic_decoupling NUMERIC,
    ADD COLUMN training_effect training_effect_label;

CREATE TYPE public.training_effect_label AS ENUM (
    'recovery',
    'base',
    'tempo',
    'threshold',
    'vo2max'
);
```

-----

### 2. `activity_efforts`

Tracks athlete performance capabilities over time, including power curves and speed records across all activity types.

#### SQL Schema

```sql
CREATE TYPE public.effort_type AS ENUM (
    'power',
    'speed'
);

CREATE TABLE public.activity_efforts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_category activity_category NOT NULL,
    duration_seconds INTEGER NOT NULL,
    effort_type effort_type NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT NOT NULL, -- 'watts' or 'meters_per_second'
    start_offset INTEGER, -- Optional: seconds from activity start
    recorded_at TIMESTAMPTZ NOT NULL
);
```

-----

### 3. `profile_metrics`

Tracks key physiological metrics including weight, sleep quality, HRV, and resting heart rate for recovery analysis and power-to-weight ratio context.

#### SQL Schema

```sql
CREATE TYPE public.profile_metric_type AS ENUM (
    'hrv_rmssd',           -- Heart Rate Variability (Root Mean Square of Successive Differences)
    'resting_hr',          -- Resting Heart Rate
    'weight_kg',           -- Body weight in kilograms
    'body_fat_percentage', -- Body fat as a percentage of total weight
    'max_hr',              -- Maximum observed Heart Rate
    'vo2_max',             -- Estimated maximal oxygen consumption
    'lthr'                 -- Lactate Threshold Heart Rate
);

CREATE TABLE public.profile_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    metric_type profile_metric_type NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_profile_metrics_lookup 
    ON public.profile_metrics(profile_id, metric_type, recorded_at DESC);
```

-----

### 4. `notifications`

Stores system-generated alerts for automatically detected achievements, including new personal records, fitness changes, and recovery alerts.

#### SQL Schema

```sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

-----

## Key Metric Definitions & Calculation Logic

This section defines core metrics and outlines their calculation methods.

### `avg_speed_mps` vs. `normalized_speed_mps`

- **`avg_speed_mps`**: Average speed calculated over the total duration of the activity.
- **`normalized_speed_mps`**: A single column storing the “physiologically relevant” speed for each activity type:
  - **Running (NGP):** Calculates Grade Adjusted Pace using the Minetti formula (Speed + Grade → Flat Equivalent Speed). Used for rTSS calculation.
  - **Swimming:** Calculates Average Moving Speed (excluding rest intervals at the wall). Used for TSS calculation (vs. Critical Swim Speed).
  - **Cycling/Power:** If power data exists, `normalized_power` is generally preferred for TSS calculations, but `normalized_speed_mps` will still store the speed metric (likely Moving Average Speed).

### `avg_power` vs. `normalized_power`

- **`avg_power`**: Average power calculated over the total duration of the activity.
- **`normalized_power`**: Normalized power calculated over the moving duration of the activity.

-----

## System Workflow

### When Activity File is Uploaded:

1. Parse the file and extract metadata
1. Determine sport category
1. **Calculate and save all metrics to the `activities` table** (Average, Normalized, EF, Decoupling, etc.). Note: Max/resting HR updates trigger VO2 max updates.
1. Extract best efforts for standard durations: 5 seconds, 10 seconds, 30 seconds, 1 minute, 5 minutes, 10 minutes, 20 minutes, 30 minutes, 60 minutes, 90 minutes, 3 hours
1. Save efforts to `activity_efforts`
1. **Auto-detect new LTHR and update `profile_metrics`**
1. Compare to recent personal bests and create notifications if improvements are detected

### When User Metric is Logged or Collected from Third Party:

- Store the metric in the `profile_metrics` table

-----

## Advanced Physiological Metrics

The FIT file analysis pipeline should include the following logic:

- **Detect New Max Heart Rate:** Identify the peak heart rate from the data. If the new value exceeds the existing `max_hr` in `profile_metrics`, create a new entry.
- **Calculate VO2 Max:** Trigger a VO2 Max recalculation whenever a new `max_hr` or `resting_hr` is recorded. Formula: `VO2 max = 15.3 × (Max HR / Resting HR)`.
- **Auto-Detect LTHR:** Analyze sustained, high-intensity efforts to detect the deflection point for LTHR or calculate FTP. If a new, higher value is found, update `profile_metrics` (LTHR).
- **Efficiency Factor (EF):** Calculate as `Normalized Power / Average Heart Rate` (or `Normalized Graded or Ungraded Speed / Avg HR` for other activities).
- **Aerobic Decoupling:** Compare the EF of the first half of a long effort to the second half. A high percentage indicates a decline in aerobic endurance capacity.
- **Training Effect:** Categorize each session as ‘recovery’, ‘base’, ‘tempo’, ‘threshold’, or ‘vo2max’ based on time spent in HR zones relative to detected thresholds.
- **Weather Data:** If the activity file lacks temperature data, use the **Google Weather API** (or equivalent) to fetch temperature based on start and end GPS coordinates and timestamps. Average the two values for the session.
- **Activity Efforts (Redundancy):** Calculate and store **all available activity efforts** (best 5s, 1m, 5m, etc.) for the current activity in the `activity_efforts` table, regardless of whether they represent all-time personal bests. This ensures fault tolerance and allows for historical analysis or rebuilding of bests if an activity is deleted.
- **Validate Payload:** Ensure the final `activities` insert payload is validated against the Zod schema before database insertion.

-----

## Summary

This performance tracking system provides comprehensive activity analysis, automated threshold detection, and intelligent performance monitoring. By pre-computing metrics and storing historical efforts, it enables fast queries while maintaining data integrity and supporting advanced physiological analysis across all activity types.​​​​​​​​​​​​​​​​