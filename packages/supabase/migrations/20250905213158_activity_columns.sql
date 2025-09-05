alter table "public"."activities" add column "avg_cadence" integer;

alter table "public"."activities" add column "avg_heart_rate" integer;

alter table "public"."activities" add column "avg_power" integer;

alter table "public"."activities" add column "avg_speed" real;

alter table "public"."activities" add column "distance" real;

alter table "public"."activities" add column "duration" integer;

alter table "public"."activities" add column "json_storage_path" text;

alter table "public"."activities" add column "max_heart_rate" integer;

alter table "public"."activities" add column "max_speed" real;

alter table "public"."activities" add column "normalized_power" integer;

alter table "public"."activities" add column "summary_metrics" jsonb;

alter table "public"."activities" add column "total_ascent" real;

alter table "public"."activities" add column "total_descent" real;


