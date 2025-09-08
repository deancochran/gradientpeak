create table "activity_results" (
    "id" uuid primary key default gen_random_uuid(),
    "activity_id" uuid not null references "activities"("id") on delete cascade,

    -- activity timing
    "started_at" timestamp with time zone not null,
    "total_time" integer,    -- total elapsed time (wall clock)
    "moving_time" integer,   -- active recording time

    -- profile snapshot
    "snapshot_weight_kg" numeric(5,2),
    "snapshot_ftp" numeric(5,2),
    "snapshot_threshold_hr" integer,

    -- profile training load
    "tss" numeric(6,2),
    "ctl" numeric(6,2),
    "atl" numeric(6,2),
    "tsb" numeric(6,2),  -- ctl - atl

    -- power metrics
    "normalized_power" numeric(6,2),
    "avg_power" numeric(6,2),
    "peak_power" numeric(6,2),
    "intensity_factor" numeric(4,2),
    "variability_index" numeric(4,2),

    -- heart rate metrics
    "avg_heart_rate" numeric(4,0),
    "max_heart_rate" numeric(4,0),

    -- cadence metrics
    "avg_cadence" numeric(4,0),
    "max_cadence" numeric(4,0),

    -- speed / distance metrics
    "distance" numeric(8,2),
    "avg_speed" numeric(5,2),
    "max_speed" numeric(5,2),

    -- elevation metrics
    "total_ascent" numeric(6,2),
    "total_descent" numeric(6,2),

    -- compliance
    "adherence_score" numeric(4,2),
    "workout_match" boolean,

    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);
