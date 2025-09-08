-- 02_profile_plans.sql
-- Profile Plans - MVP streamlined version with essential functionality

create type "plan_status" as enum ('draft', 'active', 'completed', 'paused');
create type "plan_type" as enum ('base', 'build', 'peak', 'recovery', 'custom');

create table "profile_plans" (
    "id" uuid primary key default gen_random_uuid(),
    "profile_id" uuid not null references "profiles"("id") on delete cascade,

    "name" text not null,
    "description" text,
    "plan_type" plan_type not null default 'custom',
    "status" plan_status not null default 'draft',

    "start_date" date not null,
    "end_date" date not null,

    -- profile snapshot
    "snapshot_weight_kg" numeric(5,2),
    "snapshot_ftp" numeric(5,2),
    "snapshot_threshold_hr" integer,

    -- progression config (JSONB)
    "config_version" text not null default '1.0',
    "config" jsonb default '{
        "ramp_rate": 0.07,
        "recovery_weeks": [4, 8, 12],
        "test_weeks": [4, 8],
        "weekly_targets": []
    }'::jsonb,

    -- progress tracking
    "completion_percentage" numeric(5,2) default 0.00,

    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
);


-- RLS policies
alter table "profile_plans" enable row level security;

create policy "Users can manage own plans" on "profile_plans"
    for all using (auth.uid() = profile_id);
