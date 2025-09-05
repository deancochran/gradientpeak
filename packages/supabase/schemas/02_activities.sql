create type "sync_status" as enum ('local_only', 'syncing', 'synced', 'sync_failed');

create table "activities" (
  "id" uuid not null default gen_random_uuid(),
  "profile_id" uuid not null,
  "local_fit_file_path" text,
  "sync_status" sync_status not null default 'local_only'::sync_status,
  "json_storage_path" text,
  "cloud_storage_path" text,
  "sync_error_message" text,
  "started_at" timestamp with time zone not null,
  "total_elapsed_time" integer, -- Wall clock time from start to end (includes pauses)
  "total_timer_time" integer, -- Active recording time (excludes pauses)
  "distance" real,
  "avg_speed" real,
  "max_speed" real,
  "total_ascent" real,
  "total_descent" real,
  "avg_heart_rate" integer,
  "max_heart_rate" integer,
  "avg_power" integer,
  "normalized_power" integer,
  "avg_cadence" integer,
  "summary_metrics" jsonb,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "activities_pkey" primary key ("id"),
  constraint "activities_profile_id_fkey" foreign key ("profile_id") references "profiles"("id") on delete cascade
);
