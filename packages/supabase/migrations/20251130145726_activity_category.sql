create type "public"."activity_category" as enum ('run', 'bike', 'swim', 'strength', 'other');

create type "public"."activity_location" as enum ('outdoor', 'indoor');

drop index if exists "public"."idx_activities_activity_type";

drop index if exists "public"."idx_routes_activity_type";

-- Drop activity_type columns if they exist (might not exist in newer schemas)
alter table "public"."activities" drop column if exists "activity_type";
alter table "public"."activity_plans" drop column if exists "activity_type";
alter table "public"."activity_routes" drop column if exists "activity_type";

-- Add split category/location columns
alter table "public"."activities" add column "activity_category" activity_category not null default 'run'::activity_category;
alter table "public"."activities" add column "activity_location" activity_location not null default 'indoor'::activity_location;

alter table "public"."activity_plans" add column "activity_category" activity_category not null default 'run'::activity_category;
alter table "public"."activity_plans" add column "activity_location" activity_location not null default 'indoor'::activity_location;

alter table "public"."activity_routes" add column "activity_category" activity_category not null default 'run'::activity_category;

-- Drop the old enum type if it exists
drop type if exists "public"."activity_type";

CREATE INDEX idx_activities_activity_category ON public.activities USING btree (activity_category);

CREATE INDEX idx_activities_activity_location ON public.activities USING btree (activity_location);

CREATE INDEX idx_routes_activity_category ON public.activity_routes USING btree (activity_category);
