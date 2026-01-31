create type "public"."training_effect_label" as enum ('recovery', 'base', 'tempo', 'threshold', 'vo2max');

drop trigger if exists "update_profile_performance_metric_logs_updated_at" on "public"."profile_performance_metric_logs";

revoke delete on table "public"."profile_performance_metric_logs" from "anon";

revoke insert on table "public"."profile_performance_metric_logs" from "anon";

revoke references on table "public"."profile_performance_metric_logs" from "anon";

revoke select on table "public"."profile_performance_metric_logs" from "anon";

revoke trigger on table "public"."profile_performance_metric_logs" from "anon";

revoke truncate on table "public"."profile_performance_metric_logs" from "anon";

revoke update on table "public"."profile_performance_metric_logs" from "anon";

revoke delete on table "public"."profile_performance_metric_logs" from "authenticated";

revoke insert on table "public"."profile_performance_metric_logs" from "authenticated";

revoke references on table "public"."profile_performance_metric_logs" from "authenticated";

revoke select on table "public"."profile_performance_metric_logs" from "authenticated";

revoke trigger on table "public"."profile_performance_metric_logs" from "authenticated";

revoke truncate on table "public"."profile_performance_metric_logs" from "authenticated";

revoke update on table "public"."profile_performance_metric_logs" from "authenticated";

revoke delete on table "public"."profile_performance_metric_logs" from "service_role";

revoke insert on table "public"."profile_performance_metric_logs" from "service_role";

revoke references on table "public"."profile_performance_metric_logs" from "service_role";

revoke select on table "public"."profile_performance_metric_logs" from "service_role";

revoke trigger on table "public"."profile_performance_metric_logs" from "service_role";

revoke truncate on table "public"."profile_performance_metric_logs" from "service_role";

revoke update on table "public"."profile_performance_metric_logs" from "service_role";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_duration_seconds_check";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_idx_key";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_profile_id_fkey";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_reference_activity_id_fkey";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_value_check";

alter table "public"."profile_performance_metric_logs" drop constraint "profile_performance_metric_logs_pkey";

drop index if exists "public"."idx_profile_performance_metric_logs_profile";

drop index if exists "public"."idx_profile_performance_metric_logs_recorded_at";

drop index if exists "public"."idx_profile_performance_metric_logs_reference_activity";

drop index if exists "public"."idx_profile_performance_metric_logs_temporal_lookup";

drop index if exists "public"."profile_performance_metric_logs_idx_key";

drop index if exists "public"."profile_performance_metric_logs_pkey";

drop table "public"."profile_performance_metric_logs";

alter type "public"."profile_metric_type" rename to "profile_metric_type__old_version_to_be_dropped";

create type "public"."profile_metric_type" as enum ('weight_kg', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr', 'lthr');

alter table "public"."profile_metrics" alter column metric_type type "public"."profile_metric_type" using metric_type::text::"public"."profile_metric_type";

drop type "public"."profile_metric_type__old_version_to_be_dropped";

alter table "public"."activities" add column "aerobic_decoupling" numeric;

alter table "public"."activities" add column "efficiency_factor" numeric;

alter table "public"."activities" add column "normalized_graded_speed_mps" numeric(6,2);

alter table "public"."activities" add column "training_effect" public.training_effect_label;

drop sequence if exists "public"."profile_performance_metric_logs_idx_seq";

drop type "public"."performance_metric_type";


