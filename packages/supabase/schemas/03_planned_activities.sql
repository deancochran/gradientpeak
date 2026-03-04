-- 03_planned_activities.sql
-- Planned Activities - MVP streamlined version with essential functionality

create type "activity_type" as enum ('bike', 'run', 'swim', 'strength', 'other');
create type "completion_status" as enum ('pending', 'completed', 'skipped');

create table "planned_activities" (
    "id" uuid primary key default gen_random_uuid(),
    "profile_id" uuid not null references "profiles"("id") on delete cascade,
    "profile_plan_id" uuid references "profile_plans"("id") on delete set null,

    -- scheduling
    "scheduled_date" date not null,
    "name" text not null,
    "activity_type" activity_type not null,
    "description" text,

    -- workout structure
    "structure" jsonb not null default '{}'::jsonb,
    "structure_version" text not null default '1.0',

    -- requirements
    "requires_ftp" boolean default false,
    "requires_threshold_hr" boolean default false,

    -- estimates
    "estimated_duration" integer, -- seconds
    "estimated_tss" numeric(6,2),

    -- completion tracking
    "completion_status" completion_status default 'pending',
    "completed_activity_id" uuid references "activities"("id"),
    "completion_date" date,

    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
);

-- RLS policies
alter table "planned_activities" enable row level security;

create policy "Users can manage own plans" on "planned_activities"
    for all using (auth.uid() = profile_id);
