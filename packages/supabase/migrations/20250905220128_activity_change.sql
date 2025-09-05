alter table "public"."activities" drop column "duration";

alter table "public"."activities" add column "started_at" timestamp with time zone not null;

alter table "public"."activities" add column "total_elapsed_time" integer;

alter table "public"."activities" add column "total_timer_time" integer;


