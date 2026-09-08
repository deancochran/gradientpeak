create type "public"."training_effect_label" as enum ('recovery', 'base', 'tempo', 'threshold', 'vo2max');

alter table "public"."comments" drop constraint "comments_entity_type_check";

alter table "public"."content_access_grants" drop constraint "content_access_grants_access_level_check";

alter table "public"."content_access_grants" drop constraint "content_access_grants_content_type_check";

alter table "public"."content_access_grants" drop constraint "content_access_grants_source_type_check";

alter table "public"."follows" drop constraint "follows_status_check";

alter table "public"."activities" drop constraint "activities_athlete_state_evidence_check";

alter table "public"."activity_training_effects" drop constraint "activity_training_effects_common_load_check";

alter table "public"."daily_training_load" drop constraint "daily_training_load_common_load_check";

alter table "public"."group_event_rsvps" drop constraint "group_event_rsvps_status_check";

alter table "public"."group_event_series_rsvps" drop constraint "group_event_series_rsvps_status_check";

alter table "public"."profile_goals" drop constraint "profile_goals_target_payload_shape_check";

drop index if exists "public"."accounts_issuer_accountId_uidx";

drop index if exists "public"."accounts_pkey";

drop index if exists "public"."activity_efforts_ownership_unique";

drop index if exists "public"."activity_segments_effort_category_unique";

drop index if exists "public"."activity_segments_effort_source_unique";

drop index if exists "public"."idx_activity_segments_category";

drop index if exists "public"."profile_performance_estimates_profile_id_capability_kind_activi";

drop index if exists "public"."rate_limits_pkey";

drop index if exists "public"."sessions_pkey";

drop index if exists "public"."threshold_evaluations_idempotency_unique";

drop index if exists "public"."threshold_evaluations_ownership_unique";

drop index if exists "public"."threshold_evaluations_profile_identity_observed_idx";

drop index if exists "public"."threshold_evaluations_qualified_identity_unique";

drop index if exists "public"."threshold_evidence_profile_category_activity_unique";

drop index if exists "public"."threshold_evidence_profile_identity_observed_idx";

drop index if exists "public"."thresholds_identity_root_unique";

drop index if exists "public"."thresholds_ownership_unique";

drop index if exists "public"."thresholds_profile_identity_effective_idx";

drop index if exists "public"."verifications_pkey";


  create table "public"."canonical_activity_categories" (
    "code" text not null,
    "display_name" text not null,
    "enabled" boolean not null default true
      );


alter table "public"."canonical_activity_categories" enable row level security;

alter table "public"."accounts" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."accounts" alter column "id" set data type text using "id"::text;

alter table "public"."accounts" alter column "issuer" drop not null;

alter table "public"."activities" alter column "athlete_state_activity_category" set data type text using "athlete_state_activity_category"::text;

alter table "public"."activity_efforts" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."activity_segments" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."activity_training_effects" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."profile_goals" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."profile_performance_estimates" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."rate_limits" alter column "id" set data type text using "id"::text;

alter table "public"."sessions" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."sessions" alter column "id" set data type text using "id"::text;

alter table "public"."threshold_evaluation_efforts" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."threshold_evaluations" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."threshold_evidence" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."thresholds" alter column "activity_category" set data type text using "activity_category"::text;

alter table "public"."verifications" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."verifications" alter column "id" set data type text using "id"::text;

drop type "public"."activity_category";

CREATE UNIQUE INDEX canonical_activity_categories_pkey ON public.canonical_activity_categories USING btree (code);

CREATE INDEX group_event_rsvps_profile_status_idx ON public.group_event_rsvps USING btree (profile_id, status);

CREATE INDEX group_event_series_rsvps_profile_status_idx ON public.group_event_series_rsvps USING btree (profile_id, status);

CREATE INDEX idx_activity_segments_activity ON public.activity_segments USING btree (activity_id, ordinal);

CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);

CREATE UNIQUE INDEX activity_efforts_ownership_unique ON public.activity_efforts USING btree (id, profile_id, activity_id, activity_category, effort_type, source_series, source_revision);

CREATE UNIQUE INDEX activity_segments_effort_category_unique ON public.activity_segments USING btree (id, activity_id, profile_id, activity_category);

CREATE UNIQUE INDEX activity_segments_effort_source_unique ON public.activity_segments USING btree (id, activity_id, profile_id, activity_category, source_artifact_id, segment_revision);

CREATE INDEX idx_activity_segments_category ON public.activity_segments USING btree (activity_category) WHERE (activity_category IS NOT NULL);

CREATE UNIQUE INDEX profile_performance_estimates_profile_id_capability_kind_activi ON public.profile_performance_estimates USING btree (profile_id, capability_kind, activity_category);

CREATE UNIQUE INDEX rate_limits_pkey ON public.rate_limits USING btree (id);

CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);

CREATE UNIQUE INDEX threshold_evaluations_idempotency_unique ON public.threshold_evaluations USING btree (profile_id, source_activity_id, source_revision, activity_category, metric, method, policy_version);

CREATE UNIQUE INDEX threshold_evaluations_ownership_unique ON public.threshold_evaluations USING btree (id, profile_id, activity_category, metric);

CREATE INDEX threshold_evaluations_profile_identity_observed_idx ON public.threshold_evaluations USING btree (profile_id, activity_category, metric, observed_at DESC NULLS LAST, id);

CREATE UNIQUE INDEX threshold_evaluations_qualified_identity_unique ON public.threshold_evaluations USING btree (id, profile_id, activity_category, metric, outcome);

CREATE UNIQUE INDEX threshold_evidence_profile_category_activity_unique ON public.threshold_evidence USING btree (profile_id, activity_category, activity_id);

CREATE INDEX threshold_evidence_profile_identity_observed_idx ON public.threshold_evidence USING btree (profile_id, activity_category, metric, observed_at, id);

CREATE UNIQUE INDEX thresholds_identity_root_unique ON public.thresholds USING btree (profile_id, activity_category, metric) WHERE (supersedes_id IS NULL);

CREATE UNIQUE INDEX thresholds_ownership_unique ON public.thresholds USING btree (id, profile_id, activity_category, metric);

CREATE INDEX thresholds_profile_identity_effective_idx ON public.thresholds USING btree (profile_id, activity_category, metric, effective_at DESC NULLS LAST, id);

CREATE UNIQUE INDEX verifications_pkey ON public.verifications USING btree (id);

alter table "public"."canonical_activity_categories" add constraint "canonical_activity_categories_pkey" PRIMARY KEY using index "canonical_activity_categories_pkey";

alter table "public"."activity_efforts" add constraint "activity_efforts_activity_category_canonical_activity_categorie" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_activity_category_canonical_activity_categorie";

alter table "public"."activity_efforts" add constraint "activity_efforts_bike_power_max_check" CHECK (((activity_category <> 'bike'::text) OR (effort_type <> 'power'::public.effort_type) OR (value <= (3000)::double precision))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_bike_power_max_check";

alter table "public"."activity_efforts" add constraint "activity_efforts_heart_rate_bounds_check" CHECK ((((effort_type)::text <> 'heart_rate'::text) OR ((value >= (30)::double precision) AND (value <= (240)::double precision)))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_heart_rate_bounds_check";

alter table "public"."activity_efforts" add constraint "activity_efforts_run_speed_bounds_check" CHECK (((activity_category <> 'run'::text) OR (effort_type <> 'speed'::public.effort_type) OR ((value >= (0.3)::double precision) AND (value <= (13)::double precision)))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_run_speed_bounds_check";

alter table "public"."activity_efforts" add constraint "activity_efforts_supported_combination_check" CHECK ((((activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type) AND (source_series = 'power'::public.activity_effort_source_series)) OR ((activity_category = 'run'::text) AND (effort_type = 'speed'::public.effort_type) AND (source_series = ANY (ARRAY['grade_adjusted_speed'::public.activity_effort_source_series, 'raw_speed'::public.activity_effort_source_series]))) OR ((activity_category = 'swim'::text) AND (effort_type = 'speed'::public.effort_type) AND (source_series = 'swim_speed'::public.activity_effort_source_series)) OR ((activity_category = ANY (ARRAY['bike'::text, 'run'::text, 'swim'::text])) AND ((effort_type)::text = 'heart_rate'::text) AND (source_series = 'heart_rate'::public.activity_effort_source_series)))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_supported_combination_check";

alter table "public"."activity_efforts" add constraint "activity_efforts_swim_speed_bounds_check" CHECK (((activity_category <> 'swim'::text) OR (effort_type <> 'speed'::public.effort_type) OR ((value >= (0.1)::double precision) AND (value <= (3)::double precision)))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_swim_speed_bounds_check";

alter table "public"."activity_efforts" add constraint "activity_efforts_unit_compatibility_check" CHECK ((((activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type) AND (unit = 'watts'::text)) OR ((activity_category = ANY (ARRAY['run'::text, 'swim'::text])) AND (effort_type = 'speed'::public.effort_type) AND (unit = 'meters_per_second'::text)) OR (((effort_type)::text = 'heart_rate'::text) AND (unit = 'bpm'::text)))) not valid;

alter table "public"."activity_efforts" validate constraint "activity_efforts_unit_compatibility_check";

alter table "public"."activity_file_ingestions" add constraint "activity_file_ingestions_contract_version_check" CHECK ((contract_version = 'activity-intake-v1'::text)) not valid;

alter table "public"."activity_file_ingestions" validate constraint "activity_file_ingestions_contract_version_check";

alter table "public"."activity_segments" add constraint "activity_segments_activity_category_canonical_activity_categori" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."activity_segments" validate constraint "activity_segments_activity_category_canonical_activity_categori";

alter table "public"."activity_training_effects" add constraint "activity_training_effects_activity_category_canonical_activity_" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."activity_training_effects" validate constraint "activity_training_effects_activity_category_canonical_activity_";

alter table "public"."activity_training_effects" add constraint "activity_training_effects_contract_version_check" CHECK ((contract_version = 'athlete-derived-state-persistence-v1'::text)) not valid;

alter table "public"."activity_training_effects" validate constraint "activity_training_effects_contract_version_check";

alter table "public"."athlete_recalculation_queue" add constraint "athlete_recalculation_queue_contract_version_check" CHECK ((contract_version = 'athlete-derived-state-persistence-v1'::text)) not valid;

alter table "public"."athlete_recalculation_queue" validate constraint "athlete_recalculation_queue_contract_version_check";

alter table "public"."athlete_recalculation_queue" add constraint "athlete_recalculation_queue_reasons_check" CHECK ((((cardinality(reasons) >= 1) AND (cardinality(reasons) <= 9)) AND (reasons = array_remove(ARRAY[
CASE
    WHEN ('activity_created'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'activity_created'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('activity_changed'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'activity_changed'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('activity_deleted'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'activity_deleted'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('analysis_replaced'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'analysis_replaced'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('threshold_changed'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'threshold_changed'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('import_completed'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'import_completed'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('algorithm_changed'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'algorithm_changed'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('timezone_changed'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'timezone_changed'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END,
CASE
    WHEN ('explicit_repair'::public.athlete_recalculation_reason = ANY (reasons)) THEN 'explicit_repair'::public.athlete_recalculation_reason
    ELSE NULL::public.athlete_recalculation_reason
END], NULL::public.athlete_recalculation_reason)))) not valid;

alter table "public"."athlete_recalculation_queue" validate constraint "athlete_recalculation_queue_reasons_check";

alter table "public"."canonical_activity_categories" add constraint "canonical_activity_categories_code_check" CHECK ((code = ANY (ARRAY['run'::text, 'bike'::text, 'swim'::text, 'strength'::text, 'other'::text]))) not valid;

alter table "public"."canonical_activity_categories" validate constraint "canonical_activity_categories_code_check";

alter table "public"."daily_training_load" add constraint "daily_training_load_contract_version_check" CHECK ((contract_version = 'athlete-derived-state-persistence-v1'::text)) not valid;

alter table "public"."daily_training_load" validate constraint "daily_training_load_contract_version_check";

alter table "public"."planned_sessions" add constraint "planned_sessions_contract_version_check" CHECK ((contract_version = 'planned-session-v1'::text)) not valid;

alter table "public"."planned_sessions" validate constraint "planned_sessions_contract_version_check";

alter table "public"."profile_goals" add constraint "profile_goals_activity_category_check" CHECK ((activity_category = ANY (ARRAY['run'::text, 'bike'::text, 'swim'::text, 'strength'::text, 'other'::text]))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_activity_category_check";

alter table "public"."profile_goals" add constraint "profile_goals_completion_payload_check" CHECK ((((target_payload ->> 'type'::text) <> 'completion'::text) OR (((target_payload - ARRAY['type'::text, 'activity_category'::text, 'distance_m'::text, 'duration_s'::text]) = '{}'::jsonb) AND ((target_payload ? 'distance_m'::text) OR (target_payload ? 'duration_s'::text)) AND ((NOT (target_payload ? 'distance_m'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'distance_m'::text)) = 'number'::text) THEN (((target_payload ->> 'distance_m'::text))::numeric > (0)::numeric)
    ELSE false
END) AND ((NOT (target_payload ? 'duration_s'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'duration_s'::text)) = 'number'::text) THEN ((((target_payload ->> 'duration_s'::text))::numeric > (0)::numeric) AND (trunc(((target_payload ->> 'duration_s'::text))::numeric) = ((target_payload ->> 'duration_s'::text))::numeric))
    ELSE false
END)))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_completion_payload_check";

alter table "public"."profile_goals" add constraint "profile_goals_consistency_payload_check" CHECK ((((target_payload ->> 'type'::text) <> 'consistency'::text) OR (((target_payload - ARRAY['type'::text, 'target_sessions_per_week'::text, 'target_weeks'::text]) = '{}'::jsonb) AND ((target_payload ? 'target_sessions_per_week'::text) OR (target_payload ? 'target_weeks'::text)) AND ((NOT (target_payload ? 'target_sessions_per_week'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'target_sessions_per_week'::text)) = 'number'::text) THEN ((((target_payload ->> 'target_sessions_per_week'::text))::numeric > (0)::numeric) AND (trunc(((target_payload ->> 'target_sessions_per_week'::text))::numeric) = ((target_payload ->> 'target_sessions_per_week'::text))::numeric))
    ELSE false
END) AND ((NOT (target_payload ? 'target_weeks'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'target_weeks'::text)) = 'number'::text) THEN ((((target_payload ->> 'target_weeks'::text))::numeric > (0)::numeric) AND (trunc(((target_payload ->> 'target_weeks'::text))::numeric) = ((target_payload ->> 'target_weeks'::text))::numeric))
    ELSE false
END)))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_consistency_payload_check";

alter table "public"."profile_goals" add constraint "profile_goals_event_performance_payload_check" CHECK ((((target_payload ->> 'type'::text) <> 'event_performance'::text) OR (((target_payload - ARRAY['type'::text, 'activity_category'::text, 'distance_m'::text, 'target_time_s'::text, 'target_speed_mps'::text, 'environment'::text, 'tolerance_pct'::text]) = '{}'::jsonb) AND (target_payload ? 'activity_category'::text) AND (target_payload ? 'distance_m'::text) AND
CASE
    WHEN (jsonb_typeof((target_payload -> 'distance_m'::text)) = 'number'::text) THEN (((target_payload ->> 'distance_m'::text))::numeric > (0)::numeric)
    ELSE false
END AND ((target_payload ? 'target_time_s'::text) OR (target_payload ? 'target_speed_mps'::text)) AND ((NOT (target_payload ? 'target_time_s'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'target_time_s'::text)) = 'number'::text) THEN ((((target_payload ->> 'target_time_s'::text))::numeric > (0)::numeric) AND (trunc(((target_payload ->> 'target_time_s'::text))::numeric) = ((target_payload ->> 'target_time_s'::text))::numeric))
    ELSE false
END) AND ((NOT (target_payload ? 'target_speed_mps'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'target_speed_mps'::text)) = 'number'::text) THEN (((target_payload ->> 'target_speed_mps'::text))::numeric > (0)::numeric)
    ELSE false
END) AND ((NOT (target_payload ? 'environment'::text)) OR ((jsonb_typeof((target_payload -> 'environment'::text)) = 'string'::text) AND ((char_length(btrim((target_payload ->> 'environment'::text))) >= 1) AND (char_length(btrim((target_payload ->> 'environment'::text))) <= 80)))) AND ((NOT (target_payload ? 'tolerance_pct'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'tolerance_pct'::text)) = 'number'::text) THEN ((((target_payload ->> 'tolerance_pct'::text))::numeric >= (0)::numeric) AND (((target_payload ->> 'tolerance_pct'::text))::numeric <= (1)::numeric))
    ELSE false
END)))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_event_performance_payload_check";

alter table "public"."profile_goals" add constraint "profile_goals_threshold_payload_check" CHECK ((((target_payload ->> 'type'::text) <> 'threshold'::text) OR (((target_payload - ARRAY['type'::text, 'metric'::text, 'activity_category'::text, 'value'::text, 'test_duration_s'::text, 'tolerance_pct'::text]) = '{}'::jsonb) AND (target_payload ? 'metric'::text) AND (jsonb_typeof((target_payload -> 'metric'::text)) = 'string'::text) AND ((target_payload ->> 'metric'::text) = ANY (ARRAY['pace'::text, 'power'::text, 'hr'::text])) AND (target_payload ? 'value'::text) AND
CASE
    WHEN (jsonb_typeof((target_payload -> 'value'::text)) = 'number'::text) THEN (((target_payload ->> 'value'::text))::numeric > (0)::numeric)
    ELSE false
END AND ((NOT (target_payload ? 'test_duration_s'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'test_duration_s'::text)) = 'number'::text) THEN ((((target_payload ->> 'test_duration_s'::text))::numeric > (0)::numeric) AND (trunc(((target_payload ->> 'test_duration_s'::text))::numeric) = ((target_payload ->> 'test_duration_s'::text))::numeric))
    ELSE false
END) AND ((NOT (target_payload ? 'tolerance_pct'::text)) OR
CASE
    WHEN (jsonb_typeof((target_payload -> 'tolerance_pct'::text)) = 'number'::text) THEN ((((target_payload ->> 'tolerance_pct'::text))::numeric >= (0)::numeric) AND (((target_payload ->> 'tolerance_pct'::text))::numeric <= (1)::numeric))
    ELSE false
END)))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_threshold_payload_check";

alter table "public"."profile_performance_estimates" add constraint "profile_performance_estimates_category_check" CHECK ((activity_category = ANY (ARRAY['run'::text, 'bike'::text, 'swim'::text, 'strength'::text, 'other'::text]))) not valid;

alter table "public"."profile_performance_estimates" validate constraint "profile_performance_estimates_category_check";

alter table "public"."threshold_evaluation_efforts" add constraint "threshold_evaluation_efforts_activity_category_canonical_activi" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."threshold_evaluation_efforts" validate constraint "threshold_evaluation_efforts_activity_category_canonical_activi";

alter table "public"."threshold_evaluation_efforts" add constraint "threshold_evaluation_efforts_metric_check" CHECK ((((metric = 'power'::public.threshold_metric) AND (activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type) AND (source_series = 'power'::public.activity_effort_source_series)) OR ((metric = 'speed'::public.threshold_metric) AND (activity_category = 'run'::text) AND (effort_type = 'speed'::public.effort_type) AND (source_series = ANY (ARRAY['grade_adjusted_speed'::public.activity_effort_source_series, 'raw_speed'::public.activity_effort_source_series]))) OR ((metric = 'speed'::public.threshold_metric) AND (activity_category = 'swim'::text) AND (effort_type = 'speed'::public.effort_type) AND (source_series = 'swim_speed'::public.activity_effort_source_series)))) not valid;

alter table "public"."threshold_evaluation_efforts" validate constraint "threshold_evaluation_efforts_metric_check";

alter table "public"."threshold_evaluations" add constraint "threshold_evaluations_activity_category_canonical_activity_cate" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."threshold_evaluations" validate constraint "threshold_evaluations_activity_category_canonical_activity_cate";

alter table "public"."threshold_evaluations" add constraint "threshold_evaluations_identity_check" CHECK ((((activity_category = 'bike'::text) AND (metric = 'power'::public.threshold_metric) AND (method = 'bike_power_30m'::text) AND (unit = 'watts'::text)) OR ((activity_category = 'run'::text) AND (metric = 'speed'::public.threshold_metric) AND (method = 'run_speed_30m'::text) AND (unit = 'meters_per_second'::text)) OR ((activity_category = 'swim'::text) AND (metric = 'speed'::public.threshold_metric) AND (method = 'swim_speed_15m'::text) AND (unit = 'meters_per_second'::text)))) not valid;

alter table "public"."threshold_evaluations" validate constraint "threshold_evaluations_identity_check";

alter table "public"."threshold_evidence" add constraint "threshold_evidence_contract_version_check" CHECK ((contract_version = 'athlete-derived-state-persistence-v1'::text)) not valid;

alter table "public"."threshold_evidence" validate constraint "threshold_evidence_contract_version_check";

alter table "public"."threshold_evidence" add constraint "threshold_evidence_identity_check" CHECK ((((activity_category = 'bike'::text) AND (metric = 'power'::public.threshold_metric) AND (unit = 'watts'::text) AND (method = 'bike_power_30m'::text) AND (source_series_metric = 'power'::text)) OR ((activity_category = 'run'::text) AND (metric = 'speed'::public.threshold_metric) AND (unit = 'meters_per_second'::text) AND (method = 'run_speed_30m'::text) AND (source_series_metric = ANY (ARRAY['speed'::text, 'grade_adjusted_speed'::text]))) OR ((activity_category = 'swim'::text) AND (metric = 'speed'::public.threshold_metric) AND (unit = 'meters_per_second'::text) AND (method = 'swim_speed_15m'::text) AND (source_series_metric = 'speed'::text)))) not valid;

alter table "public"."threshold_evidence" validate constraint "threshold_evidence_identity_check";

alter table "public"."threshold_evidence" add constraint "threshold_evidence_plausibility_check" CHECK ((plausibility_version = 'threshold-plausibility-v1'::text)) not valid;

alter table "public"."threshold_evidence" validate constraint "threshold_evidence_plausibility_check";

alter table "public"."threshold_evidence" add constraint "threshold_evidence_policy_check" CHECK ((policy_version = 'threshold-policy-v1'::text)) not valid;

alter table "public"."threshold_evidence" validate constraint "threshold_evidence_policy_check";

alter table "public"."thresholds" add constraint "thresholds_activity_category_canonical_activity_categories_code" FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT not valid;

alter table "public"."thresholds" validate constraint "thresholds_activity_category_canonical_activity_categories_code";

alter table "public"."thresholds" add constraint "thresholds_identity_check" CHECK ((((activity_category = 'bike'::text) AND (metric = 'power'::public.threshold_metric) AND (method = 'bike_power_30m'::text) AND (unit = 'watts'::text)) OR ((activity_category = 'run'::text) AND (metric = 'speed'::public.threshold_metric) AND (method = 'run_speed_30m'::text) AND (unit = 'meters_per_second'::text)) OR ((activity_category = 'swim'::text) AND (metric = 'speed'::public.threshold_metric) AND (method = 'swim_speed_15m'::text) AND (unit = 'meters_per_second'::text)))) not valid;

alter table "public"."thresholds" validate constraint "thresholds_identity_check";

alter table "public"."activities" add constraint "activities_athlete_state_evidence_check" CHECK ((((athlete_state_common_load IS NULL) AND (athlete_state_activity_category IS NULL) AND (athlete_state_evidence_confidence IS NULL) AND (athlete_state_input_version IS NULL) AND (athlete_state_computed_at IS NULL)) OR ((athlete_state_common_load >= (0)::numeric) AND (athlete_state_activity_category = ANY (ARRAY['run'::text, 'bike'::text, 'swim'::text, 'strength'::text, 'other'::text])) AND ((athlete_state_evidence_confidence >= (0)::numeric) AND (athlete_state_evidence_confidence <= (1)::numeric)) AND (btrim(athlete_state_input_version) <> ''::text) AND (athlete_state_computed_at IS NOT NULL)))) not valid;

alter table "public"."activities" validate constraint "activities_athlete_state_evidence_check";

alter table "public"."activity_training_effects" add constraint "activity_training_effects_common_load_check" CHECK ((((common_load >= (0)::numeric) AND (common_load <= (10000)::numeric)) AND (common_load <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])))) not valid;

alter table "public"."activity_training_effects" validate constraint "activity_training_effects_common_load_check";

alter table "public"."daily_training_load" add constraint "daily_training_load_common_load_check" CHECK ((((common_load >= (0)::numeric) AND (common_load <= (3660000)::numeric)) AND (common_load <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])))) not valid;

alter table "public"."daily_training_load" validate constraint "daily_training_load_common_load_check";

alter table "public"."group_event_rsvps" add constraint "group_event_rsvps_status_check" CHECK ((status = 'declined'::text)) not valid;

alter table "public"."group_event_rsvps" validate constraint "group_event_rsvps_status_check";

alter table "public"."group_event_series_rsvps" add constraint "group_event_series_rsvps_status_check" CHECK ((status = 'declined'::text)) not valid;

alter table "public"."group_event_series_rsvps" validate constraint "group_event_series_rsvps_status_check";

alter table "public"."profile_goals" add constraint "profile_goals_target_payload_shape_check" CHECK (((jsonb_typeof(target_payload) = 'object'::text) AND (target_payload ? 'type'::text) AND (jsonb_typeof((target_payload -> 'type'::text)) = 'string'::text) AND ((target_payload ->> 'type'::text) = ANY (ARRAY['event_performance'::text, 'threshold'::text, 'completion'::text, 'consistency'::text])) AND ((NOT (target_payload ? 'activity_category'::text)) OR ((jsonb_typeof((target_payload -> 'activity_category'::text)) = 'string'::text) AND ((target_payload ->> 'activity_category'::text) = activity_category))))) not valid;

alter table "public"."profile_goals" validate constraint "profile_goals_target_payload_shape_check";

grant delete on table "public"."canonical_activity_categories" to "service_role";

grant insert on table "public"."canonical_activity_categories" to "service_role";

grant references on table "public"."canonical_activity_categories" to "service_role";

grant select on table "public"."canonical_activity_categories" to "service_role";

grant trigger on table "public"."canonical_activity_categories" to "service_role";

grant truncate on table "public"."canonical_activity_categories" to "service_role";

grant update on table "public"."canonical_activity_categories" to "service_role";


