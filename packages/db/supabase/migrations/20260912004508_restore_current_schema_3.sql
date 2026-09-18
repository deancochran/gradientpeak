set local check_function_bodies = off;

alter table "public"."activities"
  add constraint "activities_athlete_state_confidence_check"
    check (((athlete_state_evidence_confidence IS NULL) OR ((athlete_state_evidence_confidence >= (0)::numeric) AND (athlete_state_evidence_confidence <= (1)::numeric))));

alter table "public"."activities"
  add constraint "activities_athlete_state_load_check" check (((athlete_state_common_load IS NULL) OR (athlete_state_common_load >= (0)::numeric)));

alter table "public"."activity_plans"
  add constraint "activity_plans_adaptation_check" check (((adaptation IS NULL) OR ((jsonb_typeof(adaptation) = 'object'::text) AND (pg_column_size(adaptation) <= 262144))));

alter table "public"."activity_plans"
  add constraint "activity_plans_semantic_hash_check" check ((semantic_hash ~ '^v1:sha256:[0-9a-f]{64}$'::text));

alter table "public"."activity_plans"
  add constraint "activity_plans_training_intent_check"
    check ((training_intent = ANY (ARRAY['recovery'::text, 'aerobic_base'::text, 'durable_endurance'::text, 'threshold_development'::text, 'race_specific'::text, 'vo2max'::text,
    'anaerobic_capacity'::text, 'muscular_endurance'::text, 'speed_skill'::text, 'technique'::text, 'strength_support'::text, 'general_maintenance'::text])));

alter table "public"."activity_plans"
  add constraint "activity_plans_validation_policy_check"
    check ((validation_policy = ANY (ARRAY['recovery.v1'::text, 'aerobic-base.v1'::text, 'durable-endurance.v1'::text, 'threshold.v1'::text, 'race-specific.v1'::text,
    'vo2max.long-intervals.v1'::text, 'vo2max.short-intervals.v1'::text, 'anaerobic-capacity.v1'::text, 'muscular-endurance.v1'::text, 'speed-skill.v1'::text,
    'technique.v1'::text, 'strength-support.v1'::text, 'general-maintenance.v1'::text])));

alter table "public"."activity_source_references"
  add constraint "activity_source_references_relationship_kind_check" check ((relationship_kind = ANY (ARRAY['imported'::text, 'exported'::text, 'both'::text])));

alter table "public"."activity_source_references"
  add constraint "activity_source_references_resolution_activity_check" check ((((resolution_status = 'confirmed'::text) AND (activity_id IS NOT NULL)) OR
    (resolution_status = 'review'::text) OR ((resolution_status = ANY (ARRAY['ignored'::text, 'provider_deleted'::text])) AND (activity_id IS NULL))));

alter table "public"."activity_source_references"
  add constraint "activity_source_references_resolution_status_check"
    check ((resolution_status = ANY (ARRAY['confirmed'::text, 'review'::text, 'ignored'::text, 'provider_deleted'::text])));

alter table "public"."activity_source_references"
  add constraint "activity_source_refs_last_import_run_profile_fk" foreign key (last_import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null;

alter table "public"."activity_source_references"
  add constraint "activity_source_refs_material_import_run_profile_fk" foreign key (last_material_import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null;

alter table "public"."events"
  add constraint "events_planned_session_kind_check" check (((planned_session_id IS NULL) OR ((event_type = 'planned'::public.event_type) AND (activity_plan_id IS NOT NULL))));

alter table "public"."events"
  add constraint "events_training_plan_session_check" check (((training_plan_id IS NULL) OR (planned_session_id IS NOT NULL)));

alter table "public"."organizations"
  add constraint "organizations_root_owner_membership_fkey" foreign key (id, root_owner_membership_id)
    references public.organization_memberships(organization_id, id) on delete restrict deferrable initially deferred;

alter table "public"."planned_sessions"
  add constraint "planned_sessions_id_profile_activity_plan_unique" unique (id, profile_id, activity_plan_id);

alter table "public"."events"
  add constraint "events_planned_session_owner_fkey" foreign key (planned_session_id, profile_id, activity_plan_id)
    references public.planned_sessions(id, profile_id, activity_plan_id) on delete restrict;

alter table "public"."planned_sessions"
  add constraint "planned_sessions_prescription_check"
    check (((activity_plan_revision > 0) AND (jsonb_typeof(resolution_manifest) = 'object'::text) AND (pg_column_size(resolution_manifest) <= 1048576) AND
    (jsonb_typeof((resolution_manifest -> 'resolver_version'::text)) = 'string'::text) AND (btrim((resolution_manifest ->> 'resolver_version'::text)) <> ''::text) AND
    (jsonb_typeof((resolution_manifest -> 'policy_version'::text)) = 'string'::text) AND (btrim((resolution_manifest ->> 'policy_version'::text)) <> ''::text) AND
    ((resolution_manifest ->> 'activity_plan_id'::text) = (activity_plan_id)::text) AND ((resolution_manifest -> 'activity_plan_revision'::text) = to_jsonb(activity_plan_revision)) AND
    ((resolution_manifest ->> 'activity_plan_semantic_hash'::text) ~ '^v1:sha256:[0-9a-f]{64}$'::text) AND
    (jsonb_typeof((resolution_manifest -> 'session_demand'::text)) = 'object'::text) AND (jsonb_typeof((resolution_manifest -> 'adaptation_values'::text)) = 'object'::text) AND
    (((resolution_manifest -> 'effective_target_duration_minutes'::text) = 'null'::jsonb) OR
    (jsonb_typeof((resolution_manifest -> 'effective_target_duration_minutes'::text)) = 'number'::text)) AND
    (((resolution_manifest -> 'effective_target_common_load'::text) = 'null'::jsonb) OR
    (jsonb_typeof((resolution_manifest -> 'effective_target_common_load'::text)) = 'number'::text)) AND
    (jsonb_typeof((resolution_manifest -> 'evidence_facts'::text)) = 'array'::text) AND
    (jsonb_typeof((resolution_manifest -> 'reason_codes'::text)) = 'array'::text) AND
    (jsonb_typeof((resolution_manifest -> 'resolved_structure'::text)) = 'object'::text) AND
    ((resolution_manifest ->> 'resolved_structure_hash'::text) ~ '^v1:sha256:[0-9a-f]{64}$'::text) AND
    (jsonb_typeof((resolution_manifest -> 'prescription_estimate'::text)) = 'object'::text) AND
    ((resolution_manifest ->> 'fingerprint'::text) ~ '^v1:sha256:[0-9a-f]{64}$'::text)));

alter table "public"."planned_sessions"
  add constraint "planned_sessions_source_check"
    check ((((source_kind = 'direct'::public.planned_session_source_kind) AND (direct_operation_id ~ '^[A-Za-z0-9_-]{32,128}$'::text) AND
    (idempotency_key = ('direct:'::text || direct_operation_id)) AND (num_nonnulls(training_plan_id, training_plan_revision, source_session_id) = 0)) OR
    ((source_kind = 'training_plan'::public.planned_session_source_kind) AND (training_plan_id IS NOT NULL) AND (training_plan_revision > 0) AND
    (source_session_id IS NOT NULL) AND
    (idempotency_key = ((((('training-plan:'::text || (training_plan_id)::text) || ':'::text) || (training_plan_revision)::text) || ':'::text) || (source_session_id)::text)) AND
    (direct_operation_id IS NULL))));

alter table "public"."provider_sync_jobs"
  add constraint "provider_sync_jobs_import_run_profile_fkey" foreign key (import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null;

alter table "public"."threshold_evidence"
  add constraint "threshold_evidence_profile_category_activity_unique" unique (profile_id, activity_category, metric, activity_id);

alter table "public"."thresholds"
  add constraint "thresholds_supersedes_fkey" foreign key (supersedes_id) references public.thresholds(id) on delete no action deferrable initially deferred;

create unique index events_planned_session_unique on public.events using btree (planned_session_id)
  where (planned_session_id is not null);
