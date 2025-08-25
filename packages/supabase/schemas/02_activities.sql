create type "sync_status" as enum ('local_only', 'syncing', 'synced', 'sync_failed');

create table "activities" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "local_fit_file_path" text not null,
  "sync_status" sync_status not null default 'local_only'::sync_status,
  "cloud_storage_path" text,
  "sync_error_message" text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "activities_pkey" primary key ("id"),
  constraint "activities_user_id_fkey" foreign key ("user_id") references "users"("id") on delete cascade
);