BEGIN;

-- Consolidated source: 20260730000000_mvp_baseline.sql

-- Fresh-only MVP baseline generated from the current Drizzle schema and reviewed local manual assets.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE FUNCTION public.activity_artifact_content_path(target_profile_id uuid, target_digest text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$ SELECT 'artifacts/sha256/' || target_profile_id::text || '/' || target_digest $$;

CREATE FUNCTION public.activity_plan_structure_is_canonical(input jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;

CREATE FUNCTION public.activity_plan_jsonb_has_exact_keys(input jsonb, required_keys text[], optional_keys text[] DEFAULT '{}'::text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_jsonb_is_uuid(input jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_jsonb_is_string(input jsonb, minimum integer, maximum integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_jsonb_is_integer_between(input jsonb, minimum numeric, maximum numeric) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_target_is_canonical(input jsonb, activity_category text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_duration_is_canonical(input jsonb, rest_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;
CREATE FUNCTION public.activity_plan_segment_is_canonical(input jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT true $$;

CREATE TYPE "public"."activity_file_ingestion_source" AS ENUM('mobile_recording', 'manual_import', 'provider_sync');
CREATE TYPE "public"."activity_category" AS ENUM('run', 'bike', 'swim', 'strength', 'other');
CREATE TYPE "public"."activity_file_ingestion_status" AS ENUM('awaiting_upload', 'processing', 'failed_retryable', 'succeeded', 'failed_terminal');
CREATE TYPE "public"."activity_ingestion_failure_code" AS ENUM('artifact_missing', 'hash_mismatch', 'unsupported_format', 'invalid_activity', 'promotion_failed', 'dependency_unavailable', 'internal');
CREATE TYPE "public"."activity_session_rpe_source" AS ENUM('user', 'provider', 'manual');
CREATE TYPE "public"."athlete_recalculation_reason" AS ENUM('activity_created', 'activity_changed', 'activity_deleted', 'analysis_replaced', 'threshold_changed', 'import_completed', 'algorithm_changed', 'timezone_changed', 'explicit_repair');
CREATE TYPE "public"."effort_type" AS ENUM('power', 'speed', 'heart_rate');
CREATE TYPE "public"."activity_effort_source_series" AS ENUM('power', 'grade_adjusted_speed', 'raw_speed', 'swim_speed', 'heart_rate');
CREATE TYPE "public"."threshold_metric" AS ENUM('power', 'speed');
CREATE TYPE "public"."threshold_evaluation_outcome" AS ENUM('qualified', 'rejected');
CREATE TYPE "public"."threshold_evaluation_rejection_reason" AS ENUM('source_not_accepted', 'ownership_unverified', 'series_missing', 'series_ambiguous', 'exact_window_missing', 'exact_window_ambiguous', 'exact_window_incomplete', 'source_incomplete', 'coverage_insufficient', 'gap_bound_exceeded', 'value_implausible');
CREATE TYPE "public"."threshold_evaluation_effort_role" AS ENUM('primary', 'supporting');
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'completed', 'cancelled');
CREATE TYPE "public"."event_type" AS ENUM('planned', 'race_target', 'custom');
CREATE TYPE "public"."evidence_observation_source" AS ENUM('manual', 'test', 'imported', 'provider', 'estimated', 'derived');
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');
CREATE TYPE "public"."integration_provider" AS ENUM('strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift');
CREATE TYPE "public"."integration_resource_kind" AS ENUM('event', 'activity_plan', 'activity_route', 'group_event_route_delivery', 'activity');
CREATE TYPE "public"."like_entity_type" AS ENUM('activity', 'activity_plan', 'training_plan', 'route');
CREATE TYPE "public"."notification_type" AS ENUM('new_message', 'coaching_invitation', 'coaching_invitation_accepted', 'coaching_invitation_declined', 'new_follower', 'follow_request', 'group_event_cancelled');
CREATE TYPE "public"."onboarding_status" AS ENUM('provider_selection', 'processing', 'review', 'completed');
CREATE TYPE "public"."planned_session_cancellation_reason" AS ENUM('user_requested', 'plan_replaced', 'series_cancelled');
CREATE TYPE "public"."planned_session_completion_state" AS ENUM('linked', 'activity_deleted');
CREATE TYPE "public"."planned_session_source_kind" AS ENUM('direct', 'training_plan', 'recurrence');
CREATE TYPE "public"."planned_session_status" AS ENUM('scheduled', 'cancelled', 'completed');
CREATE TYPE "public"."profile_metric_type" AS ENUM('weight_kg', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr');
CREATE TYPE "public"."threshold_evidence_status" AS ENUM('active', 'superseded', 'deleted');
CREATE TABLE "accounts" (
	"id" uuid DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "rate_limits" (
	"id" uuid DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);

CREATE TABLE "sessions" (
	"id" uuid DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);

CREATE TABLE "users" (
	"id" uuid DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "verifications" (
	"id" uuid DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_plan_id" uuid,
	"route_id" uuid,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"notes" text,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"elapsed_ms" bigint NOT NULL,
	"active_ms" bigint,
	"moving_ms" bigint,
	"timing_coverage" text DEFAULT 'unavailable' NOT NULL,
	"segments_revision" integer DEFAULT 1 NOT NULL,
	"parser_version" text NOT NULL,
	"decoded_contract_version" text NOT NULL,
	"materializer_version" text NOT NULL,
	"canonical_evidence_tier" text DEFAULT 'inferred_fallback' NOT NULL,
	"segments_generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"distance_meters" integer DEFAULT 0 NOT NULL,
	"elevation_gain_meters" numeric(10, 2),
	"elevation_loss_meters" numeric(10, 2),
	"calories" integer,
	"avg_heart_rate" integer,
	"max_heart_rate" integer,
	"avg_power" integer,
	"max_power" integer,
	"avg_cadence" integer,
	"max_cadence" integer,
	"avg_speed_mps" numeric(6, 2),
	"max_speed_mps" numeric(6, 2),
	"normalized_speed_mps" numeric(6, 2),
	"avg_temperature" numeric,
	"avg_swolf" numeric,
	"pool_length_meters" numeric,
	"total_strokes" integer,
	"device_manufacturer" text,
	"device_product" text,
	"polyline" text,
	"laps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"map_bounds" jsonb,
	"performance_target_snapshot" jsonb,
	"athlete_state_common_load" numeric,
	"athlete_state_activity_category" "activity_category",
	"athlete_state_evidence_confidence" numeric,
	"athlete_state_capability_distance_meters" numeric,
	"athlete_state_capability_duration_minutes" numeric,
	"athlete_state_input_version" text,
	"athlete_state_computed_at" timestamp with time zone,
	CONSTRAINT "activities_id_profile_id_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "activities_content_visibility_check" CHECK ("activities"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "activities_distance_meters_check" CHECK ("activities"."distance_meters" >= 0),
	CONSTRAINT "activities_elapsed_ms_check" CHECK ("activities"."elapsed_ms" > 0),
	CONSTRAINT "activities_active_ms_check" CHECK ("activities"."active_ms" is null or ("activities"."active_ms" >= 0 and "activities"."active_ms" <= "activities"."elapsed_ms")),
	CONSTRAINT "activities_moving_ms_check" CHECK ("activities"."moving_ms" is null or ("activities"."moving_ms" >= 0 and "activities"."moving_ms" <= coalesce("activities"."active_ms", "activities"."elapsed_ms"))),
	CONSTRAINT "activities_segments_revision_check" CHECK ("activities"."segments_revision" > 0),
	CONSTRAINT "activities_canonical_evidence_tier_check" CHECK ("activities"."canonical_evidence_tier" in ('inferred_fallback', 'provider_summary', 'raw_samples', 'fit_artifact')),
	CONSTRAINT "activities_timing_coverage_values_check" CHECK (("activities"."timing_coverage" = 'complete' and "activities"."active_ms" is not null and "activities"."moving_ms" is not null) or ("activities"."timing_coverage" in ('partial', 'unavailable') and "activities"."active_ms" is null and "activities"."moving_ms" is null)),
	CONSTRAINT "activities_moving_time_check" CHECK ("activities"."moving_ms" is null or "activities"."active_ms" is null or "activities"."moving_ms" <= "activities"."active_ms"),
	CONSTRAINT "activities_laps_array_check" CHECK (jsonb_typeof("activities"."laps") = 'array'),
	CONSTRAINT "activities_laps_count_check" CHECK (jsonb_array_length("activities"."laps") <= 1000),
	CONSTRAINT "activities_laps_size_check" CHECK (pg_column_size("activities"."laps") <= 1048576),
	CONSTRAINT "activities_performance_target_snapshot_check" CHECK ("activities"."performance_target_snapshot" is null or (jsonb_typeof("activities"."performance_target_snapshot") = 'object' and pg_column_size("activities"."performance_target_snapshot") <= 65536)),
	CONSTRAINT "activities_athlete_state_evidence_check" CHECK (("activities"."athlete_state_common_load" is null and "activities"."athlete_state_activity_category" is null and "activities"."athlete_state_evidence_confidence" is null and "activities"."athlete_state_input_version" is null and "activities"."athlete_state_computed_at" is null) or ("activities"."athlete_state_common_load" >= 0 and "activities"."athlete_state_activity_category" in ('run', 'bike', 'swim', 'strength', 'other') and "activities"."athlete_state_evidence_confidence" between 0 and 1 and btrim("activities"."athlete_state_input_version") <> '' and "activities"."athlete_state_computed_at" is not null)),
	CONSTRAINT "activities_athlete_state_capability_check" CHECK (("activities"."athlete_state_capability_distance_meters" is null or "activities"."athlete_state_capability_distance_meters" >= 0) and ("activities"."athlete_state_capability_duration_minutes" is null or "activities"."athlete_state_capability_duration_minutes" >= 0))
);

CREATE TABLE "activity_artifact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" text NOT NULL,
	"ordinal" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"provider_revision" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_artifact_links_activity_artifact_profile_unique" UNIQUE("activity_id","artifact_id","profile_id"),
	CONSTRAINT "activity_artifact_links_activity_artifact_role_unique" UNIQUE("activity_id","artifact_id","role"),
	CONSTRAINT "activity_artifact_links_activity_role_ordinal_unique" UNIQUE("activity_id","role","ordinal"),
	CONSTRAINT "activity_artifact_links_ordinal_check" CHECK ("activity_artifact_links"."ordinal" >= 0),
	CONSTRAINT "activity_artifact_links_current_source_check" CHECK ("activity_artifact_links"."is_current" = false or "activity_artifact_links"."role" = 'source')
);

CREATE TABLE "activity_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"digest_algorithm" text DEFAULT 'sha256' NOT NULL,
	"digest" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"media_type" text NOT NULL,
	"format" text NOT NULL,
	"original_name" text,
	"availability" text DEFAULT 'accepted' NOT NULL,
	"first_accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_until" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "activity_artifacts_id_profile_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "activity_artifacts_profile_digest_size_unique" UNIQUE("profile_id","digest_algorithm","digest","byte_size"),
	CONSTRAINT "activity_artifacts_bucket_path_unique" UNIQUE("bucket","path"),
	CONSTRAINT "activity_artifacts_sha256_check" CHECK ("activity_artifacts"."digest_algorithm" = 'sha256' and "activity_artifacts"."digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_artifacts_byte_size_check" CHECK ("activity_artifacts"."byte_size" > 0),
	CONSTRAINT "activity_artifacts_path_check" CHECK (btrim("activity_artifacts"."bucket") <> '' and btrim("activity_artifacts"."path") <> ''),
	CONSTRAINT "activity_artifacts_content_addressed_path_check" CHECK ("activity_artifacts"."path" = public.activity_artifact_content_path("activity_artifacts"."profile_id", "activity_artifacts"."digest")),
	CONSTRAINT "activity_artifacts_lifecycle_check" CHECK (("activity_artifacts"."availability" = 'accepted' and "activity_artifacts"."deletion_requested_at" is null and "activity_artifacts"."deleted_at" is null) or ("activity_artifacts"."availability" = 'deletion_pending' and "activity_artifacts"."deletion_requested_at" is not null and "activity_artifacts"."deleted_at" is null) or ("activity_artifacts"."availability" = 'deleted' and "activity_artifacts"."deletion_requested_at" is not null and "activity_artifacts"."deleted_at" is not null))
);

CREATE TABLE "activity_efforts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"effort_type" "effort_type" NOT NULL,
	"source_series" "activity_effort_source_series" NOT NULL,
	"duration_seconds" integer NOT NULL,
	"distance_meters" integer,
	"source_artifact_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"start_offset_ms" bigint NOT NULL,
	"end_offset_ms" bigint NOT NULL,
	"window_coverage" numeric NOT NULL,
	"max_gap_seconds" numeric NOT NULL,
	"unit" text NOT NULL,
	"value" real NOT NULL,
	"source" "evidence_observation_source" NOT NULL,
	"method" text NOT NULL,
	"calculation_version" text NOT NULL,
	"quality_score" numeric,
	"provenance" jsonb NOT NULL,
	CONSTRAINT "activity_efforts_ownership_unique" UNIQUE("id","profile_id","activity_id","activity_category","effort_type","source_series","source_revision"),
	CONSTRAINT "activity_efforts_deterministic_source_window_unique" UNIQUE("activity_id","segment_id","source_artifact_id","source_revision","effort_type","source_series","start_offset_ms","end_offset_ms","method","calculation_version"),
	CONSTRAINT "activity_efforts_duration_seconds_positive_check" CHECK ("activity_efforts"."duration_seconds" > 0),
	CONSTRAINT "activity_efforts_distance_meters_bounds_check" CHECK ("activity_efforts"."distance_meters" is null or "activity_efforts"."distance_meters" > 0),
	CONSTRAINT "activity_efforts_source_revision_check" CHECK ("activity_efforts"."source_revision" > 0),
	CONSTRAINT "activity_efforts_window_check" CHECK ("activity_efforts"."start_offset_ms" >= 0 and "activity_efforts"."end_offset_ms" = "activity_efforts"."start_offset_ms" + "activity_efforts"."duration_seconds"::bigint * 1000),
	CONSTRAINT "activity_efforts_coverage_finite_range_check" CHECK ("activity_efforts"."window_coverage" between 0 and 1 and "activity_efforts"."window_coverage" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "activity_efforts_max_gap_finite_check" CHECK ("activity_efforts"."max_gap_seconds" > 0 and "activity_efforts"."max_gap_seconds" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "activity_efforts_value_finite_positive_check" CHECK ("activity_efforts"."value" > 0 and "activity_efforts"."value" not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real)),
	CONSTRAINT "activity_efforts_method_not_blank_check" CHECK (btrim("activity_efforts"."method") <> ''),
	CONSTRAINT "activity_efforts_calculation_version_not_blank_check" CHECK (btrim("activity_efforts"."calculation_version") <> ''),
	CONSTRAINT "activity_efforts_quality_score_range_check" CHECK ("activity_efforts"."quality_score" is null or ("activity_efforts"."quality_score" >= 0 and "activity_efforts"."quality_score" <= 1)),
	CONSTRAINT "activity_efforts_provenance_object_check" CHECK (jsonb_typeof("activity_efforts"."provenance") = 'object')
);

CREATE TABLE "activity_file_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid,
	"artifact_id" uuid,
	"profile_id" uuid NOT NULL,
	"source" "activity_file_ingestion_source" NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"integration_id" uuid,
	"contract_version" text DEFAULT 'activity-intake-v1' NOT NULL,
	"operation_id" text NOT NULL,
	"staging_bucket" text,
	"staging_path" text,
	"expected_sha256" text,
	"expected_byte_size" integer,
	"expected_format" text,
	"expected_media_type" text,
	"uploaded_at" timestamp with time zone,
	"staging_cleanup_pending" boolean DEFAULT false NOT NULL,
	"staging_cleaned_at" timestamp with time zone,
	"staging_cleanup_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "activity_file_ingestion_status" DEFAULT 'awaiting_upload' NOT NULL,
	"failure_code" "activity_ingestion_failure_code",
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_file_ingestions_operation_id_check" CHECK ("activity_file_ingestions"."operation_id" ~ '^[A-Za-z0-9_-]{32,128}$'),
	CONSTRAINT "activity_file_ingestions_provider_identity_check" CHECK (("activity_file_ingestions"."source" = 'provider_sync' and num_nonnulls("activity_file_ingestions"."provider", "activity_file_ingestions"."external_id", "activity_file_ingestions"."integration_id") = 3 and btrim("activity_file_ingestions"."external_id") <> '') or ("activity_file_ingestions"."source" <> 'provider_sync' and num_nonnulls("activity_file_ingestions"."provider", "activity_file_ingestions"."external_id", "activity_file_ingestions"."integration_id") = 0)),
	CONSTRAINT "activity_file_ingestions_expected_size_check" CHECK ("activity_file_ingestions"."expected_byte_size" is null or "activity_file_ingestions"."expected_byte_size" > 0),
	CONSTRAINT "activity_file_ingestions_expected_hash_check" CHECK ("activity_file_ingestions"."expected_sha256" is null or "activity_file_ingestions"."expected_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_file_ingestions_staging_metadata_check" CHECK (num_nonnulls("activity_file_ingestions"."staging_bucket", "activity_file_ingestions"."staging_path", "activity_file_ingestions"."expected_sha256", "activity_file_ingestions"."expected_byte_size", "activity_file_ingestions"."expected_format", "activity_file_ingestions"."expected_media_type") in (0, 6) and ("activity_file_ingestions"."staging_bucket" is null or (btrim("activity_file_ingestions"."staging_bucket") <> '' and btrim("activity_file_ingestions"."staging_path") <> '' and (("activity_file_ingestions"."expected_format" = 'fit' and "activity_file_ingestions"."expected_media_type" = 'application/vnd.ant.fit') or ("activity_file_ingestions"."expected_format" = 'gpx' and "activity_file_ingestions"."expected_media_type" = 'application/gpx+xml') or ("activity_file_ingestions"."expected_format" = 'tcx' and "activity_file_ingestions"."expected_media_type" = 'application/vnd.garmin.tcx+xml'))))),
	CONSTRAINT "activity_file_ingestions_cleanup_state_check" CHECK ((not "activity_file_ingestions"."staging_cleanup_pending" or ("activity_file_ingestions"."status" = 'succeeded' and "activity_file_ingestions"."staging_path" is not null and "activity_file_ingestions"."artifact_id" is not null)) and ("activity_file_ingestions"."staging_cleaned_at" is null or (not "activity_file_ingestions"."staging_cleanup_pending" and "activity_file_ingestions"."staging_path" is not null)) and ("activity_file_ingestions"."staging_cleanup_error" is null or "activity_file_ingestions"."staging_cleanup_pending") and not ("activity_file_ingestions"."staging_cleaned_at" is not null and "activity_file_ingestions"."staging_cleanup_error" is not null)),
	CONSTRAINT "activity_file_ingestions_lifecycle_check" CHECK (("activity_file_ingestions"."status" = 'awaiting_upload' and "activity_file_ingestions"."activity_id" is null and "activity_file_ingestions"."artifact_id" is null and "activity_file_ingestions"."started_at" is null and num_nonnulls("activity_file_ingestions"."failure_code", "activity_file_ingestions"."completed_at", "activity_file_ingestions"."failed_at") = 0) or ("activity_file_ingestions"."status" = 'processing' and "activity_file_ingestions"."activity_id" is null and "activity_file_ingestions"."started_at" is not null and num_nonnulls("activity_file_ingestions"."failure_code", "activity_file_ingestions"."completed_at", "activity_file_ingestions"."failed_at") = 0) or ("activity_file_ingestions"."status" in ('failed_retryable', 'failed_terminal') and "activity_file_ingestions"."started_at" is not null and "activity_file_ingestions"."failure_code" is not null and "activity_file_ingestions"."failed_at" is not null and "activity_file_ingestions"."completed_at" is null) or ("activity_file_ingestions"."status" = 'succeeded' and "activity_file_ingestions"."activity_id" is not null and "activity_file_ingestions"."artifact_id" is not null and "activity_file_ingestions"."started_at" is not null and "activity_file_ingestions"."completed_at" is not null and "activity_file_ingestions"."failure_code" is null and "activity_file_ingestions"."failed_at" is null))
);

CREATE TABLE "activity_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"notes" text,
	"structure" jsonb NOT NULL,
	"structure_hash" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"gps_recording_enabled" boolean DEFAULT true NOT NULL,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"system_content_key" text,
	"system_content_version" integer,
	"system_content_hash" text,
	CONSTRAINT "activity_plans_structure_v3_check" CHECK (jsonb_typeof("activity_plans"."structure") = 'object' and "activity_plans"."structure"->>'version' = '3' and "activity_plans"."structure"->>'activity_category' in ('run', 'bike', 'swim', 'strength', 'other') and jsonb_typeof("activity_plans"."structure"->'segments') = 'array' and jsonb_array_length("activity_plans"."structure"->'segments') between 1 and 64 and pg_column_size("activity_plans"."structure") <= 1048576),
	CONSTRAINT "activity_plans_structure_canonical_check" CHECK (public.activity_plan_structure_is_canonical("activity_plans"."structure")),
	CONSTRAINT "activity_plans_structure_hash_check" CHECK ("activity_plans"."structure_hash" ~ '^v1:sha256:[0-9a-f]{64}$'),
	CONSTRAINT "activity_plans_revision_check" CHECK ("activity_plans"."revision" >= 1),
	CONSTRAINT "activity_plans_content_visibility_check" CHECK ("activity_plans"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "activity_plans_system_templates_public_check" CHECK ("activity_plans"."is_system_template" = false or "activity_plans"."content_visibility" = 'public'),
	CONSTRAINT "activity_plans_system_template_check" CHECK (("activity_plans"."is_system_template" = true and "activity_plans"."profile_id" is null) or ("activity_plans"."is_system_template" = false and "activity_plans"."profile_id" is not null)),
	CONSTRAINT "activity_plans_system_content_identity_check" CHECK (("activity_plans"."is_system_template" and "activity_plans"."system_content_key" is not null and btrim("activity_plans"."system_content_key") <> '' and "activity_plans"."system_content_version" > 0 and "activity_plans"."system_content_hash" ~ '^v1:sha256:[0-9a-f]{64}$') or (not "activity_plans"."is_system_template" and num_nonnulls("activity_plans"."system_content_key", "activity_plans"."system_content_version", "activity_plans"."system_content_hash") = 0))
);

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.structure IS DISTINCT FROM OLD.structure THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_plans_enforce_revision
BEFORE UPDATE ON public.activity_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_plan_revision();

CREATE TABLE "activity_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"file_path" text NOT NULL,
	"file_sha256" text,
	"storage_state" text DEFAULT 'ready' NOT NULL,
	"total_distance" integer NOT NULL,
	"total_ascent" integer,
	"total_descent" integer,
	"elevation_polyline" text,
	"polyline" text NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	CONSTRAINT "activity_routes_total_distance_check" CHECK ("activity_routes"."total_distance" >= 0),
	CONSTRAINT "activity_routes_total_ascent_check" CHECK ("activity_routes"."total_ascent" >= 0),
	CONSTRAINT "activity_routes_total_descent_check" CHECK ("activity_routes"."total_descent" >= 0),
	CONSTRAINT "activity_routes_file_sha256_check" CHECK ("activity_routes"."file_sha256" is null or "activity_routes"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_routes_storage_state_check" CHECK ("activity_routes"."storage_state" in ('upload_pending', 'ready', 'deletion_pending')),
	CONSTRAINT "activity_routes_system_templates_public_check" CHECK ("activity_routes"."is_system_template" = false or "activity_routes"."is_public" = true),
	CONSTRAINT "activity_routes_system_template_check" CHECK (("activity_routes"."is_system_template" = true and "activity_routes"."profile_id" is null) or ("activity_routes"."is_system_template" = false and "activity_routes"."profile_id" is not null))
);

CREATE TABLE "activity_route_deletion_receipts" (
	"route_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "activity_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"role" text NOT NULL,
	"activity_category" "activity_category",
	"start_offset_ms" bigint NOT NULL,
	"end_offset_ms" bigint NOT NULL,
	"source_artifact_id" uuid,
	"source_session_index" integer,
	"source_message_index" integer,
	"raw_type_string" text,
	"raw_type_integer" integer,
	"raw_sport_string" text,
	"raw_sport_integer" integer,
	"raw_sub_sport_string" text,
	"raw_sub_sport_integer" integer,
	"summary" jsonb NOT NULL,
	"summary_version" integer DEFAULT 1 NOT NULL,
	"timing_coverage" text NOT NULL,
	"active_ms" bigint,
	"moving_ms" bigint,
	"segment_revision" integer DEFAULT 1 NOT NULL,
	"parser_version" text NOT NULL,
	"materializer_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_segments_id_activity_profile_unique" UNIQUE("id","activity_id","profile_id"),
	CONSTRAINT "activity_segments_effort_category_unique" UNIQUE("id","activity_id","profile_id","activity_category"),
	CONSTRAINT "activity_segments_effort_source_unique" UNIQUE("id","activity_id","profile_id","activity_category","source_artifact_id","segment_revision"),
	CONSTRAINT "activity_segments_activity_ordinal_unique" UNIQUE("activity_id","ordinal"),
	CONSTRAINT "activity_segments_ordinal_check" CHECK ("activity_segments"."ordinal" >= 0),
	CONSTRAINT "activity_segments_offset_check" CHECK ("activity_segments"."start_offset_ms" >= 0 and "activity_segments"."end_offset_ms" > "activity_segments"."start_offset_ms"),
	CONSTRAINT "activity_segments_role_category_check" CHECK (("activity_segments"."role" = 'activity' and "activity_segments"."activity_category" is not null) or ("activity_segments"."role" <> 'activity' and "activity_segments"."activity_category" is null)),
	CONSTRAINT "activity_segments_unknown_source_check" CHECK ("activity_segments"."role" <> 'unknown' or num_nonnulls("activity_segments"."raw_type_string", "activity_segments"."raw_type_integer", "activity_segments"."raw_sport_string", "activity_segments"."raw_sport_integer", "activity_segments"."raw_sub_sport_string", "activity_segments"."raw_sub_sport_integer") > 0),
	CONSTRAINT "activity_segments_raw_sub_sport_type_check" CHECK (num_nonnulls("activity_segments"."raw_sub_sport_string", "activity_segments"."raw_sub_sport_integer") <= 1),
	CONSTRAINT "activity_segments_raw_source_string_bounds_check" CHECK (("activity_segments"."raw_type_string" is null or char_length("activity_segments"."raw_type_string") between 1 and 128) and ("activity_segments"."raw_sport_string" is null or char_length("activity_segments"."raw_sport_string") between 1 and 128) and ("activity_segments"."raw_sub_sport_string" is null or char_length("activity_segments"."raw_sub_sport_string") between 1 and 128)),
	CONSTRAINT "activity_segments_source_indexes_check" CHECK (("activity_segments"."source_session_index" is null and "activity_segments"."source_message_index" is null) or "activity_segments"."source_artifact_id" is not null),
	CONSTRAINT "activity_segments_summary_check" CHECK ("activity_segments"."summary_version" = 1 and jsonb_typeof("activity_segments"."summary") = 'object' and pg_column_size("activity_segments"."summary") <= 1048576),
	CONSTRAINT "activity_segments_timing_check" CHECK ("activity_segments"."active_ms" is null or ("activity_segments"."active_ms" >= 0 and "activity_segments"."active_ms" <= "activity_segments"."end_offset_ms" - "activity_segments"."start_offset_ms")),
	CONSTRAINT "activity_segments_moving_check" CHECK ("activity_segments"."moving_ms" is null or ("activity_segments"."moving_ms" >= 0 and "activity_segments"."moving_ms" <= coalesce("activity_segments"."active_ms", "activity_segments"."end_offset_ms" - "activity_segments"."start_offset_ms"))),
	CONSTRAINT "activity_segments_timing_coverage_values_check" CHECK (("activity_segments"."timing_coverage" = 'complete' and "activity_segments"."active_ms" is not null and "activity_segments"."moving_ms" is not null) or ("activity_segments"."timing_coverage" = 'partial' and num_nonnulls("activity_segments"."active_ms", "activity_segments"."moving_ms") > 0) or ("activity_segments"."timing_coverage" = 'unavailable' and "activity_segments"."active_ms" is null and "activity_segments"."moving_ms" is null))
);

CREATE TABLE "activity_analysis_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"source_segments_revision" integer NOT NULL,
	"analysis_version" text NOT NULL,
	"reason" text NOT NULL,
	"performance_target_snapshot" jsonb NOT NULL,
	"target_fingerprint" text NOT NULL,
	"segment_load_projection" jsonb NOT NULL,
	"output_fingerprint" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_analysis_revisions_activity_revision_unique" UNIQUE("activity_id","profile_id","revision"),
	CONSTRAINT "activity_analysis_revisions_revision_check" CHECK ("activity_analysis_revisions"."revision" > 0),
	CONSTRAINT "activity_analysis_revisions_segments_revision_check" CHECK ("activity_analysis_revisions"."source_segments_revision" > 0),
	CONSTRAINT "activity_analysis_revisions_version_check" CHECK (btrim("activity_analysis_revisions"."analysis_version") <> ''),
	CONSTRAINT "activity_analysis_revisions_reason_check" CHECK ("activity_analysis_revisions"."reason" = 'manual_profile_reprocess'),
	CONSTRAINT "activity_analysis_revisions_target_check" CHECK (jsonb_typeof("activity_analysis_revisions"."performance_target_snapshot") = 'object' and pg_column_size("activity_analysis_revisions"."performance_target_snapshot") <= 1048576),
	CONSTRAINT "activity_analysis_revisions_projection_check" CHECK (jsonb_typeof("activity_analysis_revisions"."segment_load_projection") = 'object' and pg_column_size("activity_analysis_revisions"."segment_load_projection") <= 1048576),
	CONSTRAINT "activity_analysis_revisions_target_fingerprint_check" CHECK ("activity_analysis_revisions"."target_fingerprint" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "activity_analysis_revisions_output_fingerprint_check" CHECK ("activity_analysis_revisions"."output_fingerprint" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE "activity_session_rpe_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"corrected_at" timestamp with time zone,
	"rpe" integer NOT NULL,
	"scale" text NOT NULL,
	"scale_version" text NOT NULL,
	"source" "activity_session_rpe_source" NOT NULL,
	"operation_id" uuid NOT NULL,
	"correction_of_id" uuid,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_session_rpe_evidence_id_activity_profile_unique" UNIQUE("id","activity_id","profile_id"),
	CONSTRAINT "activity_session_rpe_evidence_rpe_bounds_check" CHECK ("activity_session_rpe_evidence"."rpe" between 1 and 10),
	CONSTRAINT "activity_session_rpe_evidence_scale_not_blank_check" CHECK (btrim("activity_session_rpe_evidence"."scale") <> ''),
	CONSTRAINT "activity_session_rpe_evidence_scale_version_not_blank_check" CHECK (btrim("activity_session_rpe_evidence"."scale_version") <> ''),
	CONSTRAINT "activity_session_rpe_evidence_correction_timestamp_check" CHECK (("activity_session_rpe_evidence"."correction_of_id" is null) = ("activity_session_rpe_evidence"."corrected_at" is null)),
	CONSTRAINT "activity_session_rpe_evidence_correction_manual_check" CHECK ("activity_session_rpe_evidence"."correction_of_id" is null or "activity_session_rpe_evidence"."source" = 'manual'),
	CONSTRAINT "activity_session_rpe_evidence_provenance_object_check" CHECK (jsonb_typeof("activity_session_rpe_evidence"."provenance") = 'object')
);

CREATE TABLE "api_rate_limit_windows" (
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_rate_limit_windows_key_hash_window_started_at_pk" PRIMARY KEY("key_hash","window_started_at"),
	CONSTRAINT "api_rate_limit_windows_count_check" CHECK ("api_rate_limit_windows"."count" > 0)
);

CREATE TABLE "athlete_consent_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"jurisdiction" text NOT NULL,
	"terms_text" text NOT NULL,
	"content_digest" text NOT NULL,
	"supersedes_policy_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_consent_policy_versions_id_scope_unique" UNIQUE("id","scope_key"),
	CONSTRAINT "athlete_consent_policy_versions_scope_check" CHECK ("athlete_consent_policy_versions"."scope_key" in ('basic_profile', 'training', 'activities', 'metrics', 'goals', 'calendar')),
	CONSTRAINT "athlete_consent_policy_versions_terms_non_empty" CHECK (btrim("athlete_consent_policy_versions"."terms_text") <> ''),
	CONSTRAINT "athlete_consent_policy_versions_digest_non_empty" CHECK (btrim("athlete_consent_policy_versions"."content_digest") <> ''),
	CONSTRAINT "athlete_consent_policy_versions_supersedes_not_self_check" CHECK ("athlete_consent_policy_versions"."supersedes_policy_version_id" is null or "athlete_consent_policy_versions"."supersedes_policy_version_id" <> "athlete_consent_policy_versions"."id")
);

CREATE TABLE "athlete_data_sharing_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"athlete_profile_id" uuid NOT NULL,
	"scope_key" text NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"granted_by_profile_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"superseded_by_consent_id" uuid,
	CONSTRAINT "athlete_data_sharing_consents_authority_identity_unique" UNIQUE("organization_id","engagement_id","athlete_profile_id","scope_key","id"),
	CONSTRAINT "athlete_data_sharing_consents_grantor_check" CHECK ("athlete_data_sharing_consents"."granted_by_profile_id" = "athlete_data_sharing_consents"."athlete_profile_id"),
	CONSTRAINT "athlete_data_sharing_consents_expiry_chronology_check" CHECK ("athlete_data_sharing_consents"."expires_at" is null or "athlete_data_sharing_consents"."expires_at" >= "athlete_data_sharing_consents"."granted_at"),
	CONSTRAINT "athlete_data_sharing_consents_end_chronology_check" CHECK ("athlete_data_sharing_consents"."ended_at" is null or "athlete_data_sharing_consents"."ended_at" >= "athlete_data_sharing_consents"."granted_at"),
	CONSTRAINT "athlete_data_sharing_consents_successor_not_self_check" CHECK ("athlete_data_sharing_consents"."superseded_by_consent_id" is null or "athlete_data_sharing_consents"."superseded_by_consent_id" <> "athlete_data_sharing_consents"."id")
);

CREATE TABLE "coaching_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"coach_membership_id" uuid NOT NULL,
	"assignment_kind" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "coaching_assignments_kind_check" CHECK ("coaching_assignments"."assignment_kind" in ('primary', 'supporting')),
	CONSTRAINT "coaching_assignments_chronology_check" CHECK ("coaching_assignments"."ended_at" is null or "coaching_assignments"."ended_at" >= "coaching_assignments"."assigned_at")
);

CREATE TABLE "coaching_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"athlete_profile_id" uuid NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_engagements_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "coaching_engagements_organization_id_id_athlete_unique" UNIQUE("organization_id","id","athlete_profile_id"),
	CONSTRAINT "coaching_engagements_lifecycle_check" CHECK ("coaching_engagements"."ended_at" is null or "coaching_engagements"."paused_at" is null)
);

CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "comments_entity_type_check" CHECK ("comments"."entity_type" in ('activity', 'training_plan', 'activity_plan', 'route', 'event'))
);

CREATE TABLE "content_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"grantee_profile_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"access_level" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_access_grants_content_type_check" CHECK ("content_access_grants"."content_type" in ('profile', 'event', 'activity_plan', 'activity_route', 'training_plan')),
	CONSTRAINT "content_access_grants_access_level_check" CHECK ("content_access_grants"."access_level" in ('read', 'read_geometry')),
	CONSTRAINT "content_access_grants_source_type_check" CHECK ("content_access_grants"."source_type" in ('event', 'training_plan'))
);

CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_read_message_id" uuid,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversation_participants_read_cursor_pair_check" CHECK (("conversation_participants"."last_read_at" is null) = ("conversation_participants"."last_read_message_id" is null))
);

CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"group_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"event_type" "event_type" NOT NULL,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"scheduled_date" text NOT NULL,
	"training_plan_id" uuid,
	"activity_plan_id" uuid,
	"linked_activity_id" uuid,
	"route_id" uuid,
	"recurrence_rule" text,
	"recurrence_timezone" text,
	"series_id" uuid,
	"occurrence_key" text DEFAULT '' NOT NULL,
	"original_starts_at" timestamp with time zone,
	"schedule_batch_id" uuid,
	CONSTRAINT "events_id_profile_id_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "events_time_window" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_recurrence_rule_non_empty" CHECK ("events"."recurrence_rule" is null or btrim("events"."recurrence_rule") <> ''),
	CONSTRAINT "events_recurrence_timezone_non_empty" CHECK ("events"."recurrence_timezone" is null or btrim("events"."recurrence_timezone") <> ''),
	CONSTRAINT "events_recurrence_timezone_requires_rule" CHECK ("events"."recurrence_timezone" is null or "events"."recurrence_rule" is not null),
	CONSTRAINT "events_series_occurrence_key_required" CHECK ("events"."series_id" is null or btrim("events"."occurrence_key") <> ''),
	CONSTRAINT "events_recurrence_occurrence_key_required" CHECK ("events"."recurrence_rule" is null or btrim("events"."occurrence_key") <> ''),
	CONSTRAINT "events_occurrence_scheduled_date_identity" CHECK ("events"."occurrence_key" = '' or "events"."scheduled_date" = "events"."occurrence_key"),
	CONSTRAINT "events_series_not_self" CHECK ("events"."series_id" is null or "events"."series_id" <> "events"."id")
);

CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "follows_status_check" CHECK ("follows"."status" in ('pending', 'accepted'))
);

CREATE TABLE "group_event_rsvps" (
	"group_event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_event_rsvps_group_event_id_profile_id_pk" PRIMARY KEY("group_event_id","profile_id"),
	CONSTRAINT "group_event_rsvps_status_check" CHECK ("group_event_rsvps"."status" in ('going', 'declined'))
);

CREATE TABLE "group_event_series_rsvps" (
	"group_event_series_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_event_series_rsvps_group_event_series_id_profile_id_pk" PRIMARY KEY("group_event_series_id","profile_id"),
	CONSTRAINT "group_event_series_rsvps_status_check" CHECK ("group_event_series_rsvps"."status" in ('going', 'declined'))
);

CREATE TABLE "group_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"series_id" uuid,
	"created_by_profile_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"recurrence_rule" text,
	"recurrence_timezone" text,
	"occurrence_key" text,
	"location_name" text,
	"route_id" uuid,
	"activity_plan_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_events_title_non_empty" CHECK (btrim("group_events"."title") <> ''),
	CONSTRAINT "group_events_time_window" CHECK ("group_events"."ends_at" is null or "group_events"."ends_at" > "group_events"."starts_at"),
	CONSTRAINT "group_events_series_not_self" CHECK ("group_events"."series_id" is null or "group_events"."series_id" <> "group_events"."id"),
	CONSTRAINT "group_events_timezone_non_empty" CHECK (btrim("group_events"."timezone") <> ''),
	CONSTRAINT "group_events_recurrence_rule_non_empty" CHECK ("group_events"."recurrence_rule" is null or btrim("group_events"."recurrence_rule") <> ''),
	CONSTRAINT "group_events_recurrence_timezone_non_empty" CHECK ("group_events"."recurrence_timezone" is null or btrim("group_events"."recurrence_timezone") <> ''),
	CONSTRAINT "group_events_recurrence_timezone_requires_rule" CHECK ("group_events"."recurrence_timezone" is null or "group_events"."recurrence_rule" is not null),
	CONSTRAINT "group_events_occurrence_key_required" CHECK ("group_events"."series_id" is null or ("group_events"."occurrence_key" is not null and btrim("group_events"."occurrence_key") <> '')),
	CONSTRAINT "group_events_location_name_non_empty" CHECK ("group_events"."location_name" is null or btrim("group_events"."location_name") <> '')
);

CREATE TABLE "group_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_profile_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invitations_status_check" CHECK ("group_invitations"."status" in ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);

CREATE TABLE "group_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_join_requests_status_check" CHECK ("group_join_requests"."status" in ('pending', 'approved', 'declined', 'cancelled'))
);

CREATE TABLE "group_memberships" (
	"group_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_memberships_group_id_profile_id_pk" PRIMARY KEY("group_id","profile_id"),
	CONSTRAINT "group_memberships_role_check" CHECK ("group_memberships"."role" in ('owner', 'admin', 'member')),
	CONSTRAINT "group_memberships_status_check" CHECK ("group_memberships"."status" in ('active', 'left', 'removed'))
);

CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"avatar_url" text,
	"cover_url" text,
	"access_level" text DEFAULT 'public' NOT NULL,
	"join_policy" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "groups_access_level_check" CHECK ("groups"."access_level" in ('public', 'members_only')),
	CONSTRAINT "groups_join_policy_check" CHECK ("groups"."join_policy" in ('open', 'request_to_join', 'invite_only')),
	CONSTRAINT "groups_name_non_empty" CHECK (btrim("groups"."name") <> ''),
	CONSTRAINT "groups_slug_non_empty" CHECK (btrim("groups"."slug") <> '')
);

CREATE TABLE "integration_credentials" (
	"integration_id" uuid PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"generation" integer DEFAULT 1 NOT NULL,
	"reconnect_required_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_credentials_access_token_envelope_check" CHECK ("integration_credentials"."access_token" like 'enc:v1:%'),
	CONSTRAINT "integration_credentials_refresh_token_envelope_check" CHECK ("integration_credentials"."refresh_token" is null or "integration_credentials"."refresh_token" like 'enc:v1:%')
);

CREATE TABLE "integration_resource_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"profile_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"resource_kind" "integration_resource_kind" NOT NULL,
	"internal_resource_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"provider_metadata" jsonb,
	"payload_hash" text,
	CONSTRAINT "integration_resource_links_internal_unique" UNIQUE("integration_id","resource_kind","internal_resource_id"),
	CONSTRAINT "integration_resource_links_external_unique" UNIQUE("integration_id","resource_kind","external_id"),
	CONSTRAINT "integration_resource_links_no_activity_check" CHECK ("integration_resource_links"."resource_kind" <> 'activity')
);

CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"disconnect_requested_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"remote_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_id_profile_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "unique_integration_type" UNIQUE("profile_id","provider")
);

CREATE TABLE "likes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"profile_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "like_entity_type" NOT NULL,
	CONSTRAINT "likes_profile_entity_unique" UNIQUE("profile_id","entity_type","entity_id")
);

CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"read_at" timestamp with time zone
);

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);

CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"mobile_redirect_uri" text NOT NULL,
	"callback_uri" text,
	"requested_scope" text,
	"verifier_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);

CREATE TABLE "organization_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"actor_membership_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "organization_audit_events_action_non_empty" CHECK (btrim("organization_audit_events"."action") <> ''),
	CONSTRAINT "organization_audit_events_resource_type_non_empty" CHECK (btrim("organization_audit_events"."resource_type") <> ''),
	CONSTRAINT "organization_audit_events_details_object" CHECK (jsonb_typeof("organization_audit_events"."details") = 'object'),
	CONSTRAINT "organization_audit_events_details_size_check" CHECK (pg_column_size("organization_audit_events"."details") <= 4096),
	CONSTRAINT "organization_audit_events_actor_membership_profile_check" CHECK ("organization_audit_events"."actor_membership_id" is null or "organization_audit_events"."actor_profile_id" is not null)
);

CREATE TABLE "organization_membership_role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_membership_role_grants_role_key_check" CHECK ("organization_membership_role_grants"."role_key" in ('admin', 'coach')),
	CONSTRAINT "organization_membership_role_grants_revocation_chronology_check" CHECK ("organization_membership_role_grants"."revoked_at" is null or "organization_membership_role_grants"."revoked_at" >= "organization_membership_role_grants"."granted_at")
);

CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"suspended_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_profile_unique" UNIQUE("organization_id","profile_id"),
	CONSTRAINT "organization_memberships_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_memberships_organization_id_id_profile_unique" UNIQUE("organization_id","id","profile_id"),
	CONSTRAINT "organization_memberships_lifecycle_check" CHECK ("organization_memberships"."ended_at" is null or "organization_memberships"."suspended_at" is null)
);

CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_profile_id" uuid NOT NULL,
	"root_owner_membership_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_non_empty" CHECK (btrim("organizations"."name") <> ''),
	CONSTRAINT "organizations_slug_non_empty" CHECK (btrim("organizations"."slug") <> ''),
	CONSTRAINT "organizations_timezone_non_empty" CHECK (btrim("organizations"."timezone") <> ''),
	CONSTRAINT "organizations_lifecycle_check" CHECK ("organizations"."closed_at" is null or "organizations"."suspended_at" is null)
);

CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_membership_id" uuid NOT NULL,
	"invitation_kind" text NOT NULL,
	"invited_profile_id" uuid,
	"invited_email" text,
	"requested_role_key" text,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_by_profile_id" uuid,
	"accepted_at" timestamp with time zone,
	"closed_by_membership_id" uuid,
	"declined_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_closer_check" CHECK (("status" in ('revoked','expired')) = ("closed_by_membership_id" is not null)),
	CONSTRAINT "organization_invitations_decline_check" CHECK (("status" = 'declined') = ("declined_by_profile_id" is not null) and ("declined_by_profile_id" is null or "invited_profile_id" is null or "declined_by_profile_id" = "invited_profile_id")),
	CONSTRAINT "organization_invitations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_invitations_recipient_check" CHECK (("invited_profile_id" is null) <> ("invited_email" is null)),
	CONSTRAINT "organization_invitations_email_non_empty" CHECK ("invited_email" is null or btrim("invited_email") <> ''),
	CONSTRAINT "organization_invitations_token_digest_non_empty" CHECK (btrim("token_digest") <> ''),
	CONSTRAINT "organization_invitations_role_check" CHECK (("invitation_kind" = 'staff' and "requested_role_key" is not null and "requested_role_key" in ('admin', 'coach')) or ("invitation_kind" = 'athlete' and "requested_role_key" is null)),
	CONSTRAINT "organization_invitations_acceptance_check" CHECK (("status" = 'accepted' and "accepted_by_profile_id" is not null and "accepted_at" is not null and "accepted_at" >= "created_at" and "accepted_at" < "expires_at" and ("invited_profile_id" is null or "accepted_by_profile_id" = "invited_profile_id")) or ("status" <> 'accepted' and "accepted_by_profile_id" is null and "accepted_at" is null)),
	CONSTRAINT "organization_invitations_expiry_check" CHECK ("expires_at" >= "created_at"),
	CONSTRAINT "organization_invitations_kind_check" CHECK ("invitation_kind" in ('staff', 'athlete')),
	CONSTRAINT "organization_invitations_status_check" CHECK ("status" in ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);

CREATE TABLE "organization_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	CONSTRAINT "organization_groups_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_groups_archive_check" CHECK (("archived_at" is null) = ("archived_by_membership_id" is null) and ("archived_at" is null or "archived_at" >= "created_at")),
	CONSTRAINT "organization_groups_name_non_empty" CHECK (btrim("name") <> '')
);

CREATE TABLE "organization_group_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"added_by_membership_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_membership_id" uuid,
	CONSTRAINT "organization_group_athletes_end_actor_check" CHECK (("ended_at" is null) = ("ended_by_membership_id" is null)),
	CONSTRAINT "organization_group_athletes_chronology_check" CHECK ("ended_at" is null or "ended_at" >= "joined_at")
);

CREATE TABLE "organization_group_coach_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"coach_membership_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_membership_id" uuid,
	CONSTRAINT "organization_group_coach_assignments_end_actor_check" CHECK (("ended_at" is null) = ("ended_by_membership_id" is null)),
	CONSTRAINT "organization_group_coach_assignments_chronology_check" CHECK ("ended_at" is null or "ended_at" >= "assigned_at")
);

CREATE TABLE "profile_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"priority" integer NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"target_date" date NOT NULL,
	"target_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_goals_title_length_check" CHECK (char_length(btrim("profile_goals"."title")) between 1 and 100),
	CONSTRAINT "profile_goals_priority_range" CHECK ("profile_goals"."priority" between 0 and 10),
	CONSTRAINT "profile_goals_target_payload_shape_check" CHECK (jsonb_typeof("profile_goals"."target_payload") = 'object'
		and "profile_goals"."target_payload" ? 'type'
		and jsonb_typeof("profile_goals"."target_payload"->'type') = 'string'
		and "profile_goals"."target_payload"->>'type' in ('event_performance', 'threshold', 'completion', 'consistency')
		and (not ("profile_goals"."target_payload" ? 'activity_category')
			or (jsonb_typeof("profile_goals"."target_payload"->'activity_category') = 'string'
				and "profile_goals"."target_payload"->>'activity_category' = "profile_goals"."activity_category"::text)))
);

CREATE TABLE "profile_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"metric_type" "profile_metric_type" NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"reference_activity_id" uuid,
	"value" numeric NOT NULL,
	"source" "evidence_observation_source",
	"method" text,
	"calculation_version" text,
	"quality_score" numeric,
	"provenance" jsonb,
	CONSTRAINT "profile_metrics_value_check" CHECK ("profile_metrics"."value" >= 0),
	CONSTRAINT "profile_metrics_method_not_blank_check" CHECK ("profile_metrics"."method" is null or btrim("profile_metrics"."method") <> ''),
	CONSTRAINT "profile_metrics_calculation_version_not_blank_check" CHECK ("profile_metrics"."calculation_version" is null or btrim("profile_metrics"."calculation_version") <> ''),
	CONSTRAINT "profile_metrics_quality_score_range_check" CHECK ("profile_metrics"."quality_score" is null or ("profile_metrics"."quality_score" >= 0 and "profile_metrics"."quality_score" <= 1)),
	CONSTRAINT "profile_metrics_provenance_object_check" CHECK ("profile_metrics"."provenance" is null or jsonb_typeof("profile_metrics"."provenance") = 'object')
);

CREATE TABLE "profile_athlete_state" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"source_revision" bigint DEFAULT 0 NOT NULL,
	"published_revision" bigint DEFAULT 0 NOT NULL,
	"dirty_from_at" timestamp with time zone,
	"activity_analysis_cursor_started_at" timestamp with time zone,
	"activity_analysis_cursor_activity_id" uuid,
	"fitness" numeric DEFAULT 0 NOT NULL,
	"fatigue" numeric DEFAULT 0 NOT NULL,
	"evidence_confidence" numeric DEFAULT 0 NOT NULL,
	"coverage_start_at" timestamp with time zone,
	"coverage_end_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"algorithm_version" text DEFAULT 'athlete-state-projection-v1' NOT NULL,
	"computed_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"retry_after" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_failure_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_athlete_state_revision_check" CHECK ("profile_athlete_state"."source_revision" >= 0 and "profile_athlete_state"."published_revision" >= 0 and "profile_athlete_state"."published_revision" <= "profile_athlete_state"."source_revision"),
	CONSTRAINT "profile_athlete_state_fitness_check" CHECK ("profile_athlete_state"."fitness" >= 0),
	CONSTRAINT "profile_athlete_state_fatigue_check" CHECK ("profile_athlete_state"."fatigue" >= 0),
	CONSTRAINT "profile_athlete_state_confidence_check" CHECK ("profile_athlete_state"."evidence_confidence" between 0 and 1),
	CONSTRAINT "profile_athlete_state_lease_check" CHECK (num_nonnulls("profile_athlete_state"."lease_token", "profile_athlete_state"."lease_expires_at") in (0, 2)),
	CONSTRAINT "profile_athlete_state_analysis_cursor_check" CHECK (num_nonnulls("profile_athlete_state"."activity_analysis_cursor_started_at", "profile_athlete_state"."activity_analysis_cursor_activity_id") in (0, 2)),
	CONSTRAINT "profile_athlete_state_failures_check" CHECK ("profile_athlete_state"."consecutive_failures" >= 0),
	CONSTRAINT "profile_athlete_state_algorithm_check" CHECK (btrim("profile_athlete_state"."algorithm_version") <> '')
);

CREATE TABLE "profile_performance_estimates" (
	"profile_id" uuid NOT NULL,
	"capability_kind" text NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"confidence" numeric NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"evidence_window_start_at" timestamp with time zone,
	"evidence_window_end_at" timestamp with time zone,
	"algorithm_version" text NOT NULL,
	"source_revision" bigint NOT NULL,
	"target_fact" jsonb,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_performance_estimates_profile_id_capability_kind_activity_category_pk" PRIMARY KEY("profile_id","capability_kind","activity_category"),
	CONSTRAINT "profile_performance_estimates_kind_check" CHECK (btrim("profile_performance_estimates"."capability_kind") <> ''),
	CONSTRAINT "profile_performance_estimates_unit_check" CHECK (btrim("profile_performance_estimates"."unit") <> ''),
	CONSTRAINT "profile_performance_estimates_value_check" CHECK ("profile_performance_estimates"."value" >= 0),
	CONSTRAINT "profile_performance_estimates_confidence_check" CHECK ("profile_performance_estimates"."confidence" between 0 and 1),
	CONSTRAINT "profile_performance_estimates_algorithm_check" CHECK (btrim("profile_performance_estimates"."algorithm_version") <> ''),
	CONSTRAINT "profile_performance_estimates_revision_check" CHECK ("profile_performance_estimates"."source_revision" >= 0)
);

CREATE TABLE "activity_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"integration_id" uuid,
	"integration_generation" bigint,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"window_start_at" timestamp with time zone,
	"window_end_at" timestamp with time zone,
	"next_cursor" text,
	"next_page" integer,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"skipped_diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"material_change_count" integer DEFAULT 0 NOT NULL,
	"material_effective_from_at" timestamp with time zone,
	"earliest_activity_at" timestamp with time zone,
	"latest_activity_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"superseded_by_run_id" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_import_runs_id_profile_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "activity_import_runs_kind_check" CHECK ("activity_import_runs"."kind" in ('onboarding', 'history_sync', 'manual_sync')),
	CONSTRAINT "activity_import_runs_status_check" CHECK ("activity_import_runs"."status" in ('queued', 'running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "activity_import_runs_counts_check" CHECK ("activity_import_runs"."discovered_count" >= 0 and "activity_import_runs"."imported_count" >= 0 and "activity_import_runs"."skipped_count" >= 0 and "activity_import_runs"."failed_count" >= 0 and "activity_import_runs"."material_change_count" >= 0),
	CONSTRAINT "activity_import_runs_skipped_diagnostics_check" CHECK (jsonb_typeof("activity_import_runs"."skipped_diagnostics") = 'array' and jsonb_array_length("activity_import_runs"."skipped_diagnostics") <= 120 and pg_column_size("activity_import_runs"."skipped_diagnostics") <= 16384),
	CONSTRAINT "activity_import_runs_next_page_check" CHECK ("activity_import_runs"."next_page" is null or "activity_import_runs"."next_page" >= 1),
	CONSTRAINT "activity_import_runs_cursor_page_check" CHECK (num_nonnulls("activity_import_runs"."next_cursor", "activity_import_runs"."next_page") <= 1),
	CONSTRAINT "activity_import_runs_integration_generation_check" CHECK (("activity_import_runs"."integration_id" is null) = ("activity_import_runs"."integration_generation" is null)),
	CONSTRAINT "activity_import_runs_terminal_check" CHECK ("activity_import_runs"."status" not in ('completed', 'failed', 'cancelled') or "activity_import_runs"."completed_at" is not null),
	CONSTRAINT "activity_import_runs_error_check" CHECK ("activity_import_runs"."last_error_code" is null or btrim("activity_import_runs"."last_error_code") <> ''),
	CONSTRAINT "activity_import_runs_supersession_check" CHECK (num_nonnulls("activity_import_runs"."superseded_by_run_id", "activity_import_runs"."superseded_at") in (0, 2) and ("activity_import_runs"."superseded_by_run_id" is null or ("activity_import_runs"."status" = 'failed' and "activity_import_runs"."superseded_by_run_id" <> "activity_import_runs"."id")))
);

CREATE TABLE "activity_source_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_external_id" text NOT NULL,
	"provider_revision" text,
	"origin_provider" text,
	"origin_external_id" text,
	"artifact_sha256" text,
	"last_import_run_id" uuid,
	"last_material_import_run_id" uuid,
	"last_material_effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_source_references_provider_unique" UNIQUE("profile_id","provider","provider_external_id"),
	CONSTRAINT "activity_source_references_provider_check" CHECK (btrim("activity_source_references"."provider") <> '' and btrim("activity_source_references"."provider_external_id") <> ''),
	CONSTRAINT "activity_source_references_origin_check" CHECK (("activity_source_references"."origin_provider" is null) = ("activity_source_references"."origin_external_id" is null)),
	CONSTRAINT "activity_source_references_artifact_check" CHECK ("activity_source_references"."artifact_sha256" is null or "activity_source_references"."artifact_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_source_references_material_import_check" CHECK (("activity_source_references"."last_material_import_run_id" is null) = ("activity_source_references"."last_material_effective_at" is null))
);

CREATE TABLE "profile_training_settings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text,
	"full_name" text,
	"username" text,
	"avatar_url" text,
	"cover_url" text,
	"bio" text,
	"dob" timestamp with time zone,
	"gender" "gender",
	"language" text,
	"planning_timezone" text,
	"preferred_units" text,
	"onboarding_status" "onboarding_status" DEFAULT 'provider_selection' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"default_content_visibility" text DEFAULT 'private' NOT NULL,
	CONSTRAINT "profiles_preferred_units_check" CHECK ("profiles"."preferred_units" is null or "profiles"."preferred_units" in ('metric', 'imperial')),
	CONSTRAINT "profiles_default_content_visibility_check" CHECK ("profiles"."default_content_visibility" in ('private', 'followers', 'public'))
);

CREATE TABLE "provider_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_sequence" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "provider_sync_jobs_queue_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"integration_generation" integer DEFAULT 1 NOT NULL,
	"import_run_id" uuid,
	"job_type" text NOT NULL,
	"operation" text,
	"resource_kind" "integration_resource_kind",
	"internal_resource_id" uuid,
	"sync_lane_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text,
	"supersedes_job_id" uuid,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"lock_expires_at" timestamp with time zone,
	"locked_by" text
);

CREATE TABLE "provider_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"resource" text NOT NULL,
	"publish_horizon_days" integer,
	"sync_mode" text NOT NULL,
	"last_sync_started_at" timestamp with time zone,
	"last_sync_succeeded_at" timestamp with time zone,
	"last_sync_failed_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cursor" text,
	"high_watermark" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "provider_sync_state_integration_resource_unique" UNIQUE("integration_id","resource")
);

CREATE TABLE "provider_webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"provider" "integration_provider" NOT NULL,
	"integration_id" uuid,
	"integration_generation" integer,
	"provider_account_id" text,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"payload" jsonb NOT NULL,
	"payload_hash" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"job_id" uuid,
	"last_error" text,
	CONSTRAINT "provider_webhook_receipts_event_unique" UNIQUE("provider","provider_account_id","provider_event_id"),
	CONSTRAINT "provider_webhook_receipts_integration_generation_pair_check" CHECK (("provider_webhook_receipts"."integration_id" is null) = ("provider_webhook_receipts"."integration_generation" is null)),
	CONSTRAINT "provider_webhook_receipts_integration_generation_positive_check" CHECK ("provider_webhook_receipts"."integration_generation" is null or "provider_webhook_receipts"."integration_generation" > 0)
);

CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"structure" jsonb NOT NULL,
	"structure_hash" text NOT NULL,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"system_content_key" text,
	"system_content_version" integer,
	"system_content_hash" text,
	"sessions_per_week_target" integer,
	"duration_hours" numeric(12, 2),
	"revision" integer DEFAULT 1 NOT NULL,
	"validated_state_revision" bigint,
	"validated_at" timestamp with time zone,
	"projection_algorithm_version" text,
	CONSTRAINT "training_plans_structure_v1_check" CHECK (jsonb_typeof("training_plans"."structure") = 'object' and "training_plans"."structure"->>'version' = '1' and jsonb_typeof("training_plans"."structure"->'sessions') = 'array' and jsonb_array_length("training_plans"."structure"->'sessions') > 0 and pg_column_size("training_plans"."structure") <= 1048576),
	CONSTRAINT "training_plans_structure_hash_check" CHECK ("training_plans"."structure_hash" ~ '^v1:sha256:[0-9a-f]{64}$'),
	CONSTRAINT "training_plans_content_visibility_check" CHECK ("training_plans"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "training_plans_system_templates_public_check" CHECK ("training_plans"."is_system_template" = false or "training_plans"."content_visibility" = 'public'),
	CONSTRAINT "training_plans_template_profile_check" CHECK (("training_plans"."is_system_template" = true and "training_plans"."profile_id" is null) or ("training_plans"."is_system_template" = false and "training_plans"."profile_id" is not null)),
	CONSTRAINT "training_plans_system_content_identity_check" CHECK (("training_plans"."is_system_template" and "training_plans"."system_content_key" is not null and btrim("training_plans"."system_content_key") <> '' and "training_plans"."system_content_version" > 0 and "training_plans"."system_content_hash" ~ '^v1:sha256:[0-9a-f]{64}$') or (not "training_plans"."is_system_template" and num_nonnulls("training_plans"."system_content_key", "training_plans"."system_content_version", "training_plans"."system_content_hash") = 0)),
	CONSTRAINT "training_plans_revision_check" CHECK ("training_plans"."revision" > 0),
	CONSTRAINT "training_plans_projection_validation_check" CHECK ((num_nonnulls("training_plans"."validated_state_revision", "training_plans"."validated_at", "training_plans"."projection_algorithm_version") = 0 or ("training_plans"."validated_at" is not null and "training_plans"."projection_algorithm_version" is not null)) and ("training_plans"."validated_state_revision" is null or "training_plans"."validated_state_revision" >= 0) and ("training_plans"."projection_algorithm_version" is null or btrim("training_plans"."projection_algorithm_version") <> ''))
);

CREATE TABLE "threshold_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"metric" "threshold_metric" NOT NULL,
	"method" text NOT NULL,
	"outcome" "threshold_evaluation_outcome" NOT NULL,
	"value" numeric,
	"unit" text NOT NULL,
	"confidence" numeric,
	"observed_at" timestamp with time zone NOT NULL,
	"rejection_reason" "threshold_evaluation_rejection_reason",
	"policy_version" text NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"source_activity_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threshold_evaluations_idempotency_unique" UNIQUE("profile_id","source_activity_id","source_revision","activity_category","metric","method","policy_version"),
	CONSTRAINT "threshold_evaluations_ownership_unique" UNIQUE("id","profile_id","activity_category","metric"),
	CONSTRAINT "threshold_evaluations_qualified_identity_unique" UNIQUE("id","profile_id","activity_category","metric","outcome"),
	CONSTRAINT "threshold_evaluations_outcome_check" CHECK (("threshold_evaluations"."outcome" = 'qualified' and "threshold_evaluations"."value" is not null and "threshold_evaluations"."confidence" is not null and "threshold_evaluations"."rejection_reason" is null) or ("threshold_evaluations"."outcome" = 'rejected' and "threshold_evaluations"."value" is null and "threshold_evaluations"."confidence" is null and "threshold_evaluations"."rejection_reason" is not null)),
	CONSTRAINT "threshold_evaluations_value_finite_positive_check" CHECK ("threshold_evaluations"."value" is null or ("threshold_evaluations"."value" > 0 and "threshold_evaluations"."value" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))),
	CONSTRAINT "threshold_evaluations_confidence_finite_range_check" CHECK ("threshold_evaluations"."confidence" is null or ("threshold_evaluations"."confidence" between 0 and 1 and "threshold_evaluations"."confidence" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))),
	CONSTRAINT "threshold_evaluations_source_revision_check" CHECK ("threshold_evaluations"."source_revision" > 0),
	CONSTRAINT "threshold_evaluations_created_after_observed_check" CHECK ("threshold_evaluations"."created_at" >= "threshold_evaluations"."observed_at"),
	CONSTRAINT "threshold_evaluations_policy_check" CHECK (btrim("threshold_evaluations"."policy_version") <> ''),
	CONSTRAINT "threshold_evaluations_diagnostics_check" CHECK (jsonb_typeof("threshold_evaluations"."diagnostics") = 'object' and pg_column_size("threshold_evaluations"."diagnostics") <= 16384)
);

CREATE TABLE "threshold_evaluation_efforts" (
	"evaluation_id" uuid NOT NULL,
	"effort_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"activity_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"metric" "threshold_metric" NOT NULL,
	"effort_type" "effort_type" NOT NULL,
	"source_series" "activity_effort_source_series" NOT NULL,
	"role" "threshold_evaluation_effort_role" NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "threshold_evaluation_efforts_evaluation_id_effort_id_pk" PRIMARY KEY("evaluation_id","effort_id"),
	CONSTRAINT "threshold_evaluation_efforts_role_ordinal_unique" UNIQUE("evaluation_id","role","ordinal"),
	CONSTRAINT "threshold_evaluation_efforts_ordinal_check" CHECK ("threshold_evaluation_efforts"."ordinal" between 0 and 63),
	CONSTRAINT "threshold_evaluation_efforts_primary_ordinal_check" CHECK ("threshold_evaluation_efforts"."role" <> 'primary' or "threshold_evaluation_efforts"."ordinal" = 0)
);

CREATE TABLE "thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"metric" "threshold_metric" NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"evaluation_outcome" "threshold_evaluation_outcome" DEFAULT 'qualified' NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"confidence" numeric NOT NULL,
	"method" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"policy_version" text NOT NULL,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thresholds_ownership_unique" UNIQUE("id","profile_id","activity_category","metric"),
	CONSTRAINT "thresholds_evaluation_unique" UNIQUE("evaluation_id"),
	CONSTRAINT "thresholds_supersedes_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "thresholds_qualified_evaluation_check" CHECK ("thresholds"."evaluation_outcome" = 'qualified'),
	CONSTRAINT "thresholds_value_finite_positive_check" CHECK ("thresholds"."value" > 0 and "thresholds"."value" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "thresholds_confidence_finite_range_check" CHECK ("thresholds"."confidence" between 0 and 1 and "thresholds"."confidence" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "thresholds_created_after_effective_check" CHECK ("thresholds"."created_at" >= "thresholds"."effective_at"),
	CONSTRAINT "thresholds_policy_check" CHECK (btrim("thresholds"."policy_version") <> ''),
	CONSTRAINT "thresholds_supersedes_check" CHECK ("thresholds"."supersedes_id" is null or "thresholds"."supersedes_id" <> "thresholds"."id")
);

CREATE TABLE "activity_training_effects" (
	"profile_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"activity_analysis_revision" integer NOT NULL,
	"contract_version" text DEFAULT 'athlete-derived-state-persistence-v1' NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"planning_date" date NOT NULL,
	"source_revision" bigint NOT NULL,
	"calculation_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"common_load" numeric NOT NULL,
	"evidence_confidence" numeric NOT NULL,
	"capability_observation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_training_effects_activity_id_activity_analysis_revision_pk" PRIMARY KEY("activity_id","activity_analysis_revision"),
	CONSTRAINT "activity_training_effects_analysis_revision_check" CHECK ("activity_training_effects"."activity_analysis_revision" > 0),
	CONSTRAINT "activity_training_effects_source_revision_check" CHECK ("activity_training_effects"."source_revision" >= 0),
	CONSTRAINT "activity_training_effects_calculation_version_check" CHECK ("activity_training_effects"."calculation_version" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
	CONSTRAINT "activity_training_effects_input_fingerprint_check" CHECK ("activity_training_effects"."input_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "activity_training_effects_common_load_check" CHECK ("activity_training_effects"."common_load" >= 0 and "activity_training_effects"."common_load" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "activity_training_effects_confidence_check" CHECK ("activity_training_effects"."evidence_confidence" between 0 and 1 and "activity_training_effects"."evidence_confidence" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "activity_training_effects_capability_check" CHECK ("activity_training_effects"."capability_observation" is null or (jsonb_typeof("activity_training_effects"."capability_observation") = 'object' and pg_column_size("activity_training_effects"."capability_observation") <= 4096 and (("activity_training_effects"."capability_observation"->>'distanceMeters') is not null or ("activity_training_effects"."capability_observation"->>'durationMinutes') is not null)))
);

CREATE TABLE "daily_training_load" (
	"profile_id" uuid NOT NULL,
	"planning_date" date NOT NULL,
	"contract_version" text DEFAULT 'athlete-derived-state-persistence-v1' NOT NULL,
	"common_load" numeric NOT NULL,
	"fitness" numeric NOT NULL,
	"fatigue" numeric NOT NULL,
	"form" numeric NOT NULL,
	"readiness" numeric,
	"coverage_status" text NOT NULL,
	"contributing_activity_count" integer NOT NULL,
	"omitted_activity_count" integer NOT NULL,
	"source_revision" bigint NOT NULL,
	"calculation_version" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_training_load_profile_id_planning_date_source_revision_pk" PRIMARY KEY("profile_id","planning_date","source_revision"),
	CONSTRAINT "daily_training_load_common_load_check" CHECK ("daily_training_load"."common_load" >= 0 and "daily_training_load"."common_load" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "daily_training_load_state_check" CHECK ("daily_training_load"."fitness" >= 0 and "daily_training_load"."fatigue" >= 0 and abs("daily_training_load"."form" - ("daily_training_load"."fitness" - "daily_training_load"."fatigue")) <= 0.000000001 and "daily_training_load"."fitness" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and "daily_training_load"."fatigue" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and "daily_training_load"."form" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "daily_training_load_readiness_check" CHECK ("daily_training_load"."readiness" is null or ("daily_training_load"."readiness" between 0 and 100 and "daily_training_load"."readiness" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))),
	CONSTRAINT "daily_training_load_coverage_check" CHECK ("daily_training_load"."contributing_activity_count" >= 0 and (("daily_training_load"."coverage_status" = 'complete' and "daily_training_load"."omitted_activity_count" = 0) or ("daily_training_load"."coverage_status" = 'partial' and "daily_training_load"."omitted_activity_count" > 0))),
	CONSTRAINT "daily_training_load_source_revision_check" CHECK ("daily_training_load"."source_revision" >= 0),
	CONSTRAINT "daily_training_load_calculation_version_check" CHECK ("daily_training_load"."calculation_version" ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
);

CREATE TABLE "athlete_recalculation_queue" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"contract_version" text DEFAULT 'athlete-derived-state-persistence-v1' NOT NULL,
	"idempotency_key" text NOT NULL,
	"earliest_affected_at" timestamp with time zone NOT NULL,
	"earliest_affected_planning_date" date NOT NULL,
	"source_revision" bigint NOT NULL,
	"reasons" "athlete_recalculation_reason"[] NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_recalculation_queue_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "athlete_recalculation_queue_idempotency_check" CHECK ("athlete_recalculation_queue"."idempotency_key" = 'athlete-recalculation:' || "athlete_recalculation_queue"."profile_id"::text),
	CONSTRAINT "athlete_recalculation_queue_source_revision_check" CHECK ("athlete_recalculation_queue"."source_revision" >= 0)
);

CREATE TABLE "threshold_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"contract_version" text DEFAULT 'athlete-derived-state-persistence-v1' NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"metric" "threshold_metric" NOT NULL,
	"unit" text NOT NULL,
	"method" text NOT NULL,
	"value" numeric NOT NULL,
	"source_series_id" text NOT NULL,
	"source_series_metric" text NOT NULL,
	"start_timestamp_seconds" numeric NOT NULL,
	"end_timestamp_seconds" numeric NOT NULL,
	"exact_window_seconds" integer NOT NULL,
	"conversion_factor" numeric NOT NULL,
	"policy_version" text NOT NULL,
	"plausibility_version" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"calculation_version" text NOT NULL,
	"confidence" numeric NOT NULL,
	"status" "threshold_evidence_status" DEFAULT 'active' NOT NULL,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threshold_evidence_id_profile_activity_unique" UNIQUE("id","profile_id","activity_id"),
	CONSTRAINT "threshold_evidence_profile_category_activity_unique" UNIQUE("profile_id","activity_category","activity_id"),
	CONSTRAINT "threshold_evidence_value_check" CHECK ("threshold_evidence"."value" > 0 and "threshold_evidence"."value" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "threshold_evidence_source_series_id_check" CHECK (char_length(btrim("threshold_evidence"."source_series_id")) between 1 and 256),
	CONSTRAINT "threshold_evidence_window_check" CHECK ("threshold_evidence"."exact_window_seconds" > 0 and "threshold_evidence"."end_timestamp_seconds" = "threshold_evidence"."start_timestamp_seconds" + "threshold_evidence"."exact_window_seconds" and "threshold_evidence"."start_timestamp_seconds" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and "threshold_evidence"."end_timestamp_seconds" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "threshold_evidence_conversion_factor_check" CHECK ("threshold_evidence"."conversion_factor" > 0 and "threshold_evidence"."conversion_factor" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "threshold_evidence_calculation_version_check" CHECK ("threshold_evidence"."calculation_version" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
	CONSTRAINT "threshold_evidence_confidence_check" CHECK ("threshold_evidence"."confidence" between 0 and 1 and "threshold_evidence"."confidence" not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
	CONSTRAINT "threshold_evidence_lifecycle_check" CHECK (("threshold_evidence"."status" = 'active' and "threshold_evidence"."invalidated_at" is null) or ("threshold_evidence"."status" in ('superseded', 'deleted') and "threshold_evidence"."invalidated_at" >= "threshold_evidence"."observed_at"))
);

CREATE TABLE "planned_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"contract_version" text DEFAULT 'planned-session-v1' NOT NULL,
	"session_revision" integer DEFAULT 1 NOT NULL,
	"planning_date" date NOT NULL,
	"original_target_date" date NOT NULL,
	"source_kind" "planned_session_source_kind" NOT NULL,
	"idempotency_key" text NOT NULL,
	"direct_operation_id" text,
	"training_plan_id" uuid,
	"training_plan_revision" integer,
	"source_session_key" text,
	"series_id" uuid,
	"occurrence_key" date,
	"group_event_id" uuid,
	"activity_plan_id" uuid NOT NULL,
	"activity_plan_revision" integer NOT NULL,
	"prescription_structure" jsonb NOT NULL,
	"prescription_quantification" jsonb,
	"prescription_captured_at" timestamp with time zone NOT NULL,
	"status" "planned_session_status" DEFAULT 'scheduled' NOT NULL,
	"cancellation_reason" "planned_session_cancellation_reason",
	"cancelled_at" timestamp with time zone,
	"completed_activity_id" uuid,
	"completion_state" "planned_session_completion_state",
	"linked_at" timestamp with time zone,
	"completion_unlinked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_sessions_id_profile_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "planned_sessions_profile_idempotency_unique" UNIQUE("profile_id","idempotency_key"),
	CONSTRAINT "planned_sessions_revision_check" CHECK ("planned_sessions"."session_revision" > 0),
	CONSTRAINT "planned_sessions_idempotency_length_check" CHECK (char_length("planned_sessions"."idempotency_key") between 1 and 512),
	CONSTRAINT "planned_sessions_source_check" CHECK (("planned_sessions"."source_kind" = 'direct' and "planned_sessions"."direct_operation_id" ~ '^[A-Za-z0-9_-]{32,128}$' and "planned_sessions"."idempotency_key" = 'direct:' || "planned_sessions"."direct_operation_id" and num_nonnulls("planned_sessions"."training_plan_id", "planned_sessions"."training_plan_revision", "planned_sessions"."source_session_key", "planned_sessions"."series_id", "planned_sessions"."occurrence_key") = 0) or ("planned_sessions"."source_kind" = 'training_plan' and "planned_sessions"."training_plan_id" is not null and "planned_sessions"."training_plan_revision" > 0 and "planned_sessions"."source_session_key" is not null and char_length(btrim("planned_sessions"."source_session_key")) between 1 and 128 and "planned_sessions"."idempotency_key" = 'training-plan:' || "planned_sessions"."training_plan_id"::text || ':' || "planned_sessions"."training_plan_revision"::text || ':' || "planned_sessions"."source_session_key" and num_nonnulls("planned_sessions"."direct_operation_id", "planned_sessions"."series_id", "planned_sessions"."occurrence_key") = 0) or ("planned_sessions"."source_kind" = 'recurrence' and "planned_sessions"."series_id" is not null and "planned_sessions"."occurrence_key" is not null and "planned_sessions"."occurrence_key" = "planned_sessions"."original_target_date" and "planned_sessions"."idempotency_key" = 'recurrence:' || "planned_sessions"."series_id"::text || ':' || "planned_sessions"."occurrence_key"::text and num_nonnulls("planned_sessions"."direct_operation_id", "planned_sessions"."training_plan_id", "planned_sessions"."training_plan_revision", "planned_sessions"."source_session_key") = 0)),
	CONSTRAINT "planned_sessions_prescription_check" CHECK ("planned_sessions"."activity_plan_revision" > 0 and jsonb_typeof("planned_sessions"."prescription_structure") = 'object' and pg_column_size("planned_sessions"."prescription_structure") <= 1048576 and ("planned_sessions"."prescription_quantification" is null or (jsonb_typeof("planned_sessions"."prescription_quantification") = 'object' and pg_column_size("planned_sessions"."prescription_quantification") <= 262144))),
	CONSTRAINT "planned_sessions_lifecycle_check" CHECK (("planned_sessions"."status" = 'scheduled' and num_nonnulls("planned_sessions"."cancellation_reason", "planned_sessions"."cancelled_at", "planned_sessions"."completed_activity_id", "planned_sessions"."completion_state", "planned_sessions"."linked_at", "planned_sessions"."completion_unlinked_at") = 0) or ("planned_sessions"."status" = 'cancelled' and "planned_sessions"."cancellation_reason" is not null and "planned_sessions"."cancelled_at" is not null and num_nonnulls("planned_sessions"."completed_activity_id", "planned_sessions"."completion_state", "planned_sessions"."linked_at", "planned_sessions"."completion_unlinked_at") = 0) or ("planned_sessions"."status" = 'completed' and num_nonnulls("planned_sessions"."cancellation_reason", "planned_sessions"."cancelled_at") = 0 and (("planned_sessions"."completion_state" = 'linked' and "planned_sessions"."completed_activity_id" is not null and "planned_sessions"."linked_at" is not null and "planned_sessions"."completion_unlinked_at" is null) or ("planned_sessions"."completion_state" = 'activity_deleted' and "planned_sessions"."completed_activity_id" is null and "planned_sessions"."linked_at" is not null and "planned_sessions"."completion_unlinked_at" >= "planned_sessions"."linked_at")))),
	CONSTRAINT "planned_sessions_series_not_self_check" CHECK ("planned_sessions"."series_id" is null or "planned_sessions"."series_id" <> "planned_sessions"."id")
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_analysis_revisions" ADD CONSTRAINT "activity_analysis_revisions_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_artifact_links" ADD CONSTRAINT "activity_artifact_links_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_artifact_links" ADD CONSTRAINT "activity_artifact_links_artifact_profile_fkey" FOREIGN KEY ("artifact_id","profile_id") REFERENCES "public"."activity_artifacts"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_artifacts" ADD CONSTRAINT "activity_artifacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_exact_source_fkey" FOREIGN KEY ("segment_id","activity_id","profile_id","activity_category","source_artifact_id","source_revision") REFERENCES "public"."activity_segments"("id","activity_id","profile_id","activity_category","source_artifact_id","segment_revision") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "threshold_evaluations" ADD CONSTRAINT "threshold_evaluations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "threshold_evaluations" ADD CONSTRAINT "threshold_evaluations_source_activity_profile_fkey" FOREIGN KEY ("source_activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "threshold_evaluation_efforts" ADD CONSTRAINT "threshold_evaluation_efforts_evaluation_ownership_fkey" FOREIGN KEY ("evaluation_id","profile_id","activity_category","metric") REFERENCES "public"."threshold_evaluations"("id","profile_id","activity_category","metric") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "threshold_evaluation_efforts" ADD CONSTRAINT "threshold_evaluation_efforts_effort_ownership_fkey" FOREIGN KEY ("effort_id","profile_id","activity_id","activity_category","effort_type","source_series","source_revision") REFERENCES "public"."activity_efforts"("id","profile_id","activity_id","activity_category","effort_type","source_series","source_revision") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_qualified_evaluation_ownership_fkey" FOREIGN KEY ("evaluation_id","profile_id","activity_category","metric","evaluation_outcome") REFERENCES "public"."threshold_evaluations"("id","profile_id","activity_category","metric","outcome") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_supersedes_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."thresholds"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_artifact_profile_fkey" FOREIGN KEY ("artifact_id","profile_id") REFERENCES "public"."activity_artifacts"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_integration_profile_fkey" FOREIGN KEY ("integration_id","profile_id") REFERENCES "public"."integrations"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_training_effects" ADD CONSTRAINT "activity_training_effects_analysis_revision_fkey" FOREIGN KEY ("activity_id","profile_id","activity_analysis_revision") REFERENCES "public"."activity_analysis_revisions"("activity_id","profile_id","revision") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "daily_training_load" ADD CONSTRAINT "daily_training_load_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "athlete_recalculation_queue" ADD CONSTRAINT "athlete_recalculation_queue_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "threshold_evidence" ADD CONSTRAINT "threshold_evidence_activity_owner_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_series_owner_fkey" FOREIGN KEY ("series_id","profile_id") REFERENCES "public"."planned_sessions"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_completed_activity_owner_fkey" FOREIGN KEY ("completed_activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_group_event_fkey" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_route_deletion_receipts" ADD CONSTRAINT "activity_route_deletion_receipts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_source_link_fkey" FOREIGN KEY ("activity_id","source_artifact_id","profile_id") REFERENCES "public"."activity_artifact_links"("activity_id","artifact_id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_session_rpe_evidence" ADD CONSTRAINT "activity_session_rpe_evidence_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_session_rpe_evidence" ADD CONSTRAINT "activity_session_rpe_evidence_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_session_rpe_evidence" ADD CONSTRAINT "activity_session_rpe_evidence_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_session_rpe_evidence" ADD CONSTRAINT "activity_session_rpe_evidence_correction_same_activity_profile_fkey" FOREIGN KEY ("correction_of_id","activity_id","profile_id") REFERENCES "public"."activity_session_rpe_evidence"("id","activity_id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "athlete_consent_policy_versions" ADD CONSTRAINT "athlete_consent_policy_versions_supersedes_scope_fkey" FOREIGN KEY ("supersedes_policy_version_id","scope_key") REFERENCES "public"."athlete_consent_policy_versions"("id","scope_key") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "athlete_data_sharing_consents" ADD CONSTRAINT "athlete_data_sharing_consents_engagement_fkey" FOREIGN KEY ("organization_id","engagement_id","athlete_profile_id") REFERENCES "public"."coaching_engagements"("organization_id","id","athlete_profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "athlete_data_sharing_consents" ADD CONSTRAINT "athlete_data_sharing_consents_policy_scope_fkey" FOREIGN KEY ("policy_version_id","scope_key") REFERENCES "public"."athlete_consent_policy_versions"("id","scope_key") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "athlete_data_sharing_consents" ADD CONSTRAINT "athlete_data_sharing_consents_successor_fkey" FOREIGN KEY ("organization_id","engagement_id","athlete_profile_id","scope_key","superseded_by_consent_id") REFERENCES "public"."athlete_data_sharing_consents"("organization_id","engagement_id","athlete_profile_id","scope_key","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_engagement_fkey" FOREIGN KEY ("organization_id","engagement_id") REFERENCES "public"."coaching_engagements"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_membership_fkey" FOREIGN KEY ("organization_id","coach_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "coaching_engagements" ADD CONSTRAINT "coaching_engagements_athlete_profile_id_profiles_id_fk" FOREIGN KEY ("athlete_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "coaching_engagements" ADD CONSTRAINT "coaching_engagements_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "comments" ADD CONSTRAINT "comments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_grantee_profile_id_profiles_id_fk" FOREIGN KEY ("grantee_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_linked_activity_id_activities_id_fk" FOREIGN KEY ("linked_activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_profiles_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_group_event_id_group_events_id_fk" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_series_rsvps" ADD CONSTRAINT "group_event_series_rsvps_group_event_series_id_group_events_id_fk" FOREIGN KEY ("group_event_series_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_series_rsvps" ADD CONSTRAINT "group_event_series_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_series_id_group_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_profile_id_profiles_id_fk" FOREIGN KEY ("invited_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "likes" ADD CONSTRAINT "likes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_actor_membership_fkey" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_actor_identity_fkey" FOREIGN KEY ("organization_id","actor_membership_id","actor_profile_id") REFERENCES "public"."organization_memberships"("organization_id","id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_membership_role_grants" ADD CONSTRAINT "organization_membership_role_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_membership_role_grants" ADD CONSTRAINT "organization_membership_role_grants_membership_fkey" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_root_owner_membership_fkey" FOREIGN KEY ("id","root_owner_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_inviter_fkey" FOREIGN KEY ("organization_id","invited_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_profile_fkey" FOREIGN KEY ("invited_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_profile_fkey" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_declined_by_profile_id_profiles_id_fk" FOREIGN KEY ("declined_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_closer_fkey" FOREIGN KEY ("organization_id","closed_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_creator_fkey" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_archiver_fkey" FOREIGN KEY ("organization_id","archived_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_ender_fkey" FOREIGN KEY ("organization_id","ended_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_ender_fkey" FOREIGN KEY ("organization_id","ended_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_group_fkey" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."organization_groups"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_engagement_fkey" FOREIGN KEY ("organization_id","engagement_id") REFERENCES "public"."coaching_engagements"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_actor_fkey" FOREIGN KEY ("organization_id","added_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_group_fkey" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."organization_groups"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_coach_fkey" FOREIGN KEY ("organization_id","coach_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_actor_fkey" FOREIGN KEY ("organization_id","assigned_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "profile_goals" ADD CONSTRAINT "profile_goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_reference_activity_id_activities_id_fk" FOREIGN KEY ("reference_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "profile_athlete_state" ADD CONSTRAINT "profile_athlete_state_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "profile_performance_estimates" ADD CONSTRAINT "profile_performance_estimates_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_import_runs" ADD CONSTRAINT "activity_import_runs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_import_runs" ADD CONSTRAINT "activity_import_runs_integration_profile_fkey" FOREIGN KEY ("integration_id","profile_id") REFERENCES "public"."integrations"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_import_runs" ADD CONSTRAINT "activity_import_runs_superseded_by_run_id_activity_import_runs_id_fk" FOREIGN KEY ("superseded_by_run_id") REFERENCES "public"."activity_import_runs"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_integration_profile_fkey" FOREIGN KEY ("integration_id","profile_id") REFERENCES "public"."integrations"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_references_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_refs_last_import_run_profile_fk" FOREIGN KEY ("last_import_run_id","profile_id") REFERENCES "public"."activity_import_runs"("id","profile_id") ON DELETE set null ("last_import_run_id") ON UPDATE no action;
ALTER TABLE "activity_source_references" ADD CONSTRAINT "activity_source_refs_material_import_run_profile_fk" FOREIGN KEY ("last_material_import_run_id","profile_id") REFERENCES "public"."activity_import_runs"("id","profile_id") ON DELETE set null ("last_material_import_run_id") ON UPDATE no action;
ALTER TABLE "profile_training_settings" ADD CONSTRAINT "profile_training_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_import_run_profile_fkey" FOREIGN KEY ("import_run_id","profile_id") REFERENCES "public"."activity_import_runs"("id","profile_id") ON DELETE set null ("import_run_id") ON UPDATE no action;
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_job_id_provider_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provider_sync_jobs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");
CREATE UNIQUE INDEX "accounts_issuer_accountId_uidx" ON "accounts" USING btree ("issuer","account_id");
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");
CREATE INDEX "idx_activities_activity_plan" ON "activities" USING btree ("activity_plan_id") WHERE "activities"."activity_plan_id" is not null;
CREATE INDEX "idx_activities_route" ON "activities" USING btree ("route_id") WHERE "activities"."route_id" is not null;
CREATE INDEX "idx_activities_profile_started" ON "activities" USING btree ("profile_id","started_at");
CREATE INDEX "idx_activities_athlete_state_replay" ON "activities" USING btree ("profile_id","finished_at","id") WHERE "athlete_state_common_load" is not null and "athlete_state_activity_category" is not null and "athlete_state_evidence_confidence" is not null and "athlete_state_input_version" is not null and "athlete_state_computed_at" is not null;
CREATE INDEX "idx_activities_started" ON "activities" USING btree ("started_at");
CREATE INDEX "idx_activities_content_visibility" ON "activities" USING btree ("content_visibility");
CREATE INDEX "idx_activity_analysis_revisions_selection" ON "activity_analysis_revisions" USING btree ("profile_id","activity_id","source_segments_revision","revision");
CREATE INDEX "idx_activity_artifact_links_artifact" ON "activity_artifact_links" USING btree ("artifact_id");
CREATE INDEX "idx_activity_artifacts_profile" ON "activity_artifacts" USING btree ("profile_id");
CREATE INDEX "idx_activity_efforts_activity_id" ON "activity_efforts" USING btree ("activity_id");
CREATE INDEX "idx_activity_efforts_segment_id" ON "activity_efforts" USING btree ("segment_id");
CREATE INDEX "idx_activity_efforts_source_revision" ON "activity_efforts" USING btree ("activity_id","source_revision","source_artifact_id");
CREATE INDEX "idx_activity_efforts_athlete_state_replay" ON "activity_efforts" USING btree ("profile_id","id");
CREATE INDEX "idx_activity_file_ingestions_activity_profile" ON "activity_file_ingestions" USING btree ("activity_id","profile_id") WHERE "activity_file_ingestions"."activity_id" is not null;
CREATE INDEX "idx_activity_file_ingestions_artifact_id" ON "activity_file_ingestions" USING btree ("artifact_id") WHERE "activity_file_ingestions"."artifact_id" is not null;
CREATE INDEX "idx_activity_file_ingestions_profile_id" ON "activity_file_ingestions" USING btree ("profile_id");
CREATE INDEX "idx_activity_file_ingestions_profile_status_updated" ON "activity_file_ingestions" USING btree ("profile_id","status","updated_at");
CREATE INDEX "idx_activity_file_ingestions_provider_external" ON "activity_file_ingestions" USING btree ("provider","external_id") WHERE "activity_file_ingestions"."provider" is not null and "activity_file_ingestions"."external_id" is not null;
CREATE UNIQUE INDEX "activity_file_ingestions_profile_operation_unique" ON "activity_file_ingestions" USING btree ("profile_id","operation_id");
CREATE INDEX "activity_training_effects_rebuild_idx" ON "activity_training_effects" USING btree ("profile_id","effective_at","activity_id","activity_analysis_revision");
CREATE INDEX "activity_training_effects_profile_planning_date_idx" ON "activity_training_effects" USING btree ("profile_id","planning_date");
CREATE INDEX "daily_training_load_revision_range_idx" ON "daily_training_load" USING btree ("profile_id","source_revision","planning_date");
CREATE INDEX "athlete_recalculation_queue_pending_idx" ON "athlete_recalculation_queue" USING btree ("requested_at","profile_id");
CREATE INDEX "threshold_evidence_active_profile_observed_idx" ON "threshold_evidence" USING btree ("profile_id","observed_at","id") WHERE "threshold_evidence"."status" = 'active';
CREATE INDEX "threshold_evidence_activity_idx" ON "threshold_evidence" USING btree ("activity_id","id");
CREATE INDEX "threshold_evidence_profile_identity_observed_idx" ON "threshold_evidence" USING btree ("profile_id","activity_category","metric","observed_at","id");
CREATE INDEX "planned_sessions_profile_date_idx" ON "planned_sessions" USING btree ("profile_id","planning_date","id");
CREATE INDEX "planned_sessions_profile_status_date_idx" ON "planned_sessions" USING btree ("profile_id","status","planning_date","id");
CREATE INDEX "planned_sessions_training_plan_idx" ON "planned_sessions" USING btree ("training_plan_id","profile_id") WHERE "planned_sessions"."training_plan_id" is not null;
CREATE INDEX "planned_sessions_activity_plan_idx" ON "planned_sessions" USING btree ("activity_plan_id");
CREATE UNIQUE INDEX "planned_sessions_profile_group_event_unique" ON "planned_sessions" USING btree ("profile_id","group_event_id") WHERE "planned_sessions"."group_event_id" is not null;
CREATE INDEX "planned_sessions_completed_activity_idx" ON "planned_sessions" USING btree ("completed_activity_id") WHERE "planned_sessions"."completed_activity_id" is not null;
CREATE UNIQUE INDEX "planned_sessions_series_occurrence_unique" ON "planned_sessions" USING btree ("series_id","occurrence_key") WHERE "planned_sessions"."series_id" is not null;
CREATE INDEX "idx_activity_plans_profile_id" ON "activity_plans" USING btree ("profile_id") WHERE "activity_plans"."profile_id" is not null;
CREATE INDEX "idx_activity_plans_system_templates" ON "activity_plans" USING btree ("is_system_template") WHERE "activity_plans"."is_system_template" = true;
CREATE INDEX "idx_activity_plans_content_visibility" ON "activity_plans" USING btree ("content_visibility");
CREATE INDEX "idx_activity_plans_structure_categories" ON "activity_plans" USING gin ("structure" jsonb_path_ops);
CREATE UNIQUE INDEX "activity_plans_system_content_key_unique" ON "activity_plans" USING btree ("system_content_key") WHERE "activity_plans"."system_content_key" is not null;
CREATE INDEX "idx_routes_profile_id" ON "activity_routes" USING btree ("profile_id") WHERE "activity_routes"."profile_id" is not null;
CREATE INDEX "idx_routes_name" ON "activity_routes" USING btree ("name");
CREATE INDEX "idx_routes_created_at" ON "activity_routes" USING btree ("created_at");
CREATE INDEX "idx_routes_profile_storage_state" ON "activity_routes" USING btree ("profile_id","storage_state");
CREATE INDEX "idx_activity_route_deletion_receipts_profile" ON "activity_route_deletion_receipts" USING btree ("profile_id");
CREATE INDEX "idx_routes_is_system_template" ON "activity_routes" USING btree ("is_system_template") WHERE "activity_routes"."is_system_template" = true;
CREATE INDEX "idx_activity_segments_category" ON "activity_segments" USING btree ("activity_category") WHERE "activity_segments"."activity_category" is not null;
CREATE UNIQUE INDEX "activity_session_rpe_evidence_profile_operation_unique" ON "activity_session_rpe_evidence" USING btree ("profile_id","operation_id");
CREATE UNIQUE INDEX "activity_session_rpe_evidence_one_replacement_per_evidence_unique" ON "activity_session_rpe_evidence" USING btree ("correction_of_id") WHERE "activity_session_rpe_evidence"."correction_of_id" is not null;
CREATE UNIQUE INDEX "activity_session_rpe_evidence_one_root_per_activity_profile_unique" ON "activity_session_rpe_evidence" USING btree ("activity_id","profile_id") WHERE "activity_session_rpe_evidence"."correction_of_id" is null;
CREATE INDEX "idx_activity_session_rpe_evidence_activity_recorded" ON "activity_session_rpe_evidence" USING btree ("activity_id","recorded_at","id") WHERE "activity_session_rpe_evidence"."correction_of_id" is null;
CREATE INDEX "idx_api_rate_limit_windows_expiry" ON "api_rate_limit_windows" USING btree ("expires_at");
CREATE INDEX "athlete_consent_policy_versions_supersedes_scope_fkey_idx" ON "athlete_consent_policy_versions" USING btree ("supersedes_policy_version_id","scope_key");
CREATE UNIQUE INDEX "athlete_data_sharing_consents_current_unique" ON "athlete_data_sharing_consents" USING btree ("organization_id","engagement_id","athlete_profile_id","scope_key") WHERE "athlete_data_sharing_consents"."ended_at" is null;
CREATE INDEX "athlete_data_sharing_consents_policy_scope_idx" ON "athlete_data_sharing_consents" USING btree ("policy_version_id","scope_key");
CREATE INDEX "athlete_data_sharing_consents_successor_idx" ON "athlete_data_sharing_consents" USING btree ("superseded_by_consent_id") WHERE "athlete_data_sharing_consents"."superseded_by_consent_id" is not null;
CREATE INDEX "athlete_data_sharing_consents_engagement_fkey_idx" ON "athlete_data_sharing_consents" USING btree ("organization_id","engagement_id","athlete_profile_id");
CREATE INDEX "athlete_data_sharing_consents_successor_fkey_idx" ON "athlete_data_sharing_consents" USING btree ("organization_id","engagement_id","athlete_profile_id","scope_key","superseded_by_consent_id");
CREATE UNIQUE INDEX "coaching_assignments_active_primary_unique" ON "coaching_assignments" USING btree ("engagement_id") WHERE "coaching_assignments"."assignment_kind" = 'primary' and "coaching_assignments"."ended_at" is null;
CREATE UNIQUE INDEX "coaching_assignments_active_kind_unique" ON "coaching_assignments" USING btree ("engagement_id","coach_membership_id","assignment_kind") WHERE "coaching_assignments"."ended_at" is null;
CREATE INDEX "coaching_assignments_active_coach_membership_idx" ON "coaching_assignments" USING btree ("organization_id","coach_membership_id") WHERE "coaching_assignments"."ended_at" is null;
CREATE INDEX "coaching_assignments_engagement_fkey_idx" ON "coaching_assignments" USING btree ("organization_id","engagement_id");
CREATE INDEX "coaching_assignments_membership_fkey_idx" ON "coaching_assignments" USING btree ("organization_id","coach_membership_id");
CREATE UNIQUE INDEX "coaching_engagements_current_unique" ON "coaching_engagements" USING btree ("organization_id","athlete_profile_id") WHERE "coaching_engagements"."ended_at" is null;
CREATE INDEX "coaching_engagements_athlete_profile_organization_idx" ON "coaching_engagements" USING btree ("athlete_profile_id","organization_id");
CREATE INDEX "idx_comments_entity" ON "comments" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_comments_profile_id" ON "comments" USING btree ("profile_id","created_at");
CREATE INDEX "idx_comments_created_at" ON "comments" USING btree ("created_at");
CREATE UNIQUE INDEX "content_access_grants_source_unique" ON "content_access_grants" USING btree ("content_type","content_id","grantee_profile_id","access_level","source_type","source_id");
CREATE INDEX "idx_content_access_grants_grantee_content" ON "content_access_grants" USING btree ("grantee_profile_id","content_type","content_id");
CREATE INDEX "idx_content_access_grants_source" ON "content_access_grants" USING btree ("source_type","source_id");
CREATE INDEX "idx_content_access_grants_active_expiry" ON "content_access_grants" USING btree ("expires_at") WHERE "content_access_grants"."expires_at" is not null and "content_access_grants"."revoked_at" is null;
CREATE INDEX "idx_content_access_grants_actor_profile_id" ON "content_access_grants" USING btree ("actor_profile_id") WHERE "content_access_grants"."actor_profile_id" is not null;
CREATE INDEX "idx_conversation_participants_user_id" ON "conversation_participants" USING btree ("user_id");
CREATE UNIQUE INDEX "idx_events_series_occurrence_unique" ON "events" USING btree ("series_id","occurrence_key") WHERE "events"."series_id" is not null;
CREATE INDEX "idx_events_training_plan_id" ON "events" USING btree ("training_plan_id") WHERE "events"."training_plan_id" is not null;
CREATE INDEX "idx_events_activity_plan_id" ON "events" USING btree ("activity_plan_id") WHERE "events"."activity_plan_id" is not null;
CREATE INDEX "idx_events_linked_activity_id" ON "events" USING btree ("linked_activity_id") WHERE "events"."linked_activity_id" is not null;
CREATE INDEX "idx_events_route_id" ON "events" USING btree ("route_id") WHERE "events"."route_id" is not null;
CREATE INDEX "idx_events_schedule_batch" ON "events" USING btree ("profile_id","schedule_batch_id") WHERE "events"."schedule_batch_id" is not null;
CREATE INDEX "idx_events_event_type_starts_at" ON "events" USING btree ("event_type","starts_at");
CREATE INDEX "idx_events_profile_starts_at" ON "events" USING btree ("profile_id","starts_at");
CREATE INDEX "idx_events_profile_status_starts_at" ON "events" USING btree ("profile_id","status","starts_at");
CREATE INDEX "idx_events_planned_day_summary" ON "events" USING btree ("profile_id","scheduled_date","starts_at","id","activity_plan_id") WHERE "events"."event_type" = 'planned' and "events"."status" in ('scheduled', 'completed');
CREATE INDEX "idx_follows_following_id" ON "follows" USING btree ("following_id");
CREATE INDEX "group_events_group_starts_at_idx" ON "group_events" USING btree ("group_id","starts_at");
CREATE INDEX "group_events_group_cancelled_starts_at_idx" ON "group_events" USING btree ("group_id","cancelled_at","starts_at");
CREATE UNIQUE INDEX "group_events_series_occurrence_unique_idx" ON "group_events" USING btree ("series_id","occurrence_key") WHERE "group_events"."series_id" is not null;
CREATE INDEX "group_events_series_starts_at_idx" ON "group_events" USING btree ("series_id","starts_at") WHERE "group_events"."series_id" is not null;
CREATE INDEX "idx_group_events_created_by_profile_id" ON "group_events" USING btree ("created_by_profile_id") WHERE "group_events"."created_by_profile_id" is not null;
CREATE INDEX "idx_group_events_route_id" ON "group_events" USING btree ("route_id") WHERE "group_events"."route_id" is not null;
CREATE INDEX "idx_group_events_activity_plan_id" ON "group_events" USING btree ("activity_plan_id") WHERE "group_events"."activity_plan_id" is not null;
CREATE INDEX "group_invitations_invited_profile_status_idx" ON "group_invitations" USING btree ("invited_profile_id","status");
CREATE UNIQUE INDEX "group_invitations_pending_profile_unique_idx" ON "group_invitations" USING btree ("group_id","invited_profile_id") WHERE "group_invitations"."status" = 'pending';
CREATE INDEX "group_join_requests_group_status_idx" ON "group_join_requests" USING btree ("group_id","status");
CREATE INDEX "idx_group_join_requests_profile_id" ON "group_join_requests" USING btree ("profile_id");
CREATE UNIQUE INDEX "group_join_requests_pending_unique_idx" ON "group_join_requests" USING btree ("group_id","profile_id") WHERE "group_join_requests"."status" = 'pending';
CREATE INDEX "group_memberships_profile_status_idx" ON "group_memberships" USING btree ("profile_id","status");
CREATE INDEX "group_memberships_group_status_idx" ON "group_memberships" USING btree ("group_id","status");
CREATE UNIQUE INDEX "groups_slug_unique_idx" ON "groups" USING btree ("slug") WHERE "groups"."deleted_at" is null;
CREATE INDEX "groups_created_at_idx" ON "groups" USING btree ("created_at" DESC NULLS LAST) WHERE "groups"."deleted_at" is null;
CREATE INDEX "idx_groups_created_by_profile_id" ON "groups" USING btree ("created_by_profile_id");
CREATE INDEX "idx_integration_credentials_expires_at" ON "integration_credentials" USING btree ("expires_at");
CREATE INDEX "idx_integration_resource_links_profile" ON "integration_resource_links" USING btree ("profile_id");
CREATE INDEX "idx_integration_resource_links_integration" ON "integration_resource_links" USING btree ("integration_id");
CREATE INDEX "idx_integration_resource_links_internal" ON "integration_resource_links" USING btree ("resource_kind","internal_resource_id");
CREATE INDEX "idx_integration_resource_links_provider_external" ON "integration_resource_links" USING btree ("provider","external_id");
CREATE UNIQUE INDEX "integrations_provider_external_id_unique" ON "integrations" USING btree ("provider","external_id") WHERE "integrations"."external_id" is not null;
CREATE INDEX "idx_integrations_profile_id" ON "integrations" USING btree ("profile_id");
CREATE INDEX "idx_integrations_external_id" ON "integrations" USING btree ("external_id");
CREATE INDEX "idx_integrations_provider" ON "integrations" USING btree ("provider");
CREATE INDEX "idx_likes_entity" ON "likes" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");
CREATE INDEX "idx_messages_sender_id" ON "messages" USING btree ("sender_id");
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");
CREATE INDEX "idx_notifications_actor_id" ON "notifications" USING btree ("actor_id");
CREATE INDEX "idx_notifications_read_at" ON "notifications" USING btree ("read_at");
CREATE INDEX "idx_oauth_states_expires_at" ON "oauth_states" USING btree ("expires_at");
CREATE INDEX "idx_oauth_states_profile_id" ON "oauth_states" USING btree ("profile_id");
CREATE INDEX "organization_audit_events_organization_occurred_idx" ON "organization_audit_events" USING btree ("organization_id","occurred_at");
CREATE INDEX "organization_audit_events_actor_membership_idx" ON "organization_audit_events" USING btree ("organization_id","actor_membership_id") WHERE "organization_audit_events"."actor_membership_id" is not null;
CREATE INDEX "organization_audit_events_actor_membership_fkey_idx" ON "organization_audit_events" USING btree ("organization_id","actor_membership_id");
CREATE INDEX "organization_audit_events_actor_identity_fkey_idx" ON "organization_audit_events" USING btree ("organization_id","actor_membership_id","actor_profile_id");
CREATE UNIQUE INDEX "organization_audit_events_correlation_action_unique" ON "organization_audit_events" USING btree ("organization_id","correlation_id","action") WHERE "organization_audit_events"."correlation_id" is not null;
CREATE UNIQUE INDEX "organization_membership_role_grants_active_unique" ON "organization_membership_role_grants" USING btree ("organization_id","membership_id","role_key") WHERE "organization_membership_role_grants"."revoked_at" is null;
CREATE INDEX "organization_membership_role_grants_membership_fkey_idx" ON "organization_membership_role_grants" USING btree ("organization_id","membership_id");
CREATE INDEX "organization_memberships_active_profile_idx" ON "organization_memberships" USING btree ("profile_id","organization_id") WHERE "organization_memberships"."suspended_at" is null and "organization_memberships"."ended_at" is null;
CREATE INDEX "organization_memberships_active_organization_idx" ON "organization_memberships" USING btree ("organization_id","id") WHERE "organization_memberships"."suspended_at" is null and "organization_memberships"."ended_at" is null;
CREATE UNIQUE INDEX "organizations_slug_unique_idx" ON "organizations" USING btree ("slug");
CREATE INDEX "organizations_created_by_profile_id_idx" ON "organizations" USING btree ("created_by_profile_id");
CREATE UNIQUE INDEX "organization_invitations_token_digest_unique" ON "organization_invitations" USING btree ("token_digest");
CREATE INDEX "organization_invitations_pending_recipient_idx" ON "organization_invitations" USING btree ("organization_id","invited_profile_id") WHERE "organization_invitations"."status" = 'pending' and "organization_invitations"."invited_profile_id" is not null;
CREATE INDEX "organization_groups_active_organization_idx" ON "organization_groups" USING btree ("organization_id","id") WHERE "organization_groups"."archived_at" is null;
CREATE UNIQUE INDEX "organization_group_athletes_current_unique" ON "organization_group_athletes" USING btree ("group_id","engagement_id") WHERE "organization_group_athletes"."ended_at" is null;
CREATE INDEX "organization_group_athletes_active_engagement_idx" ON "organization_group_athletes" USING btree ("organization_id","engagement_id") WHERE "organization_group_athletes"."ended_at" is null;
CREATE UNIQUE INDEX "organization_group_coach_assignments_current_unique" ON "organization_group_coach_assignments" USING btree ("group_id","coach_membership_id") WHERE "organization_group_coach_assignments"."ended_at" is null;
CREATE INDEX "organization_group_coach_assignments_active_coach_idx" ON "organization_group_coach_assignments" USING btree ("organization_id","coach_membership_id") WHERE "organization_group_coach_assignments"."ended_at" is null;
CREATE INDEX "idx_profile_goals_profile_id" ON "profile_goals" USING btree ("profile_id");
CREATE INDEX "idx_profile_metrics_profile" ON "profile_metrics" USING btree ("profile_id","recorded_at");
CREATE INDEX "idx_profile_metrics_recorded_at" ON "profile_metrics" USING btree ("recorded_at");
CREATE INDEX "idx_profile_metrics_reference_activity" ON "profile_metrics" USING btree ("reference_activity_id") WHERE "profile_metrics"."reference_activity_id" is not null;
CREATE INDEX "idx_profile_metrics_temporal_lookup" ON "profile_metrics" USING btree ("profile_id","metric_type","recorded_at");
CREATE INDEX "profile_athlete_state_claim_idx" ON "profile_athlete_state" USING btree ("retry_after","dirty_from_at","updated_at");
CREATE INDEX "profile_performance_estimates_profile_revision_idx" ON "profile_performance_estimates" USING btree ("profile_id","source_revision");
CREATE INDEX "threshold_evaluations_profile_identity_observed_idx" ON "threshold_evaluations" USING btree ("profile_id","activity_category","metric","observed_at" DESC NULLS LAST,"id");
CREATE INDEX "threshold_evaluations_source_revision_idx" ON "threshold_evaluations" USING btree ("source_activity_id","source_revision","id");
CREATE INDEX "threshold_evaluation_efforts_effort_evaluation_idx" ON "threshold_evaluation_efforts" USING btree ("effort_id","evaluation_id");
CREATE INDEX "threshold_evaluation_efforts_activity_evaluation_idx" ON "threshold_evaluation_efforts" USING btree ("activity_id","source_revision","evaluation_id");
CREATE INDEX "thresholds_profile_identity_effective_idx" ON "thresholds" USING btree ("profile_id","activity_category","metric","effective_at" DESC NULLS LAST,"id");
CREATE UNIQUE INDEX "thresholds_identity_root_unique" ON "thresholds" USING btree ("profile_id","activity_category","metric") WHERE "thresholds"."supersedes_id" is null;
CREATE INDEX "thresholds_supersedes_idx" ON "thresholds" USING btree ("supersedes_id") WHERE "thresholds"."supersedes_id" is not null;
CREATE INDEX "activity_import_runs_profile_status_updated_idx" ON "activity_import_runs" USING btree ("profile_id","status","updated_at");
CREATE INDEX "activity_import_runs_integration_status_updated_idx" ON "activity_import_runs" USING btree ("integration_id","status","updated_at") WHERE "activity_import_runs"."integration_id" is not null;
CREATE UNIQUE INDEX "activity_import_runs_running_bulk_profile_unique" ON "activity_import_runs" USING btree ("profile_id") WHERE "activity_import_runs"."status" = 'running' and "activity_import_runs"."kind" in ('onboarding', 'history_sync', 'manual_sync');
CREATE UNIQUE INDEX "activity_source_references_origin_unique" ON "activity_source_references" USING btree ("profile_id","origin_provider","origin_external_id") WHERE "activity_source_references"."origin_provider" is not null and "activity_source_references"."origin_external_id" is not null;
CREATE UNIQUE INDEX "activity_source_references_artifact_unique" ON "activity_source_references" USING btree ("profile_id","artifact_sha256") WHERE "activity_source_references"."artifact_sha256" is not null;
CREATE INDEX "activity_source_references_activity_idx" ON "activity_source_references" USING btree ("activity_id");
CREATE INDEX "activity_source_references_integration_idx" ON "activity_source_references" USING btree ("integration_id");
CREATE INDEX "activity_source_references_import_run_idx" ON "activity_source_references" USING btree ("last_import_run_id") WHERE "activity_source_references"."last_import_run_id" is not null;
CREATE INDEX "activity_source_references_material_import_run_idx" ON "activity_source_references" USING btree ("last_material_import_run_id") WHERE "activity_source_references"."last_material_import_run_id" is not null;
CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "profiles" USING btree ("username");
CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "profiles" USING btree ("email") WHERE "profiles"."email" is not null;
CREATE UNIQUE INDEX "provider_sync_jobs_queue_sequence_key" ON "provider_sync_jobs" USING btree ("queue_sequence");
CREATE INDEX "idx_provider_sync_jobs_status_run_at_priority" ON "provider_sync_jobs" USING btree ("status","run_at","priority");
CREATE INDEX "idx_provider_sync_jobs_provider_profile_status" ON "provider_sync_jobs" USING btree ("provider","profile_id","status");
CREATE INDEX "idx_provider_sync_jobs_dedupe_key" ON "provider_sync_jobs" USING btree ("dedupe_key");
CREATE INDEX "idx_provider_sync_jobs_lane_status" ON "provider_sync_jobs" USING btree ("sync_lane_key","status","run_at");
CREATE INDEX "idx_provider_sync_jobs_integration_id" ON "provider_sync_jobs" USING btree ("integration_id");
CREATE INDEX "idx_provider_sync_jobs_import_run_id" ON "provider_sync_jobs" USING btree ("import_run_id") WHERE "provider_sync_jobs"."import_run_id" is not null;
CREATE INDEX "idx_provider_sync_jobs_integration_generation_status" ON "provider_sync_jobs" USING btree ("integration_id","integration_generation","status");
CREATE INDEX "idx_provider_sync_jobs_profile_id" ON "provider_sync_jobs" USING btree ("profile_id");
CREATE INDEX "idx_provider_sync_jobs_supersedes_job_id" ON "provider_sync_jobs" USING btree ("supersedes_job_id") WHERE "provider_sync_jobs"."supersedes_job_id" is not null;
CREATE INDEX "idx_provider_sync_state_provider_next_sync" ON "provider_sync_state" USING btree ("provider","next_sync_at");
CREATE INDEX "idx_provider_webhook_receipts_provider_status" ON "provider_webhook_receipts" USING btree ("provider","processing_status");
CREATE INDEX "idx_provider_webhook_receipts_job_id" ON "provider_webhook_receipts" USING btree ("job_id");
CREATE INDEX "idx_provider_webhook_receipts_integration_id" ON "provider_webhook_receipts" USING btree ("integration_id") WHERE "provider_webhook_receipts"."integration_id" is not null;
CREATE INDEX "idx_provider_webhook_receipts_integration_generation_status" ON "provider_webhook_receipts" USING btree ("integration_id","integration_generation","processing_status") WHERE "provider_webhook_receipts"."integration_id" is not null;
CREATE INDEX "idx_training_plans_profile_id" ON "training_plans" USING btree ("profile_id") WHERE "training_plans"."profile_id" is not null;
CREATE INDEX "idx_training_plans_is_system_template" ON "training_plans" USING btree ("is_system_template") WHERE "training_plans"."is_system_template" = true;
CREATE INDEX "idx_training_plans_name" ON "training_plans" USING btree ("name");
CREATE INDEX "idx_training_plans_content_visibility" ON "training_plans" USING btree ("content_visibility");
CREATE UNIQUE INDEX "training_plans_system_content_key_unique" ON "training_plans" USING btree ("system_content_key") WHERE "training_plans"."system_content_key" is not null;


CREATE OR REPLACE FUNCTION "public"."activity_artifact_content_path"("target_profile_id" "uuid", "target_digest" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select 'artifacts/sha256/'||target_profile_id::text||'/'||target_digest
$$;

CREATE OR REPLACE FUNCTION "public"."activity_parent_segment_set_constraint_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.validate_activity_segment_set(new.id);
  return null;
end $$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_duration_is_canonical"("input" "jsonb", "rest_only" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select case input ->> 'type'
    when 'time' then public.activity_plan_jsonb_has_exact_keys(input, array['type', 'seconds'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'seconds', 1, 86400)
    when 'distance' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type', 'meters'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'meters', 1, 1000000)
    when 'repetitions' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type', 'count'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'count', 1, 10000)
    when 'untilFinished' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type'])
    else false
  end
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_has_exact_keys"("input" "jsonb", "required_keys" "text"[], "optional_keys" "text"[] DEFAULT '{}'::"text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select pg_catalog.jsonb_typeof(input) = 'object'
    and required_keys <@ array(select pg_catalog.jsonb_object_keys(input))
    and array(select pg_catalog.jsonb_object_keys(input)) <@ (required_keys || optional_keys)
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_is_integer_between"("input" "jsonb", "minimum" numeric, "maximum" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select pg_catalog.jsonb_typeof(input) = 'number'
    and (input #>> '{}')::numeric = pg_catalog.trunc((input #>> '{}')::numeric)
    and (input #>> '{}')::numeric between minimum and maximum
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_is_string"("input" "jsonb", "minimum" integer, "maximum" integer) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select pg_catalog.jsonb_typeof(input) = 'string'
    and pg_catalog.char_length(input #>> '{}') between minimum and maximum
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_is_uuid"("input" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $_$
  select pg_catalog.jsonb_typeof(input) = 'string'
    and input #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$_$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_segment_is_canonical"("input" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
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
            where not public.activity_plan_jsonb_has_exact_keys(step_value, array['id', 'name', 'duration', 'targets'], array['description', 'notes'])
              or not public.activity_plan_jsonb_is_uuid(step_value -> 'id')
              or not public.activity_plan_jsonb_is_string(step_value -> 'name', 1, 100)
              or (step_value -> 'description' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'description', 0, 500))
              or (step_value -> 'notes' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'notes', 0, 1000))
              or not public.activity_plan_duration_is_canonical(step_value -> 'duration')
              or pg_catalog.jsonb_typeof(step_value -> 'targets') <> 'array'
              or pg_catalog.jsonb_array_length(step_value -> 'targets') not between 1 and 3
          )
      )
    else false
  end
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_structure_is_canonical"("input" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
declare
  segment_value jsonb;
  interval_value jsonb;
  step_value jsonb;
  seen_ids text[] := '{}'::text[];
  activity_category text;
  prior_was_rest boolean := false;
  activity_count integer := 0;
  expanded_occurrences numeric := 0;
  explicit_timed_seconds numeric := 0;
  id_value text;
begin
  -- jsonb::text inserts canonical whitespace that JSON.stringify does not. Core's
  -- 1 MiB UTF-8 limit remains exact; this coarser database guard leaves bounded
  -- serialization headroom so a Core-valid document is not rejected here.
  if input is null
    or pg_catalog.octet_length(input::text) > 1200000
    or not public.activity_plan_jsonb_has_exact_keys(input, array['version', 'activity_category', 'segments'])
    or input -> 'version' <> '3'::jsonb
    or input ->> 'activity_category' not in ('run', 'bike', 'swim', 'strength', 'other')
    or pg_catalog.jsonb_typeof(input -> 'segments') <> 'array'
    or pg_catalog.jsonb_array_length(input -> 'segments') not between 1 and 64 then return false; end if;
  activity_category := input ->> 'activity_category';
  for segment_value in select value from pg_catalog.jsonb_array_elements(input -> 'segments') loop
    if not public.activity_plan_segment_is_canonical(segment_value) then return false; end if;
    id_value := segment_value ->> 'id';
    if id_value = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids, id_value);
    if segment_value ->> 'role' = 'rest' then
      if prior_was_rest then return false; end if;
      prior_was_rest := true;
      explicit_timed_seconds := explicit_timed_seconds + (segment_value -> 'duration' ->> 'seconds')::numeric;
    else
      prior_was_rest := false;
      activity_count := activity_count + 1;
      for interval_value in select value from pg_catalog.jsonb_array_elements(segment_value -> 'intervals') loop
        id_value := interval_value ->> 'id';
        if id_value = any(seen_ids) then return false; end if;
        seen_ids := array_append(seen_ids, id_value);
        expanded_occurrences := expanded_occurrences + pg_catalog.jsonb_array_length(interval_value -> 'steps') * (interval_value ->> 'repetitions')::numeric;
        for step_value in select value from pg_catalog.jsonb_array_elements(interval_value -> 'steps') loop
          id_value := step_value ->> 'id';
          if id_value = any(seen_ids) then return false; end if;
          seen_ids := array_append(seen_ids, id_value);
          if step_value -> 'duration' ->> 'type' = 'time' then
            explicit_timed_seconds := explicit_timed_seconds + (step_value -> 'duration' ->> 'seconds')::numeric * (interval_value ->> 'repetitions')::numeric;
          end if;
          if exists (
            select 1 from pg_catalog.jsonb_array_elements(step_value -> 'targets') target_value
            where not public.activity_plan_target_is_canonical(target_value, activity_category)
          ) then return false; end if;
        end loop;
      end loop;
    end if;
  end loop;
  return activity_count > 0 and expanded_occurrences <= 1000 and explicit_timed_seconds <= 604800;
end
$$;

CREATE OR REPLACE FUNCTION "public"."activity_plan_target_is_canonical"("input" "jsonb", "activity_category" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  select public.activity_plan_jsonb_has_exact_keys(input, array['type', 'intensity'])
    and pg_catalog.jsonb_typeof(input -> 'type') = 'string'
    and pg_catalog.jsonb_typeof(input -> 'intensity') = 'number'
    and case input ->> 'type'
      when '%FTP' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 300 and activity_category = 'bike'
      when '%MaxHR' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 200 and activity_category in ('run', 'bike', 'swim', 'other')
      when '%ThresholdHR' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 200 and activity_category in ('run', 'bike', 'swim')
      when 'watts' then (input ->> 'intensity')::numeric between 0 and 3000 and activity_category = 'bike'
      when 'bpm' then (input ->> 'intensity')::numeric between 30 and 250 and activity_category in ('run', 'bike', 'swim', 'other')
      when 'speed' then (input ->> 'intensity')::numeric between 0 and 100 and activity_category in ('run', 'swim')
      when 'cadence' then (input ->> 'intensity')::numeric between 0 and 300 and activity_category in ('run', 'bike')
      when 'RPE' then (input ->> 'intensity')::numeric between 1 and 10
      else false
    end
$$;

CREATE OR REPLACE FUNCTION "public"."activity_segment_set_constraint_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.validate_activity_segment_set(coalesce(new.activity_id, old.activity_id));
  return null;
end $$;

CREATE OR REPLACE FUNCTION "public"."block_activity_artifact_direct_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare lifecycle_owner name;
begin
  select pg_catalog.pg_get_userbyid(procedure.proowner) into lifecycle_owner
  from pg_catalog.pg_proc as procedure
  where procedure.oid=pg_catalog.to_regprocedure('public.block_activity_artifact_direct_delete()');
  if current_user is distinct from lifecycle_owner
    or old.availability<>'deleted'
    or current_setting('gradientpeak.artifact_hard_delete_authorized',true) is distinct from 'on' then
    raise exception 'activity artifact delete requires completed service lifecycle';
  end if;
  return old;
end $$;

CREATE OR REPLACE FUNCTION "public"."close_organization"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_recent_reauthentication_verified" boolean, "p_reason_code" "text", "p_correlation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_revoked_grants integer;
  v_ended_engagements integer;
  v_ended_assignments integer;
  v_ended_consents integer;
BEGIN
  IF p_recent_reauthentication_verified IS DISTINCT FROM true
    OR p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'reauthentication, a lowercase reason_code, and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.closed'
        AND audit.resource_id = p_organization_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS root_membership
    WHERE root_membership.organization_id = p_organization_id
      AND root_membership.id = v_organization.root_owner_membership_id
      AND root_membership.profile_id = p_actor_profile_id
      AND root_membership.suspended_at IS NULL
      AND root_membership.ended_at IS NULL
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'only the active root owner may close organization';
  END IF;

  UPDATE public.organizations
  SET closed_at = v_now, suspended_at = NULL
  WHERE id = p_organization_id;

  UPDATE public.organization_membership_role_grants
  SET revoked_at = v_now
  WHERE organization_id = p_organization_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_grants = ROW_COUNT;

  UPDATE public.coaching_engagements
  SET ended_at = v_now, paused_at = NULL
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_engagements = ROW_COUNT;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_consents = ROW_COUNT;

  -- Membership rows intentionally remain unchanged. The closed organization is
  -- the authority fence; memberships retain historical identity/attribution.
  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_organization.root_owner_membership_id,
    'organization.closed',
    'organization',
    p_organization_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'revoked_grants', v_revoked_grants,
      'ended_engagements', v_ended_engagements,
      'ended_assignments', v_ended_assignments,
      'ended_consents', v_ended_consents
    )
  );
END
$_$;

CREATE OR REPLACE FUNCTION "public"."coaching_athlete_read_access_decision"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_athlete_profile_id" "uuid", "p_scope_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_membership_id uuid;
  v_membership_suspended_at timestamp with time zone;
  v_membership_ended_at timestamp with time zone;
  v_granted_at timestamp with time zone;
  v_engagement_id uuid;
  v_engagement_paused_at timestamp with time zone;
  v_engagement_ended_at timestamp with time zone;
  v_engagement_created_at timestamp with time zone;
  v_assignment_id uuid;
  v_consent_id uuid;
  v_policy_version_id uuid;
  v_consent_granted_at timestamp with time zone;
  v_consent_expires_at timestamp with time zone;
  v_consent_ended_at timestamp with time zone;
  v_successor_consent_id uuid;
  v_policy_effective_from timestamp with time zone;
BEGIN
  IF p_scope_key IS NULL OR p_scope_key NOT IN (
    'basic_profile',
    'training',
    'activities',
    'metrics',
    'goals',
    'calendar'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid coaching athlete read scope';
  END IF;

  -- FOR SHARE conflicts with ordinary lifecycle UPDATE. Every writer below first
  -- takes this organization row FOR UPDATE, so authorization and a future
  -- projection read can remain in one linearized transaction.
  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
    AND organization.suspended_at IS NULL
    AND organization.closed_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN 'organization_not_active';
  END IF;

  SELECT
    membership.id,
    membership.suspended_at,
    membership.ended_at
  INTO
    v_membership_id,
    v_membership_suspended_at,
    v_membership_ended_at
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
  FOR SHARE;

  IF v_membership_id IS NULL
    OR v_membership_suspended_at IS NOT NULL
    OR v_membership_ended_at IS NOT NULL THEN
    RETURN 'membership_not_active';
  END IF;

  SELECT grant_row.granted_at
  INTO v_granted_at
  FROM public.organization_membership_role_grants AS grant_row
  WHERE grant_row.organization_id = p_organization_id
    AND grant_row.membership_id = v_membership_id
    AND grant_row.role_key = 'coach'
    AND grant_row.revoked_at IS NULL
  ORDER BY grant_row.granted_at DESC, grant_row.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_granted_at IS NULL OR v_granted_at > v_now THEN
    RETURN 'missing_coach_role';
  END IF;

  SELECT
    engagement.id,
    engagement.paused_at,
    engagement.ended_at,
    engagement.created_at
  INTO
    v_engagement_id,
    v_engagement_paused_at,
    v_engagement_ended_at,
    v_engagement_created_at
  FROM public.coaching_engagements AS engagement
  WHERE engagement.organization_id = p_organization_id
    AND engagement.athlete_profile_id = p_athlete_profile_id
  ORDER BY
    (engagement.ended_at IS NULL) DESC,
    engagement.created_at DESC,
    engagement.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_engagement_id IS NULL
    OR v_engagement_paused_at IS NOT NULL
    OR v_engagement_ended_at IS NOT NULL
    OR v_engagement_created_at > v_now THEN
    RETURN 'engagement_not_active';
  END IF;

  SELECT assignment.id
  INTO v_assignment_id
  FROM public.coaching_assignments AS assignment
  WHERE assignment.organization_id = p_organization_id
    AND assignment.engagement_id = v_engagement_id
    AND assignment.coach_membership_id = v_membership_id
    AND assignment.ended_at IS NULL
    AND assignment.assigned_at <= v_now
  LIMIT 1
  FOR SHARE;

  IF v_assignment_id IS NULL THEN
    SELECT group_assignment.id
    INTO v_assignment_id
    FROM public.organization_group_coach_assignments AS group_assignment
    JOIN public.organization_groups AS organization_group
      ON organization_group.organization_id = group_assignment.organization_id
      AND organization_group.id = group_assignment.group_id
    JOIN public.organization_group_athletes AS group_athlete
      ON group_athlete.organization_id = group_assignment.organization_id
      AND group_athlete.group_id = group_assignment.group_id
    WHERE group_assignment.organization_id = p_organization_id
      AND group_assignment.coach_membership_id = v_membership_id
      AND group_assignment.ended_at IS NULL
      AND group_assignment.assigned_at <= v_now
      AND organization_group.archived_at IS NULL
      AND group_athlete.engagement_id = v_engagement_id
      AND group_athlete.ended_at IS NULL
      AND group_athlete.joined_at <= v_now
    LIMIT 1
    FOR SHARE;
  END IF;

  IF v_assignment_id IS NULL THEN
    RETURN 'assignment_missing';
  END IF;

  SELECT
    consent.id,
    consent.policy_version_id,
    consent.granted_at,
    consent.expires_at,
    consent.ended_at,
    consent.superseded_by_consent_id
  INTO
    v_consent_id,
    v_policy_version_id,
    v_consent_granted_at,
    v_consent_expires_at,
    v_consent_ended_at,
    v_successor_consent_id
  FROM public.athlete_data_sharing_consents AS consent
  WHERE consent.organization_id = p_organization_id
    AND consent.engagement_id = v_engagement_id
    AND consent.athlete_profile_id = p_athlete_profile_id
    AND consent.scope_key = p_scope_key
  ORDER BY
    (consent.ended_at IS NULL) DESC,
    consent.granted_at DESC,
    consent.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_consent_id IS NULL THEN
    RETURN 'consent_missing';
  END IF;

  IF v_consent_ended_at IS NOT NULL OR v_successor_consent_id IS NOT NULL THEN
    RETURN 'consent_ended';
  END IF;

  IF v_consent_granted_at > v_now THEN
    RETURN 'consent_missing';
  END IF;

  IF v_consent_expires_at IS NOT NULL AND v_consent_expires_at <= v_now THEN
    RETURN 'consent_expired';
  END IF;

  SELECT policy.effective_from
  INTO v_policy_effective_from
  FROM public.athlete_consent_policy_versions AS policy
  WHERE policy.id = v_policy_version_id
    AND policy.scope_key = p_scope_key;

  IF v_policy_effective_from IS NULL OR v_policy_effective_from > v_now THEN
    RETURN 'consent_policy_not_effective';
  END IF;

  RETURN 'allow';
END
$$;

CREATE OR REPLACE FUNCTION "public"."end_coaching_engagement"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_engagement_id" "uuid", "p_reason_code" "text", "p_correlation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_engagement public.coaching_engagements%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_ended_assignments integer;
  v_ended_consents integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'coaching.engagement_ended'
        AND audit.resource_id = p_engagement_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  SELECT engagement.*
  INTO v_engagement
  FROM public.coaching_engagements AS engagement
  WHERE engagement.organization_id = p_organization_id
    AND engagement.id = p_engagement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'engagement not found';
  END IF;

  IF p_actor_profile_id <> v_engagement.athlete_profile_id
    AND v_actor_membership_id IS DISTINCT FROM v_organization.root_owner_membership_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS grant_row
      WHERE grant_row.organization_id = p_organization_id
        AND grant_row.membership_id = v_actor_membership_id
        AND grant_row.role_key = 'admin'
        AND grant_row.granted_at <= v_now
        AND grant_row.revoked_at IS NULL
    ) THEN
    RAISE EXCEPTION 'actor lacks engagement-end authority';
  END IF;

  IF v_engagement.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.coaching_engagements
  SET ended_at = v_now, paused_at = NULL
  WHERE organization_id = p_organization_id
    AND id = p_engagement_id;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND engagement_id = p_engagement_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND engagement_id = p_engagement_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_consents = ROW_COUNT;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'coaching.engagement_ended',
    'coaching_engagement',
    p_engagement_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'ended_assignments', v_ended_assignments,
      'ended_consents', v_ended_consents
    )
  );
END
$_$;

CREATE OR REPLACE FUNCTION "public"."end_organization_membership"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_membership_id" "uuid", "p_reason_code" "text", "p_correlation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_target_membership public.organization_memberships%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_revoked_grants integer;
  v_ended_assignments integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.membership_ended'
        AND audit.resource_id = p_membership_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.suspended_at IS NOT NULL OR v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is not active';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  IF v_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'actor membership is not active';
  END IF;

  SELECT membership.*
  INTO v_target_membership
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF v_actor_membership_id = p_membership_id
    OR v_organization.root_owner_membership_id = p_membership_id THEN
    RAISE EXCEPTION 'target membership cannot be ended';
  END IF;

  IF v_actor_membership_id <> v_organization.root_owner_membership_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS actor_grant
      WHERE actor_grant.organization_id = p_organization_id
        AND actor_grant.membership_id = v_actor_membership_id
        AND actor_grant.role_key = 'admin'
        AND actor_grant.granted_at <= v_now
        AND actor_grant.revoked_at IS NULL
    ) OR EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS target_grant
      WHERE target_grant.organization_id = p_organization_id
        AND target_grant.membership_id = p_membership_id
        AND target_grant.role_key = 'admin'
        AND target_grant.granted_at <= v_now
        AND target_grant.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'actor lacks membership-end authority';
    END IF;
  END IF;

  IF v_target_membership.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.organization_memberships
  SET ended_at = v_now, suspended_at = NULL
  WHERE organization_id = p_organization_id
    AND id = p_membership_id;

  UPDATE public.organization_membership_role_grants
  SET revoked_at = v_now
  WHERE organization_id = p_organization_id
    AND membership_id = p_membership_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_grants = ROW_COUNT;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND coach_membership_id = p_membership_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'organization.membership_ended',
    'organization_membership',
    p_membership_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'revoked_grants', v_revoked_grants,
      'ended_assignments', v_ended_assignments
    )
  );
END
$_$;

CREATE OR REPLACE FUNCTION "public"."enforce_activity_artifact_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare lifecycle_owner name;
begin
  if row(new.profile_id, new.digest_algorithm, new.digest, new.byte_size, new.bucket, new.path,
         new.media_type, new.format, new.original_name, new.first_accepted_at)
     is distinct from
     row(old.profile_id, old.digest_algorithm, old.digest, old.byte_size, old.bucket, old.path,
         old.media_type, old.format, old.original_name, old.first_accepted_at) then
    raise exception 'accepted activity artifact byte identity is immutable';
  end if;
  if new.availability is distinct from old.availability then
    select pg_catalog.pg_get_userbyid(procedure.proowner) into lifecycle_owner
    from pg_catalog.pg_proc as procedure
    where procedure.oid=pg_catalog.to_regprocedure('public.enforce_activity_artifact_immutable()');
    if current_user is distinct from lifecycle_owner
      or current_setting('gradientpeak.artifact_lifecycle_authorized',true) is distinct from 'on' then
      raise exception 'activity artifact lifecycle requires authorized service workflow';
    end if;
    if not ((old.availability='accepted' and new.availability='deletion_pending')
      or (old.availability='deletion_pending' and new.availability='deleted')) then
      raise exception 'invalid activity artifact lifecycle transition';
    end if;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."enforce_ready_activity_route_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.route_id is null then return new; end if;
  perform 1 from public.activity_routes
  where id=new.route_id and storage_state='ready'
  for key share;
  if not found then
    raise exception 'event route must reference ready route storage';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."enforce_ready_route_social_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.entity_type <> 'route' then return new; end if;
  perform 1 from public.activity_routes
  where id=new.entity_id and storage_state='ready'
  for key share;
  if not found then
    raise exception 'route social content requires ready route storage';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."finalize_activity_artifact_deletion"("target_id" "uuid", "storage_deleted" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not storage_deleted then raise exception 'storage deletion proof is required'; end if;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deleted',deleted_at=now()
  where id=target_id and availability='deletion_pending';
  if not found then raise exception 'artifact is not deletion_pending or does not exist'; end if;
end $$;

CREATE OR REPLACE FUNCTION "public"."guard_organization_root_owner_transfer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_expected_guard text;
  v_transfer_owner name;
BEGIN
  IF NEW.root_owner_membership_id IS NOT DISTINCT FROM OLD.root_owner_membership_id THEN
    RETURN NEW;
  END IF;

  v_expected_guard := pg_catalog.format(
    '%s:%s:%s',
    NEW.id,
    OLD.root_owner_membership_id,
    NEW.root_owner_membership_id
  );
  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
  INTO v_transfer_owner
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.transfer_organization_root_ownership(uuid,uuid,uuid,boolean,text,uuid)'
  );
  IF CURRENT_USER IS DISTINCT FROM v_transfer_owner
    OR pg_catalog.current_setting('gradientpeak.coaching_root_transfer_guard', true)
      IS DISTINCT FROM v_expected_guard THEN
    RAISE EXCEPTION 'root ownership may change only through the guarded transfer command';
  END IF;

  PERFORM pg_catalog.set_config('gradientpeak.coaching_root_transfer_guard', '', true);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    full_name text;
    user_email text;
    base_username text;
    unique_suffix text;
    final_username text;
begin
    full_name := nullif(btrim(coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        concat_ws(' ',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        )
    )), '');

    user_email := coalesce(
        nullif(new.email, ''),
        nullif(new.raw_user_meta_data->>'email', ''),
        new.id::text || '@users.local'
    );

    base_username := coalesce(
        nullif(concat_ws('',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        ), ''),
        split_part(user_email, '@', 1),
        'user'
    );

    unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
    final_username := left(base_username || unique_suffix, 50);

    insert into public.users (id, name, email, email_verified, image)
    values (
        new.id,
        coalesce(full_name, split_part(user_email, '@', 1), 'User'),
        user_email,
        coalesce(new.email_confirmed_at is not null, false),
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        name = coalesce(public.users.name, excluded.name),
        email = coalesce(public.users.email, excluded.email),
        image = coalesce(public.users.image, excluded.image),
        updated_at = now();

    insert into public.profiles (id, email, full_name, username, avatar_url)
    values (
        new.id,
        new.email,
        full_name,
        final_username,
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        email = coalesce(public.profiles.email, excluded.email),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        username = coalesce(public.profiles.username, excluded.username),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."prevent_coaching_assignment_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coaching assignments are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.coach_membership_id IS DISTINCT FROM OLD.coach_membership_id
     OR NEW.assignment_kind IS DISTINCT FROM OLD.assignment_kind
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR OLD.ended_at IS NOT NULL
     OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'coaching assignments may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization groups are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.archived_at IS NOT NULL
     OR NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'organization groups may only transition once from active to archived';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."guard_organization_group_authority"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  actor_id uuid;
  row_data jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  -- All new authority writers use the same fence as protected projection reads.
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF TG_TABLE_NAME = 'organization_groups' THEN
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by_membership_id ELSE NEW.archived_by_membership_id END;
  ELSIF TG_TABLE_NAME = 'organization_group_athletes' THEN
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.added_by_membership_id ELSE NEW.ended_by_membership_id END;
  ELSE
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.assigned_by_membership_id ELSE NEW.ended_by_membership_id END;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id = o.id AND m.id = actor_id
    WHERE o.id = NEW.organization_id AND o.suspended_at IS NULL AND o.closed_at IS NULL
      AND m.suspended_at IS NULL AND m.ended_at IS NULL AND m.created_at <= transaction_timestamp()
      AND (m.id = o.root_owner_membership_id OR EXISTS (
        SELECT 1 FROM public.organization_membership_role_grants r
        WHERE r.organization_id = o.id AND r.membership_id = m.id AND r.role_key = 'admin'
          AND r.revoked_at IS NULL AND r.granted_at <= transaction_timestamp()
      ))
  ) THEN RAISE EXCEPTION 'organization group mutation requires an active root owner or admin actor'; END IF;
  IF TG_OP = 'INSERT' AND (
    row_data->>'ended_at' IS NOT NULL OR row_data->>'archived_at' IS NOT NULL
    OR COALESCE((row_data->>'joined_at')::timestamptz, (row_data->>'assigned_at')::timestamptz,
                (row_data->>'created_at')::timestamptz) > transaction_timestamp()
  ) THEN RAISE EXCEPTION 'organization group relationships must begin active and effective now'; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE((row_data->>'ended_at')::timestamptz,
       (row_data->>'archived_at')::timestamptz) > transaction_timestamp() THEN
    RAISE EXCEPTION 'organization group revocation must be effective now';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."audit_organization_group_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  actor_id uuid;
  actor_profile uuid;
  row_data jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  actor_id := COALESCE((row_data->>'ended_by_membership_id')::uuid,
    (row_data->>'archived_by_membership_id')::uuid, (row_data->>'added_by_membership_id')::uuid,
    (row_data->>'assigned_by_membership_id')::uuid, (row_data->>'created_by_membership_id')::uuid);
  SELECT profile_id INTO STRICT actor_profile FROM public.organization_memberships
    WHERE organization_id = NEW.organization_id AND id = actor_id;
  INSERT INTO public.organization_audit_events
    (organization_id, actor_profile_id, actor_membership_id, action, resource_type, resource_id, details)
  VALUES (NEW.organization_id, actor_profile, actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'group_relationship_created' ELSE 'group_relationship_ended' END,
    TG_TABLE_NAME, NEW.id, '{}'::jsonb);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_athlete_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization group athlete memberships are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.added_by_membership_id IS DISTINCT FROM OLD.added_by_membership_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'organization group athlete memberships may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_coach_assignment_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization group coach assignments are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.coach_membership_id IS DISTINCT FROM OLD.coach_membership_id
     OR NEW.assigned_by_membership_id IS DISTINCT FROM OLD.assigned_by_membership_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'organization group coach assignments may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_current_organization_group_relationship"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  relationship_row record;
  actor_membership_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'organization_group_athletes' THEN
    SELECT * INTO relationship_row FROM public.organization_group_athletes WHERE id = NEW.id;
    actor_membership_id := relationship_row.added_by_membership_id;
  ELSIF TG_TABLE_NAME = 'organization_group_coach_assignments' THEN
    SELECT * INTO relationship_row FROM public.organization_group_coach_assignments WHERE id = NEW.id;
    actor_membership_id := relationship_row.assigned_by_membership_id;
  ELSE
    RAISE EXCEPTION 'unexpected organization group relationship';
  END IF;
  IF relationship_row.ended_at IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations AS organization
    JOIN public.organization_groups AS organization_group ON organization_group.organization_id = organization.id
    JOIN public.organization_memberships AS actor ON actor.organization_id = organization.id AND actor.id = actor_membership_id
    WHERE organization.id = relationship_row.organization_id
      AND organization_group.id = relationship_row.group_id
      AND organization.suspended_at IS NULL AND organization.closed_at IS NULL
      AND organization_group.archived_at IS NULL
      AND actor.suspended_at IS NULL AND actor.ended_at IS NULL
      AND (actor.id = organization.root_owner_membership_id OR EXISTS (
        SELECT 1 FROM public.organization_membership_role_grants AS actor_grant
        WHERE actor_grant.organization_id = organization.id AND actor_grant.membership_id = actor.id
          AND actor_grant.role_key = 'admin' AND actor_grant.granted_at <= pg_catalog.transaction_timestamp()
          AND actor_grant.revoked_at IS NULL
      ))
  ) THEN RAISE EXCEPTION 'current organization group relationship requires an active root owner or admin actor and active organization group'; END IF;
  IF TG_TABLE_NAME = 'organization_group_athletes' THEN
  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_engagements AS engagement
    WHERE engagement.organization_id = relationship_row.organization_id AND engagement.id = relationship_row.engagement_id
      AND engagement.paused_at IS NULL AND engagement.ended_at IS NULL
  ) THEN RAISE EXCEPTION 'current organization group athlete membership requires an active engagement'; END IF;
  ELSE
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS coach
    JOIN public.organization_membership_role_grants AS grant_row ON grant_row.organization_id = coach.organization_id AND grant_row.membership_id = coach.id
    WHERE coach.organization_id = relationship_row.organization_id AND coach.id = relationship_row.coach_membership_id
      AND coach.suspended_at IS NULL AND coach.ended_at IS NULL AND grant_row.role_key = 'coach'
      AND grant_row.granted_at <= pg_catalog.transaction_timestamp() AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'current organization group coach assignment requires an active coach membership and grant'; END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_organization_invitation_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF TG_OP = 'INSERT' AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'organization invitations must start pending';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.status <> 'pending' OR NEW.status = 'pending'
    OR (pg_catalog.to_jsonb(NEW) - ARRAY['status','accepted_at','accepted_by_profile_id','closed_by_membership_id','declined_by_profile_id'])
       IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - ARRAY['status','accepted_at','accepted_by_profile_id','closed_by_membership_id','declined_by_profile_id'])
  ) THEN RAISE EXCEPTION 'invitation permits only one immutable pending-to-terminal transition'; END IF;
  IF NEW.status = 'accepted' AND (NEW.expires_at <= transaction_timestamp()
      OR NEW.accepted_at IS DISTINCT FROM transaction_timestamp()) THEN
    RAISE EXCEPTION 'accepted invitation must be unexpired and accepted now';
  END IF;
  IF NEW.status = 'declined' THEN RETURN NEW; END IF;
  IF NEW.status = 'expired' AND NEW.expires_at > transaction_timestamp() THEN
    RAISE EXCEPTION 'invitation has not yet expired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations AS organization
    JOIN public.organization_memberships AS actor
      ON actor.organization_id = organization.id AND actor.id =
        CASE WHEN NEW.status IN ('revoked','expired') THEN NEW.closed_by_membership_id ELSE NEW.invited_by_membership_id END
    WHERE organization.id = NEW.organization_id
      AND organization.suspended_at IS NULL AND organization.closed_at IS NULL
      AND actor.suspended_at IS NULL AND actor.ended_at IS NULL
      AND (
        actor.id = organization.root_owner_membership_id
        OR (NEW.requested_role_key IS DISTINCT FROM 'admin' AND EXISTS (
          SELECT 1 FROM public.organization_membership_role_grants AS actor_grant
          WHERE actor_grant.organization_id = organization.id AND actor_grant.membership_id = actor.id
            AND actor_grant.role_key = 'admin' AND actor_grant.granted_at <= pg_catalog.transaction_timestamp()
            AND actor_grant.revoked_at IS NULL
        ))
      )
  ) THEN
    RAISE EXCEPTION 'organization invitation requires an active authorized inviter';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_coaching_engagement_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'accepted coaching engagements are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'coaching engagement identity and terminal end facts are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_consent_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'athlete data sharing consents are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
     OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
     OR NEW.granted_by_profile_id IS DISTINCT FROM OLD.granted_by_profile_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at)
     OR (OLD.superseded_by_consent_id IS NOT NULL AND NEW.superseded_by_consent_id IS DISTINCT FROM OLD.superseded_by_consent_id) THEN
    RAISE EXCEPTION 'consent authority identity and grant facts are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_audit_event_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION 'organization audit events are append-only';
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_policy_version_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION 'athlete consent policy versions are immutable';
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_role_grant_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'role grants are retained and may only be revoked';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
     OR NEW.role_key IS DISTINCT FROM OLD.role_key
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
     OR OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'role grants may only transition once from active to revoked';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."purge_deleted_activity_artifact"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform set_config('gradientpeak.artifact_hard_delete_authorized','on',true);
  delete from public.activity_artifacts where id=target_id and availability='deleted';
  if not found then raise exception 'artifact tombstone is not deletable'; end if;
end $$;

CREATE OR REPLACE FUNCTION "public"."reject_activity_performance_target_snapshot_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  if new.performance_target_snapshot is distinct from old.performance_target_snapshot then
    raise exception 'activity performance target snapshots are immutable after capture';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."enforce_activity_analysis_revision_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  current_segments_revision integer;
begin
  if TG_OP = 'INSERT' then
    select activity.segments_revision
    into current_segments_revision
    from public.activities activity
    where activity.id = new.activity_id
      and activity.profile_id = new.profile_id;
    if current_segments_revision is null
       or current_segments_revision <> new.source_segments_revision then
      raise exception 'activity analysis revision must match the owned current segment revision';
    end if;
    return new;
  end if;
  if TG_OP = 'DELETE'
     and not exists (
       select 1 from public.activities activity
       where activity.id = old.activity_id and activity.profile_id = old.profile_id
     ) then
    return old;
  end if;
  raise exception 'activity analysis revisions are append-only';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."reject_activity_session_rpe_evidence_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'activity_session_rpe_evidence is immutable';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_activity_artifact_deletion"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform 1 from public.activity_artifacts where id=target_id and availability='accepted' for update;
  if not found then raise exception 'artifact is not accepted or does not exist'; end if;
  update public.activity_segments set source_artifact_id=null,source_session_index=null,source_message_index=null
    where source_artifact_id=target_id;
  update public.activity_file_ingestions set artifact_id=null,status='failed_terminal',uploaded_at=null,
    staging_cleanup_pending=false,staging_cleanup_error=null,
    failure_code='artifact_missing',completed_at=null,
    failed_at=coalesce(failed_at,now()),updated_at=now()
    where artifact_id=target_id;
  delete from public.activity_artifact_links where artifact_id=target_id;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deletion_pending',deletion_requested_at=now()
  where id=target_id and availability='accepted';
end $$;

CREATE OR REPLACE FUNCTION "public"."switch_activity_source_artifact"("target_activity_id" "uuid", "target_artifact_id" "uuid", "target_profile_id" "uuid", "target_provider_revision" "text" DEFAULT NULL::"text") RETURNS "public"."activity_artifact_links"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare inserted public.activity_artifact_links;
begin
  perform 1 from public.activity_artifacts
  where id=target_artifact_id and profile_id=target_profile_id and availability='accepted'
  for update;
  if not found then raise exception 'accepted artifact/profile not found'; end if;
  perform 1 from public.activities where id=target_activity_id and profile_id=target_profile_id for update;
  if not found then raise exception 'activity/profile not found'; end if;
  update public.activity_artifact_links set is_current=false
    where activity_id=target_activity_id and role='source' and is_current;
  insert into public.activity_artifact_links(activity_id,artifact_id,profile_id,role,ordinal,is_current,provider_revision)
  values(target_activity_id,target_artifact_id,target_profile_id,'source',
    coalesce((select max(ordinal)+1 from public.activity_artifact_links where activity_id=target_activity_id and role='source'),0),
    true,target_provider_revision) returning * into inserted;
  return inserted;
end $$;

CREATE OR REPLACE FUNCTION "public"."transfer_organization_root_ownership"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_target_membership_id" "uuid", "p_recent_reauthentication_verified" boolean, "p_reason_code" "text", "p_correlation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_target_profile_id uuid;
  v_replay_count integer;
  v_matching_replay_count integer;
BEGIN
  IF p_recent_reauthentication_verified IS DISTINCT FROM true
    OR p_target_membership_id IS NULL
    OR p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'reauthentication, a target membership, lowercase reason_code, and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.root_ownership_transferred'
        AND audit.resource_id = p_target_membership_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another root transfer request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  IF v_organization.root_owner_membership_id = p_target_membership_id THEN
    RAISE EXCEPTION 'target membership is already the root owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS root_membership
    WHERE root_membership.organization_id = p_organization_id
      AND root_membership.id = v_organization.root_owner_membership_id
      AND root_membership.profile_id = p_actor_profile_id
      AND root_membership.suspended_at IS NULL
      AND root_membership.ended_at IS NULL
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'only the active root owner may transfer organization ownership';
  END IF;

  SELECT target_membership.profile_id
  INTO v_target_profile_id
  FROM public.organization_memberships AS target_membership
  WHERE target_membership.organization_id = p_organization_id
    AND target_membership.id = p_target_membership_id
    AND target_membership.suspended_at IS NULL
    AND target_membership.ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target root-owner membership is not active in organization';
  END IF;

  PERFORM 1
  FROM public.organization_membership_role_grants AS grant_row
  WHERE grant_row.organization_id = p_organization_id
    AND grant_row.membership_id = p_target_membership_id
    AND grant_row.role_key = 'admin'
    AND grant_row.granted_at <= v_now
    AND grant_row.revoked_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target root-owner membership requires an effective admin grant';
  END IF;

  PERFORM pg_catalog.set_config(
    'gradientpeak.coaching_root_transfer_guard',
    pg_catalog.format(
      '%s:%s:%s',
      p_organization_id,
      v_organization.root_owner_membership_id,
      p_target_membership_id
    ),
    true
  );

  UPDATE public.organizations
  SET root_owner_membership_id = p_target_membership_id,
      updated_at = v_now
  WHERE id = p_organization_id;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_organization.root_owner_membership_id,
    'organization.root_ownership_transferred',
    'organization_membership',
    p_target_membership_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'previous_root_owner_membership_id', v_organization.root_owner_membership_id,
      'target_profile_id', v_target_profile_id
    )
  );
END
$_$;

CREATE OR REPLACE FUNCTION "public"."validate_activity_effort_segment_range"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare segment_record record;
begin
  if new.activity_id is null then return new; end if;
  select start_offset_ms,end_offset_ms,activity_category into segment_record from public.activity_segments
    where id=new.segment_id and activity_id=new.activity_id and profile_id=new.profile_id;
  if not found or segment_record.activity_category<>new.activity_category
    or new.start_offset_ms<segment_record.start_offset_ms
    or new.end_offset_ms>segment_record.end_offset_ms then
    raise exception 'activity effort must be contained by its matching-category segment';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."validate_activity_segment_set"("target_activity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  parent_record record;
  segment_count integer;
  max_ordinal integer;
  summed_active bigint;
  summed_moving bigint;
  complete_count integer;
begin
  select elapsed_ms, active_ms, moving_ms,timing_coverage into parent_record
  from public.activities where id = target_activity_id;
  if not found then return; end if;

  select count(*), max(ordinal), sum(active_ms), sum(moving_ms),
    count(*) filter(where timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    into segment_count, max_ordinal, summed_active, summed_moving,complete_count
  from public.activity_segments where activity_id = target_activity_id;
  if segment_count = 0 or max_ordinal <> segment_count - 1 then
    raise exception 'activity % segment ordinals must be contiguous from zero', target_activity_id;
  end if;
  if exists (select 1 from public.activity_segments where activity_id = target_activity_id and end_offset_ms > parent_record.elapsed_ms) then
    raise exception 'activity % segment exceeds parent elapsed bounds', target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    left join public.activity_segments p on p.activity_id=s.activity_id and p.ordinal=s.ordinal-1
    left join public.activity_segments n on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='transition'
      and (p.role is distinct from 'activity' or n.role is distinct from 'activity')
  ) then raise exception 'activity % transition must be between activity segments', target_activity_id; end if;
  if exists (
    select 1 from public.activity_segments s join public.activity_segments n
      on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='rest' and n.role='rest'
  ) then raise exception 'activity % has consecutive rest segments', target_activity_id; end if;
  if parent_record.timing_coverage='complete' then
    if complete_count<>segment_count then
      raise exception 'activity % complete parent requires complete timing for every segment',target_activity_id;
    end if;
    if parent_record.active_ms is distinct from summed_active or parent_record.moving_ms is distinct from summed_moving then
      raise exception 'activity % complete timing does not reconcile with segments',target_activity_id;
    end if;
  elsif parent_record.active_ms is not null or parent_record.moving_ms is not null then
    raise exception 'activity % partial/unavailable parent timing totals must be null',target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    where s.activity_id=target_activity_id
       and (s.summary->>'version' is distinct from s.summary_version::text
         or s.summary#>>'{timing,timingCoverage}' is distinct from s.timing_coverage
         or (s.summary#>>'{timing,activeMs}')::bigint is distinct from s.active_ms
         or (s.summary#>>'{timing,movingMs}')::bigint is distinct from s.moving_ms)
  ) then raise exception 'activity % segment summary timing/version mismatch', target_activity_id; end if;
end $$;

CREATE OR REPLACE FUNCTION "public"."validate_consent_supersession"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  consent_row public.athlete_data_sharing_consents%ROWTYPE;
  successor_row public.athlete_data_sharing_consents%ROWTYPE;
BEGIN
  SELECT * INTO consent_row FROM public.athlete_data_sharing_consents WHERE id = NEW.id;
  IF consent_row.superseded_by_consent_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF consent_row.superseded_by_consent_id = consent_row.id OR consent_row.ended_at IS NULL THEN
    RAISE EXCEPTION 'a consent successor requires an ended predecessor and cannot reference itself';
  END IF;
  SELECT * INTO successor_row FROM public.athlete_data_sharing_consents WHERE id = consent_row.superseded_by_consent_id;
  IF successor_row.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'consent successor must be current when linked';
  END IF;
  IF successor_row.granted_at < consent_row.granted_at OR consent_row.ended_at > successor_row.granted_at THEN
    RAISE EXCEPTION 'consent successor chronology is invalid';
  END IF;
  IF EXISTS (
    WITH RECURSIVE consent_chain(id, successor_id, path, cycle) AS (
      SELECT c.id, c.superseded_by_consent_id, ARRAY[c.id], false
      FROM public.athlete_data_sharing_consents c
      WHERE c.id = consent_row.id
      UNION ALL
      SELECT next_consent.id,
             next_consent.superseded_by_consent_id,
             consent_chain.path || next_consent.id,
             next_consent.id = ANY(consent_chain.path)
      FROM consent_chain
      JOIN public.athlete_data_sharing_consents next_consent ON next_consent.id = consent_chain.successor_id
      WHERE consent_chain.successor_id IS NOT NULL AND NOT consent_chain.cycle
    )
    SELECT 1 FROM consent_chain WHERE cycle
  ) THEN
    RAISE EXCEPTION 'consent supersession cannot contain a cycle';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_current_coaching_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  assignment_row public.coaching_assignments%ROWTYPE;
BEGIN
  SELECT * INTO assignment_row FROM public.coaching_assignments WHERE id = NEW.id;
  IF assignment_row.ended_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.coaching_engagements e ON e.organization_id = o.id AND e.id = assignment_row.engagement_id
    JOIN public.organization_memberships m ON m.organization_id = o.id AND m.id = assignment_row.coach_membership_id
    JOIN public.organization_membership_role_grants g ON g.organization_id = o.id AND g.membership_id = m.id
    WHERE o.id = assignment_row.organization_id
      AND o.suspended_at IS NULL AND o.closed_at IS NULL
      AND e.paused_at IS NULL AND e.ended_at IS NULL
      AND m.suspended_at IS NULL AND m.ended_at IS NULL
      AND g.role_key = 'coach' AND g.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'current coaching assignment requires an active organization, engagement, membership, and coach grant';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_organization_root_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  target_organization_id uuid;
  root_membership_id uuid;
BEGIN
  target_organization_id := COALESCE(
    (pg_catalog.to_jsonb(NEW)->>'organization_id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'organization_id')::uuid,
    (pg_catalog.to_jsonb(NEW)->>'id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'id')::uuid
  );
  SELECT root_owner_membership_id INTO root_membership_id
  FROM public.organizations
  WHERE id = target_organization_id
  FOR UPDATE;
  IF FOUND AND EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = target_organization_id
      AND closed_at IS NULL
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      WHERE membership.organization_id = target_organization_id
        AND membership.id = root_membership_id
        AND membership.suspended_at IS NULL
        AND membership.ended_at IS NULL
    ) THEN
      RAISE EXCEPTION 'active or suspended organization % must retain an active root-owner membership', target_organization_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS grant_row
      WHERE grant_row.organization_id = target_organization_id
        AND grant_row.membership_id = root_membership_id
        AND grant_row.role_key = 'admin'
        AND grant_row.granted_at <= pg_catalog.transaction_timestamp()
        AND grant_row.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'root-owner membership % must retain an effective admin grant', root_membership_id;
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION "public"."validate_policy_supersession"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  predecessor_effective_from timestamp with time zone;
BEGIN
  IF NEW.supersedes_policy_version_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT effective_from INTO predecessor_effective_from
  FROM public.athlete_consent_policy_versions
  WHERE id = NEW.supersedes_policy_version_id AND scope_key = NEW.scope_key;
  IF predecessor_effective_from IS NULL OR NEW.effective_from < predecessor_effective_from THEN
    RAISE EXCEPTION 'policy supersession must retain scope and cannot move effective chronology backward';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."withdraw_athlete_consent"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_consent_id" "uuid", "p_reason_code" "text", "p_correlation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_consent public.athlete_data_sharing_consents%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'athlete.consent_withdrawn'
        AND audit.resource_id = p_consent_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  SELECT consent.*
  INTO v_consent
  FROM public.athlete_data_sharing_consents AS consent
  WHERE consent.organization_id = p_organization_id
    AND consent.id = p_consent_id
  FOR UPDATE;

  IF NOT FOUND OR v_consent.athlete_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'only the exact athlete may withdraw consent';
  END IF;

  IF v_consent.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND id = p_consent_id;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'athlete.consent_withdrawn',
    'athlete_data_sharing_consent',
    p_consent_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object('reason_code', p_reason_code)
  );
END
$_$;

CREATE FUNCTION public.validate_threshold_evaluation_insert() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.activities AS activity
    WHERE activity.id = NEW.source_activity_id
      AND activity.profile_id = NEW.profile_id
      AND activity.segments_revision = NEW.source_revision
      AND activity.finished_at = NEW.observed_at
      AND activity.finished_at <= pg_catalog.statement_timestamp()
  ) THEN
    RAISE EXCEPTION 'threshold evaluation must cite the exact current activity source revision'
      USING ERRCODE = '23514', CONSTRAINT = 'threshold_evaluations_source_integrity';
  END IF;
  NEW.created_at := pg_catalog.statement_timestamp();
  RETURN NEW;
END
$$;

CREATE FUNCTION public.enforce_threshold_truth_immutability() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'immutable derived rows cannot be updated directly'
    USING ERRCODE = '23514', CONSTRAINT = 'threshold_truth_immutable';
END
$$;

CREATE FUNCTION public.enforce_threshold_immutability() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_rewire text;
BEGIN
  expected_rewire := OLD.supersedes_id::text || ':' || coalesce(NEW.supersedes_id::text, '');
  IF pg_trigger_depth() > 1
    AND current_user = (
      SELECT pg_catalog.pg_get_userbyid(class.relowner)
      FROM pg_catalog.pg_class AS class
      WHERE class.oid = TG_RELID
    )
    AND pg_catalog.current_setting('gradientpeak.threshold_rewire', true) = expected_rewire
    AND (to_jsonb(NEW) - 'supersedes_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'supersedes_id')
    AND NOT EXISTS (SELECT 1 FROM public.thresholds WHERE id = OLD.supersedes_id)
    AND (
      NEW.supersedes_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.thresholds AS parent
        WHERE parent.id = NEW.supersedes_id
          AND parent.profile_id = NEW.profile_id
          AND parent.activity_category = NEW.activity_category
          AND parent.metric = NEW.metric
      )
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'threshold rows are immutable outside referential supersession cleanup'
    USING ERRCODE = '23514', CONSTRAINT = 'thresholds_immutable';
END
$$;

CREATE FUNCTION public.rewire_threshold_successor_after_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rewired_count integer;
BEGIN
  PERFORM pg_catalog.set_config(
    'gradientpeak.threshold_rewire',
    OLD.id::text || ':' || coalesce(OLD.supersedes_id::text, ''),
    true
  );
  UPDATE public.thresholds AS successor
  SET supersedes_id = OLD.supersedes_id
  WHERE successor.supersedes_id = OLD.id
    AND successor.profile_id = OLD.profile_id
    AND successor.activity_category = OLD.activity_category
    AND successor.metric = OLD.metric;
  GET DIAGNOSTICS rewired_count = ROW_COUNT;
  PERFORM pg_catalog.set_config('gradientpeak.threshold_rewire', '', true);

  IF rewired_count > 1 OR EXISTS (
    SELECT 1 FROM public.thresholds AS successor
    WHERE successor.supersedes_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'threshold successor chain is branched or crosses identity'
      USING ERRCODE = '23514', CONSTRAINT = 'thresholds_successor_rewire_identity';
  END IF;
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.rewire_threshold_successor_after_delete() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.validate_threshold_evaluation_efforts() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_evaluation_id uuid;
  evaluation public.threshold_evaluations%ROWTYPE;
  primary_count integer;
  primary_activity_id uuid;
  primary_revision integer;
BEGIN
  IF TG_TABLE_NAME = 'threshold_evaluations' THEN
    target_evaluation_id := NEW.id;
  ELSE
    target_evaluation_id := NEW.evaluation_id;
  END IF;

  SELECT * INTO evaluation
  FROM public.threshold_evaluations
  WHERE id = target_evaluation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT count(*)::integer
  INTO primary_count
  FROM public.threshold_evaluation_efforts
  WHERE evaluation_id = target_evaluation_id
    AND role = 'primary';

  SELECT activity_id, source_revision
  INTO primary_activity_id, primary_revision
  FROM public.threshold_evaluation_efforts
  WHERE evaluation_id = target_evaluation_id
    AND role = 'primary'
  LIMIT 1;

  IF evaluation.outcome = 'rejected' AND EXISTS (
    SELECT 1
    FROM public.threshold_evaluation_efforts AS linked_effort
    WHERE linked_effort.evaluation_id = target_evaluation_id
      AND (
        linked_effort.activity_id IS DISTINCT FROM evaluation.source_activity_id
        OR linked_effort.source_revision IS DISTINCT FROM evaluation.source_revision
      )
  ) THEN
    RAISE EXCEPTION 'rejected threshold evaluation links must match its source activity revision'
      USING ERRCODE = '23514', CONSTRAINT = 'threshold_evaluations_rejected_effort_source';
  END IF;

  IF primary_count > 1 THEN
    RAISE EXCEPTION 'threshold evaluation cannot have multiple primary efforts'
      USING ERRCODE = '23514', CONSTRAINT = 'threshold_evaluations_primary_effort';
  END IF;

  IF evaluation.outcome = 'qualified' AND primary_count <> 1 THEN
    RAISE EXCEPTION 'qualified threshold evaluation requires exactly one primary effort'
      USING ERRCODE = '23514', CONSTRAINT = 'threshold_evaluations_primary_effort';
  END IF;

  -- Rejected evaluations may have no measured window; all linked evidence is source-local.
  IF primary_count = 1 AND (
      primary_activity_id IS DISTINCT FROM evaluation.source_activity_id
      OR primary_revision IS DISTINCT FROM evaluation.source_revision
    )
  THEN
    RAISE EXCEPTION 'threshold evaluation primary effort does not match its source revision'
      USING ERRCODE = '23514', CONSTRAINT = 'threshold_evaluations_primary_effort';
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION public.validate_threshold_insert() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  evaluation public.threshold_evaluations%ROWTYPE;
  prior public.thresholds%ROWTYPE;
BEGIN
  SELECT * INTO evaluation
  FROM public.threshold_evaluations
  WHERE id = NEW.evaluation_id
    AND profile_id = NEW.profile_id
    AND activity_category = NEW.activity_category
    AND metric = NEW.metric
    AND outcome = 'qualified';

  IF NOT FOUND
    OR NEW.value IS DISTINCT FROM evaluation.value
    OR NEW.unit IS DISTINCT FROM evaluation.unit
    OR NEW.confidence IS DISTINCT FROM evaluation.confidence
    OR NEW.method IS DISTINCT FROM evaluation.method
    OR NEW.policy_version IS DISTINCT FROM evaluation.policy_version
    OR NEW.effective_at < evaluation.observed_at
  THEN
    RAISE EXCEPTION 'threshold must exactly publish its qualified evaluation'
      USING ERRCODE = '23514', CONSTRAINT = 'thresholds_evaluation_snapshot';
  END IF;

  NEW.created_at := pg_catalog.statement_timestamp();
  IF NEW.effective_at > NEW.created_at THEN
    RAISE EXCEPTION 'threshold effective_at cannot be in the future'
      USING ERRCODE = '23514', CONSTRAINT = 'thresholds_not_future';
  END IF;

  IF NEW.supersedes_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.thresholds AS existing
      WHERE existing.profile_id = NEW.profile_id
        AND existing.activity_category = NEW.activity_category
        AND existing.metric = NEW.metric
    ) THEN
      RAISE EXCEPTION 'threshold history requires an exact supersession edge'
        USING ERRCODE = '23514', CONSTRAINT = 'thresholds_linear_history';
    END IF;
  ELSE
    SELECT * INTO prior FROM public.thresholds
    WHERE id = NEW.supersedes_id
      AND profile_id = NEW.profile_id
      AND activity_category = NEW.activity_category
      AND metric = NEW.metric;
    IF NOT FOUND OR NEW.effective_at < prior.effective_at THEN
      RAISE EXCEPTION 'threshold supersession is cross-identity or backdated'
        USING ERRCODE = '23514', CONSTRAINT = 'thresholds_supersession_order';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.thresholds AS existing
      WHERE existing.profile_id = NEW.profile_id
        AND existing.activity_category = NEW.activity_category
        AND existing.metric = NEW.metric
        AND (existing.effective_at, existing.created_at, existing.id)
          > (prior.effective_at, prior.created_at, prior.id)
    ) THEN
      RAISE EXCEPTION 'threshold must supersede the latest history row'
        USING ERRCODE = '23514', CONSTRAINT = 'thresholds_latest_supersession';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.delete_effort_dependent_threshold_evaluations() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.threshold_evaluations AS evaluation
  WHERE evaluation.id IN (
    SELECT link.evaluation_id
    FROM public.threshold_evaluation_efforts AS link
    WHERE link.effort_id = OLD.id
  );
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.delete_effort_dependent_threshold_evaluations() FROM PUBLIC, anon, authenticated;

ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_analysis_revisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_artifact_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_artifacts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_efforts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_file_ingestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_training_effects" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_routes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_route_deletion_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_segments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_session_rpe_evidence" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."api_rate_limit_windows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athlete_consent_policy_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athlete_data_sharing_consents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athlete_recalculation_queue" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coaching_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coaching_engagements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."content_access_grants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."daily_training_load" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_event_rsvps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_event_series_rsvps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_invitations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_join_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_memberships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."integration_credentials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."integration_resource_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."oauth_states" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organization_audit_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organization_membership_role_grants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_group_athletes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_group_coach_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planned_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_goals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_metrics" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_import_runs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_source_references" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_athlete_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_performance_estimates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."threshold_evaluations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."threshold_evaluation_efforts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."threshold_evidence" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."thresholds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_training_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."provider_sync_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."provider_sync_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."provider_webhook_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."training_plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."verifications" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.reject_future_coaching_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.assigned_at > pg_catalog.transaction_timestamp() THEN
    RAISE EXCEPTION 'coaching assignment assigned_at cannot be in the future';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER coaching_assignments_assigned_at_not_future
BEFORE INSERT OR UPDATE OF assigned_at ON public.coaching_assignments
FOR EACH ROW EXECUTE FUNCTION public.reject_future_coaching_assignment();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('activity-files', 'activity-files', false, 52428800, array['application/fit', 'application/gpx+xml', 'application/octet-stream', 'application/tcx+xml', 'application/vnd.ant.fit', 'application/vnd.garmin.tcx+xml', 'application/xml', 'text/xml']::text[]),
  ('gpx-routes', 'gpx-routes', false, 10485760, array['application/gpx+xml', 'application/vnd.garmin.tcx+xml', 'application/xml']::text[]),
  ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png']::text[]);
CREATE POLICY "Service role can manage all activity files" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'activity-files') WITH CHECK (bucket_id = 'activity-files');
CREATE POLICY "Users can manage their own avatar" ON storage.objects FOR ALL TO public USING (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read their own activity files" ON storage.objects FOR SELECT TO public USING (bucket_id = 'activity-files' AND (storage.foldername(name))[1] = 'activities' AND auth.uid()::text = (storage.foldername(name))[2]);
CREATE POLICY "Users can upload their own activity files" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'activity-files' AND (storage.foldername(name))[1] = 'activities' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE CONSTRAINT TRIGGER activities_validate_segment_set AFTER INSERT OR UPDATE ON public.activities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.activity_parent_segment_set_constraint_trigger();
CREATE TRIGGER threshold_evaluations_insert_guard BEFORE INSERT ON public.threshold_evaluations FOR EACH ROW EXECUTE FUNCTION public.validate_threshold_evaluation_insert();
CREATE TRIGGER activity_efforts_immutable BEFORE UPDATE ON public.activity_efforts FOR EACH ROW EXECUTE FUNCTION public.enforce_threshold_truth_immutability();
CREATE TRIGGER threshold_evaluations_immutable BEFORE UPDATE ON public.threshold_evaluations FOR EACH ROW EXECUTE FUNCTION public.enforce_threshold_truth_immutability();
CREATE TRIGGER threshold_evaluation_efforts_immutable BEFORE UPDATE ON public.threshold_evaluation_efforts FOR EACH ROW EXECUTE FUNCTION public.enforce_threshold_truth_immutability();
CREATE TRIGGER thresholds_insert_guard BEFORE INSERT ON public.thresholds FOR EACH ROW EXECUTE FUNCTION public.validate_threshold_insert();
CREATE TRIGGER thresholds_immutable BEFORE UPDATE ON public.thresholds FOR EACH ROW EXECUTE FUNCTION public.enforce_threshold_immutability();
CREATE TRIGGER thresholds_rewire_successor AFTER DELETE ON public.thresholds FOR EACH ROW EXECUTE FUNCTION public.rewire_threshold_successor_after_delete();
CREATE CONSTRAINT TRIGGER threshold_evaluations_efforts_guard AFTER INSERT ON public.threshold_evaluations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_threshold_evaluation_efforts();
CREATE CONSTRAINT TRIGGER threshold_evaluation_efforts_complete_guard AFTER INSERT ON public.threshold_evaluation_efforts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_threshold_evaluation_efforts();
CREATE TRIGGER activity_artifacts_block_direct_delete BEFORE DELETE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.block_activity_artifact_direct_delete();
CREATE TRIGGER activity_artifacts_immutable_before_update BEFORE UPDATE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_artifact_immutable();
CREATE TRIGGER activity_efforts_validate_segment_range BEFORE INSERT OR UPDATE ON public.activity_efforts FOR EACH ROW EXECUTE FUNCTION public.validate_activity_effort_segment_range();
CREATE TRIGGER activity_efforts_delete_threshold_dependents BEFORE DELETE ON public.activity_efforts FOR EACH ROW EXECUTE FUNCTION public.delete_effort_dependent_threshold_evaluations();
CREATE TRIGGER activities_performance_target_snapshot_immutable BEFORE UPDATE OF performance_target_snapshot ON public.activities FOR EACH ROW EXECUTE FUNCTION public.reject_activity_performance_target_snapshot_mutation();
CREATE TRIGGER activity_analysis_revisions_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.activity_analysis_revisions FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_analysis_revision_immutability();
CREATE TRIGGER events_require_ready_route BEFORE INSERT OR UPDATE OF route_id ON public.events FOR EACH ROW EXECUTE FUNCTION public.enforce_ready_activity_route_reference();
CREATE TRIGGER group_events_require_ready_route BEFORE INSERT OR UPDATE OF route_id ON public.group_events FOR EACH ROW EXECUTE FUNCTION public.enforce_ready_activity_route_reference();
CREATE TRIGGER likes_require_ready_route BEFORE INSERT OR UPDATE OF entity_id, entity_type ON public.likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ready_route_social_reference();
CREATE TRIGGER comments_require_ready_route BEFORE INSERT OR UPDATE OF entity_id, entity_type ON public.comments FOR EACH ROW EXECUTE FUNCTION public.enforce_ready_route_social_reference();
CREATE CONSTRAINT TRIGGER activity_segments_validate_set AFTER INSERT OR DELETE OR UPDATE ON public.activity_segments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.activity_segment_set_constraint_trigger();
CREATE TRIGGER activity_session_rpe_evidence_reject_update BEFORE UPDATE ON public.activity_session_rpe_evidence FOR EACH ROW EXECUTE FUNCTION public.reject_activity_session_rpe_evidence_mutation();
CREATE TRIGGER athlete_consent_policy_versions_immutable BEFORE DELETE OR UPDATE ON public.athlete_consent_policy_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_policy_version_mutation();
CREATE CONSTRAINT TRIGGER athlete_consent_policy_versions_supersession_guard AFTER INSERT ON public.athlete_consent_policy_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_policy_supersession();
CREATE TRIGGER athlete_data_sharing_consents_immutable BEFORE DELETE OR UPDATE ON public.athlete_data_sharing_consents FOR EACH ROW EXECUTE FUNCTION public.prevent_consent_mutation();
CREATE CONSTRAINT TRIGGER athlete_data_sharing_consents_supersession_guard AFTER INSERT OR UPDATE ON public.athlete_data_sharing_consents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_consent_supersession();
CREATE CONSTRAINT TRIGGER coaching_assignments_current_authority_guard AFTER INSERT OR UPDATE ON public.coaching_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_coaching_assignment();
CREATE TRIGGER coaching_assignments_retained BEFORE DELETE OR UPDATE ON public.coaching_assignments FOR EACH ROW EXECUTE FUNCTION public.prevent_coaching_assignment_mutation();
CREATE TRIGGER coaching_engagements_retained BEFORE DELETE OR UPDATE ON public.coaching_engagements FOR EACH ROW EXECUTE FUNCTION public.prevent_coaching_engagement_mutation();
CREATE TRIGGER organization_groups_retained BEFORE DELETE OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_mutation();
CREATE TRIGGER organization_invitations_actor_guard BEFORE INSERT OR UPDATE ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION public.validate_organization_invitation_actor();
CREATE TRIGGER organization_groups_authority_guard BEFORE INSERT OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();
CREATE TRIGGER organization_group_athletes_authority_guard BEFORE INSERT OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();
CREATE TRIGGER organization_group_coach_assignments_authority_guard BEFORE INSERT OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();
CREATE TRIGGER organization_groups_audit AFTER INSERT OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();
CREATE TRIGGER organization_group_athletes_audit AFTER INSERT OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();
CREATE TRIGGER organization_group_coach_assignments_audit AFTER INSERT OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();
CREATE TRIGGER organization_group_athletes_retained BEFORE DELETE OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_athlete_mutation();
CREATE CONSTRAINT TRIGGER organization_group_athletes_current_authority_guard AFTER INSERT OR UPDATE ON public.organization_group_athletes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_organization_group_relationship();
CREATE TRIGGER organization_group_coach_assignments_retained BEFORE DELETE OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_coach_assignment_mutation();
CREATE CONSTRAINT TRIGGER organization_group_coach_assignments_current_authority_guard AFTER INSERT OR UPDATE ON public.organization_group_coach_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_organization_group_relationship();
CREATE CONSTRAINT TRIGGER grants_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organization_membership_role_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE CONSTRAINT TRIGGER memberships_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organization_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE TRIGGER organization_audit_events_append_only BEFORE DELETE OR UPDATE ON public.organization_audit_events FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_audit_event_mutation();
CREATE TRIGGER organization_membership_role_grants_revoke_only BEFORE DELETE OR UPDATE ON public.organization_membership_role_grants FOR EACH ROW EXECUTE FUNCTION public.prevent_role_grant_mutation();
CREATE CONSTRAINT TRIGGER organizations_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE TRIGGER organizations_root_owner_transfer_command_guard BEFORE UPDATE OF root_owner_membership_id ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_organization_root_owner_transfer();

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.activity_efforts,
  public.activity_training_effects,
  public.threshold_evaluations,
  public.threshold_evaluation_efforts,
  public.thresholds
FROM service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.organizations,
  public.organization_memberships,
  public.organization_membership_role_grants,
  public.coaching_engagements,
  public.coaching_assignments,
  public.athlete_consent_policy_versions,
  public.athlete_data_sharing_consents,
  public.organization_audit_events
  ,public.organization_invitations
  ,public.organization_groups
  ,public.organization_group_athletes
  ,public.organization_group_coach_assignments
FROM service_role;
GRANT SELECT ON TABLE
  public.organizations,
  public.organization_memberships,
  public.organization_membership_role_grants,
  public.coaching_engagements,
  public.coaching_assignments,
  public.athlete_consent_policy_versions,
  public.athlete_data_sharing_consents,
  public.organization_audit_events
  ,public.organization_invitations
  ,public.organization_groups
  ,public.organization_group_athletes
  ,public.organization_group_coach_assignments
TO service_role;
REVOKE MAINTAIN ON TABLE public.organization_invitations, public.organization_groups,
  public.organization_group_athletes, public.organization_group_coach_assignments FROM service_role;
DO $$
DECLARE
  procedure_identity text;
BEGIN
  FOR procedure_identity IN
    SELECT p.oid::regprocedure::text
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      procedure_identity
    );
  END LOOP;
END
$$;
GRANT EXECUTE ON FUNCTION
  public.request_activity_artifact_deletion(uuid),
  public.finalize_activity_artifact_deletion(uuid, boolean),
  public.purge_deleted_activity_artifact(uuid),
  public.switch_activity_source_artifact(uuid, uuid, uuid, text)
TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;




-- Consolidated source: 20260824125639_add_activities_route_id.sql
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS route_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_route_id_activity_routes_id_fk'
      AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_route_id_activity_routes_id_fk
      FOREIGN KEY (route_id)
      REFERENCES public.activity_routes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_route
  ON public.activities USING btree (route_id)
  WHERE route_id IS NOT NULL;


-- Consolidated source: 20260825043028_normalize_public_default_privileges.sql

-- PostgreSQL owners retain implicit privileges. Remove explicit owner entries so
-- public-schema defaults stay deterministic across Supabase bootstrap versions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM postgres;


-- Consolidated source: 20260912004506_restore_current_schema_1.sql
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


-- Consolidated source: 20260912004507_restore_current_schema_2.sql
set local check_function_bodies = off;

alter type "public"."planned_session_source_kind" RENAME to "planned_session_source_kind__pgdelta_replaced";

create type "public"."planned_session_source_kind" as enum (
  'direct',
  'training_plan'
);

alter table "public"."planned_sessions"
  alter column "source_kind" type "public"."planned_session_source_kind" using "source_kind"::text::"public"."planned_session_source_kind";

drop type "public"."planned_session_source_kind__pgdelta_replaced";

alter type "public"."threshold_metric" add value 'lthr' after 'speed';


-- Consolidated source: 20260912004508_restore_current_schema_3.sql
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


-- Consolidated source: 20260913090000_freeze_planned_session_prescriptions.sql

alter table public.activity_plans drop column validation_policy;

alter table public.events drop column training_plan_id cascade;
alter table public.events drop column planned_session_id cascade;
alter table public.events drop column activity_plan_id cascade;

-- Planned events were executable mirrors of planned_sessions. The hard cut removes
-- those redundant rows before narrowing the enum; custom/race events are retained.
delete from public.events where event_type = 'planned';

alter type public.event_type rename to event_type_with_planned;
create type public.event_type as enum ('race_target', 'custom');
alter table public.events
  alter column event_type type public.event_type
  using event_type::text::public.event_type;
drop type public.event_type_with_planned;

create or replace function public.prevent_planned_session_prescription_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id
    or new.contract_version is distinct from old.contract_version
    or new.original_target_date is distinct from old.original_target_date
    or new.source_kind is distinct from old.source_kind
    or new.idempotency_key is distinct from old.idempotency_key
    or new.direct_operation_id is distinct from old.direct_operation_id
    or new.training_plan_id is distinct from old.training_plan_id
    or new.training_plan_revision is distinct from old.training_plan_revision
    or new.source_session_id is distinct from old.source_session_id
    or new.activity_plan_id is distinct from old.activity_plan_id
    or new.activity_plan_revision is distinct from old.activity_plan_revision
    or new.resolution_manifest is distinct from old.resolution_manifest
    or new.prescription_captured_at is distinct from old.prescription_captured_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'planned session prescription and source fields are immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_planned_session_prescription_mutation() from public;
revoke all on function public.prevent_planned_session_prescription_mutation() from anon;
revoke all on function public.prevent_planned_session_prescription_mutation() from authenticated;
revoke all on function public.prevent_planned_session_prescription_mutation() from service_role;

create trigger planned_sessions_prescription_immutable
before update on public.planned_sessions
for each row execute function public.prevent_planned_session_prescription_mutation();


-- Consolidated source: 20260914100000_manual_training_diary.sql

alter table public.activities
  add column entry_provenance text,
  add column manual_activity_category public.activity_category,
  add column diary_date date,
  add column diary_timezone text,
  add column superseded_by_activity_id uuid,
  add column superseded_at timestamptz,
  add column reconciliation_operation_id uuid,
  add column reconciled_planned_session_id uuid,
  alter column started_at drop not null,
  alter column finished_at drop not null,
  alter column elapsed_ms drop not null,
  alter column distance_meters drop not null;

alter table public.activities drop constraint activities_distance_meters_check;
alter table public.activities add constraint activities_distance_meters_check
  check (distance_meters is null or distance_meters >= 0);
alter table public.activities drop constraint activities_elapsed_ms_check;
alter table public.activities add constraint activities_elapsed_ms_check
  check (elapsed_ms is null or elapsed_ms >= 0);
alter table public.activities add constraint activities_manual_observation_check
  check (
    (entry_provenance = 'manual' and manual_activity_category is not null and diary_date is not null and diary_timezone is not null
      and ((started_at is null and finished_at is null) or (started_at is not null and finished_at is not null)))
    or
    (entry_provenance is distinct from 'manual' and manual_activity_category is null and diary_date is null and diary_timezone is null
      and started_at is not null and finished_at is not null and elapsed_ms > 0 and distance_meters is not null)
  );

alter table public.activities
  add constraint activities_reconciled_planned_session_owner_fkey
  foreign key (reconciled_planned_session_id, profile_id)
  references public.planned_sessions(id, profile_id) on delete restrict;

alter table public.activities
  add constraint activities_superseded_by_owner_fkey
  foreign key (superseded_by_activity_id, profile_id)
  references public.activities(id, profile_id) on delete restrict,
  add constraint activities_manual_supersession_check
  check (
    (superseded_by_activity_id is null and superseded_at is null and reconciliation_operation_id is null and reconciled_planned_session_id is null)
    or (entry_provenance = 'manual' and superseded_by_activity_id is not null and superseded_by_activity_id <> id
      and superseded_at is not null and reconciliation_operation_id is not null and reconciled_planned_session_id is not null)
  );
create unique index activities_profile_reconciliation_operation_unique
  on public.activities(profile_id, reconciliation_operation_id)
  where reconciliation_operation_id is not null;

alter table public.planned_sessions add column completion_outcome text, add column skip_operation_id uuid;
update public.planned_sessions
  set completion_outcome = 'full'
  where status = 'completed' and completion_state in ('linked', 'activity_deleted');
alter table public.planned_sessions drop constraint planned_sessions_lifecycle_check;
alter table public.planned_sessions add constraint planned_sessions_lifecycle_check
  check (
    (status = 'scheduled' and num_nonnulls(cancellation_reason, cancelled_at, completed_activity_id, completion_state, completion_outcome, skip_operation_id, linked_at, completion_unlinked_at) = 0)
    or
    (status = 'cancelled' and cancellation_reason is not null and cancelled_at is not null and num_nonnulls(completed_activity_id, completion_state, completion_outcome, skip_operation_id, linked_at, completion_unlinked_at) = 0)
    or
    (status = 'completed' and num_nonnulls(cancellation_reason, cancelled_at) = 0 and (
      (completion_state = 'linked' and completed_activity_id is not null and completion_outcome in ('full', 'partial') and skip_operation_id is null and linked_at is not null and completion_unlinked_at is null)
      or (completion_state = 'activity_deleted' and completed_activity_id is null and completion_outcome in ('full', 'partial') and skip_operation_id is null and linked_at is not null and completion_unlinked_at >= linked_at)
      or (completion_state is null and completion_outcome = 'skipped' and completed_activity_id is null and skip_operation_id is not null and linked_at is not null and completion_unlinked_at is null)
    ))
  );
alter table public.planned_sessions add constraint planned_sessions_completion_outcome_check
  check (completion_outcome is null or completion_outcome in ('full', 'partial', 'skipped'));

create table public.manual_training_diary_operations (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request_fingerprint text not null,
  activity_id uuid not null references public.activities(id) on delete restrict,
  planned_session_id uuid,
  created_at timestamptz not null default now(),
  constraint manual_training_diary_operations_profile_operation_unique unique (profile_id, operation_id)
);
create index manual_training_diary_operations_activity_idx
  on public.manual_training_diary_operations(activity_id);

alter table public.manual_training_diary_operations
  add constraint manual_training_diary_operations_activity_owner_fkey
  foreign key (activity_id, profile_id)
  references public.activities(id, profile_id) on delete restrict,
  add constraint manual_training_diary_operations_planned_session_owner_fkey
  foreign key (planned_session_id, profile_id)
  references public.planned_sessions(id, profile_id) on delete restrict;

alter table public.manual_training_diary_operations enable row level security;
revoke all on table public.manual_training_diary_operations from anon, authenticated;


-- Consolidated source: 20260914110000_manual_diary_segment_validation.sql

create or replace function public.validate_activity_segment_set(target_activity_id uuid) returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  parent_record record;
  segment_count integer;
  max_ordinal integer;
  summed_active bigint;
  summed_moving bigint;
  complete_count integer;
begin
  select elapsed_ms, active_ms, moving_ms, timing_coverage,
    entry_provenance, manual_activity_category, diary_date, diary_timezone,
    started_at, finished_at
    into parent_record
  from public.activities where id = target_activity_id;
  if not found then return; end if;

  -- Manual diary observations are scalar evidence. The immediate manual
  -- contract check owns their nullable measurement fields; they have no segment set.
  if parent_record.entry_provenance = 'manual'
    and parent_record.manual_activity_category is not null
    and parent_record.diary_date is not null
    and parent_record.diary_timezone is not null
    and ((parent_record.started_at is null and parent_record.finished_at is null)
      or (parent_record.started_at is not null and parent_record.finished_at is not null)) then
    return;
  end if;

  select count(*), max(ordinal), sum(active_ms), sum(moving_ms),
    count(*) filter(where timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    into segment_count, max_ordinal, summed_active, summed_moving, complete_count
  from public.activity_segments where activity_id = target_activity_id;
  if segment_count = 0 or max_ordinal <> segment_count - 1 then
    raise exception 'activity % segment ordinals must be contiguous from zero', target_activity_id;
  end if;
  if exists (select 1 from public.activity_segments where activity_id = target_activity_id and end_offset_ms > parent_record.elapsed_ms) then
    raise exception 'activity % segment exceeds parent elapsed bounds', target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    left join public.activity_segments p on p.activity_id=s.activity_id and p.ordinal=s.ordinal-1
    left join public.activity_segments n on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='transition'
      and (p.role is distinct from 'activity' or n.role is distinct from 'activity')
  ) then raise exception 'activity % transition must be between activity segments', target_activity_id; end if;
  if exists (
    select 1 from public.activity_segments s join public.activity_segments n
      on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='rest' and n.role='rest'
  ) then raise exception 'activity % has consecutive rest segments', target_activity_id; end if;
  if parent_record.timing_coverage='complete' then
    if complete_count<>segment_count then
      raise exception 'activity % complete parent requires complete timing for every segment',target_activity_id;
    end if;
    if parent_record.active_ms is distinct from summed_active or parent_record.moving_ms is distinct from summed_moving then
      raise exception 'activity % complete timing does not reconcile with segments',target_activity_id;
    end if;
  elsif parent_record.active_ms is not null or parent_record.moving_ms is not null then
    raise exception 'activity % partial/unavailable parent timing totals must be null',target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    where s.activity_id=target_activity_id
      and (s.summary->>'version' is distinct from s.summary_version::text
        or s.summary#>>'{timing,timingCoverage}' is distinct from s.timing_coverage
        or (s.summary#>>'{timing,activeMs}')::bigint is distinct from s.active_ms
        or (s.summary#>>'{timing,movingMs}')::bigint is distinct from s.moving_ms)
  ) then raise exception 'activity % segment summary timing/version mismatch', target_activity_id; end if;
end $$;


-- Consolidated source: 20260914120000_training_plan_applications.sql

create table public.training_plan_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete restrict,
  source_revision integer not null check (source_revision > 0),
  start_date date not null,
  planning_timezone text not null check (btrim(planning_timezone) <> ''),
  application_revision integer not null default 1 check (application_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profile_id),
  unique (id, profile_id, training_plan_id)
);
create index training_plan_applications_profile_plan_idx
  on public.training_plan_applications(profile_id, training_plan_id, created_at);

create table public.training_plan_application_command_receipts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  command text not null check (command in ('apply', 'update', 'remove')),
  request_fingerprint text not null check (request_fingerprint ~ '^v1:sha256:[0-9a-f]{64}$'),
  application_id uuid,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (profile_id, operation_id),
  check (operation_id ~ '^[A-Za-z0-9_-]{32,128}$'),
  constraint training_plan_application_command_receipts_application_owner_fkey
    foreign key (application_id, profile_id)
    references public.training_plan_applications(id, profile_id) on delete restrict
);
create index training_plan_application_command_receipts_application_idx
  on public.training_plan_application_command_receipts(application_id);

alter table public.training_plan_applications enable row level security;
alter table public.training_plan_application_command_receipts enable row level security;
revoke all on table public.training_plan_applications from anon, authenticated;
revoke all on table public.training_plan_application_command_receipts from anon, authenticated;

-- Backend-only durable command receipts.  They intentionally have no public
-- policies: API transactions access them through the server role only.
create table public.chatbot_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  command text not null,
  request_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (profile_id, operation_id),
  check (operation_id ~ '^[A-Za-z0-9_-]{32,128}$'),
  check (command ~ '^chatbot[.][a-z0-9_.-]{2,80}$'),
  check (request_fingerprint ~ '^v1:sha256:[0-9a-f]{64}$'),
  check (jsonb_typeof(result) = 'object')
);
create index chatbot_operation_receipts_profile_created_idx
  on public.chatbot_operation_receipts(profile_id, created_at);
alter table public.chatbot_operation_receipts enable row level security;
revoke all on table public.chatbot_operation_receipts from anon, authenticated;

alter table public.planned_sessions add column training_plan_application_id uuid;

-- The pre-application immutable-source trigger necessarily rejects the
-- provenance key rewrite below. Replace its function first so the reinstalled
-- guard includes application identity, then suspend only this trigger while
-- this transaction holds the table write fence.
create or replace function public.prevent_planned_session_prescription_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id
    or new.contract_version is distinct from old.contract_version
    or new.original_target_date is distinct from old.original_target_date
    or new.source_kind is distinct from old.source_kind
    or new.idempotency_key is distinct from old.idempotency_key
    or new.direct_operation_id is distinct from old.direct_operation_id
    or new.training_plan_id is distinct from old.training_plan_id
    or new.training_plan_revision is distinct from old.training_plan_revision
    or new.training_plan_application_id is distinct from old.training_plan_application_id
    or new.source_session_id is distinct from old.source_session_id
    or new.activity_plan_id is distinct from old.activity_plan_id
    or new.activity_plan_revision is distinct from old.activity_plan_revision
    or new.resolution_manifest is distinct from old.resolution_manifest
    or new.prescription_captured_at is distinct from old.prescription_captured_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'planned session prescription and source fields are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_planned_session_prescription_mutation() from public;
revoke all on function public.prevent_planned_session_prescription_mutation() from anon;
revoke all on function public.prevent_planned_session_prescription_mutation() from authenticated;
revoke all on function public.prevent_planned_session_prescription_mutation() from service_role;

lock table public.planned_sessions in share row exclusive mode;
drop trigger planned_sessions_prescription_immutable on public.planned_sessions;
alter table public.planned_sessions drop constraint planned_sessions_source_check;

-- Backfill only groups with a proven shared anchor: every source session's
-- stored calendar date must equal one common date offset from its weekday.
-- A group that cannot prove this relation deliberately remains legacy/null.
with mapped as (
  select
    ps.profile_id,
    ps.training_plan_id,
    ps.training_plan_revision,
    ps.planning_date - ((source.value->>'offset_days')::integer) as anchor_date
  from public.planned_sessions ps
  join public.training_plans tp
    on tp.id = ps.training_plan_id
    and tp.revision = ps.training_plan_revision
  join lateral jsonb_array_elements(tp.structure->'sessions') source(value)
    on source.value->>'id' = ps.source_session_id::text
  where ps.source_kind = 'training_plan'
    and ps.training_plan_application_id is null
), candidates as (
  select m.profile_id, m.training_plan_id, m.training_plan_revision,
    min(m.anchor_date)::date as start_date
  from mapped m
  group by m.profile_id, m.training_plan_id, m.training_plan_revision
  having min(m.anchor_date) = max(m.anchor_date)
    and count(*) = (
      select count(*) from public.planned_sessions ps
      where ps.profile_id = m.profile_id
        and ps.training_plan_id = m.training_plan_id
        and ps.training_plan_revision = m.training_plan_revision
        and ps.source_kind = 'training_plan'
        and ps.training_plan_application_id is null
    )
), inserted as (
  insert into public.training_plan_applications (
    profile_id, training_plan_id, source_revision, start_date, planning_timezone
  )
  select c.profile_id, c.training_plan_id, c.training_plan_revision, c.start_date,
    p.planning_timezone
  from candidates c
  join public.profiles p on p.id = c.profile_id
  join pg_timezone_names tz on tz.name = p.planning_timezone
  returning id, profile_id, training_plan_id, source_revision
)
update public.planned_sessions ps
set training_plan_application_id = inserted.id,
    idempotency_key = 'training-plan:' || inserted.id::text || ':' || ps.training_plan_revision::text || ':' || ps.source_session_id::text
from inserted
where ps.profile_id = inserted.profile_id
  and ps.training_plan_id = inserted.training_plan_id
  and ps.training_plan_revision = inserted.source_revision
  and ps.training_plan_application_id is null;

alter table public.planned_sessions
  add constraint planned_sessions_application_source_fkey
  foreign key (training_plan_application_id, profile_id, training_plan_id)
  references public.training_plan_applications(id, profile_id, training_plan_id) on delete restrict;

alter table public.planned_sessions add constraint planned_sessions_source_check check (
  (source_kind = 'direct' and direct_operation_id ~ '^[A-Za-z0-9_-]{32,128}$'
    and idempotency_key = 'direct:' || direct_operation_id
    and num_nonnulls(training_plan_id, training_plan_revision, training_plan_application_id, source_session_id) = 0)
  or
  (source_kind = 'training_plan' and training_plan_id is not null and training_plan_revision > 0
    and source_session_id is not null and direct_operation_id is null
    and ((training_plan_application_id is not null
      and idempotency_key = 'training-plan:' || training_plan_application_id::text || ':' || training_plan_revision::text || ':' || source_session_id::text)
      or (training_plan_application_id is null
        and idempotency_key = 'training-plan:' || training_plan_id::text || ':' || training_plan_revision::text || ':' || source_session_id::text)))
);
create trigger planned_sessions_prescription_immutable
before update on public.planned_sessions
for each row execute function public.prevent_planned_session_prescription_mutation();
create index planned_sessions_application_status_date_idx
  on public.planned_sessions(training_plan_application_id, profile_id, status, planning_date, id)
  where training_plan_application_id is not null;


-- Consolidated source: 20260914130000_training_plan_save_receipts.sql

alter table public.training_plan_application_command_receipts
  drop constraint training_plan_application_command_receipts_command_check;
alter table public.training_plan_application_command_receipts
  add constraint training_plan_application_command_receipts_command_check
  check (command in ('apply', 'update', 'remove', 'save_plan'));


-- Consolidated source: 20260916000000_activity_plan_authoring_policy.sql

-- Separate current-authoring authority. Do not tighten the historical validator:
-- old rows and captured resolution manifests have a different compatibility contract.
-- activity-plan-authoring:functions:start
CREATE OR REPLACE FUNCTION public.activity_plan_js_trim(input text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT btrim(input, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_utf16_key(input text)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE code_point integer; hex_key text := '';
BEGIN
  FOR position IN 1..char_length(input) LOOP
    code_point := ascii(substr(input, position, 1));
    IF code_point > 65535 THEN
      code_point := code_point - 65536;
      hex_key := hex_key || lpad(to_hex(55296 + code_point / 1024),4,'0') || lpad(to_hex(56320 + mod(code_point,1024)),4,'0');
    ELSE hex_key := hex_key || lpad(to_hex(code_point),4,'0'); END IF;
  END LOOP;
  RETURN decode(hex_key,'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_js_length(input text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT char_length(input) + count(*) FILTER (WHERE ascii(substr(input, position, 1)) > 65535)::integer
  FROM generate_series(1,char_length(input)) AS position
$$;

-- Core uses JSON.stringify on finite IEEE-754 numbers. Select the shortest
-- round-tripping decimal precision from the exact IEEE-754 binary rational
-- (ties to an even significand), then apply
-- ECMAScript's fixed/exponent thresholds. Merely copying float8::text is wrong
-- for values such as -61346878300597980, where PostgreSQL prints ...97984.
CREATE OR REPLACE FUNCTION public.activity_plan_js_number(input jsonb)
RETURNS text LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog SET extra_float_digits = 3 AS $$
DECLARE number_value double precision; rendered text; digits text; sign text := '';
  exact_decimal numeric; candidate numeric; other_candidate numeric; unit_value numeric; truncated numeric;
  exponent_value integer; scale_value integer; binary_exponent integer; power_exponent integer;
  binary_value bytea; significand numeric; power_factor numeric; power_result numeric := 1;
  matched boolean := false;
BEGIN
  number_value := (input #>> '{}')::double precision;
  IF number_value = 0 THEN RETURN '0'; END IF;
  IF number_value::text IN ('Infinity','-Infinity','NaN') THEN RAISE EXCEPTION 'non-finite canonical JSON number' USING ERRCODE='22003'; END IF;
  rendered := number_value::text;
  binary_value := float8send(abs(number_value));
  binary_exponent := (get_byte(binary_value,0) & 127) * 16 + get_byte(binary_value,1) / 16;
  significand := get_byte(binary_value,1) & 15;
  FOR byte_index IN 2..7 LOOP significand := significand * 256 + get_byte(binary_value,byte_index); END LOOP;
  IF binary_exponent = 0 THEN binary_exponent := -1074;
  ELSE significand := significand + 4503599627370496; binary_exponent := binary_exponent - 1075; END IF;
  power_factor := CASE WHEN binary_exponent < 0 THEN 5 ELSE 2 END;
  power_exponent := abs(binary_exponent);
  WHILE power_exponent > 0 LOOP
    IF mod(power_exponent,2) = 1 THEN power_result := power_result * power_factor; END IF;
    power_exponent := power_exponent / 2;
    IF power_exponent > 0 THEN power_factor := power_factor * power_factor; END IF;
  END LOOP;
  exact_decimal := significand * power_result;
  IF binary_exponent < 0 THEN exact_decimal := (exact_decimal::text || 'e' || binary_exponent::text)::numeric; END IF;
  IF number_value < 0 THEN exact_decimal := -exact_decimal; END IF;
  IF strpos(rendered,'e') > 0 THEN exponent_value := split_part(rendered,'e',2)::integer;
  ELSE
    rendered := ltrim(rendered,'-');
    IF split_part(rendered,'.',1) <> '0' THEN exponent_value := length(split_part(rendered,'.',1))-1;
    ELSE digits := split_part(rendered,'.',2); exponent_value := -(length(digits)-length(ltrim(digits,'0'))+1); END IF;
  END IF;
  FOR precision_value IN 1..17 LOOP
    scale_value := precision_value-exponent_value-1;
    unit_value := ('1e' || (-scale_value)::text)::numeric;
    candidate := round(exact_decimal,scale_value); truncated := trunc(exact_decimal,scale_value);
    IF abs(exact_decimal-truncated) = unit_value/2 AND mod(abs(truncated/unit_value),2) = 0 THEN candidate := truncated; END IF;
    IF abs(candidate) <= 1.7976931348623157e308::numeric AND candidate::double precision = number_value THEN matched := true; EXIT; END IF;
    -- At a binary exponent boundary the round-trip interval is asymmetric.
    -- Check the other decimal neighbor as well before increasing precision.
    other_candidate := candidate + CASE WHEN candidate < exact_decimal THEN unit_value ELSE -unit_value END;
    IF abs(other_candidate) <= 1.7976931348623157e308::numeric AND other_candidate::double precision = number_value THEN candidate := other_candidate; matched := true; EXIT; END IF;
  END LOOP;
  IF NOT matched THEN RAISE EXCEPTION 'unable to canonicalize finite JavaScript number' USING ERRCODE='22003'; END IF;
  rendered := abs(candidate)::text;
  IF strpos(rendered,'.') > 0 THEN rendered := rtrim(rtrim(rendered,'0'),'.'); END IF;
  IF candidate < 0 THEN sign := '-'; END IF;
  IF abs(candidate) >= 0.000001 AND abs(candidate) < 1e21::numeric THEN RETURN sign || rendered; END IF;
  IF split_part(rendered,'.',1) <> '0' THEN exponent_value := length(split_part(rendered,'.',1))-1;
  ELSE digits := split_part(rendered,'.',2); exponent_value := -(length(digits)-length(ltrim(digits,'0'))+1); END IF;
  digits := rtrim(ltrim(replace(rendered,'.',''),'0'),'0');
  RETURN sign || left(digits,1) || CASE WHEN length(digits)>1 THEN '.' || substr(digits,2) ELSE '' END
    || 'e' || CASE WHEN exponent_value >= 0 THEN '+' ELSE '-' END || abs(exponent_value)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_canonical_json(input jsonb)
RETURNS text LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE result text := ''; entry record; separator text := '';
BEGIN
  CASE jsonb_typeof(input)
    WHEN 'object' THEN
      -- JS enumerates array-index properties numerically, then the remaining
      -- keys in the UTF-16 order established by normalizeCanonicalJson().
      FOR entry IN SELECT e.key, e.value FROM jsonb_each(input) e
        ORDER BY CASE WHEN e.key ~ '^(0|[1-9][0-9]{0,9})$' THEN CASE WHEN e.key::bigint < 4294967295 THEN e.key::bigint ELSE 4294967295 END ELSE 4294967295 END,
          public.activity_plan_utf16_key(e.key)
      LOOP
        result := result || separator || to_jsonb(entry.key)::text || ':' || public.activity_plan_core_canonical_json(entry.value); separator := ',';
      END LOOP;
      RETURN '{' || result || '}';
    WHEN 'array' THEN
      FOR entry IN SELECT value FROM jsonb_array_elements(input) LOOP
        result := result || separator || public.activity_plan_core_canonical_json(entry.value); separator := ',';
      END LOOP;
      RETURN '[' || result || ']';
    WHEN 'number' THEN RETURN public.activity_plan_js_number(input);
    ELSE RETURN input::text;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_normalize_adaptation(input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE result jsonb := input; control jsonb; state_value jsonb; values_value jsonb; ordinal integer;
BEGIN
  IF input IS NULL OR input = 'null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  FOR control, ordinal IN SELECT value, ordinality::integer-1 FROM jsonb_array_elements(input->'controls') WITH ORDINALITY LOOP
    control := jsonb_set(control,'{key}',to_jsonb(public.activity_plan_js_trim(control->>'key')));
    control := jsonb_set(control,'{label}',to_jsonb(public.activity_plan_js_trim(control->>'label')));
    result := jsonb_set(result,ARRAY['controls',ordinal::text],control);
  END LOOP;
  IF input ? 'allowedStates' THEN
    FOR state_value, ordinal IN SELECT value, ordinality::integer-1 FROM jsonb_array_elements(input->'allowedStates') WITH ORDINALITY LOOP
      state_value := jsonb_set(state_value,'{label}',to_jsonb(public.activity_plan_js_trim(state_value->>'label')));
      SELECT jsonb_object_agg(public.activity_plan_js_trim(e.key),e.value) INTO values_value FROM jsonb_each(state_value->'values') e;
      state_value := jsonb_set(state_value,'{values}',values_value);
      result := jsonb_set(result,ARRAY['allowedStates',ordinal::text],state_value);
    END LOOP;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_structure_hash(input jsonb)
RETURNS text LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT 'v1:sha256:' || encode(sha256(convert_to(public.activity_plan_core_canonical_json(input),'UTF8')),'hex')
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_semantic_hash(input jsonb, adaptation jsonb, intent text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT public.activity_plan_core_structure_hash(jsonb_build_object('structure',input,'adaptation',public.activity_plan_core_normalize_adaptation(adaptation),'training_intent',intent))
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  historical jsonb := input;
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  si integer; ii integer; ti integer; category text; duration_type text;
  types text[]; objective_count integer; intensity numeric;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR octet_length(input::text) > 1200000
    OR jsonb_typeof(input->'segments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(input->'segments') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR segment, si IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(input->'segments') WITH ORDINALITY LOOP
    IF segment->>'role' = 'activity' THEN
      IF jsonb_typeof(segment->'intervals') IS DISTINCT FROM 'array' OR jsonb_array_length(segment->'intervals') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
      FOR interval_value, ii IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY LOOP
        IF jsonb_typeof(interval_value->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(interval_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
        FOR step_value, ti IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY LOOP
          IF step_value->>'purpose' IS NULL OR step_value->>'purpose' NOT IN ('warmup','work','recovery','cooldown','technique') THEN RETURN false; END IF;
          duration_type := step_value->'duration'->>'type';
          IF duration_type IS NULL OR NOT (
            duration_type = 'time'
            OR (duration_type = 'distance' AND category IN ('run','bike','swim'))
            OR (duration_type = 'repetitions' AND category = 'strength')
          ) THEN RETURN false; END IF;
          IF jsonb_typeof(step_value->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(step_value->'targets') NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
          IF duration_type = 'repetitions' AND (jsonb_array_length(step_value->'targets') <> 1 OR step_value->'targets'->0->>'type' IS DISTINCT FROM 'RPE') THEN RETURN false; END IF;
          types := '{}'; objective_count := 0;
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            IF target->>'type' = ANY(types) THEN RETURN false; END IF;
            types := array_append(types, target->>'type');
            IF target->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
            intensity := (target->>'intensity')::numeric;
            IF target->>'type' = 'RPE' AND (intensity NOT BETWEEN 1 AND 10 OR mod(intensity * 2, 1) <> 0) THEN RETURN false; END IF;
            IF target->>'type' = '%MaxHR' AND intensity > 100 THEN RETURN false; END IF;
            IF duration_type = 'distance' AND target->>'type' = 'speed' AND intensity <= 0 THEN RETURN false; END IF;
          END LOOP;
          IF objective_count > 1 OR (objective_count = 0 AND NOT ('RPE' = ANY(types))) THEN RETURN false; END IF;
          -- The historical SQL shape predates optional purpose. Strip only that
          -- field in a copy, then reuse its bounded structural/type validation.
          historical := jsonb_set(historical, ARRAY['segments',si::text,'intervals',ii::text,'steps',ti::text], step_value - 'purpose');
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN public.activity_plan_structure_is_canonical(historical) IS TRUE;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_intent_is_valid(input jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  work_count numeric := 0; work_seconds numeric := 0; recovery_seconds numeric := 0;
  seconds numeric; repeats numeric; intensity numeric;
  high_intensity boolean := false; threshold_intensity boolean := false; technique boolean := false;
BEGIN
  IF intent IS NULL OR intent NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance') THEN RETURN false; END IF;
  FOR segment IN SELECT value FROM jsonb_array_elements(input->'segments') LOOP
    IF segment->>'role' = 'rest' THEN recovery_seconds := recovery_seconds + (segment->'duration'->>'seconds')::numeric;
    ELSE
      FOR interval_value IN SELECT value FROM jsonb_array_elements(segment->'intervals') LOOP
        repeats := (interval_value->>'repetitions')::numeric;
        FOR step_value IN SELECT value FROM jsonb_array_elements(interval_value->'steps') LOOP
          seconds := CASE WHEN step_value->'duration'->>'type' = 'time' THEN (step_value->'duration'->>'seconds')::numeric * repeats ELSE 0 END;
          IF step_value->>'purpose' = 'work' THEN work_count := work_count + repeats; work_seconds := work_seconds + seconds;
          ELSIF step_value->>'purpose' = 'recovery' THEN recovery_seconds := recovery_seconds + seconds;
          ELSIF step_value->>'purpose' = 'technique' THEN technique := true; END IF;
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            intensity := (target->>'intensity')::numeric;
            high_intensity := high_intensity OR CASE target->>'type'
              WHEN '%FTP' THEN intensity >= 105 WHEN '%ThresholdHR' THEN intensity >= 100
              WHEN '%MaxHR' THEN intensity >= 90 WHEN 'RPE' THEN intensity >= 8 ELSE false END;
            threshold_intensity := threshold_intensity OR CASE target->>'type'
              WHEN '%FTP' THEN intensity BETWEEN 88 AND 105 WHEN '%ThresholdHR' THEN intensity BETWEEN 95 AND 105
              WHEN '%MaxHR' THEN intensity BETWEEN 80 AND 95 WHEN 'RPE' THEN intensity >= 6 ELSE false END;
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  IF intent IN ('vo2max','threshold_development','anaerobic_capacity','speed_skill') AND work_count = 0 THEN RETURN false; END IF;
  IF intent IN ('vo2max','threshold_development','anaerobic_capacity') AND work_seconds > 0 AND recovery_seconds > 0 AND work_seconds / recovery_seconds < 0.5 THEN RETURN false; END IF;
  RETURN NOT ((intent = 'vo2max' AND NOT high_intensity) OR (intent = 'threshold_development' AND NOT threshold_intensity)
    OR (intent = 'recovery' AND high_intensity) OR (intent = 'technique' AND NOT technique));
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_uuid_is_valid(input jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_typeof(input) = 'string' AND (input #>> '{}') ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$', false)
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_content_is_valid(input jsonb, adaptation jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  control jsonb; target jsonb; range_value jsonb; state_value jsonb; values_value jsonb;
  segment jsonb; interval_value jsonb; step_value jsonb;
  bindings jsonb := '[]'::jsonb; binding jsonb; owners jsonb := '{}'::jsonb; defaults jsonb := '{}'::jsonb;
  ranges jsonb := '{}'::jsonb; states jsonb := '[{}]'::jsonb; next_states jsonb; seen_states jsonb := '[]'::jsonb;
  keys text[] := '{}'::text[]; control_ids text[] := '{}'::text[]; state_ids text[] := '{}'::text[];
  key text; kind text; unit_key text; first_unit text; quantity text; field_path text[];
  minimum numeric; maximum numeric; default_value numeric; increment numeric; steps double precision;
  state_count numeric := 1; cardinality integer; amount numeric;
  si integer; ii integer; ti integer; target_index integer; matches integer;
  resolved jsonb; has_default boolean := false; entry record;
BEGIN
  IF NOT public.activity_plan_authoring_structure_is_valid(input) OR NOT public.activity_plan_authoring_intent_is_valid(input, intent) THEN RETURN false; END IF;
  IF adaptation IS NULL OR adaptation = 'null'::jsonb THEN RETURN true; END IF;
  IF public.activity_plan_jsonb_has_exact_keys(adaptation, ARRAY['controls'], ARRAY['allowedStates']) IS NOT TRUE
    OR jsonb_typeof(adaptation->'controls') IS DISTINCT FROM 'array'
    OR jsonb_array_length(adaptation->'controls') NOT BETWEEN 1 AND 32 THEN RETURN false; END IF;
  FOR control IN SELECT value FROM jsonb_array_elements(adaptation->'controls') LOOP
    IF public.activity_plan_jsonb_has_exact_keys(control, ARRAY['id','key','label','kind','range','targets']) IS NOT TRUE
      OR NOT public.activity_plan_authoring_uuid_is_valid(control->'id')
      OR jsonb_typeof(control->'key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(control->'label') IS DISTINCT FROM 'string'
      OR public.activity_plan_js_length(public.activity_plan_js_trim(control->>'label')) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(control->'targets') IS DISTINCT FROM 'array'
      OR jsonb_array_length(control->'targets') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
    key := public.activity_plan_js_trim(control->>'key'); kind := control->>'kind';
    IF public.activity_plan_js_length(key) NOT BETWEEN 1 AND 64 OR key !~ '^[a-z][a-z0-9_]*$' OR key = ANY(keys)
      OR control->>'id' = ANY(control_ids) OR kind IS NULL
      OR kind NOT IN ('interval_repetitions','step_quantity','recovery_quantity','target_intensity') THEN RETURN false; END IF;
    keys := array_append(keys, key); control_ids := array_append(control_ids, control->>'id');
    range_value := control->'range';
    IF public.activity_plan_jsonb_has_exact_keys(range_value, ARRAY['minimum','default','maximum','increment']) IS NOT TRUE
      OR EXISTS (SELECT 1 FROM jsonb_each(range_value) AS r WHERE jsonb_typeof(r.value) <> 'number') THEN RETURN false; END IF;
    minimum := (range_value->>'minimum')::numeric; maximum := (range_value->>'maximum')::numeric;
    default_value := (range_value->>'default')::numeric; increment := (range_value->>'increment')::numeric;
    IF increment <= 0 OR minimum > default_value OR default_value > maximum THEN RETURN false; END IF;
    FOREACH amount IN ARRAY ARRAY[default_value, maximum] LOOP
      -- Core's alignment contract uses IEEE-754 arithmetic after JSON decoding.
      steps := (amount::double precision - minimum::double precision) / increment::double precision;
      IF abs(steps - round(steps)) > 0.000000001 OR abs(round(steps)) > 9007199254740991 THEN RETURN false; END IF;
    END LOOP;
    state_count := state_count * (round((maximum - minimum) / increment) + 1);
    defaults := defaults || jsonb_build_object(key, default_value);
    ranges := ranges || jsonb_build_object(key, range_value);
    first_unit := NULL;
    FOR target IN SELECT value FROM jsonb_array_elements(control->'targets') LOOP
      IF target->>'type' = 'rest_segment' THEN
        IF kind <> 'recovery_quantity' OR public.activity_plan_jsonb_has_exact_keys(target, ARRAY['type','segmentId']) IS NOT TRUE THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO segment, si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id' = target->>'segmentId';
        IF segment IS NULL OR segment->>'role' <> 'rest' THEN RETURN false; END IF;
        field_path := ARRAY['segments',si::text,'duration','seconds']; unit_key := 'time';
      ELSE
        IF public.activity_plan_jsonb_has_exact_keys(target,
          CASE target->>'type'
            WHEN 'interval_repetitions' THEN ARRAY['type','activitySegmentId','intervalId']
            WHEN 'target_intensity' THEN ARRAY['type','activitySegmentId','intervalId','stepId','targetType']
            ELSE ARRAY['type','activitySegmentId','intervalId','stepId','quantityType'] END) IS NOT TRUE THEN RETURN false; END IF;
        IF NOT public.activity_plan_authoring_uuid_is_valid(target->'activitySegmentId') OR NOT public.activity_plan_authoring_uuid_is_valid(target->'intervalId') THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO segment, si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id' = target->>'activitySegmentId';
        IF segment IS NULL OR segment->>'role' <> 'activity' THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO interval_value, ii FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY WHERE value->>'id' = target->>'intervalId';
        IF interval_value IS NULL THEN RETURN false; END IF;
        field_path := ARRAY['segments',si::text,'intervals',ii::text];
        IF target->>'type' = 'interval_repetitions' THEN
          IF kind <> 'interval_repetitions' THEN RETURN false; END IF;
          field_path := field_path || ARRAY['repetitions']; unit_key := 'interval_repetitions';
        ELSE
          IF NOT public.activity_plan_authoring_uuid_is_valid(target->'stepId') THEN RETURN false; END IF;
          SELECT value, ordinality::integer - 1 INTO step_value, ti FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY WHERE value->>'id' = target->>'stepId';
          IF step_value IS NULL THEN RETURN false; END IF;
          field_path := field_path || ARRAY['steps',ti::text];
          IF target->>'type' = 'target_intensity' THEN
            IF kind <> 'target_intensity' THEN RETURN false; END IF;
            SELECT count(*) INTO matches FROM jsonb_array_elements(step_value->'targets') AS v WHERE v->>'type' = target->>'targetType';
            IF matches <> 1 THEN RETURN false; END IF;
            SELECT ordinality::integer - 1 INTO target_index FROM jsonb_array_elements(step_value->'targets') WITH ORDINALITY WHERE value->>'type' = target->>'targetType';
            IF public.activity_plan_target_is_canonical(jsonb_build_object('type', target->>'targetType', 'intensity', minimum), input->>'activity_category') IS NOT TRUE
              OR public.activity_plan_target_is_canonical(jsonb_build_object('type', target->>'targetType', 'intensity', maximum), input->>'activity_category') IS NOT TRUE THEN RETURN false; END IF;
            field_path := field_path || ARRAY['targets',target_index::text,'intensity']; unit_key := 'intensity:' || (target->>'targetType');
          ELSE
            IF ((kind = 'step_quantity' AND target->>'type' = 'step_quantity') OR (kind = 'recovery_quantity' AND target->>'type' = 'recovery_step' AND step_value->>'purpose' = 'recovery')) IS NOT TRUE THEN RETURN false; END IF;
            quantity := target->>'quantityType';
            IF quantity IS NULL OR quantity NOT IN ('time','distance','repetitions') OR quantity IS DISTINCT FROM step_value->'duration'->>'type' THEN RETURN false; END IF;
            field_path := field_path || ARRAY['duration', CASE quantity WHEN 'time' THEN 'seconds' WHEN 'distance' THEN 'meters' ELSE 'count' END]; unit_key := quantity;
          END IF;
        END IF;
      END IF;
      IF kind <> 'target_intensity' AND (minimum < 1 OR mod(minimum,1) <> 0 OR mod(maximum,1) <> 0 OR mod(default_value,1) <> 0 OR mod(increment,1) <> 0) THEN RETURN false; END IF;
      IF first_unit IS NOT NULL AND first_unit <> unit_key THEN RETURN false; END IF;
      first_unit := unit_key;
      IF (input #>> field_path)::numeric IS DISTINCT FROM default_value THEN RETURN false; END IF;
      IF owners ? field_path::text AND owners->>field_path::text <> key THEN RETURN false; END IF;
      owners := owners || jsonb_build_object(field_path::text, key);
      bindings := bindings || jsonb_build_array(jsonb_build_object('key',key,'path',to_jsonb(field_path)));
    END LOOP;
  END LOOP;
  IF adaptation ? 'allowedStates' THEN
    IF jsonb_typeof(adaptation->'allowedStates') IS DISTINCT FROM 'array' OR jsonb_array_length(adaptation->'allowedStates') NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
    states := '[]'::jsonb;
    FOR state_value IN SELECT value FROM jsonb_array_elements(adaptation->'allowedStates') LOOP
      IF public.activity_plan_jsonb_has_exact_keys(state_value, ARRAY['id','label','values']) IS NOT TRUE
        OR NOT public.activity_plan_authoring_uuid_is_valid(state_value->'id') OR state_value->>'id' = ANY(state_ids)
        OR jsonb_typeof(state_value->'label') IS DISTINCT FROM 'string' OR public.activity_plan_js_length(public.activity_plan_js_trim(state_value->>'label')) NOT BETWEEN 1 AND 100
        OR jsonb_typeof(state_value->'values') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      state_ids := array_append(state_ids, state_value->>'id');
      SELECT coalesce(jsonb_object_agg(public.activity_plan_js_trim(e.key), e.value), '{}'::jsonb) INTO values_value FROM jsonb_each(state_value->'values') e;
      IF public.activity_plan_jsonb_has_exact_keys(values_value, keys) IS NOT TRUE THEN RETURN false; END IF;
      FOR entry IN SELECT * FROM jsonb_each(values_value) LOOP
        IF jsonb_typeof(entry.value) <> 'number' THEN RETURN false; END IF;
        range_value := ranges->entry.key; amount := (entry.value #>> '{}')::numeric;
        minimum := (range_value->>'minimum')::numeric; maximum := (range_value->>'maximum')::numeric; increment := (range_value->>'increment')::numeric;
        steps := (amount::double precision - minimum::double precision) / increment::double precision;
        IF amount < minimum OR amount > maximum OR abs(steps-round(steps)) > 0.000000001 THEN RETURN false; END IF;
      END LOOP;
      IF seen_states @> jsonb_build_array(values_value) THEN RETURN false; END IF;
      seen_states := seen_states || jsonb_build_array(values_value);
      has_default := has_default OR values_value = defaults;
      states := states || jsonb_build_array(values_value);
    END LOOP;
    IF NOT has_default THEN RETURN false; END IF;
  ELSE
    IF state_count > 10000 THEN RETURN false; END IF;
    FOREACH key IN ARRAY keys LOOP
      range_value := ranges->key; minimum := (range_value->>'minimum')::numeric;
      maximum := (range_value->>'maximum')::numeric; increment := (range_value->>'increment')::numeric;
      cardinality := round((maximum - minimum)/increment)::integer + 1;
      next_states := '[]'::jsonb;
      FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP
        FOR offset_index IN 0..cardinality-1 LOOP
          amount := CASE WHEN offset_index = cardinality-1 THEN maximum ELSE minimum + offset_index*increment END;
          next_states := next_states || jsonb_build_array(values_value || jsonb_build_object(key,amount));
        END LOOP;
      END LOOP;
      states := next_states;
    END LOOP;
  END IF;
  FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP
    resolved := input;
    FOR binding IN SELECT value FROM jsonb_array_elements(bindings) LOOP
      SELECT array_agg(value) INTO field_path FROM jsonb_array_elements_text(binding->'path');
      resolved := jsonb_set(resolved, field_path, values_value->(binding->>'key'));
    END LOOP;
    IF NOT public.activity_plan_authoring_structure_is_valid(resolved) OR NOT public.activity_plan_authoring_intent_is_valid(resolved,intent) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_authoring()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.structure IS DISTINCT FROM OLD.structure
    OR NEW.adaptation IS DISTINCT FROM OLD.adaptation OR NEW.training_intent IS DISTINCT FROM OLD.training_intent
    OR NEW.structure_hash IS DISTINCT FROM OLD.structure_hash OR NEW.semantic_hash IS DISTINCT FROM OLD.semantic_hash THEN
    IF public.activity_plan_authoring_content_is_valid(NEW.structure, NEW.adaptation, NEW.training_intent) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_authoring_guard',
        MESSAGE = 'ACTIVITY_PLAN_AUTHORING_INVALID_CONTENT';
    END IF;
    IF NEW.structure_hash IS DISTINCT FROM public.activity_plan_core_structure_hash(NEW.structure)
      OR NEW.semantic_hash IS DISTINCT FROM public.activity_plan_core_semantic_hash(NEW.structure,NEW.adaptation,NEW.training_intent) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_hash_guard', MESSAGE = 'ACTIVITY_PLAN_HASH_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.structure IS DISTINCT FROM OLD.structure OR NEW.adaptation IS DISTINCT FROM OLD.adaptation
    OR NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;
-- activity-plan-authoring:functions:end

-- Widen the existing shape gate, without scanning or retrofitting historical rows.
-- The authoring trigger below owns inserts and semantic edits; metadata-only
-- changes to historical rows intentionally retain their old compatibility contract.
ALTER TABLE public.activity_plans DROP CONSTRAINT activity_plans_structure_canonical_check;
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_canonical_check
  CHECK (public.activity_plan_structure_is_canonical(structure) OR public.activity_plan_authoring_structure_is_valid(structure)) NOT VALID;

-- activity-plan-authoring:triggers:start
DROP TRIGGER IF EXISTS activity_plans_authoring_guard ON public.activity_plans;
CREATE TRIGGER activity_plans_authoring_guard BEFORE INSERT OR UPDATE ON public.activity_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_plan_authoring();
DROP TRIGGER IF EXISTS activity_plans_enforce_revision ON public.activity_plans;
CREATE TRIGGER activity_plans_enforce_revision BEFORE UPDATE ON public.activity_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_plan_revision();
-- activity-plan-authoring:triggers:end

-- activity-plan-authoring:acl:start
REVOKE ALL ON FUNCTION public.activity_plan_js_trim(text), public.activity_plan_utf16_key(text), public.activity_plan_js_length(text),
  public.activity_plan_js_number(jsonb), public.activity_plan_core_canonical_json(jsonb), public.activity_plan_core_normalize_adaptation(jsonb),
  public.activity_plan_core_structure_hash(jsonb), public.activity_plan_core_semantic_hash(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_plan_js_trim(text), public.activity_plan_utf16_key(text), public.activity_plan_js_length(text),
  public.activity_plan_js_number(jsonb), public.activity_plan_core_canonical_json(jsonb), public.activity_plan_core_normalize_adaptation(jsonb),
  public.activity_plan_core_structure_hash(jsonb), public.activity_plan_core_semantic_hash(jsonb,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb),
  public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_uuid_is_valid(jsonb),
  public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text), public.enforce_activity_plan_authoring()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb),
  public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_uuid_is_valid(jsonb),
  public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text), public.enforce_activity_plan_authoring()
  TO service_role;
-- activity-plan-authoring:acl:end


-- Consolidated source: 20260921000000_activity_plan_purpose_free_authoring.sql

-- Current authoring no longer classifies steps by purpose. The historical
-- structure validator remains untouched for frozen documents and manifests.
-- activity-plan-authoring:functions:start
CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  historical jsonb := input;
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  si integer; ii integer; ti integer; category text; duration_type text;
  types text[]; objective_count integer; intensity numeric;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR octet_length(input::text) > 1200000
    OR jsonb_typeof(input->'segments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(input->'segments') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR segment, si IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(input->'segments') WITH ORDINALITY LOOP
    IF segment->>'role' = 'activity' THEN
      IF jsonb_typeof(segment->'intervals') IS DISTINCT FROM 'array' OR jsonb_array_length(segment->'intervals') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
      FOR interval_value, ii IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY LOOP
        IF jsonb_typeof(interval_value->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(interval_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
        FOR step_value, ti IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY LOOP
          IF step_value ? 'purpose' AND (jsonb_typeof(step_value->'purpose') <> 'string' OR step_value->>'purpose' NOT IN ('warmup','work','recovery','cooldown','technique')) THEN RETURN false; END IF;
          duration_type := step_value->'duration'->>'type';
          IF duration_type IS NULL OR NOT (duration_type = 'time' OR (duration_type = 'distance' AND category IN ('run','bike','swim')) OR (duration_type = 'repetitions' AND category = 'strength')) THEN RETURN false; END IF;
          IF jsonb_typeof(step_value->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(step_value->'targets') NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
          IF duration_type = 'repetitions' AND (jsonb_array_length(step_value->'targets') <> 1 OR step_value->'targets'->0->>'type' IS DISTINCT FROM 'RPE') THEN RETURN false; END IF;
          types := '{}'; objective_count := 0;
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            IF target->>'type' = ANY(types) THEN RETURN false; END IF;
            types := array_append(types, target->>'type');
            IF target->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
            intensity := (target->>'intensity')::numeric;
            IF target->>'type' = 'RPE' AND (intensity NOT BETWEEN 1 AND 10 OR mod(intensity * 2, 1) <> 0) THEN RETURN false; END IF;
            IF target->>'type' = '%MaxHR' AND intensity > 100 THEN RETURN false; END IF;
            IF duration_type = 'distance' AND target->>'type' = 'speed' AND intensity <= 0 THEN RETURN false; END IF;
          END LOOP;
          IF objective_count > 1 OR (objective_count = 0 AND NOT ('RPE' = ANY(types))) THEN RETURN false; END IF;
          historical := jsonb_set(historical, ARRAY['segments',si::text,'intervals',ii::text,'steps',ti::text], step_value - 'purpose');
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN public.activity_plan_structure_is_canonical(historical) IS TRUE;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_intent_is_valid(input jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  intensity numeric; high_intensity boolean := false; threshold_intensity boolean := false;
BEGIN
  IF intent IS NULL OR intent NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance') THEN RETURN false; END IF;
  FOR segment IN SELECT value FROM jsonb_array_elements(input->'segments') LOOP
    IF segment->>'role' = 'activity' THEN
      FOR interval_value IN SELECT value FROM jsonb_array_elements(segment->'intervals') LOOP
        FOR step_value IN SELECT value FROM jsonb_array_elements(interval_value->'steps') LOOP
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            intensity := (target->>'intensity')::numeric;
            high_intensity := high_intensity OR CASE target->>'type' WHEN '%FTP' THEN intensity >= 105 WHEN '%ThresholdHR' THEN intensity >= 100 WHEN '%MaxHR' THEN intensity >= 90 WHEN 'RPE' THEN intensity >= 8 ELSE false END;
            threshold_intensity := threshold_intensity OR CASE target->>'type' WHEN '%FTP' THEN intensity BETWEEN 88 AND 105 WHEN '%ThresholdHR' THEN intensity BETWEEN 95 AND 105 WHEN '%MaxHR' THEN intensity BETWEEN 80 AND 95 WHEN 'RPE' THEN intensity >= 6 ELSE false END;
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NOT ((intent = 'vo2max' AND NOT high_intensity) OR (intent = 'threshold_development' AND NOT threshold_intensity) OR (intent = 'recovery' AND high_intensity));
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

-- Preserve the complete bounded adaptation validator. Recovery targets retain
-- their own kind and reference; no purpose is synthesized or inferred.
CREATE OR REPLACE FUNCTION public.activity_plan_authoring_content_is_valid(input jsonb, adaptation jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  control jsonb; target jsonb; range_value jsonb; state_value jsonb; values_value jsonb;
  segment jsonb; interval_value jsonb; step_value jsonb;
  bindings jsonb := '[]'::jsonb; binding jsonb; owners jsonb := '{}'::jsonb; defaults jsonb := '{}'::jsonb;
  ranges jsonb := '{}'::jsonb; states jsonb := '[{}]'::jsonb; next_states jsonb; seen_states jsonb := '[]'::jsonb;
  keys text[] := '{}'::text[]; control_ids text[] := '{}'::text[]; state_ids text[] := '{}'::text[];
  key text; kind text; unit_key text; first_unit text; quantity text; field_path text[];
  minimum numeric; maximum numeric; default_value numeric; increment numeric; steps double precision;
  state_count numeric := 1; cardinality integer; amount numeric;
  si integer; ii integer; ti integer; target_index integer; matches integer;
  resolved jsonb; has_default boolean := false; entry record;
BEGIN
  IF NOT public.activity_plan_authoring_structure_is_valid(input) OR NOT public.activity_plan_authoring_intent_is_valid(input, intent) THEN RETURN false; END IF;
  IF adaptation IS NULL OR adaptation = 'null'::jsonb THEN RETURN true; END IF;
  IF public.activity_plan_jsonb_has_exact_keys(adaptation, ARRAY['controls'], ARRAY['allowedStates']) IS NOT TRUE OR jsonb_typeof(adaptation->'controls') IS DISTINCT FROM 'array' OR jsonb_array_length(adaptation->'controls') NOT BETWEEN 1 AND 32 THEN RETURN false; END IF;
  FOR control IN SELECT value FROM jsonb_array_elements(adaptation->'controls') LOOP
    IF public.activity_plan_jsonb_has_exact_keys(control, ARRAY['id','key','label','kind','range','targets']) IS NOT TRUE OR NOT public.activity_plan_authoring_uuid_is_valid(control->'id') OR jsonb_typeof(control->'key') IS DISTINCT FROM 'string' OR jsonb_typeof(control->'label') IS DISTINCT FROM 'string' OR public.activity_plan_js_length(public.activity_plan_js_trim(control->>'label')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(control->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(control->'targets') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
    key := public.activity_plan_js_trim(control->>'key'); kind := control->>'kind';
    IF public.activity_plan_js_length(key) NOT BETWEEN 1 AND 64 OR key !~ '^[a-z][a-z0-9_]*$' OR key = ANY(keys) OR control->>'id' = ANY(control_ids) OR kind NOT IN ('interval_repetitions','step_quantity','recovery_quantity','target_intensity') THEN RETURN false; END IF;
    keys := array_append(keys,key); control_ids := array_append(control_ids,control->>'id'); range_value := control->'range';
    IF public.activity_plan_jsonb_has_exact_keys(range_value, ARRAY['minimum','default','maximum','increment']) IS NOT TRUE OR EXISTS (SELECT 1 FROM jsonb_each(range_value) AS r WHERE jsonb_typeof(r.value) <> 'number') THEN RETURN false; END IF;
    minimum := (range_value->>'minimum')::numeric; maximum := (range_value->>'maximum')::numeric; default_value := (range_value->>'default')::numeric; increment := (range_value->>'increment')::numeric;
    IF increment <= 0 OR minimum > default_value OR default_value > maximum THEN RETURN false; END IF;
    FOREACH amount IN ARRAY ARRAY[default_value,maximum] LOOP steps := (amount::double precision-minimum::double precision)/increment::double precision; IF abs(steps-round(steps)) > .000000001 OR abs(round(steps)) > 9007199254740991 THEN RETURN false; END IF; END LOOP;
    state_count := state_count*(round((maximum-minimum)/increment)+1); defaults := defaults || jsonb_build_object(key,default_value); ranges := ranges || jsonb_build_object(key,range_value); first_unit := NULL;
    FOR target IN SELECT value FROM jsonb_array_elements(control->'targets') LOOP
      IF target->>'type' = 'rest_segment' THEN
        IF kind <> 'recovery_quantity' OR public.activity_plan_jsonb_has_exact_keys(target,ARRAY['type','segmentId']) IS NOT TRUE THEN RETURN false; END IF;
        SELECT value, ordinality::integer-1 INTO segment,si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id'=target->>'segmentId'; IF segment IS NULL OR segment->>'role'<>'rest' THEN RETURN false; END IF; field_path:=ARRAY['segments',si::text,'duration','seconds']; unit_key:='time';
      ELSE
        IF public.activity_plan_jsonb_has_exact_keys(target,CASE target->>'type' WHEN 'interval_repetitions' THEN ARRAY['type','activitySegmentId','intervalId'] WHEN 'target_intensity' THEN ARRAY['type','activitySegmentId','intervalId','stepId','targetType'] ELSE ARRAY['type','activitySegmentId','intervalId','stepId','quantityType'] END) IS NOT TRUE OR NOT public.activity_plan_authoring_uuid_is_valid(target->'activitySegmentId') OR NOT public.activity_plan_authoring_uuid_is_valid(target->'intervalId') THEN RETURN false; END IF;
        SELECT value, ordinality::integer-1 INTO segment,si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id'=target->>'activitySegmentId'; IF segment IS NULL OR segment->>'role'<>'activity' THEN RETURN false; END IF;
        SELECT value, ordinality::integer-1 INTO interval_value,ii FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY WHERE value->>'id'=target->>'intervalId'; IF interval_value IS NULL THEN RETURN false; END IF; field_path:=ARRAY['segments',si::text,'intervals',ii::text];
        IF target->>'type'='interval_repetitions' THEN IF kind<>'interval_repetitions' THEN RETURN false; END IF; field_path:=field_path||ARRAY['repetitions']; unit_key:='interval_repetitions';
        ELSE
          IF NOT public.activity_plan_authoring_uuid_is_valid(target->'stepId') THEN RETURN false; END IF; SELECT value,ordinality::integer-1 INTO step_value,ti FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY WHERE value->>'id'=target->>'stepId'; IF step_value IS NULL THEN RETURN false; END IF; field_path:=field_path||ARRAY['steps',ti::text];
          IF target->>'type'='target_intensity' THEN IF kind<>'target_intensity' THEN RETURN false; END IF; SELECT count(*) INTO matches FROM jsonb_array_elements(step_value->'targets') AS v WHERE v->>'type'=target->>'targetType'; IF matches<>1 THEN RETURN false; END IF; SELECT ordinality::integer-1 INTO target_index FROM jsonb_array_elements(step_value->'targets') WITH ORDINALITY WHERE value->>'type'=target->>'targetType'; IF public.activity_plan_target_is_canonical(jsonb_build_object('type',target->>'targetType','intensity',minimum),input->>'activity_category') IS NOT TRUE OR public.activity_plan_target_is_canonical(jsonb_build_object('type',target->>'targetType','intensity',maximum),input->>'activity_category') IS NOT TRUE THEN RETURN false; END IF; field_path:=field_path||ARRAY['targets',target_index::text,'intensity']; unit_key:='intensity:'||(target->>'targetType');
          ELSE
            IF ((kind='step_quantity' AND target->>'type'='step_quantity') OR (kind='recovery_quantity' AND target->>'type'='recovery_step')) IS NOT TRUE THEN RETURN false; END IF; quantity:=target->>'quantityType'; IF quantity NOT IN ('time','distance','repetitions') OR quantity IS DISTINCT FROM step_value->'duration'->>'type' THEN RETURN false; END IF; field_path:=field_path||ARRAY['duration',CASE quantity WHEN 'time' THEN 'seconds' WHEN 'distance' THEN 'meters' ELSE 'count' END]; unit_key:=quantity;
          END IF;
        END IF;
      END IF;
      IF kind<>'target_intensity' AND (minimum<1 OR mod(minimum,1)<>0 OR mod(maximum,1)<>0 OR mod(default_value,1)<>0 OR mod(increment,1)<>0) THEN RETURN false; END IF; IF first_unit IS NOT NULL AND first_unit<>unit_key THEN RETURN false; END IF; first_unit:=unit_key; IF (input #>> field_path)::numeric IS DISTINCT FROM default_value THEN RETURN false; END IF; IF owners ? field_path::text AND owners->>field_path::text<>key THEN RETURN false; END IF; owners:=owners||jsonb_build_object(field_path::text,key); bindings:=bindings||jsonb_build_array(jsonb_build_object('key',key,'path',to_jsonb(field_path)));
    END LOOP;
  END LOOP;
  IF adaptation ? 'allowedStates' THEN
    IF jsonb_typeof(adaptation->'allowedStates') IS DISTINCT FROM 'array' OR jsonb_array_length(adaptation->'allowedStates') NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF; states:='[]'::jsonb;
    FOR state_value IN SELECT value FROM jsonb_array_elements(adaptation->'allowedStates') LOOP
      IF public.activity_plan_jsonb_has_exact_keys(state_value,ARRAY['id','label','values']) IS NOT TRUE OR NOT public.activity_plan_authoring_uuid_is_valid(state_value->'id') OR state_value->>'id'=ANY(state_ids) OR jsonb_typeof(state_value->'label') IS DISTINCT FROM 'string' OR public.activity_plan_js_length(public.activity_plan_js_trim(state_value->>'label')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(state_value->'values') IS DISTINCT FROM 'object' THEN RETURN false; END IF; state_ids:=array_append(state_ids,state_value->>'id'); SELECT coalesce(jsonb_object_agg(public.activity_plan_js_trim(e.key),e.value),'{}'::jsonb) INTO values_value FROM jsonb_each(state_value->'values') e; IF public.activity_plan_jsonb_has_exact_keys(values_value,keys) IS NOT TRUE THEN RETURN false; END IF;
      FOR entry IN SELECT * FROM jsonb_each(values_value) LOOP IF jsonb_typeof(entry.value)<>'number' THEN RETURN false; END IF; range_value:=ranges->entry.key; amount:=(entry.value #>> '{}')::numeric; minimum:=(range_value->>'minimum')::numeric; maximum:=(range_value->>'maximum')::numeric; increment:=(range_value->>'increment')::numeric; steps:=(amount::double precision-minimum::double precision)/increment::double precision; IF amount<minimum OR amount>maximum OR abs(steps-round(steps))>.000000001 THEN RETURN false; END IF; END LOOP;
      IF seen_states @> jsonb_build_array(values_value) THEN RETURN false; END IF; seen_states:=seen_states||jsonb_build_array(values_value); has_default:=has_default OR values_value=defaults; states:=states||jsonb_build_array(values_value);
    END LOOP; IF NOT has_default THEN RETURN false; END IF;
  ELSE
    IF state_count>10000 THEN RETURN false; END IF; FOREACH key IN ARRAY keys LOOP range_value:=ranges->key; minimum:=(range_value->>'minimum')::numeric; maximum:=(range_value->>'maximum')::numeric; increment:=(range_value->>'increment')::numeric; cardinality:=round((maximum-minimum)/increment)::integer+1; next_states:='[]'::jsonb; FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP FOR offset_index IN 0..cardinality-1 LOOP amount:=CASE WHEN offset_index=cardinality-1 THEN maximum ELSE minimum+offset_index*increment END; next_states:=next_states||jsonb_build_array(values_value||jsonb_build_object(key,amount)); END LOOP; END LOOP; states:=next_states; END LOOP;
  END IF;
  FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP resolved:=input; FOR binding IN SELECT value FROM jsonb_array_elements(bindings) LOOP SELECT array_agg(value) INTO field_path FROM jsonb_array_elements_text(binding->'path'); resolved:=jsonb_set(resolved,field_path,values_value->(binding->>'key')); END LOOP; IF NOT public.activity_plan_authoring_structure_is_valid(resolved) OR NOT public.activity_plan_authoring_intent_is_valid(resolved,intent) THEN RETURN false; END IF; END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;
-- activity-plan-authoring:functions:end

-- activity-plan-authoring:triggers:start
-- Existing trigger bindings keep their names and call the replacement functions.
-- activity-plan-authoring:triggers:end

-- activity-plan-authoring:acl:start
REVOKE ALL ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb), public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb), public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text) TO service_role;
-- activity-plan-authoring:acl:end


-- Consolidated source: 20260929000000_fixed_v4_activity_plan_contract.sql

-- A V3/adaptive row cannot be safely reinterpreted as V4. Repository-managed
-- local targets are reset/reseeded for this hard cut; populated targets fail
-- before any destructive DDL rather than silently dropping prescriptions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.activity_plans)
     OR EXISTS (SELECT 1 FROM public.planned_sessions) THEN
    RAISE EXCEPTION 'fixed V4 activity-plan cutover requires an empty/reset target'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE public.activity_plans
  DROP CONSTRAINT IF EXISTS activity_plans_structure_v3_check,
  DROP CONSTRAINT IF EXISTS activity_plans_structure_canonical_check,
  DROP CONSTRAINT IF EXISTS activity_plans_adaptation_check,
  DROP CONSTRAINT IF EXISTS activity_plans_structure_hash_check,
  DROP CONSTRAINT IF EXISTS activity_plans_semantic_hash_check,
  DROP COLUMN IF EXISTS adaptation;

DROP FUNCTION IF EXISTS public.activity_plan_core_semantic_hash(jsonb,jsonb,text);

CREATE OR REPLACE FUNCTION public.activity_plan_v4_has_exact_keys(input jsonb, required text[], optional text[] DEFAULT ARRAY[]::text[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(input) = 'object'
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(input) key WHERE NOT (key = ANY(required || optional)))
    AND NOT EXISTS (SELECT 1 FROM unnest(required) key WHERE NOT input ? key)
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  category text; ids text[] := ARRAY[]::text[]; target_types text[]; objective_count integer;
  expanded numeric := 0; explicit_seconds numeric := 0; repetitions integer;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(input, ARRAY['version','activity_category','blocks']) IS NOT TRUE
     OR input->>'version' <> '4'
     OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
     OR jsonb_typeof(input->'blocks') <> 'array'
     OR jsonb_array_length(input->'blocks') NOT BETWEEN 1 AND 1000
     OR octet_length(input::text) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    IF public.activity_plan_v4_has_exact_keys(block_value, ARRAY['id','repetitions','steps']) IS NOT TRUE
       OR jsonb_typeof(block_value->'id') <> 'string'
       OR NOT public.activity_plan_authoring_uuid_is_valid(block_value->'id')
       OR block_value->>'id' = ANY(ids)
       OR jsonb_typeof(block_value->'repetitions') <> 'number'
       OR (block_value->>'repetitions') !~ '^[0-9]+$'
       OR (block_value->>'repetitions')::integer NOT BETWEEN 1 AND 50
       OR jsonb_typeof(block_value->'steps') <> 'array'
       OR jsonb_array_length(block_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    ids := array_append(ids, block_value->>'id'); repetitions := (block_value->>'repetitions')::integer;
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      IF public.activity_plan_v4_has_exact_keys(step_value, ARRAY['id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE
         OR jsonb_typeof(step_value->'id') <> 'string'
         OR NOT public.activity_plan_authoring_uuid_is_valid(step_value->'id')
         OR step_value->>'id' = ANY(ids)
         OR (step_value ? 'name' AND (jsonb_typeof(step_value->'name') <> 'string' OR char_length(trim(step_value->>'name')) NOT BETWEEN 1 AND 100))
         OR (step_value ? 'instructions' AND (jsonb_typeof(step_value->'instructions') <> 'string' OR char_length(trim(step_value->>'instructions')) NOT BETWEEN 1 AND 1000))
         OR jsonb_typeof(step_value->'targets') <> 'array' OR jsonb_array_length(step_value->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids, step_value->>'id'); duration_value := step_value->'duration';
      IF jsonb_typeof(duration_value) <> 'object' THEN RETURN false; END IF;
      IF duration_value->>'type' = 'time' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','seconds']) IS NOT TRUE OR (duration_value->>'seconds') !~ '^[0-9]+$' OR (duration_value->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF;
        explicit_seconds := explicit_seconds + repetitions * (duration_value->>'seconds')::numeric;
      ELSIF duration_value->>'type' = 'distance' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','meters']) IS NOT TRUE OR category NOT IN ('run','bike','swim') OR (duration_value->>'meters') !~ '^[0-9]+$' OR (duration_value->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'repetitions' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','count']) IS NOT TRUE OR category <> 'strength' OR (duration_value->>'count') !~ '^[0-9]+$' OR (duration_value->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'untilFinished' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded := expanded + repetitions; target_types := ARRAY[]::text[]; objective_count := 0;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF jsonb_typeof(target_value) <> 'object' OR target_value->>'type' = ANY(target_types)
           OR public.activity_plan_target_is_canonical(target_value, category) IS NOT TRUE THEN RETURN false; END IF;
        target_types := array_append(target_types, target_value->>'type');
        IF target_value->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
      END LOOP;
      IF objective_count > 1 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded <= 1000 AND explicit_seconds <= 604800;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_intent_is_valid(input jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE target_value jsonb; high boolean := false; threshold boolean := false;
BEGIN
  IF intent NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance') THEN RETURN false; END IF;
  FOR target_value IN SELECT target.value FROM jsonb_array_elements(input->'blocks') AS block_value(value), jsonb_array_elements(block_value.value->'steps') AS step_value(value), jsonb_array_elements(step_value.value->'targets') AS target(value) LOOP
    high := high OR (target_value->>'type' = '%FTP' AND (target_value->>'intensity')::numeric >= 105) OR (target_value->>'type' = '%ThresholdHR' AND (target_value->>'intensity')::numeric >= 100) OR (target_value->>'type' = '%MaxHR' AND (target_value->>'intensity')::numeric >= 90) OR (target_value->>'type' = 'RPE' AND (target_value->>'intensity')::numeric >= 8);
    threshold := threshold OR (target_value->>'type' = '%FTP' AND (target_value->>'intensity')::numeric BETWEEN 88 AND 105) OR (target_value->>'type' = '%ThresholdHR' AND (target_value->>'intensity')::numeric BETWEEN 95 AND 105) OR (target_value->>'type' = '%MaxHR' AND (target_value->>'intensity')::numeric BETWEEN 80 AND 95) OR (target_value->>'type' = 'RPE' AND (target_value->>'intensity')::numeric >= 6);
  END LOOP;
  RETURN NOT ((intent = 'vo2max' AND NOT high) OR (intent = 'threshold_development' AND NOT threshold) OR (intent = 'recovery' AND high));
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_semantic_hash(input jsonb, intent text)
RETURNS text LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT 'v2:sha256:' || encode(sha256(convert_to(public.activity_plan_core_canonical_json(jsonb_build_object('structure',input,'training_intent',intent)),'UTF8')),'hex')
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_authoring()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT public.activity_plan_authoring_structure_is_valid(NEW.structure)
     OR NOT public.activity_plan_authoring_intent_is_valid(NEW.structure, NEW.training_intent)
     OR NEW.structure_hash IS DISTINCT FROM public.activity_plan_core_structure_hash(NEW.structure)
     OR NEW.semantic_hash IS DISTINCT FROM public.activity_plan_core_semantic_hash(NEW.structure, NEW.training_intent) THEN
    RAISE EXCEPTION 'ACTIVITY_PLAN_HASH_MISMATCH' USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_hash_guard';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.structure IS DISTINCT FROM OLD.structure
     OR NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.activity_plans
  ADD CONSTRAINT activity_plans_structure_v4_check CHECK (jsonb_typeof(structure) = 'object' AND structure->>'version' = '4' AND jsonb_typeof(structure->'blocks') = 'array' AND pg_column_size(structure) <= 1048576),
  ADD CONSTRAINT activity_plans_structure_canonical_check CHECK (public.activity_plan_authoring_structure_is_valid(structure)),
  ADD CONSTRAINT activity_plans_structure_hash_check CHECK (structure_hash ~ '^v1:sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT activity_plans_semantic_hash_check CHECK (semantic_hash ~ '^v2:sha256:[0-9a-f]{64}$');

ALTER TABLE public.planned_sessions DROP CONSTRAINT IF EXISTS planned_sessions_prescription_check;
ALTER TABLE public.planned_sessions ADD CONSTRAINT planned_sessions_prescription_check CHECK (
  activity_plan_revision > 0 AND jsonb_typeof(resolution_manifest) = 'object'
  AND pg_column_size(resolution_manifest) <= 1048576
  AND resolution_manifest->>'resolver_version' = 'prescription-resolver-v2'
  AND resolution_manifest->>'policy_version' = 'training-plan-policy-v2'
  AND resolution_manifest->>'activity_plan_id' = activity_plan_id::text
  AND resolution_manifest->'activity_plan_revision' = to_jsonb(activity_plan_revision)
  AND resolution_manifest->>'activity_plan_semantic_hash' ~ '^v2:sha256:[0-9a-f]{64}$'
  AND jsonb_typeof(resolution_manifest->'session_demand') = 'object'
  AND public.activity_plan_authoring_structure_is_valid(resolution_manifest->'resolved_structure')
  AND resolution_manifest->>'resolved_structure_hash' ~ '^v1:sha256:[0-9a-f]{64}$'
  AND jsonb_typeof(resolution_manifest->'prescription_estimate') = 'object'
  AND resolution_manifest->>'fingerprint' ~ '^v2:sha256:[0-9a-f]{64}$'
);


-- Consolidated source: 20260930000000_strict_v4_resolution_manifest.sql

-- The V4 cutover migration is already applied on local development targets.
-- This forward-only correction keeps the resolver's longstanding V1 envelope
-- hashes while retaining the V2 activity-plan semantic hash.
CREATE OR REPLACE FUNCTION public.activity_plan_v4_uuid_is_valid(input jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT public.activity_plan_authoring_uuid_is_valid(input)
    AND lower(input #>> '{}') <> '00000000-0000-0000-0000-000000000000'
$$;

-- Keep the historical UUID helper available to older contracts.  The active
-- V4 validator gets an equivalent local definition with the nil UUID rejected.
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.activity_plan_authoring_structure_is_valid(jsonb)'::regprocedure);
  definition := replace(
    definition,
    'public.activity_plan_authoring_uuid_is_valid',
    'public.activity_plan_v4_uuid_is_valid'
  );
  EXECUTE definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.planned_session_resolution_manifest_is_valid(
  manifest jsonb, expected_activity_plan_id uuid, expected_activity_plan_revision integer
)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE fact jsonb; reason jsonb; text_item jsonb; demand jsonb; estimate jsonb; duration jsonb; common_load jsonb;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(manifest,
    ARRAY['resolver_version','policy_version','training_plan_id','training_plan_revision','training_plan_hash','athlete_context_revision','activity_plan_id','activity_plan_revision','activity_plan_semantic_hash','session_demand','effective_target_duration_minutes','effective_target_common_load','evidence_facts','fallback_level','reason_codes','resolved_structure','resolved_structure_hash','prescription_estimate','fingerprint']) IS NOT TRUE
    OR pg_column_size(manifest) > 1048576
    OR manifest->>'resolver_version' <> 'prescription-resolver-v2'
    OR manifest->>'policy_version' <> 'training-plan-policy-v2'
    OR manifest->>'activity_plan_id' <> expected_activity_plan_id::text
    OR manifest->'activity_plan_revision' <> to_jsonb(expected_activity_plan_revision)
    OR manifest->>'activity_plan_semantic_hash' !~ '^v2:sha256:[0-9a-f]{64}$'
    OR manifest->>'resolved_structure_hash' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR manifest->>'fingerprint' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR (manifest->>'training_plan_id' IS NOT NULL AND NOT public.activity_plan_authoring_uuid_is_valid(manifest->'training_plan_id'))
    OR (manifest->>'training_plan_revision' IS NOT NULL AND (jsonb_typeof(manifest->'training_plan_revision') <> 'number' OR manifest->>'training_plan_revision' !~ '^[1-9][0-9]*$'))
    OR (manifest->>'training_plan_hash' IS NOT NULL AND manifest->>'training_plan_hash' !~ '^v1:sha256:[0-9a-f]{64}$')
    OR (manifest->>'athlete_context_revision' IS NOT NULL AND (jsonb_typeof(manifest->'athlete_context_revision') <> 'number' OR manifest->>'athlete_context_revision' !~ '^[1-9][0-9]*$'))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_revision' IS NULL))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_hash' IS NULL))
    OR NOT public.activity_plan_authoring_structure_is_valid(manifest->'resolved_structure') THEN RETURN false; END IF;
  demand := manifest->'session_demand';
  IF public.activity_plan_v4_has_exact_keys(demand, ARRAY['activity_category','training_intent','target_duration_minutes','target_common_load','importance']) IS NOT TRUE
    OR demand->>'activity_category' NOT IN ('run','bike','swim','strength','other')
    OR demand->>'training_intent' NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance')
    OR demand->>'importance' NOT IN ('support','normal','key')
    OR (demand->>'target_duration_minutes' IS NOT NULL AND (jsonb_typeof(demand->'target_duration_minutes') <> 'number' OR demand->>'target_duration_minutes' !~ '^[1-9][0-9]*$' OR (demand->>'target_duration_minutes')::integer > 600))
    OR (demand->>'target_common_load' IS NOT NULL AND (jsonb_typeof(demand->'target_common_load') <> 'number' OR (demand->>'target_common_load')::numeric NOT BETWEEN 0 AND 10000))
    OR demand->>'activity_category' <> manifest->'resolved_structure'->>'activity_category' THEN RETURN false; END IF;
  IF (manifest->>'effective_target_duration_minutes' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_duration_minutes') <> 'number' OR (manifest->>'effective_target_duration_minutes')::numeric <= 0))
    OR (manifest->>'effective_target_common_load' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_common_load') <> 'number' OR (manifest->>'effective_target_common_load')::numeric < 0))
    OR jsonb_typeof(manifest->'evidence_facts') <> 'array' OR jsonb_array_length(manifest->'evidence_facts') > 16
    OR jsonb_typeof(manifest->'reason_codes') <> 'array' OR jsonb_array_length(manifest->'reason_codes') > 8
    OR manifest->>'fallback_level' NOT IN ('evidence_informed','preference_informed','system_default_no_context') THEN RETURN false; END IF;
  FOR reason IN SELECT value FROM jsonb_array_elements(manifest->'reason_codes') LOOP IF jsonb_typeof(reason) <> 'string' OR reason #>> '{}' <> 'preferred_weekday' THEN RETURN false; END IF; END LOOP;
  FOR fact IN SELECT value FROM jsonb_array_elements(manifest->'evidence_facts') LOOP
    IF public.activity_plan_v4_has_exact_keys(fact, ARRAY['kind','activity_category','metric','unit','value','observed_at','source_id','policy_version']) IS NOT TRUE
      OR fact->>'kind' NOT IN ('threshold','heart_rate') OR fact->>'activity_category' NOT IN ('bike','run','swim')
      OR jsonb_typeof(fact->'metric') <> 'string' OR char_length(fact->>'metric') NOT BETWEEN 1 AND 32
      OR jsonb_typeof(fact->'unit') <> 'string' OR char_length(fact->>'unit') NOT BETWEEN 1 AND 64
      OR jsonb_typeof(fact->'value') <> 'number' OR (fact->>'value')::numeric <= 0
      OR jsonb_typeof(fact->'observed_at') <> 'string' OR fact->>'observed_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$' OR jsonb_typeof(fact->'source_id') <> 'string' OR char_length(fact->>'source_id') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(fact->'policy_version') <> 'string' OR char_length(fact->>'policy_version') NOT BETWEEN 1 AND 128 THEN RETURN false; END IF;
  END LOOP;
  IF ((manifest->>'fallback_level' = 'evidence_informed') <> (manifest->>'athlete_context_revision' IS NOT NULL))
    OR ((manifest->>'fallback_level' = 'evidence_informed') <> (jsonb_array_length(manifest->'evidence_facts') > 0)) THEN RETURN false; END IF;
  estimate := manifest->'prescription_estimate'; duration := estimate->'duration'; common_load := estimate->'common_load';
  IF public.activity_plan_v4_has_exact_keys(estimate, ARRAY['duration','common_load','rest_seconds','has_open_completion','warnings','factors']) IS NOT TRUE
    OR public.activity_plan_v4_has_exact_keys(duration, ARRAY['status','value_seconds']) IS NOT TRUE
    OR public.activity_plan_v4_has_exact_keys(common_load, ARRAY['status','value']) IS NOT TRUE
    OR duration->>'status' NOT IN ('exact','estimated','unavailable') OR common_load->>'status' NOT IN ('complete','partial','unavailable')
    OR (duration->>'value_seconds' IS NOT NULL AND (jsonb_typeof(duration->'value_seconds') <> 'number' OR duration->>'value_seconds' !~ '^[1-9][0-9]*$'))
    OR ((duration->>'status' = 'unavailable') <> (duration->>'value_seconds' IS NULL))
    OR (common_load->>'value' IS NOT NULL AND (jsonb_typeof(common_load->'value') <> 'number' OR (common_load->>'value')::numeric < 0))
    OR ((common_load->>'status' = 'unavailable') <> (common_load->>'value' IS NULL))
    OR jsonb_typeof(estimate->'rest_seconds') <> 'number' OR estimate->>'rest_seconds' !~ '^[0-9]+$' OR (estimate->>'rest_seconds')::integer > 86400
    OR jsonb_typeof(estimate->'has_open_completion') <> 'boolean'
    OR jsonb_typeof(estimate->'warnings') <> 'array' OR jsonb_array_length(estimate->'warnings') > 32
    OR jsonb_typeof(estimate->'factors') <> 'array' OR jsonb_array_length(estimate->'factors') > 32 THEN RETURN false; END IF;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'warnings') LOOP
    IF jsonb_typeof(text_item) <> 'string' OR char_length(text_item #>> '{}') NOT BETWEEN 1 AND 240 THEN RETURN false; END IF;
  END LOOP;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'factors') LOOP
    IF jsonb_typeof(text_item) <> 'string' OR char_length(text_item #>> '{}') NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

ALTER TABLE public.planned_sessions DROP CONSTRAINT IF EXISTS planned_sessions_prescription_check;
ALTER TABLE public.planned_sessions ADD CONSTRAINT planned_sessions_prescription_check CHECK (
  activity_plan_revision > 0 AND public.planned_session_resolution_manifest_is_valid(resolution_manifest, activity_plan_id, activity_plan_revision)
);


-- Consolidated source: 20261001000000_activity_plan_authoring_parity.sql

-- V4 has two intentionally distinct contracts.  Frozen prescriptions must be
-- readable (and their rows must remain lifecycle-updatable) when they contain
-- a formerly-authorable open-completion step.  New or structurally revised
-- plans use the stricter authoring policy below.
CREATE OR REPLACE FUNCTION public.activity_plan_v4_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  category text; ids text[] := ARRAY[]::text[]; target_types text[]; objective_count integer;
  expanded numeric := 0; explicit_seconds numeric := 0; repetitions integer;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(input, ARRAY['version','activity_category','blocks']) IS NOT TRUE
     OR input->>'version' <> '4'
     OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
     OR jsonb_typeof(input->'blocks') <> 'array'
     OR jsonb_array_length(input->'blocks') NOT BETWEEN 1 AND 1000
     OR octet_length(convert_to(public.activity_plan_core_canonical_json(input), 'UTF8')) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    IF public.activity_plan_v4_has_exact_keys(block_value, ARRAY['id','repetitions','steps']) IS NOT TRUE
       OR jsonb_typeof(block_value->'id') <> 'string'
       OR NOT public.activity_plan_v4_uuid_is_valid(block_value->'id')
       OR block_value->>'id' = ANY(ids)
       OR jsonb_typeof(block_value->'repetitions') <> 'number'
       OR (block_value->>'repetitions') !~ '^[0-9]+$'
       OR (block_value->>'repetitions')::integer NOT BETWEEN 1 AND 50
       OR jsonb_typeof(block_value->'steps') <> 'array'
       OR jsonb_array_length(block_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    ids := array_append(ids, block_value->>'id'); repetitions := (block_value->>'repetitions')::integer;
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      IF public.activity_plan_v4_has_exact_keys(step_value, ARRAY['id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE
         OR jsonb_typeof(step_value->'id') <> 'string'
         OR NOT public.activity_plan_v4_uuid_is_valid(step_value->'id')
         OR step_value->>'id' = ANY(ids)
         OR (step_value ? 'name' AND (jsonb_typeof(step_value->'name') <> 'string' OR char_length(trim(step_value->>'name')) NOT BETWEEN 1 AND 100))
         OR (step_value ? 'instructions' AND (jsonb_typeof(step_value->'instructions') <> 'string' OR char_length(trim(step_value->>'instructions')) NOT BETWEEN 1 AND 1000))
         OR jsonb_typeof(step_value->'targets') <> 'array' OR jsonb_array_length(step_value->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids, step_value->>'id'); duration_value := step_value->'duration';
      IF jsonb_typeof(duration_value) <> 'object' THEN RETURN false; END IF;
      IF duration_value->>'type' = 'time' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','seconds']) IS NOT TRUE OR (duration_value->>'seconds') !~ '^[0-9]+$' OR (duration_value->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF;
        explicit_seconds := explicit_seconds + repetitions * (duration_value->>'seconds')::numeric;
      ELSIF duration_value->>'type' = 'distance' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','meters']) IS NOT TRUE OR category NOT IN ('run','bike','swim') OR (duration_value->>'meters') !~ '^[0-9]+$' OR (duration_value->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'repetitions' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','count']) IS NOT TRUE OR category <> 'strength' OR (duration_value->>'count') !~ '^[0-9]+$' OR (duration_value->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'untilFinished' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded := expanded + repetitions; target_types := ARRAY[]::text[]; objective_count := 0;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF jsonb_typeof(target_value) <> 'object' OR target_value->>'type' = ANY(target_types)
           OR public.activity_plan_target_is_canonical(target_value, category) IS NOT TRUE THEN RETURN false; END IF;
        target_types := array_append(target_types, target_value->>'type');
        IF target_value->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
      END LOOP;
      IF objective_count > 1 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded <= 1000 AND explicit_seconds <= 604800;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

-- This validator mirrors Core's *new authoring* policy, not the persisted
-- read shape above.
CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  category text; ids text[] := ARRAY[]::text[]; target_types text[]; objective_count integer;
  expanded numeric := 0; explicit_seconds numeric := 0; repetitions integer;
  has_authoring_intensity boolean;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(input, ARRAY['version','activity_category','blocks']) IS NOT TRUE
     OR input->>'version' <> '4'
     OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
     OR jsonb_typeof(input->'blocks') <> 'array'
     OR jsonb_array_length(input->'blocks') NOT BETWEEN 1 AND 1000
     -- Core measures compact UTF-8 JSON, not PostgreSQL's storage footprint.
     OR octet_length(convert_to(public.activity_plan_core_canonical_json(input), 'UTF8')) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    IF public.activity_plan_v4_has_exact_keys(block_value, ARRAY['id','repetitions','steps']) IS NOT TRUE
       OR jsonb_typeof(block_value->'id') <> 'string'
       OR NOT public.activity_plan_v4_uuid_is_valid(block_value->'id')
       OR block_value->>'id' = ANY(ids)
       OR jsonb_typeof(block_value->'repetitions') <> 'number'
       OR (block_value->>'repetitions') !~ '^[0-9]+$'
       OR (block_value->>'repetitions')::integer NOT BETWEEN 1 AND 50
       OR jsonb_typeof(block_value->'steps') <> 'array'
       OR jsonb_array_length(block_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    ids := array_append(ids, block_value->>'id'); repetitions := (block_value->>'repetitions')::integer;
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      IF public.activity_plan_v4_has_exact_keys(step_value, ARRAY['id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE
         OR jsonb_typeof(step_value->'id') <> 'string'
         OR NOT public.activity_plan_v4_uuid_is_valid(step_value->'id')
         OR step_value->>'id' = ANY(ids)
         OR (step_value ? 'name' AND (jsonb_typeof(step_value->'name') <> 'string' OR char_length(trim(step_value->>'name')) NOT BETWEEN 1 AND 100))
         OR (step_value ? 'instructions' AND (jsonb_typeof(step_value->'instructions') <> 'string' OR char_length(trim(step_value->>'instructions')) NOT BETWEEN 1 AND 1000))
         OR jsonb_typeof(step_value->'targets') <> 'array' OR jsonb_array_length(step_value->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids, step_value->>'id'); duration_value := step_value->'duration';
      IF jsonb_typeof(duration_value) <> 'object' THEN RETURN false; END IF;
      -- untilFinished is a historical read shape, never a newly authored one.
      IF duration_value->>'type' = 'time' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','seconds']) IS NOT TRUE OR (duration_value->>'seconds') !~ '^[0-9]+$' OR (duration_value->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF;
        explicit_seconds := explicit_seconds + repetitions * (duration_value->>'seconds')::numeric;
      ELSIF duration_value->>'type' = 'distance' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','meters']) IS NOT TRUE OR category NOT IN ('run','bike','swim') OR (duration_value->>'meters') !~ '^[0-9]+$' OR (duration_value->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'repetitions' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','count']) IS NOT TRUE OR category <> 'strength' OR (duration_value->>'count') !~ '^[0-9]+$' OR (duration_value->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded := expanded + repetitions; target_types := ARRAY[]::text[]; objective_count := 0; has_authoring_intensity := false;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF jsonb_typeof(target_value) <> 'object' OR target_value->>'type' = ANY(target_types)
           OR public.activity_plan_target_is_canonical(target_value, category) IS NOT TRUE THEN RETURN false; END IF;
        target_types := array_append(target_types, target_value->>'type');
        IF target_value->>'type' = 'RPE' THEN
          IF (target_value->>'intensity')::numeric NOT BETWEEN 1 AND 10
             OR mod((target_value->>'intensity')::numeric * 2, 1) <> 0 THEN RETURN false; END IF;
          has_authoring_intensity := true;
        ELSIF target_value->>'type' <> 'cadence' THEN
          objective_count := objective_count + 1; has_authoring_intensity := true;
        END IF;
        IF target_value->>'type' = '%MaxHR' AND (target_value->>'intensity')::numeric > 100 THEN RETURN false; END IF;
        IF duration_value->>'type' = 'distance' AND target_value->>'type' = 'speed' AND (target_value->>'intensity')::numeric <= 0 THEN RETURN false; END IF;
      END LOOP;
      IF objective_count > 1
         OR (jsonb_array_length(step_value->'targets') > 0 AND NOT has_authoring_intensity)
         OR (duration_value->>'type' = 'repetitions' AND (jsonb_array_length(step_value->'targets') <> 1 OR step_value->'targets'->0->>'type' <> 'RPE')) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded <= 1000 AND explicit_seconds <= 604800;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

ALTER TABLE public.activity_plans DROP CONSTRAINT IF EXISTS activity_plans_structure_v4_check;
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_v4_check CHECK (
  public.activity_plan_v4_structure_is_valid(structure)
);
ALTER TABLE public.activity_plans DROP CONSTRAINT IF EXISTS activity_plans_structure_canonical_check;
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_canonical_check CHECK (
  public.activity_plan_v4_structure_is_valid(structure)
);

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_authoring()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- Historical documents may receive metadata-only changes.  Structural
  -- revisions and all inserts must satisfy the current authoring policy.
  IF TG_OP = 'INSERT' OR NEW.structure IS DISTINCT FROM OLD.structure THEN
    IF NEW.structure_hash IS DISTINCT FROM public.activity_plan_core_structure_hash(NEW.structure)
       OR NEW.semantic_hash IS DISTINCT FROM public.activity_plan_core_semantic_hash(NEW.structure, NEW.training_intent) THEN
      RAISE EXCEPTION 'ACTIVITY_PLAN_HASH_MISMATCH'
        USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_hash_guard';
    END IF;
    IF public.activity_plan_authoring_structure_is_valid(NEW.structure) IS NOT TRUE
       OR NOT public.activity_plan_authoring_intent_is_valid(NEW.structure, NEW.training_intent) THEN
      RAISE EXCEPTION 'ACTIVITY_PLAN_AUTHORING_INVALID_CONTENT'
        USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_authoring_guard';
    END IF;
  ELSIF NEW.structure_hash IS DISTINCT FROM OLD.structure_hash
     OR NEW.semantic_hash IS DISTINCT FROM OLD.semantic_hash THEN
    RAISE EXCEPTION 'ACTIVITY_PLAN_HASH_MISMATCH'
      USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_hash_guard';
  ELSIF NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN
    RAISE EXCEPTION 'ACTIVITY_PLAN_CONTENT_MUTATION_REQUIRES_STRUCTURE_REVISION'
      USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_authoring_guard';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.planned_session_resolution_manifest_is_valid(
  manifest jsonb, expected_activity_plan_id uuid, expected_activity_plan_revision integer
)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE fact jsonb; reason jsonb; text_item jsonb; demand jsonb; estimate jsonb; duration jsonb; common_load jsonb;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(manifest,
    ARRAY['resolver_version','policy_version','training_plan_id','training_plan_revision','training_plan_hash','athlete_context_revision','activity_plan_id','activity_plan_revision','activity_plan_semantic_hash','session_demand','effective_target_duration_minutes','effective_target_common_load','evidence_facts','fallback_level','reason_codes','resolved_structure','resolved_structure_hash','prescription_estimate','fingerprint']) IS NOT TRUE
    OR pg_column_size(manifest) > 1048576
    OR manifest->>'resolver_version' <> 'prescription-resolver-v2'
    OR manifest->>'policy_version' <> 'training-plan-policy-v2'
    OR manifest->>'activity_plan_id' <> expected_activity_plan_id::text
    OR manifest->'activity_plan_revision' <> to_jsonb(expected_activity_plan_revision)
    OR manifest->>'activity_plan_semantic_hash' !~ '^v2:sha256:[0-9a-f]{64}$'
    OR manifest->>'resolved_structure_hash' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR manifest->>'resolved_structure_hash' IS DISTINCT FROM public.activity_plan_core_structure_hash(manifest->'resolved_structure')
    OR manifest->>'fingerprint' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR (manifest->>'training_plan_id' IS NOT NULL AND NOT public.activity_plan_authoring_uuid_is_valid(manifest->'training_plan_id'))
    OR (manifest->>'training_plan_revision' IS NOT NULL AND (jsonb_typeof(manifest->'training_plan_revision') <> 'number' OR manifest->>'training_plan_revision' !~ '^[1-9][0-9]*$'))
    OR (manifest->>'training_plan_hash' IS NOT NULL AND manifest->>'training_plan_hash' !~ '^v1:sha256:[0-9a-f]{64}$')
    OR (manifest->>'athlete_context_revision' IS NOT NULL AND (jsonb_typeof(manifest->'athlete_context_revision') <> 'number' OR manifest->>'athlete_context_revision' !~ '^[1-9][0-9]*$'))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_revision' IS NULL))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_hash' IS NULL))
    OR NOT public.activity_plan_v4_structure_is_valid(manifest->'resolved_structure') THEN RETURN false; END IF;
  demand := manifest->'session_demand';
  IF public.activity_plan_v4_has_exact_keys(demand, ARRAY['activity_category','training_intent','target_duration_minutes','target_common_load','importance']) IS NOT TRUE
    OR demand->>'activity_category' NOT IN ('run','bike','swim','strength','other')
    OR demand->>'training_intent' NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance')
    OR demand->>'importance' NOT IN ('support','normal','key')
    OR (demand->>'target_duration_minutes' IS NOT NULL AND (jsonb_typeof(demand->'target_duration_minutes') <> 'number' OR demand->>'target_duration_minutes' !~ '^[1-9][0-9]*$' OR (demand->>'target_duration_minutes')::integer > 600))
    OR (demand->>'target_common_load' IS NOT NULL AND (jsonb_typeof(demand->'target_common_load') <> 'number' OR (demand->>'target_common_load')::numeric NOT BETWEEN 0 AND 10000))
    OR demand->>'activity_category' <> manifest->'resolved_structure'->>'activity_category' THEN RETURN false; END IF;
  IF (manifest->>'effective_target_duration_minutes' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_duration_minutes') <> 'number' OR (manifest->>'effective_target_duration_minutes')::numeric <= 0))
    OR (manifest->>'effective_target_common_load' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_common_load') <> 'number' OR (manifest->>'effective_target_common_load')::numeric < 0))
    OR jsonb_typeof(manifest->'evidence_facts') <> 'array' OR jsonb_array_length(manifest->'evidence_facts') > 16
    OR jsonb_typeof(manifest->'reason_codes') <> 'array' OR jsonb_array_length(manifest->'reason_codes') > 8
    OR manifest->>'fallback_level' NOT IN ('evidence_informed','preference_informed','system_default_no_context') THEN RETURN false; END IF;
  FOR reason IN SELECT value FROM jsonb_array_elements(manifest->'reason_codes') LOOP IF jsonb_typeof(reason) <> 'string' OR reason #>> '{}' <> 'preferred_weekday' THEN RETURN false; END IF; END LOOP;
  FOR fact IN SELECT value FROM jsonb_array_elements(manifest->'evidence_facts') LOOP
    IF public.activity_plan_v4_has_exact_keys(fact, ARRAY['kind','activity_category','metric','unit','value','observed_at','source_id','policy_version']) IS NOT TRUE
      OR fact->>'kind' NOT IN ('threshold','heart_rate') OR fact->>'activity_category' NOT IN ('bike','run','swim')
      OR jsonb_typeof(fact->'metric') <> 'string' OR char_length(fact->>'metric') NOT BETWEEN 1 AND 32
      OR jsonb_typeof(fact->'unit') <> 'string' OR char_length(fact->>'unit') NOT BETWEEN 1 AND 64
      OR jsonb_typeof(fact->'value') <> 'number' OR (fact->>'value')::numeric <= 0
      OR jsonb_typeof(fact->'observed_at') <> 'string' OR fact->>'observed_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$' OR jsonb_typeof(fact->'source_id') <> 'string' OR char_length(fact->>'source_id') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(fact->'policy_version') <> 'string' OR char_length(fact->>'policy_version') NOT BETWEEN 1 AND 128 THEN RETURN false; END IF;
  END LOOP;
  IF ((manifest->>'fallback_level' = 'evidence_informed') <> (manifest->>'athlete_context_revision' IS NOT NULL))
    OR ((manifest->>'fallback_level' = 'evidence_informed') <> (jsonb_array_length(manifest->'evidence_facts') > 0)) THEN RETURN false; END IF;
  estimate := manifest->'prescription_estimate'; duration := estimate->'duration'; common_load := estimate->'common_load';
  IF public.activity_plan_v4_has_exact_keys(estimate, ARRAY['duration','common_load','rest_seconds','has_open_completion','warnings','factors']) IS NOT TRUE
    OR public.activity_plan_v4_has_exact_keys(duration, ARRAY['status','value_seconds']) IS NOT TRUE
    OR public.activity_plan_v4_has_exact_keys(common_load, ARRAY['status','value']) IS NOT TRUE
    OR duration->>'status' NOT IN ('exact','estimated','unavailable') OR common_load->>'status' NOT IN ('complete','partial','unavailable')
    OR (duration->>'value_seconds' IS NOT NULL AND (jsonb_typeof(duration->'value_seconds') <> 'number' OR duration->>'value_seconds' !~ '^[1-9][0-9]*$'))
    OR ((duration->>'status' = 'unavailable') <> (duration->>'value_seconds' IS NULL))
    OR (common_load->>'value' IS NOT NULL AND (jsonb_typeof(common_load->'value') <> 'number' OR (common_load->>'value')::numeric < 0))
    OR ((common_load->>'status' = 'unavailable') <> (common_load->>'value' IS NULL))
    OR jsonb_typeof(estimate->'rest_seconds') <> 'number' OR estimate->>'rest_seconds' !~ '^[0-9]+$' OR (estimate->>'rest_seconds')::integer > 86400
    OR jsonb_typeof(estimate->'has_open_completion') <> 'boolean'
    OR jsonb_typeof(estimate->'warnings') <> 'array' OR jsonb_array_length(estimate->'warnings') > 32
    OR jsonb_typeof(estimate->'factors') <> 'array' OR jsonb_array_length(estimate->'factors') > 32 THEN RETURN false; END IF;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'warnings') LOOP IF jsonb_typeof(text_item) <> 'string' OR char_length(text_item #>> '{}') NOT BETWEEN 1 AND 240 THEN RETURN false; END IF; END LOOP;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'factors') LOOP IF jsonb_typeof(text_item) <> 'string' OR char_length(text_item #>> '{}') NOT BETWEEN 1 AND 160 THEN RETURN false; END IF; END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;


-- Consolidated source: 20261003000000_activity_plan_interval_name_override.sql

-- An interval/block name is an explicitly authored, bounded override. It is
-- part of the strict V4 document (and consequently its Core hashes), not a
-- stored automatic label. Existing unnamed documents intentionally remain
-- valid; this migration neither backfills nor rewrites activity_plans rows.
CREATE OR REPLACE FUNCTION public.activity_plan_v4_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  category text; ids text[] := ARRAY[]::text[]; target_types text[]; objective_count integer;
  expanded numeric := 0; explicit_seconds numeric := 0; repetitions integer;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(input, ARRAY['version','activity_category','blocks']) IS NOT TRUE
     OR input->>'version' <> '4'
     OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
     OR jsonb_typeof(input->'blocks') <> 'array'
     OR jsonb_array_length(input->'blocks') NOT BETWEEN 1 AND 1000
     OR octet_length(convert_to(public.activity_plan_core_canonical_json(input), 'UTF8')) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    IF public.activity_plan_v4_has_exact_keys(block_value, ARRAY['id','repetitions','steps'], ARRAY['name']) IS NOT TRUE
       OR jsonb_typeof(block_value->'id') <> 'string'
       OR NOT public.activity_plan_v4_uuid_is_valid(block_value->'id')
       OR block_value->>'id' = ANY(ids)
       OR (block_value ? 'name' AND (jsonb_typeof(block_value->'name') <> 'string' OR block_value->>'name' IS DISTINCT FROM trim(block_value->>'name') OR char_length(trim(block_value->>'name')) NOT BETWEEN 1 AND 100))
       OR jsonb_typeof(block_value->'repetitions') <> 'number'
       OR (block_value->>'repetitions') !~ '^[0-9]+$'
       OR (block_value->>'repetitions')::integer NOT BETWEEN 1 AND 50
       OR jsonb_typeof(block_value->'steps') <> 'array'
       OR jsonb_array_length(block_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    ids := array_append(ids, block_value->>'id'); repetitions := (block_value->>'repetitions')::integer;
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      IF public.activity_plan_v4_has_exact_keys(step_value, ARRAY['id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE
         OR jsonb_typeof(step_value->'id') <> 'string'
         OR NOT public.activity_plan_v4_uuid_is_valid(step_value->'id')
         OR step_value->>'id' = ANY(ids)
         OR (step_value ? 'name' AND (jsonb_typeof(step_value->'name') <> 'string' OR char_length(trim(step_value->>'name')) NOT BETWEEN 1 AND 100))
         OR (step_value ? 'instructions' AND (jsonb_typeof(step_value->'instructions') <> 'string' OR char_length(trim(step_value->>'instructions')) NOT BETWEEN 1 AND 1000))
         OR jsonb_typeof(step_value->'targets') <> 'array' OR jsonb_array_length(step_value->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids, step_value->>'id'); duration_value := step_value->'duration';
      IF jsonb_typeof(duration_value) <> 'object' THEN RETURN false; END IF;
      IF duration_value->>'type' = 'time' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','seconds']) IS NOT TRUE OR (duration_value->>'seconds') !~ '^[0-9]+$' OR (duration_value->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF;
        explicit_seconds := explicit_seconds + repetitions * (duration_value->>'seconds')::numeric;
      ELSIF duration_value->>'type' = 'distance' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','meters']) IS NOT TRUE OR category NOT IN ('run','bike','swim') OR (duration_value->>'meters') !~ '^[0-9]+$' OR (duration_value->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'repetitions' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','count']) IS NOT TRUE OR category <> 'strength' OR (duration_value->>'count') !~ '^[0-9]+$' OR (duration_value->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'untilFinished' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded := expanded + repetitions; target_types := ARRAY[]::text[]; objective_count := 0;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF jsonb_typeof(target_value) <> 'object' OR target_value->>'type' = ANY(target_types)
           OR public.activity_plan_target_is_canonical(target_value, category) IS NOT TRUE THEN RETURN false; END IF;
        target_types := array_append(target_types, target_value->>'type');
        IF target_value->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
      END LOOP;
      IF objective_count > 1 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded <= 1000 AND explicit_seconds <= 604800;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

-- Keep authoring stricter than lifecycle reads while sharing the same strict
-- block field guard above. Frozen V4 snapshots may still contain untilFinished.
CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  has_authoring_intensity boolean; objective_count integer;
BEGIN
  IF public.activity_plan_v4_structure_is_valid(input) IS NOT TRUE THEN RETURN false; END IF;
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      duration_value := step_value->'duration';
      IF duration_value->>'type' = 'untilFinished' THEN RETURN false; END IF;
      has_authoring_intensity := false; objective_count := 0;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF target_value->>'type' = 'RPE' THEN
          IF (target_value->>'intensity')::numeric NOT BETWEEN 1 AND 10
             OR mod((target_value->>'intensity')::numeric * 2, 1) <> 0 THEN RETURN false; END IF;
          has_authoring_intensity := true;
        ELSIF target_value->>'type' <> 'cadence' THEN
          objective_count := objective_count + 1; has_authoring_intensity := true;
        END IF;
        IF target_value->>'type' = '%MaxHR' AND (target_value->>'intensity')::numeric > 100 THEN RETURN false; END IF;
        IF duration_value->>'type' = 'distance' AND target_value->>'type' = 'speed' AND (target_value->>'intensity')::numeric <= 0 THEN RETURN false; END IF;
      END LOOP;
      IF objective_count > 1
         OR (jsonb_array_length(step_value->'targets') > 0 AND NOT has_authoring_intensity)
         OR (duration_value->>'type' = 'repetitions' AND (jsonb_array_length(step_value->'targets') <> 1 OR step_value->'targets'->0->>'type' <> 'RPE')) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;


-- Consolidated source: 20261003010000_activity_plan_ecmascript_name_trim.sql

-- PostgreSQL's trim() only removes ASCII space by default. This exactly matches
-- ECMAScript String.prototype.trim() for persisted V4 name canonicality.
CREATE OR REPLACE FUNCTION public.activity_plan_ecmascript_trim(input text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT btrim(input, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_v4_name_is_canonical(input text, maximum integer)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT input IS NOT NULL
    AND input IS NOT DISTINCT FROM public.activity_plan_ecmascript_trim(input)
    AND char_length(input) BETWEEN 1 AND maximum
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_v4_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  block_value jsonb; step_value jsonb; duration_value jsonb; target_value jsonb;
  category text; ids text[] := ARRAY[]::text[]; target_types text[]; objective_count integer;
  expanded numeric := 0; explicit_seconds numeric := 0; repetitions integer;
BEGIN
  IF public.activity_plan_v4_has_exact_keys(input, ARRAY['version','activity_category','blocks']) IS NOT TRUE
     OR input->>'version' <> '4'
     OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
     OR jsonb_typeof(input->'blocks') <> 'array'
     OR jsonb_array_length(input->'blocks') NOT BETWEEN 1 AND 1000
     OR octet_length(convert_to(public.activity_plan_core_canonical_json(input), 'UTF8')) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR block_value IN SELECT value FROM jsonb_array_elements(input->'blocks') LOOP
    IF public.activity_plan_v4_has_exact_keys(block_value, ARRAY['id','repetitions','steps'], ARRAY['name']) IS NOT TRUE
       OR jsonb_typeof(block_value->'id') <> 'string'
       OR NOT public.activity_plan_v4_uuid_is_valid(block_value->'id')
       OR block_value->>'id' = ANY(ids)
       OR (block_value ? 'name' AND (jsonb_typeof(block_value->'name') <> 'string' OR NOT public.activity_plan_v4_name_is_canonical(block_value->>'name', 100)))
       OR jsonb_typeof(block_value->'repetitions') <> 'number'
       OR (block_value->>'repetitions') !~ '^[0-9]+$'
       OR (block_value->>'repetitions')::integer NOT BETWEEN 1 AND 50
       OR jsonb_typeof(block_value->'steps') <> 'array'
       OR jsonb_array_length(block_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    ids := array_append(ids, block_value->>'id'); repetitions := (block_value->>'repetitions')::integer;
    FOR step_value IN SELECT value FROM jsonb_array_elements(block_value->'steps') LOOP
      IF public.activity_plan_v4_has_exact_keys(step_value, ARRAY['id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE
         OR jsonb_typeof(step_value->'id') <> 'string'
         OR NOT public.activity_plan_v4_uuid_is_valid(step_value->'id')
         OR step_value->>'id' = ANY(ids)
         OR (step_value ? 'name' AND (jsonb_typeof(step_value->'name') <> 'string' OR NOT public.activity_plan_v4_name_is_canonical(step_value->>'name', 100)))
         OR (step_value ? 'instructions' AND (jsonb_typeof(step_value->'instructions') <> 'string' OR char_length(trim(step_value->>'instructions')) NOT BETWEEN 1 AND 1000))
         OR jsonb_typeof(step_value->'targets') <> 'array' OR jsonb_array_length(step_value->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids, step_value->>'id'); duration_value := step_value->'duration';
      IF jsonb_typeof(duration_value) <> 'object' THEN RETURN false; END IF;
      IF duration_value->>'type' = 'time' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','seconds']) IS NOT TRUE OR (duration_value->>'seconds') !~ '^[0-9]+$' OR (duration_value->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF;
        explicit_seconds := explicit_seconds + repetitions * (duration_value->>'seconds')::numeric;
      ELSIF duration_value->>'type' = 'distance' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','meters']) IS NOT TRUE OR category NOT IN ('run','bike','swim') OR (duration_value->>'meters') !~ '^[0-9]+$' OR (duration_value->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'repetitions' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type','count']) IS NOT TRUE OR category <> 'strength' OR (duration_value->>'count') !~ '^[0-9]+$' OR (duration_value->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSIF duration_value->>'type' = 'untilFinished' THEN
        IF public.activity_plan_v4_has_exact_keys(duration_value, ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded := expanded + repetitions; target_types := ARRAY[]::text[]; objective_count := 0;
      FOR target_value IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
        IF jsonb_typeof(target_value) <> 'object' OR target_value->>'type' = ANY(target_types)
           OR public.activity_plan_target_is_canonical(target_value, category) IS NOT TRUE THEN RETURN false; END IF;
        target_types := array_append(target_types, target_value->>'type');
        IF target_value->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
      END LOOP;
      IF objective_count > 1 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded <= 1000 AND explicit_seconds <= 604800;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

-- activity-plan-v5:functions:start
-- The fresh baseline ends with the sole executable activity-plan contract. Earlier
-- historical definitions above are retained only because unrelated baseline DDL
-- references them during construction; these definitions replace their active use.
CREATE OR REPLACE FUNCTION public.activity_plan_v5_has_exact_keys(input jsonb, required text[], optional text[] DEFAULT ARRAY[]::text[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(input) = 'object'
    AND input ?& required
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(input) key WHERE key <> ALL(required || optional)
    )
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_v5_uuid_is_valid(input jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(input) = 'string'
    AND input #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND lower(input #>> '{}') <> '00000000-0000-0000-0000-000000000000'
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_v5_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE item jsonb; step jsonb; duration jsonb; target jsonb; category text; ids text[] := ARRAY[]::text[]; target_types text[]; expanded integer := 0; seconds numeric := 0; executions integer; objectives integer;
BEGIN
  IF public.activity_plan_v5_has_exact_keys(input, ARRAY['version','activity_category','items']) IS NOT TRUE
    OR jsonb_typeof(input->'version') <> 'number' OR input->>'version' <> '5' OR input->>'activity_category' NOT IN ('run','bike','swim','strength','other')
    OR jsonb_typeof(input->'items') <> 'array' OR jsonb_array_length(input->'items') NOT BETWEEN 1 AND 1000
    OR octet_length(input::text) > 1048576 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR item IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
    IF item->>'type' = 'step' THEN executions := 1;
    ELSIF item->>'type' = 'repeat' THEN
      IF public.activity_plan_v5_has_exact_keys(item, ARRAY['type','id','count','steps']) IS NOT TRUE OR NOT public.activity_plan_v5_uuid_is_valid(item->'id') OR item->>'id' = ANY(ids) OR jsonb_typeof(item->'count') <> 'number' OR item->>'count' !~ '^[0-9]+$' OR (item->>'count')::integer NOT BETWEEN 2 AND 50 OR jsonb_typeof(item->'steps') <> 'array' OR jsonb_array_length(item->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
      ids := array_append(ids,item->>'id'); executions := (item->>'count')::integer;
    ELSE RETURN false; END IF;
    FOR step IN SELECT value FROM jsonb_array_elements(CASE WHEN item->>'type'='repeat' THEN item->'steps' ELSE jsonb_build_array(item) END) LOOP
      IF public.activity_plan_v5_has_exact_keys(step, ARRAY['type','id','duration','targets'], ARRAY['name','instructions']) IS NOT TRUE OR step->>'type' <> 'step' OR NOT public.activity_plan_v5_uuid_is_valid(step->'id') OR step->>'id'=ANY(ids) OR (step ? 'name' AND (jsonb_typeof(step->'name')<>'string' OR char_length(step->>'name') NOT BETWEEN 1 AND 100 OR char_length(public.activity_plan_ecmascript_trim(step->>'name')) = 0)) OR (step ? 'instructions' AND (jsonb_typeof(step->'instructions')<>'string' OR char_length(step->>'instructions') NOT BETWEEN 1 AND 1000 OR char_length(public.activity_plan_ecmascript_trim(step->>'instructions')) = 0)) OR jsonb_typeof(step->'targets') <> 'array' OR jsonb_array_length(step->'targets') > 3 THEN RETURN false; END IF;
      ids := array_append(ids,step->>'id'); duration:=step->'duration';
      IF duration->>'type'='time' THEN IF public.activity_plan_v5_has_exact_keys(duration,ARRAY['type','seconds']) IS NOT TRUE OR jsonb_typeof(duration->'seconds') <> 'number' OR duration->>'seconds' !~ '^[0-9]+$' OR (duration->>'seconds')::integer NOT BETWEEN 1 AND 86400 THEN RETURN false; END IF; seconds:=seconds+executions*(duration->>'seconds')::numeric;
      ELSIF duration->>'type'='distance' THEN IF public.activity_plan_v5_has_exact_keys(duration,ARRAY['type','meters']) IS NOT TRUE OR jsonb_typeof(duration->'meters') <> 'number' OR duration->>'meters' !~ '^[0-9]+$' OR (duration->>'meters')::integer NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
      ELSIF duration->>'type'='repetitions' THEN IF public.activity_plan_v5_has_exact_keys(duration,ARRAY['type','count']) IS NOT TRUE OR jsonb_typeof(duration->'count') <> 'number' OR duration->>'count' !~ '^[0-9]+$' OR (duration->>'count')::integer NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
      ELSIF duration->>'type'='untilFinished' THEN IF public.activity_plan_v5_has_exact_keys(duration,ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
      ELSE RETURN false; END IF;
      expanded:=expanded+executions; target_types:=ARRAY[]::text[]; objectives:=0;
      FOR target IN SELECT value FROM jsonb_array_elements(step->'targets') LOOP
        IF target->>'type'='rest' THEN
          IF jsonb_array_length(step->'targets')<>1 OR duration->>'type'<>'time' OR public.activity_plan_v5_has_exact_keys(target,ARRAY['type']) IS NOT TRUE THEN RETURN false; END IF;
        ELSIF target->>'type'=ANY(target_types) OR public.activity_plan_target_is_canonical(target,category) IS NOT TRUE THEN RETURN false; END IF;
        target_types:=array_append(target_types,target->>'type');
        IF target->>'type' NOT IN ('RPE','cadence','rest') THEN objectives:=objectives+1; END IF;
      END LOOP;
      IF objectives>1 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN expanded<=1000 AND seconds<=604800;
EXCEPTION WHEN data_exception THEN RETURN false; END; $$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE item jsonb; step jsonb; target jsonb; category text; duration_type text; objective integer; has_intensity boolean;
BEGIN
  IF public.activity_plan_v5_structure_is_valid(input) IS NOT TRUE THEN RETURN false; END IF; category:=input->>'activity_category';
  FOR item IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
    FOR step IN SELECT value FROM jsonb_array_elements(CASE WHEN item->>'type'='repeat' THEN item->'steps' ELSE jsonb_build_array(item) END) LOOP
      duration_type:=step->'duration'->>'type';
      IF duration_type='untilFinished' OR (category='strength' AND duration_type NOT IN ('time','repetitions')) OR (category IN ('run','bike','swim') AND duration_type NOT IN ('time','distance')) OR (category='other' AND duration_type <> 'time') THEN RETURN false; END IF;
      objective:=0; has_intensity:=false;
      FOR target IN SELECT value FROM jsonb_array_elements(step->'targets') LOOP
        IF target->>'type'='rest' THEN
          IF jsonb_array_length(step->'targets')<>1 OR duration_type<>'time' THEN RETURN false; END IF;
        ELSIF target->>'type' NOT IN ('RPE','cadence') THEN objective:=objective+1; has_intensity:=true; END IF;
        IF target->>'type'='RPE' AND ((target->>'intensity')::numeric NOT BETWEEN 1 AND 10 OR mod((target->>'intensity')::numeric*2,1)<>0) THEN RETURN false; END IF;
        IF target->>'type'='%MaxHR' AND (target->>'intensity')::numeric>100 THEN RETURN false; END IF;
        IF duration_type='distance' AND target->>'type'='speed' AND (target->>'intensity')::numeric<=0 THEN RETURN false; END IF;
      END LOOP;
      IF objective>1 OR (jsonb_array_length(step->'targets')>0 AND NOT has_intensity AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(step->'targets') AS t(value) WHERE t.value->>'type' IN ('RPE','rest'))) OR (duration_type='repetitions' AND (jsonb_array_length(step->'targets')<>1 OR step->'targets'->0->>'type'<>'RPE')) THEN RETURN false; END IF;
    END LOOP;
  END LOOP; RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false; END; $$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_intent_is_valid(input jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE item jsonb; step jsonb; target jsonb; high boolean:=false; threshold boolean:=false; intensity numeric;
BEGIN
  IF intent NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance') THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(input->'items') LOOP FOR step IN SELECT value FROM jsonb_array_elements(CASE WHEN item->>'type'='repeat' THEN item->'steps' ELSE jsonb_build_array(item) END) LOOP FOR target IN SELECT value FROM jsonb_array_elements(step->'targets') LOOP intensity:=(target->>'intensity')::numeric; high:=high OR (target->>'type'='%FTP' AND intensity>=105) OR (target->>'type'='%ThresholdHR' AND intensity>=100) OR (target->>'type'='%MaxHR' AND intensity>=90) OR (target->>'type'='RPE' AND intensity>=8); threshold:=threshold OR (target->>'type'='%FTP' AND intensity BETWEEN 88 AND 105) OR (target->>'type'='%ThresholdHR' AND intensity BETWEEN 95 AND 105) OR (target->>'type'='%MaxHR' AND intensity BETWEEN 80 AND 95) OR (target->>'type'='RPE' AND intensity>=6); END LOOP; END LOOP; END LOOP;
  RETURN NOT ((intent='vo2max' AND NOT high) OR (intent='threshold_development' AND NOT threshold) OR (intent='recovery' AND high));
EXCEPTION WHEN data_exception THEN RETURN false; END; $$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_structure_hash(input jsonb) RETURNS text LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT 'v1:sha256:'||encode(sha256(convert_to(public.activity_plan_core_canonical_json(input),'UTF8')),'hex') $$;
CREATE OR REPLACE FUNCTION public.activity_plan_core_semantic_hash(input jsonb, intent text) RETURNS text LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT 'v2:sha256:'||encode(sha256(convert_to(public.activity_plan_core_canonical_json(jsonb_build_object('structure',input,'training_intent',intent)),'UTF8')),'hex') $$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_authoring() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF TG_OP='INSERT' OR NEW.structure IS DISTINCT FROM OLD.structure OR NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN IF NEW.structure_hash IS DISTINCT FROM public.activity_plan_core_structure_hash(NEW.structure) OR NEW.semantic_hash IS DISTINCT FROM public.activity_plan_core_semantic_hash(NEW.structure,NEW.training_intent) THEN RAISE EXCEPTION 'ACTIVITY_PLAN_HASH_MISMATCH' USING ERRCODE='23514', CONSTRAINT='activity_plans_hash_guard'; END IF; IF public.activity_plan_authoring_structure_is_valid(NEW.structure) IS NOT TRUE OR public.activity_plan_authoring_intent_is_valid(NEW.structure,NEW.training_intent) IS NOT TRUE THEN RAISE EXCEPTION 'ACTIVITY_PLAN_AUTHORING_INVALID_CONTENT' USING ERRCODE='23514', CONSTRAINT='activity_plans_authoring_guard'; END IF; ELSIF NEW.structure_hash IS DISTINCT FROM OLD.structure_hash OR NEW.semantic_hash IS DISTINCT FROM OLD.semantic_hash THEN RAISE EXCEPTION 'ACTIVITY_PLAN_HASH_MISMATCH' USING ERRCODE='23514', CONSTRAINT='activity_plans_hash_guard'; END IF; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.enforce_activity_plan_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF NEW.structure IS DISTINCT FROM OLD.structure OR NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN NEW.revision:=OLD.revision+1; ELSE NEW.revision:=OLD.revision; END IF; RETURN NEW; END; $$;

ALTER TABLE public.activity_plans DROP CONSTRAINT IF EXISTS activity_plans_structure_v4_check;
ALTER TABLE public.activity_plans DROP CONSTRAINT IF EXISTS activity_plans_structure_v5_check;
ALTER TABLE public.activity_plans DROP CONSTRAINT IF EXISTS activity_plans_structure_canonical_check;
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_v5_check CHECK (public.activity_plan_v5_structure_is_valid(structure));
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_canonical_check CHECK (public.activity_plan_v5_structure_is_valid(structure));

-- Explicit V5 resolver contract, pinned from source rather than database introspection.
CREATE OR REPLACE FUNCTION public.activity_plan_json_numbers_are_finite(input jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE child jsonb;
BEGIN
  IF jsonb_typeof(input) = 'number' THEN RETURN abs((input #>> '{}')::numeric) <= 1.7976931348623157e308::numeric; END IF;
  IF jsonb_typeof(input) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(input) LOOP IF NOT public.activity_plan_json_numbers_are_finite(child) THEN RETURN false; END IF; END LOOP;
  ELSIF jsonb_typeof(input) = 'object' THEN
    FOR child IN SELECT value FROM jsonb_each(input) LOOP IF NOT public.activity_plan_json_numbers_are_finite(child) THEN RETURN false; END IF; END LOOP;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.activity_plan_datetime_is_valid(input text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE year_value integer; month_value integer; day_value integer; days integer;
BEGIN
  IF input IS NULL OR input !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$' THEN RETURN false; END IF;
  year_value:=substring(input,1,4)::integer; month_value:=substring(input,6,2)::integer; day_value:=substring(input,9,2)::integer;
  days:=CASE WHEN month_value=2 THEN CASE WHEN year_value%400=0 OR (year_value%4=0 AND year_value%100<>0) THEN 29 ELSE 28 END WHEN month_value IN (4,6,9,11) THEN 30 ELSE 31 END;
  RETURN day_value<=days;
END; $$;

CREATE OR REPLACE FUNCTION public.planned_session_resolution_manifest_is_valid(
  manifest jsonb, expected_activity_plan_id uuid, expected_activity_plan_revision integer
)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE fact jsonb; reason jsonb; text_item jsonb; demand jsonb; estimate jsonb; duration jsonb; common_load jsonb;
BEGIN
  IF NOT public.activity_plan_json_numbers_are_finite(manifest) THEN RETURN false; END IF;
  IF public.activity_plan_v5_has_exact_keys(manifest,
    ARRAY['resolver_version','policy_version','training_plan_id','training_plan_revision','training_plan_hash','athlete_context_revision','activity_plan_id','activity_plan_revision','activity_plan_semantic_hash','session_demand','effective_target_duration_minutes','effective_target_common_load','evidence_facts','fallback_level','reason_codes','resolved_structure','resolved_structure_hash','prescription_estimate','fingerprint']) IS NOT TRUE
    OR pg_column_size(manifest) > 1048576
    OR manifest->>'resolver_version' <> 'prescription-resolver-v2'
    OR manifest->>'policy_version' <> 'training-plan-policy-v2'
    OR manifest->>'activity_plan_id' <> expected_activity_plan_id::text
    OR manifest->'activity_plan_revision' <> to_jsonb(expected_activity_plan_revision)
    OR manifest->>'activity_plan_semantic_hash' !~ '^v2:sha256:[0-9a-f]{64}$'
    OR manifest->>'resolved_structure_hash' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR manifest->>'resolved_structure_hash' IS DISTINCT FROM public.activity_plan_core_structure_hash(manifest->'resolved_structure')
    OR manifest->>'fingerprint' !~ '^v1:sha256:[0-9a-f]{64}$'
    OR (manifest->>'training_plan_id' IS NOT NULL AND NOT public.activity_plan_authoring_uuid_is_valid(manifest->'training_plan_id'))
    OR (manifest->>'training_plan_revision' IS NOT NULL AND (jsonb_typeof(manifest->'training_plan_revision') <> 'number' OR manifest->>'training_plan_revision' !~ '^[1-9][0-9]*$'))
    OR (manifest->>'training_plan_hash' IS NOT NULL AND manifest->>'training_plan_hash' !~ '^v1:sha256:[0-9a-f]{64}$')
    OR (manifest->>'athlete_context_revision' IS NOT NULL AND (jsonb_typeof(manifest->'athlete_context_revision') <> 'number' OR manifest->>'athlete_context_revision' !~ '^[1-9][0-9]*$'))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_revision' IS NULL))
    OR ((manifest->>'training_plan_id' IS NULL) <> (manifest->>'training_plan_hash' IS NULL))
    OR public.activity_plan_v5_structure_is_valid(manifest->'resolved_structure') IS NOT TRUE THEN RETURN false; END IF;
  demand := manifest->'session_demand';
  IF public.activity_plan_v5_has_exact_keys(demand, ARRAY['activity_category','training_intent','target_duration_minutes','target_common_load','importance']) IS NOT TRUE
    OR demand->>'activity_category' NOT IN ('run','bike','swim','strength','other')
    OR demand->>'training_intent' NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance')
    OR demand->>'importance' NOT IN ('support','normal','key')
    OR (demand->>'target_duration_minutes' IS NOT NULL AND (jsonb_typeof(demand->'target_duration_minutes') <> 'number' OR demand->>'target_duration_minutes' !~ '^[1-9][0-9]*$' OR (demand->>'target_duration_minutes')::integer > 600))
    OR (demand->>'target_common_load' IS NOT NULL AND (jsonb_typeof(demand->'target_common_load') <> 'number' OR (demand->>'target_common_load')::numeric NOT BETWEEN 0 AND 10000))
    OR demand->>'activity_category' <> manifest->'resolved_structure'->>'activity_category' THEN RETURN false; END IF;
  IF (manifest->>'effective_target_duration_minutes' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_duration_minutes') <> 'number' OR (manifest->>'effective_target_duration_minutes')::numeric <= 0))
    OR (manifest->>'effective_target_common_load' IS NOT NULL AND (jsonb_typeof(manifest->'effective_target_common_load') <> 'number' OR (manifest->>'effective_target_common_load')::numeric < 0))
    OR jsonb_typeof(manifest->'evidence_facts') <> 'array' OR jsonb_array_length(manifest->'evidence_facts') > 16
    OR jsonb_typeof(manifest->'reason_codes') <> 'array' OR jsonb_array_length(manifest->'reason_codes') > 8
    OR manifest->>'fallback_level' NOT IN ('evidence_informed','preference_informed','system_default_no_context') THEN RETURN false; END IF;
  FOR reason IN SELECT value FROM jsonb_array_elements(manifest->'reason_codes') LOOP IF jsonb_typeof(reason) <> 'string' OR reason #>> '{}' <> 'preferred_weekday' THEN RETURN false; END IF; END LOOP;
  FOR fact IN SELECT value FROM jsonb_array_elements(manifest->'evidence_facts') LOOP
    IF public.activity_plan_v5_has_exact_keys(fact, ARRAY['kind','activity_category','metric','unit','value','observed_at','source_id','policy_version']) IS NOT TRUE
      OR fact->>'kind' NOT IN ('threshold','heart_rate') OR fact->>'activity_category' NOT IN ('bike','run','swim')
      OR jsonb_typeof(fact->'metric') <> 'string' OR public.activity_plan_js_length(fact->>'metric') NOT BETWEEN 1 AND 32
      OR jsonb_typeof(fact->'unit') <> 'string' OR public.activity_plan_js_length(fact->>'unit') NOT BETWEEN 1 AND 64
      OR jsonb_typeof(fact->'value') <> 'number' OR (fact->>'value')::numeric <= 0
      OR public.activity_plan_datetime_is_valid(fact->>'observed_at') IS NOT TRUE OR jsonb_typeof(fact->'source_id') <> 'string' OR public.activity_plan_js_length(fact->>'source_id') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(fact->'policy_version') <> 'string' OR public.activity_plan_js_length(fact->>'policy_version') NOT BETWEEN 1 AND 128 THEN RETURN false; END IF;
  END LOOP;
  IF ((manifest->>'fallback_level' = 'evidence_informed') <> (manifest->>'athlete_context_revision' IS NOT NULL))
    OR ((manifest->>'fallback_level' = 'evidence_informed') <> (jsonb_array_length(manifest->'evidence_facts') > 0)) THEN RETURN false; END IF;
  estimate := manifest->'prescription_estimate'; duration := estimate->'duration'; common_load := estimate->'common_load';
  IF public.activity_plan_v5_has_exact_keys(estimate, ARRAY['duration','common_load','rest_seconds','has_open_completion','warnings','factors']) IS NOT TRUE
    OR public.activity_plan_v5_has_exact_keys(duration, ARRAY['status','value_seconds']) IS NOT TRUE
    OR public.activity_plan_v5_has_exact_keys(common_load, ARRAY['status','value']) IS NOT TRUE
    OR duration->>'status' NOT IN ('exact','estimated','unavailable') OR common_load->>'status' NOT IN ('complete','partial','unavailable')
    OR (duration->>'value_seconds' IS NOT NULL AND (jsonb_typeof(duration->'value_seconds') <> 'number' OR duration->>'value_seconds' !~ '^[1-9][0-9]*$'))
    OR ((duration->>'status' = 'unavailable') <> (duration->>'value_seconds' IS NULL))
    OR (common_load->>'value' IS NOT NULL AND (jsonb_typeof(common_load->'value') <> 'number' OR (common_load->>'value')::numeric < 0))
    OR ((common_load->>'status' = 'unavailable') <> (common_load->>'value' IS NULL))
    OR jsonb_typeof(estimate->'rest_seconds') <> 'number' OR estimate->>'rest_seconds' !~ '^[0-9]+$' OR (estimate->>'rest_seconds')::integer > 86400
    OR jsonb_typeof(estimate->'has_open_completion') <> 'boolean'
    OR jsonb_typeof(estimate->'warnings') <> 'array' OR jsonb_array_length(estimate->'warnings') > 32
    OR jsonb_typeof(estimate->'factors') <> 'array' OR jsonb_array_length(estimate->'factors') > 32 THEN RETURN false; END IF;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'warnings') LOOP IF jsonb_typeof(text_item) <> 'string' OR public.activity_plan_js_length(text_item #>> '{}') NOT BETWEEN 1 AND 240 THEN RETURN false; END IF; END LOOP;
  FOR text_item IN SELECT value FROM jsonb_array_elements(estimate->'factors') LOOP IF jsonb_typeof(text_item) <> 'string' OR public.activity_plan_js_length(text_item #>> '{}') NOT BETWEEN 1 AND 160 THEN RETURN false; END IF; END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

DROP FUNCTION IF EXISTS public.activity_plan_v4_name_is_canonical(text,integer);
DROP FUNCTION IF EXISTS public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text);
DROP FUNCTION IF EXISTS public.activity_plan_core_semantic_hash(jsonb,jsonb,text);
DROP FUNCTION IF EXISTS public.activity_plan_core_normalize_adaptation(jsonb);
DROP FUNCTION IF EXISTS public.activity_plan_structure_is_canonical(jsonb);
DROP FUNCTION IF EXISTS public.activity_plan_segment_is_canonical(jsonb);
DROP FUNCTION IF EXISTS public.activity_plan_v4_structure_is_valid(jsonb);
DROP FUNCTION IF EXISTS public.activity_plan_v4_uuid_is_valid(jsonb);
DROP FUNCTION IF EXISTS public.activity_plan_v4_has_exact_keys(jsonb,text[],text[]);
-- activity-plan-v5:functions:end

-- Planned sessions now retain only source identity, lifecycle state, and the
-- durable current activity-plan reference. The former three-column manifest
-- remains nullable solely so a fresh baseline can read legacy compatibility
-- rows; no constraint or trigger treats it as a scheduled prescription.
ALTER TABLE public.planned_sessions
  ALTER COLUMN activity_plan_revision DROP NOT NULL,
  ALTER COLUMN resolution_manifest DROP NOT NULL,
  ALTER COLUMN prescription_captured_at DROP NOT NULL;
ALTER TABLE public.planned_sessions
  DROP CONSTRAINT IF EXISTS planned_sessions_prescription_check;
ALTER TABLE public.planned_sessions
  ADD CONSTRAINT planned_sessions_legacy_prescription_check CHECK (
    num_nonnulls(activity_plan_revision, resolution_manifest, prescription_captured_at) IN (0, 3)
  );

DROP TRIGGER IF EXISTS planned_sessions_prescription_immutable ON public.planned_sessions;
DROP FUNCTION IF EXISTS public.prevent_planned_session_prescription_mutation();
CREATE FUNCTION public.prevent_planned_session_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
    OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
    OR NEW.original_target_date IS DISTINCT FROM OLD.original_target_date
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.direct_operation_id IS DISTINCT FROM OLD.direct_operation_id
    OR NEW.training_plan_id IS DISTINCT FROM OLD.training_plan_id
    OR NEW.training_plan_revision IS DISTINCT FROM OLD.training_plan_revision
    OR NEW.training_plan_application_id IS DISTINCT FROM OLD.training_plan_application_id
    OR NEW.source_session_id IS DISTINCT FROM OLD.source_session_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'planned session identity and source fields are immutable';
  END IF;
  IF NEW.activity_plan_id IS DISTINCT FROM OLD.activity_plan_id
    AND (
      OLD.status <> 'scheduled'
      OR NEW.status <> 'scheduled'
      OR NEW.session_revision <> OLD.session_revision + 1
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'planned session activity-plan reference may change only for a scheduled revision transition';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_planned_session_identity_mutation() FROM public, anon, authenticated, service_role;
CREATE TRIGGER planned_sessions_identity_immutable
BEFORE UPDATE ON public.planned_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_planned_session_identity_mutation();

DROP FUNCTION IF EXISTS public.planned_session_resolution_manifest_is_valid(jsonb, uuid, integer);

-- Backend-only chatbot history and action recovery fence. RLS is deliberately
-- default-deny; application code accesses these rows through the service DB role.
CREATE TABLE public.chatbot_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chatbot_threads_profile_updated_idx ON public.chatbot_threads(profile_id, updated_at);
CREATE TABLE public.chatbot_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chatbot_threads(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^v1:sha256:[0-9a-f]{64}$'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  output jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','interrupted')),
  model_id text,
  model_tier text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(thread_id, request_id)
);
CREATE INDEX chatbot_turns_thread_created_idx ON public.chatbot_turns(thread_id, created_at);
CREATE TABLE public.chatbot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid NOT NULL REFERENCES public.chatbot_turns(id) ON DELETE CASCADE,
  action_id uuid NOT NULL,
  tool_call_id text NOT NULL,
  tool_id text NOT NULL,
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^v1:sha256:[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','unknown')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(turn_id, action_id)
  , UNIQUE(turn_id, tool_call_id)
);
ALTER TABLE public.chatbot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chatbot_threads, public.chatbot_turns, public.chatbot_actions FROM anon, authenticated;
CREATE TABLE public.deferred_threshold_calibrations (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL,
  source_revision integer NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_at timestamptz,
  last_failure_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, activity_id, source_revision),
  CONSTRAINT deferred_threshold_calibrations_activity_profile_fkey
    FOREIGN KEY (activity_id, profile_id) REFERENCES public.activities(id, profile_id) ON DELETE CASCADE,
  CONSTRAINT deferred_threshold_calibrations_revision_check CHECK (source_revision > 0),
  CONSTRAINT deferred_threshold_calibrations_status_check CHECK (status IN ('pending', 'running', 'completed')),
  CONSTRAINT deferred_threshold_calibrations_attempt_check CHECK (attempt_count >= 0),
  CONSTRAINT deferred_threshold_calibrations_lease_check
    CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX deferred_threshold_calibrations_due_idx
  ON public.deferred_threshold_calibrations(status, due_at, retry_at);
ALTER TABLE public.deferred_threshold_calibrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deferred_threshold_calibrations FROM anon, authenticated;
COMMIT;
