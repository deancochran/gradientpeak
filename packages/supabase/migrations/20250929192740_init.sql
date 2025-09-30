create type "public"."activity_metric" as enum ('heartrate', 'power', 'speed', 'cadence', 'distance', 'latlng', 'moving', 'altitude', 'elevation', 'temperature', 'gradient');

create type "public"."activity_metric_data_type" as enum ('float', 'latlng', 'boolean');

create type "public"."activity_type" as enum ('outdoor_run', 'outdoor_bike', 'indoor_treadmill', 'indoor_bike_trainer', 'indoor_strength', 'indoor_swim', 'other');

create sequence "public"."activities_idx_seq";

create sequence "public"."activity_plans_idx_seq";

create sequence "public"."activity_streams_idx_seq";

create sequence "public"."planned_activities_idx_seq";

create sequence "public"."profiles_idx_seq";

create table "public"."activities" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('activities_idx_seq'::regclass),
    "name" text not null,
    "notes" text,
    "activity_type" activity_type not null default 'other'::activity_type,
    "is_private" boolean not null default true,
    "started_at" timestamp with time zone not null,
    "finished_at" timestamp with time zone not null,
    "elapsed_time" integer not null,
    "moving_time" integer not null,
    "planned_activity_id" uuid,
    "adherence_score" integer,
    "profile_id" uuid not null,
    "profile_age" integer,
    "profile_weight_kg" integer,
    "profile_ftp" integer,
    "profile_threshold_hr" integer,
    "profile_recovery_time" integer,
    "profile_training_load" integer,
    "avg_temperature" numeric(5,2),
    "max_temperature" numeric(5,2),
    "weather_condition" text,
    "elevation_gain_per_km" numeric(5,2),
    "avg_grade" numeric(5,2),
    "total_ascent" integer not null,
    "total_descent" integer not null,
    "distance" integer not null,
    "avg_speed" numeric(5,2),
    "max_speed" numeric(5,2),
    "calories" integer,
    "avg_heart_rate" integer,
    "max_heart_rate" integer,
    "max_hr_pct_threshold" numeric(5,2),
    "hr_zone_1_time" integer default 0,
    "hr_zone_2_time" integer default 0,
    "hr_zone_3_time" integer default 0,
    "hr_zone_4_time" integer default 0,
    "hr_zone_5_time" integer default 0,
    "avg_cadence" integer,
    "max_cadence" integer,
    "total_work" integer,
    "avg_power" integer,
    "max_power" integer,
    "normalized_power" integer,
    "power_zone_1_time" integer default 0,
    "power_zone_2_time" integer default 0,
    "power_zone_3_time" integer default 0,
    "power_zone_4_time" integer default 0,
    "power_zone_5_time" integer default 0,
    "power_zone_6_time" integer default 0,
    "power_zone_7_time" integer default 0,
    "power_heart_rate_ratio" numeric(5,2),
    "intensity_factor" integer,
    "efficiency_factor" integer,
    "power_weight_ratio" numeric(5,2),
    "decoupling" integer,
    "training_stress_score" integer,
    "variability_index" integer,
    "created_at" timestamp with time zone not null default now()
);


create table "public"."activity_plans" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('activity_plans_idx_seq'::regclass),
    "profile_id" uuid not null,
    "name" text not null,
    "activity_type" activity_type not null,
    "description" text,
    "structure" jsonb not null,
    "estimated_duration" integer,
    "estimated_distance" integer,
    "estimated_tss" integer,
    "created_at" timestamp with time zone not null default now()
);


create table "public"."activity_streams" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('activity_streams_idx_seq'::regclass),
    "activity_id" uuid not null,
    "type" activity_metric not null,
    "data_type" activity_metric_data_type not null,
    "compressed_values" bytea not null,
    "compressed_timestamps" bytea not null,
    "sample_count" integer not null,
    "original_size" integer not null,
    "min_value" numeric(10,4),
    "max_value" numeric(10,4),
    "avg_value" numeric(10,4),
    "created_at" timestamp with time zone not null default now()
);


create table "public"."planned_activities" (
    "id" uuid not null default uuid_generate_v4(),
    "idx" integer not null default nextval('planned_activities_idx_seq'::regclass),
    "profile_id" uuid not null,
    "activity_plan_id" uuid,
    "scheduled_date" date not null,
    "created_at" timestamp with time zone not null default now()
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

alter sequence "public"."activity_plans_idx_seq" owned by "public"."activity_plans"."idx";

alter sequence "public"."activity_streams_idx_seq" owned by "public"."activity_streams"."idx";

alter sequence "public"."planned_activities_idx_seq" owned by "public"."planned_activities"."idx";

alter sequence "public"."profiles_idx_seq" owned by "public"."profiles"."idx";

CREATE UNIQUE INDEX activities_idx_key ON public.activities USING btree (idx);

CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

CREATE UNIQUE INDEX activity_plans_idx_key ON public.activity_plans USING btree (idx);

CREATE UNIQUE INDEX activity_plans_pkey ON public.activity_plans USING btree (id);

CREATE UNIQUE INDEX activity_streams_idx_key ON public.activity_streams USING btree (idx);

CREATE UNIQUE INDEX activity_streams_pkey ON public.activity_streams USING btree (id);

CREATE INDEX idx_activities_activity_type ON public.activities USING btree (activity_type);

CREATE INDEX idx_activities_planned_activity_id ON public.activities USING btree (planned_activity_id);

CREATE INDEX idx_activities_profile_id ON public.activities USING btree (profile_id);

CREATE INDEX idx_activities_started_at ON public.activities USING btree (started_at);

CREATE INDEX idx_activity_plans_profile_id ON public.activity_plans USING btree (profile_id);

CREATE INDEX idx_activity_streams_activity_id ON public.activity_streams USING btree (activity_id);

CREATE INDEX idx_activity_streams_type ON public.activity_streams USING btree (type);

CREATE INDEX idx_planned_activities_profile_id ON public.planned_activities USING btree (profile_id);

CREATE INDEX idx_planned_activities_scheduled_date ON public.planned_activities USING btree (scheduled_date);

CREATE UNIQUE INDEX planned_activities_idx_key ON public.planned_activities USING btree (idx);

CREATE UNIQUE INDEX planned_activities_pkey ON public.planned_activities USING btree (id);

CREATE UNIQUE INDEX profiles_idx_key ON public.profiles USING btree (idx);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);

alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table "public"."activity_plans" add constraint "activity_plans_pkey" PRIMARY KEY using index "activity_plans_pkey";

alter table "public"."activity_streams" add constraint "activity_streams_pkey" PRIMARY KEY using index "activity_streams_pkey";

alter table "public"."planned_activities" add constraint "planned_activities_pkey" PRIMARY KEY using index "planned_activities_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."activities" add constraint "activities_adherence_score_check" CHECK (((adherence_score >= 0) AND (adherence_score <= 100))) not valid;

alter table "public"."activities" validate constraint "activities_adherence_score_check";

alter table "public"."activities" add constraint "activities_avg_cadence_check" CHECK ((avg_cadence >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_avg_cadence_check";

alter table "public"."activities" add constraint "activities_avg_heart_rate_check" CHECK ((avg_heart_rate >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_avg_heart_rate_check";

alter table "public"."activities" add constraint "activities_avg_power_check" CHECK ((avg_power >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_avg_power_check";

alter table "public"."activities" add constraint "activities_avg_speed_check" CHECK ((avg_speed >= (0)::numeric)) not valid;

alter table "public"."activities" validate constraint "activities_avg_speed_check";

alter table "public"."activities" add constraint "activities_calories_check" CHECK ((calories >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_calories_check";

alter table "public"."activities" add constraint "activities_decoupling_check" CHECK (((decoupling >= 0) AND (decoupling <= 100))) not valid;

alter table "public"."activities" validate constraint "activities_decoupling_check";

alter table "public"."activities" add constraint "activities_distance_check" CHECK ((distance >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_distance_check";

alter table "public"."activities" add constraint "activities_efficiency_factor_check" CHECK (((efficiency_factor >= 0) AND (efficiency_factor <= 100))) not valid;

alter table "public"."activities" validate constraint "activities_efficiency_factor_check";

alter table "public"."activities" add constraint "activities_elapsed_time_check" CHECK ((elapsed_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_elapsed_time_check";

alter table "public"."activities" add constraint "activities_idx_key" UNIQUE using index "activities_idx_key";

alter table "public"."activities" add constraint "activities_intensity_factor_check" CHECK (((intensity_factor >= 0) AND (intensity_factor <= 100))) not valid;

alter table "public"."activities" validate constraint "activities_intensity_factor_check";

alter table "public"."activities" add constraint "activities_max_cadence_check" CHECK ((max_cadence >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_max_cadence_check";

alter table "public"."activities" add constraint "activities_max_heart_rate_check" CHECK ((max_heart_rate >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_max_heart_rate_check";

alter table "public"."activities" add constraint "activities_max_power_check" CHECK ((max_power >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_max_power_check";

alter table "public"."activities" add constraint "activities_max_speed_check" CHECK ((max_speed >= (0)::numeric)) not valid;

alter table "public"."activities" validate constraint "activities_max_speed_check";

alter table "public"."activities" add constraint "activities_moving_time_check" CHECK ((moving_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_moving_time_check";

alter table "public"."activities" add constraint "activities_normalized_power_check" CHECK ((normalized_power >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_normalized_power_check";

alter table "public"."activities" add constraint "activities_planned_activity_id_fkey" FOREIGN KEY (planned_activity_id) REFERENCES planned_activities(id) ON DELETE SET NULL not valid;

alter table "public"."activities" validate constraint "activities_planned_activity_id_fkey";

alter table "public"."activities" add constraint "activities_power_weight_ratio_check" CHECK ((power_weight_ratio >= (0)::numeric)) not valid;

alter table "public"."activities" validate constraint "activities_power_weight_ratio_check";

alter table "public"."activities" add constraint "activities_profile_age_check" CHECK ((profile_age >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_age_check";

alter table "public"."activities" add constraint "activities_profile_ftp_check" CHECK ((profile_ftp >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_ftp_check";

alter table "public"."activities" add constraint "activities_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_profile_id_fkey";

alter table "public"."activities" add constraint "activities_profile_recovery_time_check" CHECK ((profile_recovery_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_recovery_time_check";

alter table "public"."activities" add constraint "activities_profile_threshold_hr_check" CHECK ((profile_threshold_hr >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_threshold_hr_check";

alter table "public"."activities" add constraint "activities_profile_training_load_check" CHECK ((profile_training_load >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_training_load_check";

alter table "public"."activities" add constraint "activities_profile_weight_kg_check" CHECK ((profile_weight_kg > 0)) not valid;

alter table "public"."activities" validate constraint "activities_profile_weight_kg_check";

alter table "public"."activities" add constraint "activities_hr_zone_1_time_check" CHECK ((hr_zone_1_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_hr_zone_1_time_check";

alter table "public"."activities" add constraint "activities_hr_zone_2_time_check" CHECK ((hr_zone_2_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_hr_zone_2_time_check";

alter table "public"."activities" add constraint "activities_hr_zone_3_time_check" CHECK ((hr_zone_3_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_hr_zone_3_time_check";

alter table "public"."activities" add constraint "activities_hr_zone_4_time_check" CHECK ((hr_zone_4_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_hr_zone_4_time_check";

alter table "public"."activities" add constraint "activities_hr_zone_5_time_check" CHECK ((hr_zone_5_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_hr_zone_5_time_check";

alter table "public"."activities" add constraint "activities_power_zone_1_time_check" CHECK ((power_zone_1_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_1_time_check";

alter table "public"."activities" add constraint "activities_power_zone_2_time_check" CHECK ((power_zone_2_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_2_time_check";

alter table "public"."activities" add constraint "activities_power_zone_3_time_check" CHECK ((power_zone_3_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_3_time_check";

alter table "public"."activities" add constraint "activities_power_zone_4_time_check" CHECK ((power_zone_4_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_4_time_check";

alter table "public"."activities" add constraint "activities_power_zone_5_time_check" CHECK ((power_zone_5_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_5_time_check";

alter table "public"."activities" add constraint "activities_power_zone_6_time_check" CHECK ((power_zone_6_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_6_time_check";

alter table "public"."activities" add constraint "activities_power_zone_7_time_check" CHECK ((power_zone_7_time >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_power_zone_7_time_check";

alter table "public"."activities" add constraint "activities_total_ascent_check" CHECK ((total_ascent >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_total_ascent_check";

alter table "public"."activities" add constraint "activities_total_descent_check" CHECK ((total_descent >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_total_descent_check";

alter table "public"."activities" add constraint "activities_total_work_check" CHECK ((total_work >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_total_work_check";

alter table "public"."activities" add constraint "activities_training_stress_score_check" CHECK ((training_stress_score >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_training_stress_score_check";

alter table "public"."activities" add constraint "activities_variability_index_check" CHECK ((variability_index >= 0)) not valid;

alter table "public"."activities" validate constraint "activities_variability_index_check";

alter table "public"."activities" add constraint "chk_times" CHECK ((finished_at >= started_at)) not valid;

alter table "public"."activities" validate constraint "chk_times";

alter table "public"."activity_plans" add constraint "activity_plans_estimated_distance_check" CHECK ((estimated_distance >= 0)) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_estimated_distance_check";

alter table "public"."activity_plans" add constraint "activity_plans_estimated_duration_check" CHECK ((estimated_duration >= 0)) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_estimated_duration_check";

alter table "public"."activity_plans" add constraint "activity_plans_estimated_tss_check" CHECK ((estimated_tss >= 0)) not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_estimated_tss_check";

alter table "public"."activity_plans" add constraint "activity_plans_idx_key" UNIQUE using index "activity_plans_idx_key";

alter table "public"."activity_plans" add constraint "activity_plans_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activity_plans" validate constraint "activity_plans_profile_id_fkey";

alter table "public"."activity_streams" add constraint "activity_streams_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE not valid;

alter table "public"."activity_streams" validate constraint "activity_streams_activity_id_fkey";

alter table "public"."activity_streams" add constraint "activity_streams_idx_key" UNIQUE using index "activity_streams_idx_key";

alter table "public"."activity_streams" add constraint "activity_streams_original_size_check" CHECK ((original_size >= 0)) not valid;

alter table "public"."activity_streams" validate constraint "activity_streams_original_size_check";

alter table "public"."activity_streams" add constraint "activity_streams_sample_count_check" CHECK ((sample_count > 0)) not valid;

alter table "public"."activity_streams" validate constraint "activity_streams_sample_count_check";

alter table "public"."planned_activities" add constraint "planned_activities_activity_plan_id_fkey" FOREIGN KEY (activity_plan_id) REFERENCES activity_plans(id) ON DELETE CASCADE not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_activity_plan_id_fkey";

alter table "public"."planned_activities" add constraint "planned_activities_idx_key" UNIQUE using index "planned_activities_idx_key";

alter table "public"."planned_activities" add constraint "planned_activities_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_profile_id_fkey";

alter table "public"."planned_activities" add constraint "planned_activities_scheduled_date_check" CHECK ((scheduled_date >= now())) not valid;

alter table "public"."planned_activities" validate constraint "planned_activities_scheduled_date_check";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_idx_key" UNIQUE using index "profiles_idx_key";

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE using index "profiles_username_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_activity(activity jsonb, activity_streams jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
    new_activity activities%rowtype;
    stream_item jsonb;
begin
    -- insert activity
    insert into activities
    select *
    from jsonb_populate_record(null::activities, activity_payload)
    returning * into new_activity;

    -- insert streams (no need to store/return them)
    for stream_item in
        select * from jsonb_array_elements(streams_payload)
    loop
        insert into activity_streams
        select
            new_activity.id as activity_id,
            *
        from jsonb_populate_record(null::activity_streams, stream_item);
    end loop;

    -- return only the inserted activity
    return to_jsonb(new_activity);
end;
$function$
;

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

grant delete on table "public"."activity_plans" to "anon";

grant insert on table "public"."activity_plans" to "anon";

grant references on table "public"."activity_plans" to "anon";

grant select on table "public"."activity_plans" to "anon";

grant trigger on table "public"."activity_plans" to "anon";

grant truncate on table "public"."activity_plans" to "anon";

grant update on table "public"."activity_plans" to "anon";

grant delete on table "public"."activity_plans" to "authenticated";

grant insert on table "public"."activity_plans" to "authenticated";

grant references on table "public"."activity_plans" to "authenticated";

grant select on table "public"."activity_plans" to "authenticated";

grant trigger on table "public"."activity_plans" to "authenticated";

grant truncate on table "public"."activity_plans" to "authenticated";

grant update on table "public"."activity_plans" to "authenticated";

grant delete on table "public"."activity_plans" to "service_role";

grant insert on table "public"."activity_plans" to "service_role";

grant references on table "public"."activity_plans" to "service_role";

grant select on table "public"."activity_plans" to "service_role";

grant trigger on table "public"."activity_plans" to "service_role";

grant truncate on table "public"."activity_plans" to "service_role";

grant update on table "public"."activity_plans" to "service_role";

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
