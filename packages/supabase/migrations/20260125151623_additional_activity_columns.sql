alter table "public"."activities" add column "avg_swolf" numeric;

alter table "public"."activities" add column "device_manufacturer" text;

alter table "public"."activities" add column "device_product" text;

alter table "public"."activities" add column "laps" jsonb;

alter table "public"."activities" add column "map_bounds" jsonb;

alter table "public"."activities" add column "polyline" text;

alter table "public"."activities" add column "pool_length" numeric;

alter table "public"."activities" add column "total_strokes" integer;


