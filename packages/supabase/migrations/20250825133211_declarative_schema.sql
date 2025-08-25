drop policy "Users can manage their own activities" on "public"."activities";

drop policy "Users can manage their own record" on "public"."users";

alter table "public"."activities" alter column "sync_status" drop default;

alter type "public"."sync_status" rename to "sync_status__old_version_to_be_dropped";

create type "public"."sync_status" as enum ('local_only', 'syncing', 'synced', 'sync_failed');

alter table "public"."activities" alter column sync_status type "public"."sync_status" using sync_status::text::"public"."sync_status";

alter table "public"."activities" alter column "sync_status" set default 'local_only'::sync_status;

drop type "public"."sync_status__old_version_to_be_dropped";

alter table "public"."activities" disable row level security;

alter table "public"."users" disable row level security;

drop policy "Users can delete their own activity files" on "storage"."objects";

drop policy "Users can read their own activity files" on "storage"."objects";

drop policy "Users can upload activity files" on "storage"."objects";


