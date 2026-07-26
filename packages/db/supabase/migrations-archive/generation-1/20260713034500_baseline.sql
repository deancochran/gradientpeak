


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."activity_category" AS ENUM (
    'run',
    'bike',
    'swim',
    'strength',
    'other'
);


ALTER TYPE "public"."activity_category" OWNER TO "postgres";


CREATE TYPE "public"."activity_file_ingestion_source" AS ENUM (
    'mobile_recording',
    'manual_import',
    'provider_sync'
);


ALTER TYPE "public"."activity_file_ingestion_source" OWNER TO "postgres";


CREATE TYPE "public"."activity_file_ingestion_status" AS ENUM (
    'pending_upload',
    'uploaded',
    'processing',
    'ready',
    'failed'
);


ALTER TYPE "public"."activity_file_ingestion_status" OWNER TO "postgres";


CREATE TYPE "public"."effort_type" AS ENUM (
    'power',
    'speed'
);


ALTER TYPE "public"."effort_type" OWNER TO "postgres";


CREATE TYPE "public"."event_status" AS ENUM (
    'scheduled',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'planned_activity',
    'rest_day',
    'race',
    'custom',
    'imported'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."evidence_observation_source" AS ENUM (
    'manual',
    'test',
    'imported',
    'provider',
    'estimated',
    'derived'
);


ALTER TYPE "public"."evidence_observation_source" OWNER TO "postgres";


CREATE TYPE "public"."gender" AS ENUM (
    'male',
    'female',
    'other'
);


ALTER TYPE "public"."gender" OWNER TO "postgres";


CREATE TYPE "public"."integration_provider" AS ENUM (
    'strava',
    'wahoo',
    'trainingpeaks',
    'garmin',
    'zwift'
);


ALTER TYPE "public"."integration_provider" OWNER TO "postgres";


CREATE TYPE "public"."integration_resource_kind" AS ENUM (
    'event',
    'activity_plan',
    'activity_route',
    'activity'
);


ALTER TYPE "public"."integration_resource_kind" OWNER TO "postgres";


CREATE TYPE "public"."like_entity_type" AS ENUM (
    'activity',
    'activity_plan',
    'training_plan',
    'route'
);


ALTER TYPE "public"."like_entity_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'new_message',
    'coaching_invitation',
    'coaching_invitation_accepted',
    'coaching_invitation_declined',
    'new_follower',
    'follow_request',
    'group_event_cancelled'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."profile_metric_type" AS ENUM (
    'weight_kg',
    'ftp',
    'resting_hr',
    'sleep_hours',
    'hrv_rmssd',
    'vo2_max',
    'body_fat_percentage',
    'hydration_level',
    'stress_score',
    'soreness_level',
    'wellness_score',
    'max_hr',
    'lthr',
    'threshold_pace_seconds_per_km',
    'css_seconds_per_100m'
);


ALTER TYPE "public"."profile_metric_type" OWNER TO "postgres";


CREATE TYPE "public"."training_effect_label" AS ENUM (
    'recovery',
    'base',
    'tempo',
    'threshold',
    'vo2max'
);


ALTER TYPE "public"."training_effect_label" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "provider_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "id_token" "text",
    "access_token_expires_at" timestamp without time zone,
    "refresh_token_expires_at" timestamp without time zone,
    "scope" "text",
    "password" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "activity_plan_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone NOT NULL,
    "notes" "text",
    "is_private" boolean DEFAULT true NOT NULL,
    "provider" "public"."integration_provider",
    "external_id" "text",
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "moving_seconds" integer DEFAULT 0 NOT NULL,
    "distance_meters" integer DEFAULT 0 NOT NULL,
    "elevation_gain_meters" numeric(10,2),
    "elevation_loss_meters" numeric(10,2),
    "calories" integer,
    "avg_heart_rate" integer,
    "max_heart_rate" integer,
    "avg_power" integer,
    "max_power" integer,
    "normalized_power" integer,
    "avg_cadence" integer,
    "max_cadence" integer,
    "avg_speed_mps" numeric(6,2),
    "max_speed_mps" numeric(6,2),
    "normalized_speed_mps" numeric(6,2),
    "normalized_graded_speed_mps" numeric(6,2),
    "avg_temperature" numeric,
    "avg_swolf" numeric,
    "efficiency_factor" numeric,
    "aerobic_decoupling" numeric,
    "pool_length" numeric,
    "total_strokes" integer,
    "device_manufacturer" "text",
    "device_product" "text",
    "activity_file_path" "text",
    "activity_file_size" integer,
    "import_source" "text",
    "import_file_type" "text",
    "import_original_file_name" "text",
    "polyline" "text",
    "laps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "map_bounds" "jsonb",
    CONSTRAINT "activities_distance_meters_check" CHECK (("distance_meters" >= 0)),
    CONSTRAINT "activities_duration_seconds_check" CHECK (("duration_seconds" >= 0)),
    CONSTRAINT "activities_import_file_type_non_empty_check" CHECK ((("import_file_type" IS NULL) OR ("btrim"("import_file_type") <> ''::"text"))),
    CONSTRAINT "activities_import_original_file_name_non_empty_check" CHECK ((("import_original_file_name" IS NULL) OR ("btrim"("import_original_file_name") <> ''::"text"))),
    CONSTRAINT "activities_import_source_check" CHECK ((("import_source" IS NULL) OR ("import_source" = 'manual_historical'::"text"))),
    CONSTRAINT "activities_laps_array_check" CHECK (("jsonb_typeof"("laps") = 'array'::"text")),
    CONSTRAINT "activities_laps_count_check" CHECK (("jsonb_array_length"("laps") <= 1000)),
    CONSTRAINT "activities_laps_size_check" CHECK (("pg_column_size"("laps") <= 1048576)),
    CONSTRAINT "activities_moving_seconds_check" CHECK (("moving_seconds" >= 0)),
    CONSTRAINT "activities_moving_time_check" CHECK (("moving_seconds" <= "duration_seconds")),
    CONSTRAINT "activities_provider_identity_check" CHECK ((("provider" IS NULL) = ("external_id" IS NULL)))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activities_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activities_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activities_idx_seq" OWNED BY "public"."activities"."idx";



CREATE TABLE IF NOT EXISTS "public"."activity_efforts" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone,
    "profile_id" "uuid" NOT NULL,
    "activity_id" "uuid",
    "recorded_at" timestamp with time zone NOT NULL,
    "activity_category" "public"."activity_category" NOT NULL,
    "effort_type" "public"."effort_type" NOT NULL,
    "duration_seconds" integer NOT NULL,
    "start_offset" integer,
    "unit" "text" NOT NULL,
    "value" real NOT NULL,
    "source" "public"."evidence_observation_source",
    "method" "text",
    "calculation_version" "text",
    "quality_score" numeric,
    "provenance" "jsonb",
    CONSTRAINT "activity_efforts_calculation_version_not_blank_check" CHECK ((("calculation_version" IS NULL) OR ("btrim"("calculation_version") <> ''::"text"))),
    CONSTRAINT "activity_efforts_method_not_blank_check" CHECK ((("method" IS NULL) OR ("btrim"("method") <> ''::"text"))),
    CONSTRAINT "activity_efforts_provenance_object_check" CHECK ((("provenance" IS NULL) OR ("jsonb_typeof"("provenance") = 'object'::"text"))),
    CONSTRAINT "activity_efforts_quality_score_range_check" CHECK ((("quality_score" IS NULL) OR (("quality_score" >= (0)::numeric) AND ("quality_score" <= (1)::numeric))))
);


ALTER TABLE "public"."activity_efforts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_file_ingestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "source" "public"."activity_file_ingestion_source" NOT NULL,
    "provider" "public"."integration_provider",
    "external_id" "text",
    "file_path" "text",
    "file_size" integer,
    "file_type" "text",
    "status" "public"."activity_file_ingestion_status" DEFAULT 'pending_upload'::"public"."activity_file_ingestion_status" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error_code" "text",
    "last_error_message" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_file_ingestions_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "activity_file_ingestions_file_size_check" CHECK ((("file_size" IS NULL) OR ("file_size" >= 0)))
);


ALTER TABLE "public"."activity_file_ingestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_plans" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid",
    "route_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "notes" "text",
    "activity_category" "public"."activity_category" NOT NULL,
    "structure" "jsonb",
    "version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "template_visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "import_provider" "text",
    "import_external_id" "text",
    "is_system_template" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activity_plans_has_content" CHECK ((("structure" IS NOT NULL) OR ("route_id" IS NOT NULL))),
    CONSTRAINT "activity_plans_import_external_id_non_empty_check" CHECK ((("import_external_id" IS NULL) OR ("btrim"("import_external_id") <> ''::"text"))),
    CONSTRAINT "activity_plans_import_provider_non_empty_check" CHECK ((("import_provider" IS NULL) OR ("btrim"("import_provider") <> ''::"text"))),
    CONSTRAINT "activity_plans_system_template_check" CHECK (((("is_system_template" = true) AND ("profile_id" IS NULL)) OR (("is_system_template" = false) AND ("profile_id" IS NOT NULL)))),
    CONSTRAINT "activity_plans_system_templates_public_check" CHECK ((("is_system_template" = false) OR ("template_visibility" = 'public'::"text"))),
    CONSTRAINT "activity_plans_template_visibility_check" CHECK (("template_visibility" = ANY (ARRAY['private'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."activity_plans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activity_plans_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activity_plans_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activity_plans_idx_seq" OWNED BY "public"."activity_plans"."idx";



CREATE TABLE IF NOT EXISTS "public"."activity_routes" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "file_path" "text" NOT NULL,
    "total_distance" integer NOT NULL,
    "total_ascent" integer,
    "total_descent" integer,
    "elevation_polyline" "text",
    "polyline" "text" NOT NULL,
    "is_system_template" boolean DEFAULT false NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activity_routes_system_template_check" CHECK (((("is_system_template" = true) AND ("profile_id" IS NULL)) OR (("is_system_template" = false) AND ("profile_id" IS NOT NULL)))),
    CONSTRAINT "activity_routes_system_templates_public_check" CHECK ((("is_system_template" = false) OR ("is_public" = true))),
    CONSTRAINT "activity_routes_total_ascent_check" CHECK (("total_ascent" >= 0)),
    CONSTRAINT "activity_routes_total_descent_check" CHECK (("total_descent" >= 0)),
    CONSTRAINT "activity_routes_total_distance_check" CHECK (("total_distance" >= 0))
);


ALTER TABLE "public"."activity_routes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activity_routes_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activity_routes_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activity_routes_idx_seq" OWNED BY "public"."activity_routes"."idx";



CREATE TABLE IF NOT EXISTS "public"."coaches_athletes" (
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaches_athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_access_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "grantee_profile_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "access_level" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_access_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_group" boolean DEFAULT false NOT NULL,
    "group_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "event_type" "public"."event_type" NOT NULL,
    "status" "public"."event_status" DEFAULT 'scheduled'::"public"."event_status" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "notes" "text",
    "all_day" boolean DEFAULT false NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "scheduled_date" "text",
    "read_only" boolean,
    "training_plan_id" "uuid",
    "activity_plan_id" "uuid",
    "linked_activity_id" "uuid",
    "route_id" "uuid",
    "recurrence_rule" "text",
    "recurrence_timezone" "text",
    "series_id" "uuid",
    "source_provider" "text",
    "occurrence_key" "text" DEFAULT ''::"text" NOT NULL,
    "original_starts_at" timestamp with time zone,
    "integration_account_id" "uuid",
    "external_calendar_id" "text",
    "external_event_id" "text",
    "schedule_batch_id" "uuid",
    "lifecycle" "jsonb",
    "recurrence" "jsonb",
    "payload" "jsonb",
    CONSTRAINT "events_external_calendar_non_empty" CHECK ((("external_calendar_id" IS NULL) OR ("btrim"("external_calendar_id") <> ''::"text"))),
    CONSTRAINT "events_external_event_non_empty" CHECK ((("external_event_id" IS NULL) OR ("btrim"("external_event_id") <> ''::"text"))),
    CONSTRAINT "events_recurrence_rule_non_empty" CHECK ((("recurrence_rule" IS NULL) OR ("btrim"("recurrence_rule") <> ''::"text"))),
    CONSTRAINT "events_recurrence_timezone_non_empty" CHECK ((("recurrence_timezone" IS NULL) OR ("btrim"("recurrence_timezone") <> ''::"text"))),
    CONSTRAINT "events_recurrence_timezone_requires_rule" CHECK ((("recurrence_timezone" IS NULL) OR ("recurrence_rule" IS NOT NULL))),
    CONSTRAINT "events_series_not_self" CHECK ((("series_id" IS NULL) OR ("series_id" <> "id"))),
    CONSTRAINT "events_series_occurrence_key_required" CHECK ((("series_id" IS NULL) OR ("btrim"("occurrence_key") <> ''::"text"))),
    CONSTRAINT "events_source_identity_complete" CHECK (((("source_provider" IS NULL) AND ("integration_account_id" IS NULL) AND ("external_calendar_id" IS NULL) AND ("external_event_id" IS NULL)) OR (("source_provider" IS NOT NULL) AND ("integration_account_id" IS NOT NULL) AND ("external_calendar_id" IS NOT NULL) AND ("external_event_id" IS NOT NULL)))),
    CONSTRAINT "events_source_provider_non_empty" CHECK ((("source_provider" IS NULL) OR ("btrim"("source_provider") <> ''::"text"))),
    CONSTRAINT "events_time_window" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at")))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."events_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."events_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."events_idx_seq" OWNED BY "public"."events"."idx";



CREATE TABLE IF NOT EXISTS "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_event_activity_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_event_id" "uuid" NOT NULL,
    "activity_plan_id" "uuid" NOT NULL,
    "label" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_event_activity_plans_label_non_empty" CHECK ((("label" IS NULL) OR ("btrim"("label") <> ''::"text"))),
    CONSTRAINT "group_event_activity_plans_sort_order_check" CHECK (("sort_order" >= 0))
);


ALTER TABLE "public"."group_event_activity_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_event_rsvps" (
    "group_event_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "selected_group_event_activity_plan_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_event_rsvps_status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text", 'tentative'::"text"])))
);


ALTER TABLE "public"."group_event_rsvps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_event_series_rsvps" (
    "group_event_series_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_event_series_rsvps_status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text", 'tentative'::"text"])))
);


ALTER TABLE "public"."group_event_series_rsvps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "series_id" "uuid",
    "created_by_profile_id" "uuid",
    "title" "text",
    "description" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "timezone" "text",
    "recurrence_rule" "text",
    "recurrence_timezone" "text",
    "occurrence_key" "text",
    "location_name" "text",
    "route_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_events_location_name_non_empty" CHECK ((("location_name" IS NULL) OR ("btrim"("location_name") <> ''::"text"))),
    CONSTRAINT "group_events_occurrence_key_required" CHECK ((("series_id" IS NULL) OR (("occurrence_key" IS NOT NULL) AND ("btrim"("occurrence_key") <> ''::"text")))),
    CONSTRAINT "group_events_recurrence_rule_non_empty" CHECK ((("recurrence_rule" IS NULL) OR ("btrim"("recurrence_rule") <> ''::"text"))),
    CONSTRAINT "group_events_recurrence_timezone_non_empty" CHECK ((("recurrence_timezone" IS NULL) OR ("btrim"("recurrence_timezone") <> ''::"text"))),
    CONSTRAINT "group_events_recurrence_timezone_requires_rule" CHECK ((("recurrence_timezone" IS NULL) OR ("recurrence_rule" IS NOT NULL))),
    CONSTRAINT "group_events_recurring_series_timezone_required" CHECK ((("recurrence_rule" IS NULL) OR ("timezone" IS NOT NULL))),
    CONSTRAINT "group_events_root_title_required" CHECK ((("series_id" IS NOT NULL) OR ("title" IS NOT NULL))),
    CONSTRAINT "group_events_series_not_self" CHECK ((("series_id" IS NULL) OR ("series_id" <> "id"))),
    CONSTRAINT "group_events_time_window" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "group_events_timezone_non_empty" CHECK ((("timezone" IS NULL) OR ("btrim"("timezone") <> ''::"text"))),
    CONSTRAINT "group_events_title_non_empty" CHECK ((("title" IS NULL) OR ("btrim"("title") <> ''::"text")))
);


ALTER TABLE "public"."group_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "invited_profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."group_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."group_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_memberships" (
    "group_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))),
    CONSTRAINT "group_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'left'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."group_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by_profile_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "avatar_url" "text",
    "cover_url" "text",
    "access_level" "text" DEFAULT 'public'::"text" NOT NULL,
    "join_policy" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "groups_access_level_check" CHECK (("access_level" = ANY (ARRAY['public'::"text", 'members_only'::"text"]))),
    CONSTRAINT "groups_join_policy_check" CHECK (("join_policy" = ANY (ARRAY['open'::"text", 'request_to_join'::"text", 'invite_only'::"text"]))),
    CONSTRAINT "groups_name_non_empty" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "groups_slug_non_empty" CHECK (("btrim"("slug") <> ''::"text"))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_credentials" (
    "integration_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "scope" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_resource_links" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at" timestamp with time zone,
    "profile_id" "uuid" NOT NULL,
    "integration_id" "uuid" NOT NULL,
    "provider" "public"."integration_provider" NOT NULL,
    "resource_kind" "public"."integration_resource_kind" NOT NULL,
    "internal_resource_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "provider_updated_at" timestamp with time zone,
    "provider_metadata" "jsonb",
    "payload_hash" "text"
);


ALTER TABLE "public"."integration_resource_links" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."integration_resource_links_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."integration_resource_links_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."integration_resource_links_idx_seq" OWNED BY "public"."integration_resource_links"."idx";



CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idx" integer NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "provider" "public"."integration_provider" NOT NULL,
    "external_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."integrations_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."integrations_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."integrations_idx_seq" OWNED BY "public"."integrations"."idx";



CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "entity_type" "public"."like_entity_type" NOT NULL
);


ALTER TABLE "public"."likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "entity_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idx" integer NOT NULL,
    "state" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "provider" "public"."integration_provider" NOT NULL,
    "mobile_redirect_uri" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."oauth_states" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."oauth_states_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."oauth_states_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."oauth_states_idx_seq" OWNED BY "public"."oauth_states"."idx";



CREATE TABLE IF NOT EXISTS "public"."profile_goals" (
    "id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "priority" integer NOT NULL,
    "activity_category" "text",
    "target_date" "date",
    "target_payload" "jsonb",
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."profile_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_metrics" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "metric_type" "public"."profile_metric_type" NOT NULL,
    "recorded_at" timestamp with time zone NOT NULL,
    "unit" "text" NOT NULL,
    "notes" "text",
    "reference_activity_id" "uuid",
    "value" numeric NOT NULL,
    "source" "public"."evidence_observation_source",
    "method" "text",
    "calculation_version" "text",
    "quality_score" numeric,
    "provenance" "jsonb",
    CONSTRAINT "profile_metrics_calculation_version_not_blank_check" CHECK ((("calculation_version" IS NULL) OR ("btrim"("calculation_version") <> ''::"text"))),
    CONSTRAINT "profile_metrics_method_not_blank_check" CHECK ((("method" IS NULL) OR ("btrim"("method") <> ''::"text"))),
    CONSTRAINT "profile_metrics_provenance_object_check" CHECK ((("provenance" IS NULL) OR ("jsonb_typeof"("provenance") = 'object'::"text"))),
    CONSTRAINT "profile_metrics_quality_score_range_check" CHECK ((("quality_score" IS NULL) OR (("quality_score" >= (0)::numeric) AND ("quality_score" <= (1)::numeric)))),
    CONSTRAINT "profile_metrics_value_check" CHECK (("value" >= (0)::numeric))
);


ALTER TABLE "public"."profile_metrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."profile_metrics_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."profile_metrics_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."profile_metrics_idx_seq" OWNED BY "public"."profile_metrics"."idx";



CREATE TABLE IF NOT EXISTS "public"."profile_training_settings" (
    "profile_id" "uuid" NOT NULL,
    "settings" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."profile_training_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "idx" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "full_name" "text",
    "username" "text",
    "avatar_url" "text",
    "cover_url" "text",
    "bio" "text",
    "dob" timestamp with time zone,
    "gender" "public"."gender",
    "language" "text",
    "preferred_units" "text",
    "onboarded" boolean,
    "is_public" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "integration_id" "uuid" NOT NULL,
    "provider" "public"."integration_provider" NOT NULL,
    "job_type" "text" NOT NULL,
    "operation" "text",
    "resource_kind" "public"."integration_resource_kind",
    "internal_resource_id" "uuid",
    "sync_lane_key" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempt" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 8 NOT NULL,
    "dedupe_key" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_hash" "text",
    "supersedes_job_id" "uuid",
    "last_error" "text",
    "locked_at" timestamp with time zone,
    "lock_expires_at" timestamp with time zone,
    "locked_by" "text"
);


ALTER TABLE "public"."provider_sync_jobs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."provider_sync_jobs_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."provider_sync_jobs_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."provider_sync_jobs_idx_seq" OWNED BY "public"."provider_sync_jobs"."idx";



CREATE TABLE IF NOT EXISTS "public"."provider_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "integration_id" "uuid" NOT NULL,
    "provider" "public"."integration_provider" NOT NULL,
    "resource" "text" NOT NULL,
    "publish_horizon_days" integer,
    "sync_mode" "text" NOT NULL,
    "last_sync_started_at" timestamp with time zone,
    "last_sync_succeeded_at" timestamp with time zone,
    "last_sync_failed_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "cursor" "text",
    "high_watermark" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."provider_sync_state" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."provider_sync_state_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."provider_sync_state_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."provider_sync_state_idx_seq" OWNED BY "public"."provider_sync_state"."idx";



CREATE TABLE IF NOT EXISTS "public"."provider_webhook_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "provider" "public"."integration_provider" NOT NULL,
    "integration_id" "uuid",
    "provider_account_id" "text",
    "provider_event_id" "text",
    "event_type" "text" NOT NULL,
    "object_type" "text",
    "object_id" "text",
    "payload" "jsonb" NOT NULL,
    "payload_hash" "text",
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "job_id" "uuid",
    "last_error" "text"
);


ALTER TABLE "public"."provider_webhook_receipts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."provider_webhook_receipts_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."provider_webhook_receipts_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."provider_webhook_receipts_idx_seq" OWNED BY "public"."provider_webhook_receipts"."idx";



CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "text" NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_plans" (
    "id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "structure" "jsonb" NOT NULL,
    "template_visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "is_system_template" boolean DEFAULT false NOT NULL,
    "sessions_per_week_target" integer,
    "duration_hours" numeric(12,2),
    CONSTRAINT "training_plans_system_templates_public_check" CHECK ((("is_system_template" = false) OR ("template_visibility" = 'public'::"text"))),
    CONSTRAINT "training_plans_template_profile_check" CHECK (((("is_system_template" = true) AND ("profile_id" IS NULL)) OR (("is_system_template" = false) AND ("profile_id" IS NOT NULL)))),
    CONSTRAINT "training_plans_template_visibility_check" CHECK (("template_visibility" = ANY (ARRAY['private'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."training_plans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."training_plans_idx_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."training_plans_idx_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."training_plans_idx_seq" OWNED BY "public"."training_plans"."idx";



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "image" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifications" (
    "id" "text" NOT NULL,
    "identifier" "text" NOT NULL,
    "value" "text" NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."verifications" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."activities_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_plans" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."activity_plans_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_routes" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."activity_routes_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."events" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."events_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."integration_resource_links" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."integration_resource_links_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."integrations" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."integrations_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."oauth_states" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."oauth_states_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."profile_metrics" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."profile_metrics_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."provider_sync_jobs" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."provider_sync_jobs_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."provider_sync_state" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."provider_sync_state_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."provider_webhook_receipts" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."provider_webhook_receipts_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."training_plans" ALTER COLUMN "idx" SET DEFAULT "nextval"('"public"."training_plans_idx_seq"'::"regclass");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_id_profile_id_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_efforts"
    ADD CONSTRAINT "activity_efforts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_file_ingestions"
    ADD CONSTRAINT "activity_file_ingestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_plans"
    ADD CONSTRAINT "activity_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_routes"
    ADD CONSTRAINT "activity_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches_athletes"
    ADD CONSTRAINT "coaches_athletes_coach_id_athlete_id_pk" PRIMARY KEY ("coach_id", "athlete_id");



ALTER TABLE ONLY "public"."coaching_invitations"
    ADD CONSTRAINT "coaching_invitations_athlete_coach_unique" UNIQUE ("athlete_id", "coach_id");



ALTER TABLE ONLY "public"."coaching_invitations"
    ADD CONSTRAINT "coaching_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_access_grants"
    ADD CONSTRAINT "content_access_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_id_profile_id_unique" UNIQUE ("id", "profile_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY ("follower_id", "following_id");



ALTER TABLE ONLY "public"."group_event_activity_plans"
    ADD CONSTRAINT "group_event_activity_plans_event_plan_unique" UNIQUE ("group_event_id", "activity_plan_id");



ALTER TABLE ONLY "public"."group_event_activity_plans"
    ADD CONSTRAINT "group_event_activity_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_event_rsvps"
    ADD CONSTRAINT "group_event_rsvps_group_event_id_profile_id_pk" PRIMARY KEY ("group_event_id", "profile_id");



ALTER TABLE ONLY "public"."group_event_series_rsvps"
    ADD CONSTRAINT "group_event_series_rsvps_group_event_series_id_profile_id_pk" PRIMARY KEY ("group_event_series_id", "profile_id");



ALTER TABLE ONLY "public"."group_events"
    ADD CONSTRAINT "group_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_invitations"
    ADD CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_join_requests"
    ADD CONSTRAINT "group_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_group_id_profile_id_pk" PRIMARY KEY ("group_id", "profile_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_credentials"
    ADD CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("integration_id");



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_external_unique" UNIQUE ("integration_id", "resource_kind", "external_id");



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_internal_unique" UNIQUE ("integration_id", "resource_kind", "internal_resource_id");



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_idx_unique" UNIQUE ("idx");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_profile_entity_unique" UNIQUE ("profile_id", "entity_type", "entity_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_idx_unique" UNIQUE ("idx");



ALTER TABLE ONLY "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_goals"
    ADD CONSTRAINT "profile_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_training_settings"
    ADD CONSTRAINT "profile_training_settings_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_sync_jobs"
    ADD CONSTRAINT "provider_sync_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_sync_state"
    ADD CONSTRAINT "provider_sync_state_integration_resource_unique" UNIQUE ("integration_id", "resource");



ALTER TABLE ONLY "public"."provider_sync_state"
    ADD CONSTRAINT "provider_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_webhook_receipts"
    ADD CONSTRAINT "provider_webhook_receipts_event_unique" UNIQUE ("provider", "provider_account_id", "provider_event_id");



ALTER TABLE ONLY "public"."provider_webhook_receipts"
    ADD CONSTRAINT "provider_webhook_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_token_unique" UNIQUE ("token");



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "unique_integration_type" UNIQUE ("profile_id", "provider");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verifications"
    ADD CONSTRAINT "verifications_pkey" PRIMARY KEY ("id");



CREATE INDEX "accounts_userId_idx" ON "public"."accounts" USING "btree" ("user_id");



CREATE UNIQUE INDEX "activities_idx_key" ON "public"."activities" USING "btree" ("idx");



CREATE UNIQUE INDEX "activity_plans_idx_key" ON "public"."activity_plans" USING "btree" ("idx");



CREATE UNIQUE INDEX "activity_routes_idx_key" ON "public"."activity_routes" USING "btree" ("idx");



CREATE UNIQUE INDEX "content_access_grants_source_unique" ON "public"."content_access_grants" USING "btree" ("content_type", "content_id", "grantee_profile_id", "access_level", "source_type", "source_id");



CREATE UNIQUE INDEX "events_idx_key" ON "public"."events" USING "btree" ("idx");



CREATE INDEX "group_event_activity_plans_event_sort_idx" ON "public"."group_event_activity_plans" USING "btree" ("group_event_id", "sort_order");



CREATE INDEX "group_event_rsvps_profile_status_idx" ON "public"."group_event_rsvps" USING "btree" ("profile_id", "status");



CREATE INDEX "group_event_series_rsvps_profile_status_idx" ON "public"."group_event_series_rsvps" USING "btree" ("profile_id", "status");



CREATE INDEX "group_events_group_cancelled_starts_at_idx" ON "public"."group_events" USING "btree" ("group_id", "cancelled_at", "starts_at");



CREATE INDEX "group_events_group_starts_at_idx" ON "public"."group_events" USING "btree" ("group_id", "starts_at");



CREATE UNIQUE INDEX "group_events_series_occurrence_unique_idx" ON "public"."group_events" USING "btree" ("series_id", "occurrence_key") WHERE ("series_id" IS NOT NULL);



CREATE INDEX "group_events_series_starts_at_idx" ON "public"."group_events" USING "btree" ("series_id", "starts_at") WHERE ("series_id" IS NOT NULL);



CREATE INDEX "group_invitations_invited_profile_status_idx" ON "public"."group_invitations" USING "btree" ("invited_profile_id", "status");



CREATE UNIQUE INDEX "group_invitations_pending_profile_unique_idx" ON "public"."group_invitations" USING "btree" ("group_id", "invited_profile_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "group_join_requests_group_status_idx" ON "public"."group_join_requests" USING "btree" ("group_id", "status");



CREATE UNIQUE INDEX "group_join_requests_pending_unique_idx" ON "public"."group_join_requests" USING "btree" ("group_id", "profile_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "group_memberships_group_status_idx" ON "public"."group_memberships" USING "btree" ("group_id", "status");



CREATE INDEX "group_memberships_profile_status_idx" ON "public"."group_memberships" USING "btree" ("profile_id", "status");



CREATE INDEX "groups_created_at_idx" ON "public"."groups" USING "btree" ("created_at" DESC NULLS LAST) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "groups_slug_unique_idx" ON "public"."groups" USING "btree" ("slug") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_activities_activity_file_path" ON "public"."activities" USING "btree" ("activity_file_path") WHERE ("activity_file_path" IS NOT NULL);



CREATE INDEX "idx_activities_activity_plan" ON "public"."activities" USING "btree" ("activity_plan_id") WHERE ("activity_plan_id" IS NOT NULL);



CREATE INDEX "idx_activities_profile_started" ON "public"."activities" USING "btree" ("profile_id", "started_at");



CREATE INDEX "idx_activities_provider_external" ON "public"."activities" USING "btree" ("provider", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_activities_provider_external_unique" ON "public"."activities" USING "btree" ("provider", "external_id") WHERE (("provider" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_activities_started" ON "public"."activities" USING "btree" ("started_at");



CREATE INDEX "idx_activities_type" ON "public"."activities" USING "btree" ("type");



CREATE INDEX "idx_activity_efforts_activity_id" ON "public"."activity_efforts" USING "btree" ("activity_id");



CREATE INDEX "idx_activity_efforts_profile_id" ON "public"."activity_efforts" USING "btree" ("profile_id");



CREATE INDEX "idx_activity_file_ingestions_activity_id" ON "public"."activity_file_ingestions" USING "btree" ("activity_id");



CREATE INDEX "idx_activity_file_ingestions_activity_profile" ON "public"."activity_file_ingestions" USING "btree" ("activity_id", "profile_id");



CREATE INDEX "idx_activity_file_ingestions_profile_id" ON "public"."activity_file_ingestions" USING "btree" ("profile_id");



CREATE INDEX "idx_activity_file_ingestions_provider_external" ON "public"."activity_file_ingestions" USING "btree" ("provider", "external_id") WHERE (("provider" IS NOT NULL) AND ("external_id" IS NOT NULL));



CREATE INDEX "idx_activity_file_ingestions_status" ON "public"."activity_file_ingestions" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_activity_plans_import_identity" ON "public"."activity_plans" USING "btree" ("profile_id", "import_provider", "import_external_id") WHERE (("import_provider" IS NOT NULL) AND ("import_external_id" IS NOT NULL));



CREATE INDEX "idx_activity_plans_profile_id" ON "public"."activity_plans" USING "btree" ("profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE INDEX "idx_activity_plans_route_id" ON "public"."activity_plans" USING "btree" ("route_id") WHERE ("route_id" IS NOT NULL);



CREATE INDEX "idx_activity_plans_system_templates" ON "public"."activity_plans" USING "btree" ("is_system_template") WHERE ("is_system_template" = true);



CREATE INDEX "idx_activity_plans_visibility" ON "public"."activity_plans" USING "btree" ("template_visibility");



CREATE INDEX "idx_coaches_athletes_athlete_id" ON "public"."coaches_athletes" USING "btree" ("athlete_id");



CREATE INDEX "idx_coaches_athletes_coach_id" ON "public"."coaches_athletes" USING "btree" ("coach_id");



CREATE INDEX "idx_coaching_invitations_athlete_id" ON "public"."coaching_invitations" USING "btree" ("athlete_id");



CREATE INDEX "idx_coaching_invitations_coach_id" ON "public"."coaching_invitations" USING "btree" ("coach_id");



CREATE INDEX "idx_comments_created_at" ON "public"."comments" USING "btree" ("created_at");



CREATE INDEX "idx_comments_entity" ON "public"."comments" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_comments_profile_id" ON "public"."comments" USING "btree" ("profile_id", "created_at");



CREATE INDEX "idx_content_access_grants_active_expiry" ON "public"."content_access_grants" USING "btree" ("expires_at") WHERE (("expires_at" IS NOT NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "idx_content_access_grants_actor_profile_id" ON "public"."content_access_grants" USING "btree" ("actor_profile_id") WHERE ("actor_profile_id" IS NOT NULL);



CREATE INDEX "idx_content_access_grants_grantee_content" ON "public"."content_access_grants" USING "btree" ("grantee_profile_id", "content_type", "content_id");



CREATE INDEX "idx_content_access_grants_source" ON "public"."content_access_grants" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_conversation_participants_user_id" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_events_activity_plan_id" ON "public"."events" USING "btree" ("activity_plan_id") WHERE ("activity_plan_id" IS NOT NULL);



CREATE INDEX "idx_events_event_type_starts_at" ON "public"."events" USING "btree" ("event_type", "starts_at");



CREATE UNIQUE INDEX "idx_events_external_identity_unique" ON "public"."events" USING "btree" ("source_provider", "integration_account_id", "external_calendar_id", "external_event_id", "occurrence_key") WHERE (("source_provider" IS NOT NULL) AND ("integration_account_id" IS NOT NULL) AND ("external_calendar_id" IS NOT NULL) AND ("external_event_id" IS NOT NULL));



CREATE INDEX "idx_events_integration_calendar_updated" ON "public"."events" USING "btree" ("integration_account_id", "external_calendar_id", "updated_at") WHERE (("integration_account_id" IS NOT NULL) AND ("external_calendar_id" IS NOT NULL));



CREATE INDEX "idx_events_linked_activity_id" ON "public"."events" USING "btree" ("linked_activity_id") WHERE ("linked_activity_id" IS NOT NULL);



CREATE INDEX "idx_events_profile_starts_at" ON "public"."events" USING "btree" ("profile_id", "starts_at");



CREATE INDEX "idx_events_profile_status_starts_at" ON "public"."events" USING "btree" ("profile_id", "status", "starts_at");



CREATE INDEX "idx_events_route_id" ON "public"."events" USING "btree" ("route_id") WHERE ("route_id" IS NOT NULL);



CREATE INDEX "idx_events_schedule_batch" ON "public"."events" USING "btree" ("profile_id", "schedule_batch_id") WHERE ("schedule_batch_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_events_series_occurrence_unique" ON "public"."events" USING "btree" ("series_id", "occurrence_key") WHERE ("series_id" IS NOT NULL);



CREATE INDEX "idx_events_training_plan_id" ON "public"."events" USING "btree" ("training_plan_id") WHERE ("training_plan_id" IS NOT NULL);



CREATE INDEX "idx_follows_following_id" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "idx_group_event_activity_plans_activity_plan_id" ON "public"."group_event_activity_plans" USING "btree" ("activity_plan_id");



CREATE INDEX "idx_group_event_rsvps_selected_activity_plan_id" ON "public"."group_event_rsvps" USING "btree" ("selected_group_event_activity_plan_id") WHERE ("selected_group_event_activity_plan_id" IS NOT NULL);



CREATE INDEX "idx_group_events_created_by_profile_id" ON "public"."group_events" USING "btree" ("created_by_profile_id") WHERE ("created_by_profile_id" IS NOT NULL);



CREATE INDEX "idx_group_events_route_id" ON "public"."group_events" USING "btree" ("route_id") WHERE ("route_id" IS NOT NULL);



CREATE INDEX "idx_group_join_requests_profile_id" ON "public"."group_join_requests" USING "btree" ("profile_id");



CREATE INDEX "idx_groups_created_by_profile_id" ON "public"."groups" USING "btree" ("created_by_profile_id");



CREATE INDEX "idx_integration_credentials_expires_at" ON "public"."integration_credentials" USING "btree" ("expires_at");



CREATE INDEX "idx_integration_resource_links_integration" ON "public"."integration_resource_links" USING "btree" ("integration_id");



CREATE INDEX "idx_integration_resource_links_internal" ON "public"."integration_resource_links" USING "btree" ("resource_kind", "internal_resource_id");



CREATE INDEX "idx_integration_resource_links_profile" ON "public"."integration_resource_links" USING "btree" ("profile_id");



CREATE INDEX "idx_integration_resource_links_provider_external" ON "public"."integration_resource_links" USING "btree" ("provider", "external_id");



CREATE INDEX "idx_integrations_external_id" ON "public"."integrations" USING "btree" ("external_id");



CREATE INDEX "idx_integrations_profile_id" ON "public"."integrations" USING "btree" ("profile_id");



CREATE INDEX "idx_integrations_provider" ON "public"."integrations" USING "btree" ("provider");



CREATE INDEX "idx_likes_entity" ON "public"."likes" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_notifications_actor_id" ON "public"."notifications" USING "btree" ("actor_id");



CREATE INDEX "idx_notifications_read_at" ON "public"."notifications" USING "btree" ("read_at");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_oauth_states_expires_at" ON "public"."oauth_states" USING "btree" ("expires_at");



CREATE INDEX "idx_oauth_states_profile_id" ON "public"."oauth_states" USING "btree" ("profile_id");



CREATE INDEX "idx_profile_goals_profile_id" ON "public"."profile_goals" USING "btree" ("profile_id");



CREATE INDEX "idx_profile_metrics_profile" ON "public"."profile_metrics" USING "btree" ("profile_id", "recorded_at");



CREATE INDEX "idx_profile_metrics_recorded_at" ON "public"."profile_metrics" USING "btree" ("recorded_at");



CREATE INDEX "idx_profile_metrics_reference_activity" ON "public"."profile_metrics" USING "btree" ("reference_activity_id") WHERE ("reference_activity_id" IS NOT NULL);



CREATE INDEX "idx_profile_metrics_temporal_lookup" ON "public"."profile_metrics" USING "btree" ("profile_id", "metric_type", "recorded_at");



CREATE INDEX "idx_provider_sync_jobs_dedupe_key" ON "public"."provider_sync_jobs" USING "btree" ("dedupe_key");



CREATE INDEX "idx_provider_sync_jobs_integration_id" ON "public"."provider_sync_jobs" USING "btree" ("integration_id");



CREATE INDEX "idx_provider_sync_jobs_lane_status" ON "public"."provider_sync_jobs" USING "btree" ("sync_lane_key", "status", "run_at");



CREATE INDEX "idx_provider_sync_jobs_profile_id" ON "public"."provider_sync_jobs" USING "btree" ("profile_id");



CREATE INDEX "idx_provider_sync_jobs_provider_profile_status" ON "public"."provider_sync_jobs" USING "btree" ("provider", "profile_id", "status");



CREATE INDEX "idx_provider_sync_jobs_status_run_at_priority" ON "public"."provider_sync_jobs" USING "btree" ("status", "run_at", "priority");



CREATE INDEX "idx_provider_sync_jobs_supersedes_job_id" ON "public"."provider_sync_jobs" USING "btree" ("supersedes_job_id") WHERE ("supersedes_job_id" IS NOT NULL);



CREATE INDEX "idx_provider_sync_state_provider_next_sync" ON "public"."provider_sync_state" USING "btree" ("provider", "next_sync_at");



CREATE INDEX "idx_provider_webhook_receipts_integration_id" ON "public"."provider_webhook_receipts" USING "btree" ("integration_id") WHERE ("integration_id" IS NOT NULL);



CREATE INDEX "idx_provider_webhook_receipts_job_id" ON "public"."provider_webhook_receipts" USING "btree" ("job_id");



CREATE INDEX "idx_provider_webhook_receipts_provider_status" ON "public"."provider_webhook_receipts" USING "btree" ("provider", "processing_status");



CREATE INDEX "idx_routes_created_at" ON "public"."activity_routes" USING "btree" ("created_at");



CREATE INDEX "idx_routes_is_system_template" ON "public"."activity_routes" USING "btree" ("is_system_template") WHERE ("is_system_template" = true);



CREATE INDEX "idx_routes_name" ON "public"."activity_routes" USING "btree" ("name");



CREATE INDEX "idx_routes_profile_id" ON "public"."activity_routes" USING "btree" ("profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE INDEX "idx_training_plans_is_system_template" ON "public"."training_plans" USING "btree" ("is_system_template") WHERE ("is_system_template" = true);



CREATE INDEX "idx_training_plans_name" ON "public"."training_plans" USING "btree" ("name");



CREATE INDEX "idx_training_plans_profile_id" ON "public"."training_plans" USING "btree" ("profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE INDEX "idx_training_plans_visibility" ON "public"."training_plans" USING "btree" ("template_visibility");



CREATE UNIQUE INDEX "integration_resource_links_idx_key" ON "public"."integration_resource_links" USING "btree" ("idx");



CREATE UNIQUE INDEX "profile_metrics_idx_key" ON "public"."profile_metrics" USING "btree" ("idx");



CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "public"."profiles" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "public"."profiles" USING "btree" ("username");



CREATE UNIQUE INDEX "provider_sync_jobs_idx_key" ON "public"."provider_sync_jobs" USING "btree" ("idx");



CREATE UNIQUE INDEX "provider_sync_state_idx_key" ON "public"."provider_sync_state" USING "btree" ("idx");



CREATE UNIQUE INDEX "provider_webhook_receipts_idx_key" ON "public"."provider_webhook_receipts" USING "btree" ("idx");



CREATE INDEX "sessions_userId_idx" ON "public"."sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "training_plans_idx_key" ON "public"."training_plans" USING "btree" ("idx");



CREATE INDEX "verifications_identifier_idx" ON "public"."verifications" USING "btree" ("identifier");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_efforts"
    ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_efforts"
    ADD CONSTRAINT "activity_efforts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."activity_file_ingestions"
    ADD CONSTRAINT "activity_file_ingestions_activity_profile_fkey" FOREIGN KEY ("activity_id", "profile_id") REFERENCES "public"."activities"("id", "profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_file_ingestions"
    ADD CONSTRAINT "activity_file_ingestions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_plans"
    ADD CONSTRAINT "activity_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_plans"
    ADD CONSTRAINT "activity_plans_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_routes"
    ADD CONSTRAINT "activity_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaches_athletes"
    ADD CONSTRAINT "coaches_athletes_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaches_athletes"
    ADD CONSTRAINT "coaches_athletes_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_invitations"
    ADD CONSTRAINT "coaching_invitations_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_invitations"
    ADD CONSTRAINT "coaching_invitations_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."content_access_grants"
    ADD CONSTRAINT "content_access_grants_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_access_grants"
    ADD CONSTRAINT "content_access_grants_grantee_profile_id_profiles_id_fk" FOREIGN KEY ("grantee_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_integration_account_id_integrations_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integrations"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_linked_activity_id_activities_id_fk" FOREIGN KEY ("linked_activity_id") REFERENCES "public"."activities"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_series_id_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_profiles_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."group_event_activity_plans"
    ADD CONSTRAINT "group_event_activity_plans_activity_plan_id_activity_plans_id_f" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_event_activity_plans"
    ADD CONSTRAINT "group_event_activity_plans_group_event_id_group_events_id_fk" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_event_rsvps"
    ADD CONSTRAINT "group_event_rsvps_group_event_id_group_events_id_fk" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_event_rsvps"
    ADD CONSTRAINT "group_event_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_event_rsvps"
    ADD CONSTRAINT "group_event_rsvps_selected_group_event_activity_plan_id_group_e" FOREIGN KEY ("selected_group_event_activity_plan_id") REFERENCES "public"."group_event_activity_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_event_series_rsvps"
    ADD CONSTRAINT "group_event_series_rsvps_group_event_series_id_group_events_id_" FOREIGN KEY ("group_event_series_id") REFERENCES "public"."group_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_event_series_rsvps"
    ADD CONSTRAINT "group_event_series_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_events"
    ADD CONSTRAINT "group_events_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_events"
    ADD CONSTRAINT "group_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_events"
    ADD CONSTRAINT "group_events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_events"
    ADD CONSTRAINT "group_events_series_id_group_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."group_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invitations"
    ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invitations"
    ADD CONSTRAINT "group_invitations_invited_profile_id_profiles_id_fk" FOREIGN KEY ("invited_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_join_requests"
    ADD CONSTRAINT "group_join_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_join_requests"
    ADD CONSTRAINT "group_join_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_memberships"
    ADD CONSTRAINT "group_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_credentials"
    ADD CONSTRAINT "integration_credentials_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_goals"
    ADD CONSTRAINT "profile_goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_reference_activity_id_activities_id_fk" FOREIGN KEY ("reference_activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_training_settings"
    ADD CONSTRAINT "profile_training_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_sync_jobs"
    ADD CONSTRAINT "provider_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_sync_jobs"
    ADD CONSTRAINT "provider_sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_sync_state"
    ADD CONSTRAINT "provider_sync_state_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_webhook_receipts"
    ADD CONSTRAINT "provider_webhook_receipts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_webhook_receipts"
    ADD CONSTRAINT "provider_webhook_receipts_job_id_provider_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provider_sync_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_efforts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_file_ingestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_routes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaches_athletes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_access_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_event_activity_plans" ENABLE ROW LEVEL SECURITY;


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


ALTER TABLE "public"."profile_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_training_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_sync_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_webhook_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verifications" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activities_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."activity_efforts" TO "service_role";



GRANT ALL ON TABLE "public"."activity_file_ingestions" TO "service_role";



GRANT ALL ON TABLE "public"."activity_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_plans_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."activity_routes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_routes_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coaches_athletes" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."content_access_grants" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."events_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."group_event_activity_plans" TO "service_role";



GRANT ALL ON TABLE "public"."group_event_rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."group_event_series_rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."group_events" TO "service_role";



GRANT ALL ON TABLE "public"."group_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."group_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."group_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."integration_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."integration_resource_links" TO "service_role";



GRANT ALL ON SEQUENCE "public"."integration_resource_links_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."integrations_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."likes" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_states" TO "service_role";



GRANT ALL ON SEQUENCE "public"."oauth_states_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_goals" TO "service_role";



GRANT ALL ON TABLE "public"."profile_metrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profile_metrics_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_training_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."provider_sync_jobs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."provider_sync_jobs_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."provider_sync_state" TO "service_role";



GRANT ALL ON SEQUENCE "public"."provider_sync_state_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."provider_webhook_receipts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."provider_webhook_receipts_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."training_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."training_plans_idx_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."verifications" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- The signup trigger is DB-owned but lives on Supabase's auth schema, so the
-- public-only schema dump above cannot capture it. Keep this definition aligned
-- with seed.sql; the seed safely replaces it after a full local start.
drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
