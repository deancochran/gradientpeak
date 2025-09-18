create type "public"."activity_metric" as enum ('heartrate', 'power', 'speed', 'cadence', 'distance', 'latlng', 'moving', 'altitude', 'temperature', 'gradient');

create type "public"."activity_metric_data_type" as enum ('float', 'boolean', 'string', 'integer', 'latlng');

create type "public"."activity_type" as enum ('bike', 'run', 'swim', 'strength', 'other');

create type "public"."sync_status" as enum ('local_only', 'synced', 'sync_failed');

create sequence "public"."activities_idx_seq";

create sequence "public"."planned_activities_idx_seq";

create sequence "public"."profile_plans_idx_seq";

create sequence "public"."profiles_idx_seq";

create table "public"."activities" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('activities_idx_seq'::regclass),
    "profile_id" uuid not null,
    "name" text not null,
    "notes" text,
    "sync_status" sync_status not null default 'local_only'::sync_status,
    "started_at" timestamp without time zone not null,
    "total_time" integer not null default 0,
    "moving_time" integer not null default 0,
    "snapshot_weight_kg" integer not null,
    "snapshot_ftp" integer not null,
    "snapshot_threshold_hr" integer not null,
    "tss" integer not null,
    "if" integer not null,
    "normalized_power" integer,
    "avg_power" integer,
    "peak_power" integer,
    "avg_heart_rate" integer,
    "max_heart_rate" integer,
    "avg_cadence" integer,
    "max_cadence" integer,
    "distance" integer,
    "avg_speed" numeric(5,2),
    "max_speed" numeric(5,2),
    "total_ascent" integer,
    "total_descent" integer,
    "created_at" timestamp without time zone not null default now()
);


create table "public"."activity_streams" (
    "id" uuid not null default uuid_generate_v4(),
    "activity_id" uuid not null,
    "type" activity_metric not null,
    "data_type" activity_metric_data_type not null,
    "chunk_index" integer not null default 0,
    "original_size" integer not null,
    "sync_status" sync_status not null default 'local_only'::sync_status,
    "data" jsonb not null,
    "created_at" timestamp without time zone not null default now()
);


create table "public"."planned_activities" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('planned_activities_idx_seq'::regclass),
    "profile_plan_id" uuid,
    "completed_activity_id" uuid,
    "scheduled_date" date not null,
    "name" text not null,
    "activity_type" activity_type not null,
    "description" text,
    "structure" jsonb not null,
    "estimated_duration" integer,
    "estimated_distance" integer,
    "estimated_tss" integer,
    "created_at" timestamp without time zone not null default now()
);


create table "public"."profile_plans" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('profile_plans_idx_seq'::regclass),
    "profile_id" uuid not null,
    "name" text not null,
    "description" text,
    "config" jsonb not null,
    "created_at" timestamp without time zone not null default now()
);


create table "public"."profiles" (
    "id" uuid not null,
    "idx" integer not null default nextval('profiles_idx_seq'::regclass),
    "gender" text,
    "dob" date,
    "username" text,
    "language" text default 'en'::text,
    "preferred_units" text default 'metric'::text,
    "avatar_url" text,
    "bio" text,
    "onboarded" boolean default false,
    "threshold_hr" integer,
    "ftp" integer,
    "weight_kg" integer,
    "created_at" timestamp without time zone not null default now()
);


alter sequence "public"."activities_idx_seq" owned by "public"."activities"."idx";

alter sequence "public"."planned_activities_idx_seq" owned by "public"."planned_activities"."idx";

alter sequence "public"."profile_plans_idx_seq" owned by "public"."profile_plans"."idx";

alter sequence "public"."profiles_idx_seq" owned by "public"."profiles"."idx";

CREATE UNIQUE INDEX activities_idx_key ON public.activities USING btree (idx);

CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

CREATE UNIQUE INDEX activity_streams_pkey ON public.activity_streams USING btree (id);

CREATE UNIQUE INDEX planned_activities_idx_key ON public.planned_activities USING btree (idx);

CREATE UNIQUE INDEX planned_activities_pkey ON public.planned_activities USING btree (id);

CREATE UNIQUE INDEX profile_plans_idx_key ON public.profile_plans USING btree (idx);

CREATE UNIQUE INDEX profile_plans_pkey ON public.profile_plans USING btree (id);

CREATE UNIQUE INDEX profiles_idx_key ON public.profiles USING btree (idx);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);

alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table "public"."activity_streams" add constraint "activity_streams_pkey" PRIMARY KEY using index "activity_streams_pkey";

alter table "public"."planned_activities" add constraint "planned_activities_pkey" PRIMARY KEY using index "planned_activities_pkey";

alter table "public"."profile_plans" add constraint "profile_plans_pkey" PRIMARY KEY using index "profile_plans_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."activities" add constraint "activities_idx_key" UNIQUE using index "activities_idx_key";

alter table "public"."activities" add constraint "activities_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_profile_id_fkey";

alter table "public"."activity_streams" add constraint "activity_streams_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE not valid;

alter table "public"."activity_streams" validate constraint "activity_streams_activity_id_fkey";

alter table "public"."planned_activities" add constraint "planned_activities_idx_key" UNIQUE using index "planned_activities_idx_key";

alter table "public"."planned_activities" add constraint "planned_activities_profile_plan_id_fkey" FOREIGN KEY (profile_plan_id) REFERENCES profile_plans(id) ON DELETE SET NULL not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_profile_plan_id_fkey";

alter table "public"."profile_plans" add constraint "profile_plans_idx_key" UNIQUE using index "profile_plans_idx_key";

alter table "public"."profile_plans" add constraint "profile_plans_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_plans" validate constraint "profile_plans_profile_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_idx_key" UNIQUE using index "profiles_idx_key";

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE using index "profiles_username_key";

grant delete on table "public"."activities" to "anon";

grant insert on table "public"."activities" to "anon";

grant references on table "public"."activities" to "anon";

grant select on table "public"."activities" to "anon";

grant trigger on table "public"."activities" to "anon";

grant truncate on table "public"."activities" to "anon";

grant update on table "public"."activities" to "anon";

grant delete on table "public"."activities" to "authenticated";

grant insert on table "public"."activities" to "authenticated";

grant references on table "public"."activities" to "authenticated";

grant select on table "public"."activities" to "authenticated";

grant trigger on table "public"."activities" to "authenticated";

grant truncate on table "public"."activities" to "authenticated";

grant update on table "public"."activities" to "authenticated";

grant delete on table "public"."activities" to "service_role";

grant insert on table "public"."activities" to "service_role";

grant references on table "public"."activities" to "service_role";

grant select on table "public"."activities" to "service_role";

grant trigger on table "public"."activities" to "service_role";

grant truncate on table "public"."activities" to "service_role";

grant update on table "public"."activities" to "service_role";

grant delete on table "public"."activity_streams" to "anon";

grant insert on table "public"."activity_streams" to "anon";

grant references on table "public"."activity_streams" to "anon";

grant select on table "public"."activity_streams" to "anon";

grant trigger on table "public"."activity_streams" to "anon";

grant truncate on table "public"."activity_streams" to "anon";

grant update on table "public"."activity_streams" to "anon";

grant delete on table "public"."activity_streams" to "authenticated";

grant insert on table "public"."activity_streams" to "authenticated";

grant references on table "public"."activity_streams" to "authenticated";

grant select on table "public"."activity_streams" to "authenticated";

grant trigger on table "public"."activity_streams" to "authenticated";

grant truncate on table "public"."activity_streams" to "authenticated";

grant update on table "public"."activity_streams" to "authenticated";

grant delete on table "public"."activity_streams" to "service_role";

grant insert on table "public"."activity_streams" to "service_role";

grant references on table "public"."activity_streams" to "service_role";

grant select on table "public"."activity_streams" to "service_role";

grant trigger on table "public"."activity_streams" to "service_role";

grant truncate on table "public"."activity_streams" to "service_role";

grant update on table "public"."activity_streams" to "service_role";

grant delete on table "public"."planned_activities" to "anon";

grant insert on table "public"."planned_activities" to "anon";

grant references on table "public"."planned_activities" to "anon";

grant select on table "public"."planned_activities" to "anon";

grant trigger on table "public"."planned_activities" to "anon";

grant truncate on table "public"."planned_activities" to "anon";

grant update on table "public"."planned_activities" to "anon";

grant delete on table "public"."planned_activities" to "authenticated";

grant insert on table "public"."planned_activities" to "authenticated";

grant references on table "public"."planned_activities" to "authenticated";

grant select on table "public"."planned_activities" to "authenticated";

grant trigger on table "public"."planned_activities" to "authenticated";

grant truncate on table "public"."planned_activities" to "authenticated";

grant update on table "public"."planned_activities" to "authenticated";

grant delete on table "public"."planned_activities" to "service_role";

grant insert on table "public"."planned_activities" to "service_role";

grant references on table "public"."planned_activities" to "service_role";

grant select on table "public"."planned_activities" to "service_role";

grant trigger on table "public"."planned_activities" to "service_role";

grant truncate on table "public"."planned_activities" to "service_role";

grant update on table "public"."planned_activities" to "service_role";

grant delete on table "public"."profile_plans" to "anon";

grant insert on table "public"."profile_plans" to "anon";

grant references on table "public"."profile_plans" to "anon";

grant select on table "public"."profile_plans" to "anon";

grant trigger on table "public"."profile_plans" to "anon";

grant truncate on table "public"."profile_plans" to "anon";

grant update on table "public"."profile_plans" to "anon";

grant delete on table "public"."profile_plans" to "authenticated";

grant insert on table "public"."profile_plans" to "authenticated";

grant references on table "public"."profile_plans" to "authenticated";

grant select on table "public"."profile_plans" to "authenticated";

grant trigger on table "public"."profile_plans" to "authenticated";

grant truncate on table "public"."profile_plans" to "authenticated";

grant update on table "public"."profile_plans" to "authenticated";

grant delete on table "public"."profile_plans" to "service_role";

grant insert on table "public"."profile_plans" to "service_role";

grant references on table "public"."profile_plans" to "service_role";

grant select on table "public"."profile_plans" to "service_role";

grant trigger on table "public"."profile_plans" to "service_role";

grant truncate on table "public"."profile_plans" to "service_role";

grant update on table "public"."profile_plans" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


