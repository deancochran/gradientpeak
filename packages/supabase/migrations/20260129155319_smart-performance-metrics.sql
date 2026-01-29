create type "public"."effort_type" as enum ('power', 'speed');

create sequence "public"."profile_metrics_idx_seq";

drop trigger if exists "update_profile_metric_logs_updated_at" on "public"."profile_metric_logs";

revoke delete on table "public"."profile_metric_logs" from "anon";

revoke insert on table "public"."profile_metric_logs" from "anon";

revoke references on table "public"."profile_metric_logs" from "anon";

revoke select on table "public"."profile_metric_logs" from "anon";

revoke trigger on table "public"."profile_metric_logs" from "anon";

revoke truncate on table "public"."profile_metric_logs" from "anon";

revoke update on table "public"."profile_metric_logs" from "anon";

revoke delete on table "public"."profile_metric_logs" from "authenticated";

revoke insert on table "public"."profile_metric_logs" from "authenticated";

revoke references on table "public"."profile_metric_logs" from "authenticated";

revoke select on table "public"."profile_metric_logs" from "authenticated";

revoke trigger on table "public"."profile_metric_logs" from "authenticated";

revoke truncate on table "public"."profile_metric_logs" from "authenticated";

revoke update on table "public"."profile_metric_logs" from "authenticated";

revoke delete on table "public"."profile_metric_logs" from "service_role";

revoke insert on table "public"."profile_metric_logs" from "service_role";

revoke references on table "public"."profile_metric_logs" from "service_role";

revoke select on table "public"."profile_metric_logs" from "service_role";

revoke trigger on table "public"."profile_metric_logs" from "service_role";

revoke truncate on table "public"."profile_metric_logs" from "service_role";

revoke update on table "public"."profile_metric_logs" from "service_role";

alter table "public"."profile_metric_logs" drop constraint "profile_metric_logs_idx_key";

alter table "public"."profile_metric_logs" drop constraint "profile_metric_logs_profile_id_fkey";

alter table "public"."profile_metric_logs" drop constraint "profile_metric_logs_reference_activity_id_fkey";

alter table "public"."profile_metric_logs" drop constraint "profile_metric_logs_value_check";

alter table "public"."profile_metric_logs" drop constraint "profile_metric_logs_pkey";

drop index if exists "public"."idx_profile_metric_logs_profile";

drop index if exists "public"."idx_profile_metric_logs_recorded_at";

drop index if exists "public"."idx_profile_metric_logs_reference_activity";

drop index if exists "public"."idx_profile_metric_logs_temporal_lookup";

drop index if exists "public"."profile_metric_logs_idx_key";

drop index if exists "public"."profile_metric_logs_pkey";

drop table "public"."profile_metric_logs";

alter type "public"."profile_metric_type" rename to "profile_metric_type__old_version_to_be_dropped";

create type "public"."profile_metric_type" as enum ('weight_kg', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr');


  create table "public"."activity_efforts" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "activity_id" uuid not null,
    "profile_id" uuid not null,
    "activity_category" public.activity_category not null,
    "duration_seconds" integer not null,
    "effort_type" public.effort_type not null,
    "value" numeric not null,
    "unit" text not null,
    "start_offset" integer,
    "recorded_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."notifications" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "profile_id" uuid not null,
    "title" text not null,
    "message" text not null,
    "is_read" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."profile_metrics" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "idx" integer not null default nextval('public.profile_metrics_idx_seq'::regclass),
    "profile_id" uuid not null,
    "metric_type" public.profile_metric_type not null,
    "value" numeric not null,
    "unit" text not null,
    "reference_activity_id" uuid,
    "notes" text,
    "recorded_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


drop type "public"."profile_metric_type__old_version_to_be_dropped";

alter table "public"."activities" add column "avg_temperature" numeric;

alter table "public"."activities" add column "normalized_speed_mps" numeric(6,2);

alter sequence "public"."profile_metrics_idx_seq" owned by "public"."profile_metrics"."idx";

drop sequence if exists "public"."profile_metric_logs_idx_seq";

CREATE UNIQUE INDEX activity_efforts_pkey ON public.activity_efforts USING btree (id);

CREATE INDEX idx_activity_efforts_activity_id ON public.activity_efforts USING btree (activity_id);

CREATE INDEX idx_activity_efforts_profile_lookup ON public.activity_efforts USING btree (profile_id, activity_category, effort_type, duration_seconds, value DESC);

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);

CREATE INDEX idx_notifications_profile_id ON public.notifications USING btree (profile_id);

CREATE INDEX idx_profile_metrics_profile ON public.profile_metrics USING btree (profile_id, recorded_at DESC);

CREATE INDEX idx_profile_metrics_recorded_at ON public.profile_metrics USING btree (recorded_at DESC);

CREATE INDEX idx_profile_metrics_reference_activity ON public.profile_metrics USING btree (reference_activity_id) WHERE (reference_activity_id IS NOT NULL);

CREATE INDEX idx_profile_metrics_temporal_lookup ON public.profile_metrics USING btree (profile_id, metric_type, recorded_at DESC);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX profile_metrics_idx_key ON public.profile_metrics USING btree (idx);

CREATE UNIQUE INDEX profile_metrics_pkey ON public.profile_metrics USING btree (id);

alter table "public"."activity_efforts" add constraint "activity_efforts_pkey" PRIMARY KEY using index "activity_efforts_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."profile_metrics" add constraint "profile_metrics_pkey" PRIMARY KEY using index "profile_metrics_pkey";

alter table "public"."activity_efforts" add constraint "activity_efforts_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_activity_id_fkey";

alter table "public"."activity_efforts" add constraint "activity_efforts_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_profile_id_fkey";

alter table "public"."notifications" add constraint "notifications_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_profile_id_fkey";

alter table "public"."profile_metrics" add constraint "profile_metrics_idx_key" UNIQUE using index "profile_metrics_idx_key";

alter table "public"."profile_metrics" add constraint "profile_metrics_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_metrics" validate constraint "profile_metrics_profile_id_fkey";

alter table "public"."profile_metrics" add constraint "profile_metrics_reference_activity_id_fkey" FOREIGN KEY (reference_activity_id) REFERENCES public.activities(id) ON DELETE SET NULL not valid;

alter table "public"."profile_metrics" validate constraint "profile_metrics_reference_activity_id_fkey";

alter table "public"."profile_metrics" add constraint "profile_metrics_value_check" CHECK ((value >= (0)::numeric)) not valid;

alter table "public"."profile_metrics" validate constraint "profile_metrics_value_check";

grant delete on table "public"."activity_efforts" to "anon";

grant insert on table "public"."activity_efforts" to "anon";

grant references on table "public"."activity_efforts" to "anon";

grant select on table "public"."activity_efforts" to "anon";

grant trigger on table "public"."activity_efforts" to "anon";

grant truncate on table "public"."activity_efforts" to "anon";

grant update on table "public"."activity_efforts" to "anon";

grant delete on table "public"."activity_efforts" to "authenticated";

grant insert on table "public"."activity_efforts" to "authenticated";

grant references on table "public"."activity_efforts" to "authenticated";

grant select on table "public"."activity_efforts" to "authenticated";

grant trigger on table "public"."activity_efforts" to "authenticated";

grant truncate on table "public"."activity_efforts" to "authenticated";

grant update on table "public"."activity_efforts" to "authenticated";

grant delete on table "public"."activity_efforts" to "service_role";

grant insert on table "public"."activity_efforts" to "service_role";

grant references on table "public"."activity_efforts" to "service_role";

grant select on table "public"."activity_efforts" to "service_role";

grant trigger on table "public"."activity_efforts" to "service_role";

grant truncate on table "public"."activity_efforts" to "service_role";

grant update on table "public"."activity_efforts" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."profile_metrics" to "anon";

grant insert on table "public"."profile_metrics" to "anon";

grant references on table "public"."profile_metrics" to "anon";

grant select on table "public"."profile_metrics" to "anon";

grant trigger on table "public"."profile_metrics" to "anon";

grant truncate on table "public"."profile_metrics" to "anon";

grant update on table "public"."profile_metrics" to "anon";

grant delete on table "public"."profile_metrics" to "authenticated";

grant insert on table "public"."profile_metrics" to "authenticated";

grant references on table "public"."profile_metrics" to "authenticated";

grant select on table "public"."profile_metrics" to "authenticated";

grant trigger on table "public"."profile_metrics" to "authenticated";

grant truncate on table "public"."profile_metrics" to "authenticated";

grant update on table "public"."profile_metrics" to "authenticated";

grant delete on table "public"."profile_metrics" to "service_role";

grant insert on table "public"."profile_metrics" to "service_role";

grant references on table "public"."profile_metrics" to "service_role";

grant select on table "public"."profile_metrics" to "service_role";

grant trigger on table "public"."profile_metrics" to "service_role";

grant truncate on table "public"."profile_metrics" to "service_role";

grant update on table "public"."profile_metrics" to "service_role";

CREATE TRIGGER update_profile_metrics_updated_at BEFORE UPDATE ON public.profile_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


