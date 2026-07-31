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
CREATE TYPE "public"."activity_file_ingestion_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed');
CREATE TYPE "public"."activity_session_rpe_source" AS ENUM('user', 'provider', 'manual');
CREATE TYPE "public"."effort_type" AS ENUM('power', 'speed', 'heart_rate');
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'completed', 'cancelled');
CREATE TYPE "public"."event_type" AS ENUM('planned', 'race_target', 'custom', 'imported');
CREATE TYPE "public"."evidence_observation_source" AS ENUM('manual', 'test', 'imported', 'provider', 'estimated', 'derived');
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');
CREATE TYPE "public"."integration_provider" AS ENUM('strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift');
CREATE TYPE "public"."integration_resource_kind" AS ENUM('event', 'activity_plan', 'activity_route', 'group_event_route_delivery', 'activity');
CREATE TYPE "public"."like_entity_type" AS ENUM('activity', 'activity_plan', 'training_plan', 'route');
CREATE TYPE "public"."notification_type" AS ENUM('new_message', 'coaching_invitation', 'coaching_invitation_accepted', 'coaching_invitation_declined', 'new_follower', 'follow_request', 'group_event_cancelled');
CREATE TYPE "public"."profile_metric_type" AS ENUM('weight_kg', 'ftp', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr', 'lthr', 'threshold_pace_seconds_per_km', 'css_seconds_per_100m');
CREATE TYPE "public"."training_effect_label" AS ENUM('recovery', 'base', 'tempo', 'threshold', 'vo2max');
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
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
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
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
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"notes" text,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"elapsed_ms" bigint NOT NULL,
	"active_ms" bigint,
	"moving_ms" bigint,
	"timing_coverage" text DEFAULT 'unavailable' NOT NULL,
	"segments_revision" integer DEFAULT 1 NOT NULL,
	"parser_version" text NOT NULL,
	"decoded_contract_version" text NOT NULL,
	"materializer_version" text NOT NULL,
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
	"normalized_graded_speed_mps" numeric(6, 2),
	"avg_temperature" numeric,
	"avg_swolf" numeric,
	"efficiency_factor" numeric,
	"aerobic_decoupling" numeric,
	"pool_length_meters" numeric,
	"total_strokes" integer,
	"device_manufacturer" text,
	"device_product" text,
	"polyline" text,
	"laps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"map_bounds" jsonb,
	CONSTRAINT "activities_id_profile_id_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "activities_content_visibility_check" CHECK ("activities"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "activities_distance_meters_check" CHECK ("activities"."distance_meters" >= 0),
	CONSTRAINT "activities_elapsed_ms_check" CHECK ("activities"."elapsed_ms" > 0),
	CONSTRAINT "activities_active_ms_check" CHECK ("activities"."active_ms" is null or ("activities"."active_ms" >= 0 and "activities"."active_ms" <= "activities"."elapsed_ms")),
	CONSTRAINT "activities_moving_ms_check" CHECK ("activities"."moving_ms" is null or ("activities"."moving_ms" >= 0 and "activities"."moving_ms" <= coalesce("activities"."active_ms", "activities"."elapsed_ms"))),
	CONSTRAINT "activities_segments_revision_check" CHECK ("activities"."segments_revision" > 0),
	CONSTRAINT "activities_timing_coverage_values_check" CHECK (("activities"."timing_coverage" = 'complete' and "activities"."active_ms" is not null and "activities"."moving_ms" is not null) or ("activities"."timing_coverage" in ('partial', 'unavailable') and "activities"."active_ms" is null and "activities"."moving_ms" is null)),
	CONSTRAINT "activities_moving_time_check" CHECK ("activities"."moving_ms" is null or "activities"."active_ms" is null or "activities"."moving_ms" <= "activities"."active_ms"),
	CONSTRAINT "activities_provider_identity_check" CHECK (("activities"."provider" is null) = ("activities"."external_id" is null)),
	CONSTRAINT "activities_laps_array_check" CHECK (jsonb_typeof("activities"."laps") = 'array'),
	CONSTRAINT "activities_laps_count_check" CHECK (jsonb_array_length("activities"."laps") <= 1000),
	CONSTRAINT "activities_laps_size_check" CHECK (pg_column_size("activities"."laps") <= 1048576)
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
	"updated_at" timestamp with time zone,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid,
	"segment_id" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	"activity_category" text NOT NULL,
	"effort_type" "effort_type" NOT NULL,
	"duration_seconds" integer NOT NULL,
	"distance_meters" integer,
	"start_offset" integer,
	"unit" text NOT NULL,
	"value" real NOT NULL,
	"source" "evidence_observation_source",
	"method" text,
	"calculation_version" text,
	"quality_score" numeric,
	"provenance" jsonb,
	CONSTRAINT "activity_efforts_activity_segment_check" CHECK (("activity_efforts"."activity_id" is null and "activity_efforts"."segment_id" is null) or ("activity_efforts"."activity_id" is not null and "activity_efforts"."segment_id" is not null)),
	CONSTRAINT "activity_efforts_duration_seconds_bounds_check" CHECK ("activity_efforts"."duration_seconds" between 1 and 14400),
	CONSTRAINT "activity_efforts_distance_meters_bounds_check" CHECK ("activity_efforts"."distance_meters" is null or "activity_efforts"."distance_meters" between 1 and 1000000),
	CONSTRAINT "activity_efforts_value_finite_positive_check" CHECK (coalesce(("activity_efforts"."value" > 0 and "activity_efforts"."value" not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real)) or ("activity_efforts"."value" = 0 and "activity_efforts"."activity_id" is null and "activity_efforts"."activity_category" = 'bike' and "activity_efforts"."effort_type" = 'power' and "activity_efforts"."source" = 'manual' and "activity_efforts"."method" = 'profile_update_override' and "activity_efforts"."provenance" ->> 'override_state' = 'cleared'), false)),
	CONSTRAINT "activity_efforts_supported_combination_check" CHECK (("activity_efforts"."activity_category" = 'bike' and "activity_efforts"."effort_type" = 'power') or ("activity_efforts"."activity_category" in ('run', 'swim') and "activity_efforts"."effort_type" = 'speed') or ("activity_efforts"."activity_category" in ('bike', 'run', 'swim') and "activity_efforts"."effort_type"::text = 'heart_rate')),
	CONSTRAINT "activity_efforts_unit_compatibility_check" CHECK (("activity_efforts"."activity_category" = 'bike' and "activity_efforts"."effort_type" = 'power' and "activity_efforts"."unit" = 'watts') or ("activity_efforts"."activity_category" in ('run', 'swim') and "activity_efforts"."effort_type" = 'speed' and "activity_efforts"."unit" = 'meters_per_second') or ("activity_efforts"."effort_type"::text = 'heart_rate' and "activity_efforts"."unit" = 'bpm')),
	CONSTRAINT "activity_efforts_bike_power_max_check" CHECK ("activity_efforts"."activity_category" <> 'bike' or "activity_efforts"."effort_type" <> 'power' or "activity_efforts"."value" <= 3000),
	CONSTRAINT "activity_efforts_run_speed_bounds_check" CHECK ("activity_efforts"."activity_category" <> 'run' or "activity_efforts"."effort_type" <> 'speed' or ("activity_efforts"."value" >= 0.3 and "activity_efforts"."value" <= 13)),
	CONSTRAINT "activity_efforts_swim_speed_bounds_check" CHECK ("activity_efforts"."activity_category" <> 'swim' or "activity_efforts"."effort_type" <> 'speed' or ("activity_efforts"."value" >= 0.1 and "activity_efforts"."value" <= 3)),
	CONSTRAINT "activity_efforts_heart_rate_bounds_check" CHECK ("activity_efforts"."effort_type"::text <> 'heart_rate' or "activity_efforts"."value" between 30 and 240),
	CONSTRAINT "activity_efforts_method_not_blank_check" CHECK ("activity_efforts"."method" is null or btrim("activity_efforts"."method") <> ''),
	CONSTRAINT "activity_efforts_calculation_version_not_blank_check" CHECK ("activity_efforts"."calculation_version" is null or btrim("activity_efforts"."calculation_version") <> ''),
	CONSTRAINT "activity_efforts_quality_score_range_check" CHECK ("activity_efforts"."quality_score" is null or ("activity_efforts"."quality_score" >= 0 and "activity_efforts"."quality_score" <= 1)),
	CONSTRAINT "activity_efforts_provenance_object_check" CHECK ("activity_efforts"."provenance" is null or jsonb_typeof("activity_efforts"."provenance") = 'object')
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
	"operation_key" text NOT NULL,
	"claim_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"staging_bucket" text,
	"staging_path" text,
	"expected_sha256" text,
	"expected_byte_size" integer,
	"expected_format" text,
	"expected_media_type" text,
	"accepted_sha256" text,
	"accepted_byte_size" integer,
	"accepted_bucket" text,
	"accepted_path" text,
	"accepted_media_type" text,
	"accepted_format" text,
	"uploaded_at" timestamp with time zone,
	"staging_cleanup_pending" boolean DEFAULT false NOT NULL,
	"staging_cleaned_at" timestamp with time zone,
	"staging_cleanup_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "activity_file_ingestion_status" DEFAULT 'pending_upload' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_file_ingestions_ready_check" CHECK ("activity_file_ingestions"."status" <> 'ready' or ("activity_file_ingestions"."activity_id" is not null and "activity_file_ingestions"."artifact_id" is not null)),
	CONSTRAINT "activity_file_ingestions_claim_check" CHECK (("activity_file_ingestions"."claim_token" is null) = ("activity_file_ingestions"."lease_expires_at" is null)),
	CONSTRAINT "activity_file_ingestions_operation_key_check" CHECK (btrim("activity_file_ingestions"."operation_key") <> ''),
	CONSTRAINT "activity_file_ingestions_attempt_count_check" CHECK ("activity_file_ingestions"."attempt_count" >= 0),
	CONSTRAINT "activity_file_ingestions_expected_size_check" CHECK ("activity_file_ingestions"."expected_byte_size" is null or "activity_file_ingestions"."expected_byte_size" > 0),
	CONSTRAINT "activity_file_ingestions_accepted_size_check" CHECK ("activity_file_ingestions"."accepted_byte_size" is null or "activity_file_ingestions"."accepted_byte_size" > 0),
	CONSTRAINT "activity_file_ingestions_expected_hash_check" CHECK ("activity_file_ingestions"."expected_sha256" is null or "activity_file_ingestions"."expected_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_file_ingestions_accepted_hash_check" CHECK ("activity_file_ingestions"."accepted_sha256" is null or "activity_file_ingestions"."accepted_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "activity_file_ingestions_staging_metadata_check" CHECK (num_nonnulls("activity_file_ingestions"."staging_bucket", "activity_file_ingestions"."staging_path", "activity_file_ingestions"."expected_sha256", "activity_file_ingestions"."expected_byte_size", "activity_file_ingestions"."expected_format", "activity_file_ingestions"."expected_media_type") in (0, 6) and ("activity_file_ingestions"."staging_bucket" is null or (btrim("activity_file_ingestions"."staging_bucket") <> '' and btrim("activity_file_ingestions"."staging_path") <> '' and (("activity_file_ingestions"."expected_format" = 'fit' and "activity_file_ingestions"."expected_media_type" = 'application/vnd.ant.fit') or ("activity_file_ingestions"."expected_format" = 'gpx' and "activity_file_ingestions"."expected_media_type" = 'application/gpx+xml') or ("activity_file_ingestions"."expected_format" = 'tcx' and "activity_file_ingestions"."expected_media_type" = 'application/vnd.garmin.tcx+xml'))))),
	CONSTRAINT "activity_file_ingestions_accepted_metadata_check" CHECK (num_nonnulls("activity_file_ingestions"."accepted_sha256", "activity_file_ingestions"."accepted_byte_size", "activity_file_ingestions"."accepted_bucket", "activity_file_ingestions"."accepted_path", "activity_file_ingestions"."accepted_media_type", "activity_file_ingestions"."accepted_format", "activity_file_ingestions"."uploaded_at") in (0, 7) and ("activity_file_ingestions"."accepted_sha256" is null or ("activity_file_ingestions"."status" = 'ready' and btrim("activity_file_ingestions"."accepted_bucket") <> '' and btrim("activity_file_ingestions"."accepted_path") <> '' and "activity_file_ingestions"."accepted_format" in ('fit', 'gpx', 'tcx') and "activity_file_ingestions"."accepted_path" = 'artifacts/sha256/' || "activity_file_ingestions"."profile_id"::text || '/' || "activity_file_ingestions"."accepted_sha256"))),
	CONSTRAINT "activity_file_ingestions_claim_artifact_match_check" CHECK ("activity_file_ingestions"."expected_sha256" is null or "activity_file_ingestions"."accepted_sha256" is null or ("activity_file_ingestions"."accepted_sha256" = "activity_file_ingestions"."expected_sha256" and "activity_file_ingestions"."accepted_byte_size" = "activity_file_ingestions"."expected_byte_size" and "activity_file_ingestions"."accepted_bucket" = "activity_file_ingestions"."staging_bucket" and "activity_file_ingestions"."accepted_format" = "activity_file_ingestions"."expected_format" and "activity_file_ingestions"."accepted_media_type" = "activity_file_ingestions"."expected_media_type")),
	CONSTRAINT "activity_file_ingestions_cleanup_state_check" CHECK ((not "activity_file_ingestions"."staging_cleanup_pending" or ("activity_file_ingestions"."status" = 'ready' and "activity_file_ingestions"."staging_path" is not null and "activity_file_ingestions"."accepted_path" is not null)) and ("activity_file_ingestions"."staging_cleaned_at" is null or (not "activity_file_ingestions"."staging_cleanup_pending" and "activity_file_ingestions"."staging_path" is not null)) and ("activity_file_ingestions"."staging_cleanup_error" is null or "activity_file_ingestions"."staging_cleanup_pending") and not ("activity_file_ingestions"."staging_cleaned_at" is not null and "activity_file_ingestions"."staging_cleanup_error" is not null)),
	CONSTRAINT "activity_file_ingestions_processing_claim_check" CHECK (("activity_file_ingestions"."status" = 'processing' and "activity_file_ingestions"."claim_token" is not null and "activity_file_ingestions"."lease_expires_at" is not null) or ("activity_file_ingestions"."status" <> 'processing' and "activity_file_ingestions"."claim_token" is null and "activity_file_ingestions"."lease_expires_at" is null))
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
	"gps_recording_enabled" boolean DEFAULT true NOT NULL,
	"template_visibility" text DEFAULT 'private' NOT NULL,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"import_provider" text,
	"import_external_id" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	CONSTRAINT "activity_plans_structure_v3_check" CHECK (jsonb_typeof("activity_plans"."structure") = 'object' and "activity_plans"."structure"->>'version' = '3' and jsonb_typeof("activity_plans"."structure"->'segments') = 'array' and jsonb_array_length("activity_plans"."structure"->'segments') between 1 and 64 and pg_column_size("activity_plans"."structure") <= 1048576),
	CONSTRAINT "activity_plans_structure_canonical_check" CHECK (public.activity_plan_structure_is_canonical("activity_plans"."structure")),
	CONSTRAINT "activity_plans_structure_hash_check" CHECK ("activity_plans"."structure_hash" ~ '^v1:sha256:[0-9a-f]{64}$'),
	CONSTRAINT "activity_plans_template_visibility_check" CHECK ("activity_plans"."template_visibility" = any(array['private'::text, 'followers'::text, 'public'::text])),
	CONSTRAINT "activity_plans_content_visibility_check" CHECK ("activity_plans"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "activity_plans_import_provider_non_empty_check" CHECK ("activity_plans"."import_provider" is null or btrim("activity_plans"."import_provider") <> ''),
	CONSTRAINT "activity_plans_import_external_id_non_empty_check" CHECK ("activity_plans"."import_external_id" is null or btrim("activity_plans"."import_external_id") <> ''),
	CONSTRAINT "activity_plans_system_templates_public_check" CHECK ("activity_plans"."is_system_template" = false or ("activity_plans"."template_visibility" = 'public' and "activity_plans"."content_visibility" = 'public')),
	CONSTRAINT "activity_plans_system_template_check" CHECK (("activity_plans"."is_system_template" = true and "activity_plans"."profile_id" is null) or ("activity_plans"."is_system_template" = false and "activity_plans"."profile_id" is not null))
);

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
	"activity_category" text,
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

CREATE TABLE "canonical_activity_categories" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "canonical_activity_categories_code_check" CHECK ("canonical_activity_categories"."code" in ('run', 'bike', 'swim', 'strength', 'other'))
);

INSERT INTO "canonical_activity_categories" ("code", "display_name", "enabled") VALUES
  ('run', 'Run', true),
  ('bike', 'Bike', true),
  ('swim', 'Swim', true),
  ('strength', 'Strength', true),
  ('other', 'Other', true);

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
	"updated_at" timestamp with time zone NOT NULL
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"read_only" boolean,
	"training_plan_id" uuid,
	"activity_plan_id" uuid,
	"linked_activity_id" uuid,
	"route_id" uuid,
	"recurrence_rule" text,
	"recurrence_timezone" text,
	"series_id" uuid,
	"source_provider" text,
	"occurrence_key" text DEFAULT '' NOT NULL,
	"original_starts_at" timestamp with time zone,
	"integration_account_id" uuid,
	"external_calendar_id" text,
	"external_event_id" text,
	"schedule_batch_id" uuid,
	"lifecycle" jsonb,
	"recurrence" jsonb,
	"payload" jsonb,
	CONSTRAINT "events_id_profile_id_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "events_time_window" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_external_calendar_non_empty" CHECK ("events"."external_calendar_id" is null or btrim("events"."external_calendar_id") <> ''),
	CONSTRAINT "events_external_event_non_empty" CHECK ("events"."external_event_id" is null or btrim("events"."external_event_id") <> ''),
	CONSTRAINT "events_source_identity_complete" CHECK ((
        "events"."source_provider" is null
        and "events"."integration_account_id" is null
        and "events"."external_calendar_id" is null
        and "events"."external_event_id" is null
      ) or (
        "events"."source_provider" is not null
        and "events"."integration_account_id" is not null
        and "events"."external_calendar_id" is not null
        and "events"."external_event_id" is not null
      )),
	CONSTRAINT "events_source_provider_non_empty" CHECK ("events"."source_provider" is null or btrim("events"."source_provider") <> ''),
	CONSTRAINT "events_recurrence_rule_non_empty" CHECK ("events"."recurrence_rule" is null or btrim("events"."recurrence_rule") <> ''),
	CONSTRAINT "events_recurrence_timezone_non_empty" CHECK ("events"."recurrence_timezone" is null or btrim("events"."recurrence_timezone") <> ''),
	CONSTRAINT "events_recurrence_timezone_requires_rule" CHECK ("events"."recurrence_timezone" is null or "events"."recurrence_rule" is not null),
	CONSTRAINT "events_series_occurrence_key_required" CHECK ("events"."series_id" is null or btrim("events"."occurrence_key") <> ''),
	CONSTRAINT "events_series_not_self" CHECK ("events"."series_id" is null or "events"."series_id" <> "events"."id")
);

CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);

CREATE TABLE "group_event_rsvps" (
	"group_event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_event_rsvps_group_event_id_profile_id_pk" PRIMARY KEY("group_event_id","profile_id"),
	CONSTRAINT "group_event_rsvps_status_check" CHECK ("group_event_rsvps"."status" in ('accepted', 'declined', 'tentative'))
);

CREATE TABLE "group_event_series_rsvps" (
	"group_event_series_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_event_series_rsvps_group_event_series_id_profile_id_pk" PRIMARY KEY("group_event_series_id","profile_id"),
	CONSTRAINT "group_event_series_rsvps_status_check" CHECK ("group_event_series_rsvps"."status" in ('accepted', 'declined', 'tentative'))
);

CREATE TABLE "group_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"series_id" uuid,
	"created_by_profile_id" uuid,
	"title" text,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text,
	"recurrence_rule" text,
	"recurrence_timezone" text,
	"occurrence_key" text,
	"location_name" text,
	"route_id" uuid,
	"activity_plan_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_events_title_non_empty" CHECK ("group_events"."title" is null or btrim("group_events"."title") <> ''),
	CONSTRAINT "group_events_root_title_required" CHECK ("group_events"."series_id" is not null or "group_events"."title" is not null),
	CONSTRAINT "group_events_time_window" CHECK ("group_events"."ends_at" is null or "group_events"."ends_at" > "group_events"."starts_at"),
	CONSTRAINT "group_events_series_not_self" CHECK ("group_events"."series_id" is null or "group_events"."series_id" <> "group_events"."id"),
	CONSTRAINT "group_events_timezone_non_empty" CHECK ("group_events"."timezone" is null or btrim("group_events"."timezone") <> ''),
	CONSTRAINT "group_events_recurrence_rule_non_empty" CHECK ("group_events"."recurrence_rule" is null or btrim("group_events"."recurrence_rule") <> ''),
	CONSTRAINT "group_events_recurrence_timezone_non_empty" CHECK ("group_events"."recurrence_timezone" is null or btrim("group_events"."recurrence_timezone") <> ''),
	CONSTRAINT "group_events_recurrence_timezone_requires_rule" CHECK ("group_events"."recurrence_timezone" is null or "group_events"."recurrence_rule" is not null),
	CONSTRAINT "group_events_recurring_series_timezone_required" CHECK ("group_events"."recurrence_rule" is null or "group_events"."timezone" is not null),
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
	CONSTRAINT "integration_resource_links_external_unique" UNIQUE("integration_id","resource_kind","external_id")
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
	"expires_at" timestamp with time zone NOT NULL
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

CREATE TABLE "profile_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"priority" integer NOT NULL,
	"activity_category" text NOT NULL,
	"target_date" date NOT NULL,
	"target_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_goals_title_length_check" CHECK (char_length(btrim("profile_goals"."title")) between 1 and 100),
	CONSTRAINT "profile_goals_priority_range" CHECK ("profile_goals"."priority" between 0 and 10),
	CONSTRAINT "profile_goals_activity_category_check" CHECK ("profile_goals"."activity_category" in ('run', 'bike', 'swim', 'strength', 'other')),
	CONSTRAINT "profile_goals_target_payload_shape_check" CHECK (jsonb_typeof("profile_goals"."target_payload") = 'object'
		and "profile_goals"."target_payload" ? 'type'
		and jsonb_typeof("profile_goals"."target_payload"->'type') = 'string'
		and "profile_goals"."target_payload"->>'type' in ('event_performance', 'threshold', 'completion', 'consistency')
		and (not ("profile_goals"."target_payload" ? 'activity_category')
			or (jsonb_typeof("profile_goals"."target_payload"->'activity_category') = 'string'
				and "profile_goals"."target_payload"->>'activity_category' = "profile_goals"."activity_category"))),
	CONSTRAINT "profile_goals_event_performance_payload_check" CHECK ("profile_goals"."target_payload"->>'type' <> 'event_performance' or (
		"profile_goals"."target_payload" - array['type', 'activity_category', 'distance_m', 'target_time_s', 'target_speed_mps', 'environment', 'tolerance_pct']::text[] = '{}'::jsonb
		and "profile_goals"."target_payload" ? 'activity_category'
		and "profile_goals"."target_payload" ? 'distance_m'
		and case when jsonb_typeof("profile_goals"."target_payload"->'distance_m') = 'number'
			then ("profile_goals"."target_payload"->>'distance_m')::numeric > 0 else false end
		and ("profile_goals"."target_payload" ? 'target_time_s' or "profile_goals"."target_payload" ? 'target_speed_mps')
		and (not ("profile_goals"."target_payload" ? 'target_time_s') or case
			when jsonb_typeof("profile_goals"."target_payload"->'target_time_s') = 'number'
			then ("profile_goals"."target_payload"->>'target_time_s')::numeric > 0
				and trunc(("profile_goals"."target_payload"->>'target_time_s')::numeric) = ("profile_goals"."target_payload"->>'target_time_s')::numeric
			else false end)
		and (not ("profile_goals"."target_payload" ? 'target_speed_mps') or case
			when jsonb_typeof("profile_goals"."target_payload"->'target_speed_mps') = 'number'
			then ("profile_goals"."target_payload"->>'target_speed_mps')::numeric > 0 else false end)
		and (not ("profile_goals"."target_payload" ? 'environment') or (
			jsonb_typeof("profile_goals"."target_payload"->'environment') = 'string'
			and char_length(btrim("profile_goals"."target_payload"->>'environment')) between 1 and 80))
		and (not ("profile_goals"."target_payload" ? 'tolerance_pct') or case
			when jsonb_typeof("profile_goals"."target_payload"->'tolerance_pct') = 'number'
			then ("profile_goals"."target_payload"->>'tolerance_pct')::numeric between 0 and 1 else false end)
	)),
	CONSTRAINT "profile_goals_threshold_payload_check" CHECK ("profile_goals"."target_payload"->>'type' <> 'threshold' or (
		"profile_goals"."target_payload" - array['type', 'metric', 'activity_category', 'value', 'test_duration_s', 'tolerance_pct']::text[] = '{}'::jsonb
		and "profile_goals"."target_payload" ? 'metric'
		and jsonb_typeof("profile_goals"."target_payload"->'metric') = 'string'
		and "profile_goals"."target_payload"->>'metric' in ('pace', 'power', 'hr')
		and "profile_goals"."target_payload" ? 'value'
		and case when jsonb_typeof("profile_goals"."target_payload"->'value') = 'number'
			then ("profile_goals"."target_payload"->>'value')::numeric > 0 else false end
		and (not ("profile_goals"."target_payload" ? 'test_duration_s') or case
			when jsonb_typeof("profile_goals"."target_payload"->'test_duration_s') = 'number'
			then ("profile_goals"."target_payload"->>'test_duration_s')::numeric > 0
				and trunc(("profile_goals"."target_payload"->>'test_duration_s')::numeric) = ("profile_goals"."target_payload"->>'test_duration_s')::numeric
			else false end)
		and (not ("profile_goals"."target_payload" ? 'tolerance_pct') or case
			when jsonb_typeof("profile_goals"."target_payload"->'tolerance_pct') = 'number'
			then ("profile_goals"."target_payload"->>'tolerance_pct')::numeric between 0 and 1 else false end)
	)),
	CONSTRAINT "profile_goals_completion_payload_check" CHECK ("profile_goals"."target_payload"->>'type' <> 'completion' or (
		"profile_goals"."target_payload" - array['type', 'activity_category', 'distance_m', 'duration_s']::text[] = '{}'::jsonb
		and ("profile_goals"."target_payload" ? 'distance_m' or "profile_goals"."target_payload" ? 'duration_s')
		and (not ("profile_goals"."target_payload" ? 'distance_m') or case
			when jsonb_typeof("profile_goals"."target_payload"->'distance_m') = 'number'
			then ("profile_goals"."target_payload"->>'distance_m')::numeric > 0 else false end)
		and (not ("profile_goals"."target_payload" ? 'duration_s') or case
			when jsonb_typeof("profile_goals"."target_payload"->'duration_s') = 'number'
			then ("profile_goals"."target_payload"->>'duration_s')::numeric > 0
				and trunc(("profile_goals"."target_payload"->>'duration_s')::numeric) = ("profile_goals"."target_payload"->>'duration_s')::numeric
			else false end)
	)),
	CONSTRAINT "profile_goals_consistency_payload_check" CHECK ("profile_goals"."target_payload"->>'type' <> 'consistency' or (
		"profile_goals"."target_payload" - array['type', 'target_sessions_per_week', 'target_weeks']::text[] = '{}'::jsonb
		and ("profile_goals"."target_payload" ? 'target_sessions_per_week' or "profile_goals"."target_payload" ? 'target_weeks')
		and (not ("profile_goals"."target_payload" ? 'target_sessions_per_week') or case
			when jsonb_typeof("profile_goals"."target_payload"->'target_sessions_per_week') = 'number'
			then ("profile_goals"."target_payload"->>'target_sessions_per_week')::numeric > 0
				and trunc(("profile_goals"."target_payload"->>'target_sessions_per_week')::numeric) = ("profile_goals"."target_payload"->>'target_sessions_per_week')::numeric
			else false end)
		and (not ("profile_goals"."target_payload" ? 'target_weeks') or case
			when jsonb_typeof("profile_goals"."target_payload"->'target_weeks') = 'number'
			then ("profile_goals"."target_payload"->>'target_weeks')::numeric > 0
				and trunc(("profile_goals"."target_payload"->>'target_weeks')::numeric) = ("profile_goals"."target_payload"->>'target_weeks')::numeric
			else false end)
	))
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
	"onboarded" boolean,
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
	"template_visibility" text DEFAULT 'private' NOT NULL,
	"content_visibility" text DEFAULT 'private' NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"sessions_per_week_target" integer,
	"duration_hours" numeric(12, 2),
	CONSTRAINT "training_plans_structure_v1_check" CHECK (jsonb_typeof("training_plans"."structure") = 'object' and "training_plans"."structure"->>'version' = '1' and jsonb_typeof("training_plans"."structure"->'sessions') = 'array' and jsonb_array_length("training_plans"."structure"->'sessions') > 0 and pg_column_size("training_plans"."structure") <= 1048576),
	CONSTRAINT "training_plans_structure_hash_check" CHECK ("training_plans"."structure_hash" ~ '^v1:sha256:[0-9a-f]{64}$'),
	CONSTRAINT "training_plans_template_visibility_check" CHECK ("training_plans"."template_visibility" = any(array['private'::text, 'followers'::text, 'public'::text])),
	CONSTRAINT "training_plans_content_visibility_check" CHECK ("training_plans"."content_visibility" in ('private', 'followers', 'public')),
	CONSTRAINT "training_plans_system_templates_public_check" CHECK ("training_plans"."is_system_template" = false or ("training_plans"."template_visibility" = 'public' and "training_plans"."content_visibility" = 'public')),
	CONSTRAINT "training_plans_template_profile_check" CHECK (("training_plans"."is_system_template" = true and "training_plans"."profile_id" is null) or ("training_plans"."is_system_template" = false and "training_plans"."profile_id" is not null))
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_artifact_links" ADD CONSTRAINT "activity_artifact_links_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_artifact_links" ADD CONSTRAINT "activity_artifact_links_artifact_profile_fkey" FOREIGN KEY ("artifact_id","profile_id") REFERENCES "public"."activity_artifacts"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_artifacts" ADD CONSTRAINT "activity_artifacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_category_canonical_activity_categories_code_fk" FOREIGN KEY ("activity_category") REFERENCES "public"."canonical_activity_categories"("code") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_segment_activity_profile_category_fkey" FOREIGN KEY ("segment_id","activity_id","profile_id","activity_category") REFERENCES "public"."activity_segments"("id","activity_id","profile_id","activity_category") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_artifact_profile_fkey" FOREIGN KEY ("artifact_id","profile_id") REFERENCES "public"."activity_artifacts"("id","profile_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_route_deletion_receipts" ADD CONSTRAINT "activity_route_deletion_receipts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_activity_category_canonical_activity_categories_code_fk" FOREIGN KEY ("activity_category") REFERENCES "public"."canonical_activity_categories"("code") ON DELETE restrict ON UPDATE no action;
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
ALTER TABLE "events" ADD CONSTRAINT "events_integration_account_id_integrations_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;
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
ALTER TABLE "profile_goals" ADD CONSTRAINT "profile_goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_reference_activity_id_activities_id_fk" FOREIGN KEY ("reference_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "profile_training_settings" ADD CONSTRAINT "profile_training_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_job_id_provider_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provider_sync_jobs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");
CREATE INDEX "idx_activities_activity_plan" ON "activities" USING btree ("activity_plan_id") WHERE "activities"."activity_plan_id" is not null;
CREATE INDEX "idx_activities_profile_started" ON "activities" USING btree ("profile_id","started_at");
CREATE INDEX "idx_activities_started" ON "activities" USING btree ("started_at");
CREATE INDEX "idx_activities_content_visibility" ON "activities" USING btree ("content_visibility");
CREATE UNIQUE INDEX "idx_activities_provider_external_unique" ON "activities" USING btree ("provider","external_id") WHERE "activities"."provider" is not null and "activities"."external_id" is not null;
CREATE INDEX "idx_activities_provider_external" ON "activities" USING btree ("provider","external_id") WHERE "activities"."external_id" is not null;
CREATE UNIQUE INDEX "activity_artifact_links_current_source_unique" ON "activity_artifact_links" USING btree ("activity_id") WHERE "activity_artifact_links"."role" = 'source' and "activity_artifact_links"."is_current" = true;
CREATE INDEX "idx_activity_artifact_links_artifact" ON "activity_artifact_links" USING btree ("artifact_id");
CREATE INDEX "idx_activity_artifacts_profile" ON "activity_artifacts" USING btree ("profile_id");
CREATE INDEX "idx_activity_efforts_activity_id" ON "activity_efforts" USING btree ("activity_id");
CREATE INDEX "idx_activity_efforts_segment_id" ON "activity_efforts" USING btree ("segment_id");
CREATE INDEX "idx_activity_efforts_profile_id" ON "activity_efforts" USING btree ("profile_id");
CREATE INDEX "idx_activity_file_ingestions_activity_profile" ON "activity_file_ingestions" USING btree ("activity_id","profile_id") WHERE "activity_file_ingestions"."activity_id" is not null;
CREATE INDEX "idx_activity_file_ingestions_activity_id" ON "activity_file_ingestions" USING btree ("activity_id") WHERE "activity_file_ingestions"."activity_id" is not null;
CREATE INDEX "idx_activity_file_ingestions_artifact_id" ON "activity_file_ingestions" USING btree ("artifact_id") WHERE "activity_file_ingestions"."artifact_id" is not null;
CREATE INDEX "idx_activity_file_ingestions_profile_id" ON "activity_file_ingestions" USING btree ("profile_id");
CREATE INDEX "idx_activity_file_ingestions_status" ON "activity_file_ingestions" USING btree ("status");
CREATE INDEX "idx_activity_file_ingestions_provider_external" ON "activity_file_ingestions" USING btree ("provider","external_id") WHERE "activity_file_ingestions"."provider" is not null and "activity_file_ingestions"."external_id" is not null;
CREATE UNIQUE INDEX "activity_file_ingestions_profile_operation_unique" ON "activity_file_ingestions" USING btree ("profile_id","operation_key");
CREATE INDEX "idx_activity_plans_profile_id" ON "activity_plans" USING btree ("profile_id") WHERE "activity_plans"."profile_id" is not null;
CREATE INDEX "idx_activity_plans_system_templates" ON "activity_plans" USING btree ("is_system_template") WHERE "activity_plans"."is_system_template" = true;
CREATE INDEX "idx_activity_plans_visibility" ON "activity_plans" USING btree ("template_visibility");
CREATE INDEX "idx_activity_plans_content_visibility" ON "activity_plans" USING btree ("content_visibility");
CREATE INDEX "idx_activity_plans_structure_categories" ON "activity_plans" USING gin ("structure" jsonb_path_ops);
CREATE UNIQUE INDEX "idx_activity_plans_import_identity" ON "activity_plans" USING btree ("profile_id","import_provider","import_external_id") WHERE "activity_plans"."import_provider" is not null and "activity_plans"."import_external_id" is not null;
CREATE INDEX "idx_routes_profile_id" ON "activity_routes" USING btree ("profile_id") WHERE "activity_routes"."profile_id" is not null;
CREATE INDEX "idx_routes_name" ON "activity_routes" USING btree ("name");
CREATE INDEX "idx_routes_created_at" ON "activity_routes" USING btree ("created_at");
CREATE INDEX "idx_routes_profile_storage_state" ON "activity_routes" USING btree ("profile_id","storage_state");
CREATE INDEX "idx_activity_route_deletion_receipts_profile" ON "activity_route_deletion_receipts" USING btree ("profile_id");
CREATE INDEX "idx_routes_is_system_template" ON "activity_routes" USING btree ("is_system_template") WHERE "activity_routes"."is_system_template" = true;
CREATE INDEX "idx_activity_segments_activity" ON "activity_segments" USING btree ("activity_id","ordinal");
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
CREATE UNIQUE INDEX "idx_events_external_identity_unique" ON "events" USING btree ("source_provider","integration_account_id","external_calendar_id","external_event_id","occurrence_key") WHERE "events"."source_provider" is not null and "events"."integration_account_id" is not null and "events"."external_calendar_id" is not null and "events"."external_event_id" is not null;
CREATE UNIQUE INDEX "idx_events_series_occurrence_unique" ON "events" USING btree ("series_id","occurrence_key") WHERE "events"."series_id" is not null;
CREATE INDEX "idx_events_training_plan_id" ON "events" USING btree ("training_plan_id") WHERE "events"."training_plan_id" is not null;
CREATE INDEX "idx_events_activity_plan_id" ON "events" USING btree ("activity_plan_id") WHERE "events"."activity_plan_id" is not null;
CREATE INDEX "idx_events_linked_activity_id" ON "events" USING btree ("linked_activity_id") WHERE "events"."linked_activity_id" is not null;
CREATE INDEX "idx_events_route_id" ON "events" USING btree ("route_id") WHERE "events"."route_id" is not null;
CREATE INDEX "idx_events_schedule_batch" ON "events" USING btree ("profile_id","schedule_batch_id") WHERE "events"."schedule_batch_id" is not null;
CREATE INDEX "idx_events_integration_calendar_updated" ON "events" USING btree ("integration_account_id","external_calendar_id","updated_at") WHERE "events"."integration_account_id" is not null and "events"."external_calendar_id" is not null;
CREATE INDEX "idx_events_event_type_starts_at" ON "events" USING btree ("event_type","starts_at");
CREATE INDEX "idx_events_profile_starts_at" ON "events" USING btree ("profile_id","starts_at");
CREATE INDEX "idx_events_profile_status_starts_at" ON "events" USING btree ("profile_id","status","starts_at");
CREATE INDEX "idx_events_planned_day_summary" ON "events" USING btree ("profile_id","scheduled_date","starts_at","id","activity_plan_id") WHERE "events"."event_type" = 'planned' and "events"."status" in ('scheduled', 'completed');
CREATE INDEX "idx_follows_following_id" ON "follows" USING btree ("following_id");
CREATE INDEX "group_event_rsvps_profile_status_idx" ON "group_event_rsvps" USING btree ("profile_id","status");
CREATE INDEX "group_event_series_rsvps_profile_status_idx" ON "group_event_series_rsvps" USING btree ("profile_id","status");
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
CREATE INDEX "idx_profile_goals_profile_id" ON "profile_goals" USING btree ("profile_id");
CREATE INDEX "idx_profile_metrics_profile" ON "profile_metrics" USING btree ("profile_id","recorded_at");
CREATE INDEX "idx_profile_metrics_recorded_at" ON "profile_metrics" USING btree ("recorded_at");
CREATE INDEX "idx_profile_metrics_reference_activity" ON "profile_metrics" USING btree ("reference_activity_id") WHERE "profile_metrics"."reference_activity_id" is not null;
CREATE INDEX "idx_profile_metrics_temporal_lookup" ON "profile_metrics" USING btree ("profile_id","metric_type","recorded_at");
CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "profiles" USING btree ("username");
CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "profiles" USING btree ("email") WHERE "profiles"."email" is not null;
CREATE UNIQUE INDEX "provider_sync_jobs_queue_sequence_key" ON "provider_sync_jobs" USING btree ("queue_sequence");
CREATE INDEX "idx_provider_sync_jobs_status_run_at_priority" ON "provider_sync_jobs" USING btree ("status","run_at","priority");
CREATE INDEX "idx_provider_sync_jobs_provider_profile_status" ON "provider_sync_jobs" USING btree ("provider","profile_id","status");
CREATE INDEX "idx_provider_sync_jobs_dedupe_key" ON "provider_sync_jobs" USING btree ("dedupe_key");
CREATE INDEX "idx_provider_sync_jobs_lane_status" ON "provider_sync_jobs" USING btree ("sync_lane_key","status","run_at");
CREATE INDEX "idx_provider_sync_jobs_integration_id" ON "provider_sync_jobs" USING btree ("integration_id");
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
CREATE INDEX "idx_training_plans_visibility" ON "training_plans" USING btree ("template_visibility");
CREATE INDEX "idx_training_plans_content_visibility" ON "training_plans" USING btree ("content_visibility");


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
    when 'activity' then public.activity_plan_jsonb_has_exact_keys(input, array['id', 'name', 'role', 'activity_category', 'intervals'], array['notes'])
      and public.activity_plan_jsonb_is_uuid(input -> 'id')
      and public.activity_plan_jsonb_is_string(input -> 'name', 1, 100)
      and (input -> 'notes' is null or public.activity_plan_jsonb_is_string(input -> 'notes', 0, 1000))
      and input ->> 'activity_category' in ('run', 'bike', 'swim', 'strength', 'other')
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
              or exists (
                select 1 from pg_catalog.jsonb_array_elements(step_value -> 'targets') target_value
                where not public.activity_plan_target_is_canonical(target_value, input ->> 'activity_category')
              )
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
  activity_category_value text;
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
    or not public.activity_plan_jsonb_has_exact_keys(input, array['version', 'segments'])
    or input -> 'version' <> '3'::jsonb
    or pg_catalog.jsonb_typeof(input -> 'segments') <> 'array'
    or pg_catalog.jsonb_array_length(input -> 'segments') not between 1 and 64 then return false; end if;
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
      activity_category_value := segment_value ->> 'activity_category';
      if activity_category is null then activity_category := activity_category_value; elsif activity_category <> activity_category_value then return false; end if;
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
      when 'speed' then (input ->> 'intensity')::numeric between 0 and 100 and activity_category = 'run'
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
  ORDER BY assignment.assigned_at DESC, assignment.id DESC
  LIMIT 1
  FOR SHARE;

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
  update public.activity_file_ingestions set artifact_id=null,status='failed',claim_token=null,lease_expires_at=null,
    accepted_sha256=null,accepted_byte_size=null,accepted_bucket=null,accepted_path=null,
    accepted_media_type=null,accepted_format=null,uploaded_at=null,
    staging_cleanup_pending=false,staging_cleanup_error=null,
    failed_at=coalesce(failed_at,now()),last_error_code='artifact_deletion_requested',
    last_error_message='Accepted source artifact entered controlled deletion',updated_at=now()
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
    or new.start_offset is null or new.start_offset*1000<segment_record.start_offset_ms
    or (new.start_offset+new.duration_seconds)*1000>segment_record.end_offset_ms then
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

ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_artifact_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_artifacts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_efforts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_file_ingestions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_routes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_route_deletion_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_segments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_session_rpe_evidence" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."api_rate_limit_windows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athlete_consent_policy_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athlete_data_sharing_consents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."canonical_activity_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coaching_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coaching_engagements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."content_access_grants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_goals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_metrics" ENABLE ROW LEVEL SECURITY;

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
CREATE TRIGGER activity_artifacts_block_direct_delete BEFORE DELETE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.block_activity_artifact_direct_delete();
CREATE TRIGGER activity_artifacts_immutable_before_update BEFORE UPDATE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_artifact_immutable();
CREATE TRIGGER activity_efforts_validate_segment_range BEFORE INSERT OR UPDATE ON public.activity_efforts FOR EACH ROW EXECUTE FUNCTION public.validate_activity_effort_segment_range();
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
CREATE CONSTRAINT TRIGGER grants_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organization_membership_role_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE CONSTRAINT TRIGGER memberships_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organization_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE TRIGGER organization_audit_events_append_only BEFORE DELETE OR UPDATE ON public.organization_audit_events FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_audit_event_mutation();
CREATE TRIGGER organization_membership_role_grants_revoke_only BEFORE DELETE OR UPDATE ON public.organization_membership_role_grants FOR EACH ROW EXECUTE FUNCTION public.prevent_role_grant_mutation();
CREATE CONSTRAINT TRIGGER organizations_root_owner_guard AFTER INSERT OR DELETE OR UPDATE ON public.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE TRIGGER organizations_root_owner_transfer_command_guard BEFORE UPDATE OF root_owner_membership_id ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_organization_root_owner_transfer();

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
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
TO service_role;
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
