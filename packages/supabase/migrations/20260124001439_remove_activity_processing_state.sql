alter table "public"."activities" drop constraint "activities_processing_status_check";

drop index if exists "public"."idx_activities_processing_status";

alter table "public"."activities" drop column "processing_error";

alter table "public"."activities" drop column "processing_status";


