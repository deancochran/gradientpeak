set local check_function_bodies = off;

create or replace function public.activity_plan_segment_is_canonical(input jsonb) returns boolean
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $$
  select case input ->> 'role'
    when 'rest' then public.activity_plan_jsonb_has_exact_keys(input, array['id', 'name', 'role', 'duration'], array['notes'])
      and public.activity_plan_jsonb_is_uuid(input -> 'id')
      and public.activity_plan_jsonb_is_string(input -> 'name', 1, 100)
      and (input -> 'notes' is null or public.activity_plan_jsonb_is_string(input -> 'notes', 0, 1000))
      and public.activity_plan_duration_is_canonical(input -> 'duration', true)
    when 'activity' then public.activity_plan_jsonb_has_exact_keys(input, array['id', 'name', 'role', 'intervals'], array['notes'])
      and public.activity_plan_jsonb_is_uuid(input -> 'id')
      and public.activity_plan_jsonb_is_string(input -> 'name', 1, 100)
      and (input -> 'notes' is null or public.activity_plan_jsonb_is_string(input -> 'notes', 0, 1000))
      and pg_catalog.jsonb_typeof(input -> 'intervals') = 'array'
      and pg_catalog.jsonb_array_length(input -> 'intervals') between 1 and 50
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(input -> 'intervals') interval_value
        where not public.activity_plan_jsonb_has_exact_keys(interval_value, array['id', 'name', 'repetitions', 'steps'], array['notes'])
          or not public.activity_plan_jsonb_is_uuid(interval_value -> 'id')
          or not public.activity_plan_jsonb_is_string(interval_value -> 'name', 1, 100)
          or not public.activity_plan_jsonb_is_integer_between(interval_value -> 'repetitions', 1, 50)
          or (interval_value -> 'notes' is not null and not public.activity_plan_jsonb_is_string(interval_value -> 'notes', 0, 1000))
          or pg_catalog.jsonb_typeof(interval_value -> 'steps') <> 'array'
          or pg_catalog.jsonb_array_length(interval_value -> 'steps') not between 1 and 20
          or exists (
            select 1 from pg_catalog.jsonb_array_elements(interval_value -> 'steps') step_value
            where not public.activity_plan_jsonb_has_exact_keys(step_value, array['id', 'name', 'duration', 'targets'], array['description', 'notes', 'purpose'])
              or not public.activity_plan_jsonb_is_uuid(step_value -> 'id')
              or not public.activity_plan_jsonb_is_string(step_value -> 'name', 1, 100)
              or (step_value -> 'description' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'description', 0, 500))
              or (step_value -> 'notes' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'notes', 0, 1000))
              or (step_value -> 'purpose' is not null and step_value ->> 'purpose' not in ('warmup', 'work', 'recovery', 'cooldown', 'technique'))
              or not public.activity_plan_duration_is_canonical(step_value -> 'duration')
              or pg_catalog.jsonb_typeof(step_value -> 'targets') <> 'array'
              or pg_catalog.jsonb_array_length(step_value -> 'targets') not between 1 and 3
          )
      )
    else false
  end
$$;

drop index "public"."planned_sessions_series_occurrence_unique";

alter table "public"."activities" drop constraint "activities_athlete_state_capability_check";
alter table "public"."activities" drop constraint "activities_athlete_state_evidence_check";
alter table "public"."activity_source_references" drop constraint "activity_source_refs_last_import_run_profile_fk";
alter table "public"."activity_source_references" drop constraint "activity_source_refs_material_import_run_profile_fk";
alter table "public"."organizations" drop constraint "organizations_root_owner_membership_fkey";
alter table "public"."planned_sessions" drop constraint "planned_sessions_prescription_check";
alter table "public"."planned_sessions" drop constraint "planned_sessions_series_not_self_check";
alter table "public"."planned_sessions" drop constraint "planned_sessions_series_owner_fkey";
alter table "public"."planned_sessions" drop constraint "planned_sessions_source_check";
alter table "public"."profile_training_settings" drop constraint "profile_training_settings_profile_id_profiles_id_fk";
alter table "public"."provider_sync_jobs" drop constraint "provider_sync_jobs_import_run_profile_fkey";
alter table "public"."threshold_evidence" drop constraint "threshold_evidence_profile_category_activity_unique";
alter table "public"."thresholds" drop constraint "thresholds_supersedes_fkey";

alter table "public"."planned_sessions" drop column "occurrence_key";
alter table "public"."planned_sessions" drop column "prescription_quantification";
alter table "public"."planned_sessions" drop column "prescription_structure";
alter table "public"."planned_sessions" drop column "series_id";
alter table "public"."planned_sessions" drop column "source_session_key";

drop table "public"."profile_training_settings";

alter table "public"."activity_plans" add column "training_intent" text not null default 'general_maintenance'::text;
alter table "public"."activity_plans" add column "validation_policy" text not null default 'general-maintenance.v1'::text;
alter table "public"."activity_plans" add column "adaptation" jsonb;
alter table "public"."activity_plans" add column "semantic_hash" text not null;
alter table "public"."activity_source_references" add column "resolution_status" text not null default 'confirmed'::text;
alter table "public"."activity_source_references" add column "relationship_kind" text not null default 'imported'::text;
alter table "public"."events" add column "planned_session_id" uuid;
alter table "public"."integrations" add column "wahoo_event_route_delivery_enabled" boolean not null default false;
alter table "public"."planned_sessions" add column "source_session_id" uuid;
alter table "public"."planned_sessions" add column "resolution_manifest" jsonb not null;
alter table "public"."activity_source_references" alter column "activity_id" drop not null;

alter type "public"."integration_resource_kind" add value 'planned_session' before 'activity_plan';
