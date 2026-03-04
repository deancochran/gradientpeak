-- Note: Storage bucket creation moved to seed.sql

create type "sync_status" as enum ('local_only', 'syncing', 'synced', 'sync_failed');

create table "activities" (
    "id" uuid not null default gen_random_uuid(),
    "profile_id" uuid not null references "profiles"("id") on delete cascade,

    -- minimal storage for file references
    "local_storage_path" text,
    "cloud_storage_path" text,
    "sync_status" sync_status not null default 'local_only'::sync_status,

    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),

    constraint "activities_pkey" primary key ("id")
);

-- RLS policies for activities table
alter table "activities" enable row level security;

create policy "Users can manage own activities" on "activities"
    for all using (auth.uid() = profile_id);
