CREATE TYPE "public"."activity_category" AS ENUM('run', 'bike', 'swim', 'strength', 'other');
CREATE TYPE "public"."activity_file_ingestion_source" AS ENUM('mobile_recording', 'manual_import', 'provider_sync');
CREATE TYPE "public"."activity_file_ingestion_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed');
CREATE TYPE "public"."effort_type" AS ENUM('power', 'speed');
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'completed', 'cancelled');
CREATE TYPE "public"."event_type" AS ENUM('planned_activity', 'rest_day', 'race', 'custom', 'imported');
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');
CREATE TYPE "public"."integration_provider" AS ENUM('strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift');
CREATE TYPE "public"."integration_resource_kind" AS ENUM('event', 'activity_plan', 'activity_route', 'activity');
CREATE TYPE "public"."like_entity_type" AS ENUM('activity', 'activity_plan', 'training_plan', 'route');
CREATE TYPE "public"."notification_type" AS ENUM('new_message', 'coaching_invitation', 'coaching_invitation_accepted', 'coaching_invitation_declined', 'new_follower', 'follow_request', 'group_event_cancelled');
CREATE TYPE "public"."profile_metric_type" AS ENUM('weight_kg', 'ftp', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr', 'lthr');
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
	"updated_at" timestamp NOT NULL
);

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
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
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_plan_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"notes" text,
	"likes_count" integer DEFAULT 0,
	"is_private" boolean DEFAULT true NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"moving_seconds" integer DEFAULT 0 NOT NULL,
	"distance_meters" integer DEFAULT 0 NOT NULL,
	"elevation_gain_meters" numeric(10, 2),
	"elevation_loss_meters" numeric(10, 2),
	"calories" integer,
	"avg_heart_rate" integer,
	"max_heart_rate" integer,
	"avg_power" integer,
	"max_power" integer,
	"normalized_power" integer,
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
	"pool_length" numeric,
	"total_strokes" integer,
	"device_manufacturer" text,
	"device_product" text,
	"activity_file_path" text,
	"activity_file_size" integer,
	"import_source" text,
	"import_file_type" text,
	"import_original_file_name" text,
	"polyline" text,
	"laps" jsonb,
	"map_bounds" jsonb,
	CONSTRAINT "activities_id_profile_id_unique" UNIQUE("id","profile_id")
);

CREATE TABLE "activity_efforts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"profile_id" uuid NOT NULL,
	"activity_id" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	"activity_category" "activity_category" NOT NULL,
	"effort_type" "effort_type" NOT NULL,
	"duration_seconds" integer NOT NULL,
	"start_offset" integer,
	"unit" text NOT NULL,
	"value" real NOT NULL
);

CREATE TABLE "activity_file_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"source" "activity_file_ingestion_source" NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"file_path" text,
	"file_size" integer,
	"file_type" text,
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
	CONSTRAINT "activity_file_ingestions_file_size_check" CHECK ("activity_file_ingestions"."file_size" is null or "activity_file_ingestions"."file_size" >= 0),
	CONSTRAINT "activity_file_ingestions_attempt_count_check" CHECK ("activity_file_ingestions"."attempt_count" >= 0)
);

CREATE TABLE "activity_geometry" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"polyline" text,
	"map_bounds" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "activity_imports" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"device_manufacturer" text,
	"device_product" text,
	"activity_file_path" text,
	"activity_file_size" integer,
	"import_source" text,
	"import_file_type" text,
	"import_original_file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_imports_import_file_type_non_empty_check" CHECK ("activity_imports"."import_file_type" is null or btrim("activity_imports"."import_file_type") <> ''),
	CONSTRAINT "activity_imports_import_original_file_name_non_empty_check" CHECK ("activity_imports"."import_original_file_name" is null or btrim("activity_imports"."import_original_file_name") <> ''),
	CONSTRAINT "activity_imports_import_source_check" CHECK ("activity_imports"."import_source" is null or "activity_imports"."import_source" = 'manual_historical')
);

CREATE TABLE "activity_laps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"lap_index" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_laps_activity_index_unique" UNIQUE("activity_id","lap_index"),
	CONSTRAINT "activity_laps_lap_index_check" CHECK ("activity_laps"."lap_index" >= 0)
);

CREATE TABLE "activity_plan_derived_metrics_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activity_plan_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"estimator_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"estimated_tss" integer,
	"estimated_duration_seconds" integer,
	"intensity_factor" real,
	"estimated_calories" integer,
	"estimated_distance_meters" integer,
	"estimated_zones" jsonb,
	"confidence" text,
	"confidence_score" integer,
	"computed_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone NOT NULL
);

CREATE TABLE "activity_plan_refresh_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_plan_id" uuid NOT NULL
);

CREATE TABLE "activity_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"route_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"notes" text,
	"activity_category" "activity_category" NOT NULL,
	"structure" jsonb,
	"version" text DEFAULT '1.0' NOT NULL,
	"template_visibility" text DEFAULT 'private' NOT NULL,
	"import_provider" text,
	"import_external_id" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"likes_count" integer DEFAULT 0,
	CONSTRAINT "activity_plans_template_visibility_check" CHECK ("activity_plans"."template_visibility" = any(array['private'::text, 'public'::text])),
	CONSTRAINT "activity_plans_import_provider_non_empty_check" CHECK ("activity_plans"."import_provider" is null or btrim("activity_plans"."import_provider") <> ''),
	CONSTRAINT "activity_plans_import_external_id_non_empty_check" CHECK ("activity_plans"."import_external_id" is null or btrim("activity_plans"."import_external_id") <> ''),
	CONSTRAINT "activity_plans_system_templates_public_check" CHECK ("activity_plans"."is_system_template" = false or "activity_plans"."template_visibility" = 'public'),
	CONSTRAINT "activity_plans_system_template_check" CHECK (("activity_plans"."is_system_template" = true and "activity_plans"."profile_id" is null) or ("activity_plans"."is_system_template" = false and "activity_plans"."profile_id" is not null)),
	CONSTRAINT "activity_plans_has_content" CHECK ("activity_plans"."structure" is not null or "activity_plans"."route_id" is not null)
);

CREATE TABLE "activity_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"file_path" text NOT NULL,
	"total_distance" integer NOT NULL,
	"total_ascent" integer,
	"total_descent" integer,
	"elevation_polyline" text,
	"polyline" text NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"likes_count" integer DEFAULT 0,
	CONSTRAINT "activity_routes_total_distance_check" CHECK ("activity_routes"."total_distance" >= 0),
	CONSTRAINT "activity_routes_total_ascent_check" CHECK ("activity_routes"."total_ascent" >= 0),
	CONSTRAINT "activity_routes_total_descent_check" CHECK ("activity_routes"."total_descent" >= 0),
	CONSTRAINT "activity_routes_system_templates_public_check" CHECK ("activity_routes"."is_system_template" = false or "activity_routes"."is_public" = true),
	CONSTRAINT "activity_routes_system_template_check" CHECK (("activity_routes"."is_system_template" = true and "activity_routes"."profile_id" is null) or ("activity_routes"."is_system_template" = false and "activity_routes"."profile_id" is not null))
);

CREATE TABLE "activity_summaries" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"moving_seconds" integer DEFAULT 0 NOT NULL,
	"distance_meters" integer DEFAULT 0 NOT NULL,
	"elevation_gain_meters" numeric(10, 2),
	"elevation_loss_meters" numeric(10, 2),
	"calories" integer,
	"avg_heart_rate" integer,
	"max_heart_rate" integer,
	"avg_power" integer,
	"max_power" integer,
	"normalized_power" integer,
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
	"pool_length" numeric,
	"total_strokes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_summaries_distance_meters_check" CHECK ("activity_summaries"."distance_meters" >= 0),
	CONSTRAINT "activity_summaries_duration_seconds_check" CHECK ("activity_summaries"."duration_seconds" >= 0),
	CONSTRAINT "activity_summaries_moving_seconds_check" CHECK ("activity_summaries"."moving_seconds" >= 0),
	CONSTRAINT "activity_summaries_moving_time_check" CHECK ("activity_summaries"."moving_seconds" >= 0 and "activity_summaries"."moving_seconds" <= "activity_summaries"."duration_seconds")
);

CREATE TABLE "coaches_athletes" (
	"coach_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_athletes_coach_id_athlete_id_pk" PRIMARY KEY("coach_id","athlete_id")
);

CREATE TABLE "coaching_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_invitations_athlete_coach_unique" UNIQUE("athlete_id","coach_id")
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
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);

CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"group_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "event_external_links" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_provider" text,
	"integration_account_id" uuid,
	"external_calendar_id" text,
	"external_event_id" text,
	"occurrence_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_external_links_calendar_non_empty" CHECK ("event_external_links"."external_calendar_id" is null or btrim("event_external_links"."external_calendar_id") <> ''),
	CONSTRAINT "event_external_links_event_non_empty" CHECK ("event_external_links"."external_event_id" is null or btrim("event_external_links"."external_event_id") <> ''),
	CONSTRAINT "event_external_links_source_identity_complete" CHECK ((
        "event_external_links"."source_provider" is null
        and "event_external_links"."integration_account_id" is null
        and "event_external_links"."external_calendar_id" is null
        and "event_external_links"."external_event_id" is null
      ) or (
        "event_external_links"."source_provider" is not null
        and "event_external_links"."integration_account_id" is not null
        and "event_external_links"."external_calendar_id" is not null
        and "event_external_links"."external_event_id" is not null
      )),
	CONSTRAINT "event_external_links_source_provider_non_empty" CHECK ("event_external_links"."source_provider" is null or btrim("event_external_links"."source_provider") <> '')
);

CREATE TABLE "event_payloads" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"lifecycle" jsonb,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "event_recurrence" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"recurrence_rule" text,
	"recurrence_timezone" text,
	"series_id" uuid,
	"occurrence_key" text DEFAULT '' NOT NULL,
	"original_starts_at" timestamp with time zone,
	"recurrence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_recurrence_rule_non_empty" CHECK ("event_recurrence"."recurrence_rule" is null or btrim("event_recurrence"."recurrence_rule") <> ''),
	CONSTRAINT "event_recurrence_timezone_non_empty" CHECK ("event_recurrence"."recurrence_timezone" is null or btrim("event_recurrence"."recurrence_timezone") <> ''),
	CONSTRAINT "event_recurrence_timezone_requires_rule" CHECK ("event_recurrence"."recurrence_timezone" is null or "event_recurrence"."recurrence_rule" is not null),
	CONSTRAINT "event_recurrence_series_occurrence_key_required" CHECK ("event_recurrence"."series_id" is null or btrim("event_recurrence"."occurrence_key") <> ''),
	CONSTRAINT "event_recurrence_series_not_self" CHECK ("event_recurrence"."series_id" is null or "event_recurrence"."series_id" <> "event_recurrence"."event_id")
);

CREATE TABLE "event_schedule_links" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"training_plan_id" uuid,
	"activity_plan_id" uuid,
	"linked_activity_id" uuid,
	"route_id" uuid,
	"schedule_batch_id" uuid,
	"user_training_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
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
	"scheduled_date" text,
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
	"user_training_plan_id" uuid,
	"lifecycle" jsonb,
	"recurrence" jsonb,
	"payload" jsonb,
	CONSTRAINT "events_id_profile_id_unique" UNIQUE("id","profile_id"),
	CONSTRAINT "events_time_window" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at")
);

CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);

CREATE TABLE "group_event_activity_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_event_id" uuid NOT NULL,
	"activity_plan_id" uuid NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_event_activity_plans_event_plan_unique" UNIQUE("group_event_id","activity_plan_id"),
	CONSTRAINT "group_event_activity_plans_sort_order_check" CHECK ("group_event_activity_plans"."sort_order" >= 0),
	CONSTRAINT "group_event_activity_plans_label_non_empty" CHECK ("group_event_activity_plans"."label" is null or btrim("group_event_activity_plans"."label") <> '')
);

CREATE TABLE "group_event_rsvps" (
	"group_event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"selected_group_event_activity_plan_id" uuid,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "integration_resource_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
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
	"idx" serial NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_idx_unique" UNIQUE("idx"),
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
	"idx" serial NOT NULL,
	"state" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"mobile_redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_states_idx_unique" UNIQUE("idx")
);

CREATE TABLE "profile_estimation_state" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"metrics_revision" integer DEFAULT 0 NOT NULL,
	"performance_revision" integer DEFAULT 0 NOT NULL,
	"fitness_revision" integer DEFAULT 0 NOT NULL,
	"dirty_since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "profile_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"priority" integer NOT NULL,
	"activity_category" text,
	"target_date" date,
	"target_payload" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE "profile_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"metric_type" "profile_metric_type" NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"reference_activity_id" uuid,
	"value" numeric NOT NULL,
	CONSTRAINT "profile_metrics_value_check" CHECK ("profile_metrics"."value" >= 0)
);

CREATE TABLE "profile_training_settings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"email" text,
	"full_name" text,
	"username" text,
	"avatar_url" text,
	"cover_url" text,
	"bio" text,
	"dob" timestamp with time zone,
	"gender" "gender",
	"language" text,
	"preferred_units" text,
	"onboarded" boolean,
	"is_public" boolean NOT NULL
);

CREATE TABLE "provider_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
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
	"idx" serial NOT NULL,
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
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"provider" "integration_provider" NOT NULL,
	"integration_id" uuid,
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
	CONSTRAINT "provider_webhook_receipts_event_unique" UNIQUE("provider","provider_account_id","provider_event_id")
);

CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"structure" jsonb NOT NULL,
	"template_visibility" text DEFAULT 'private' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"sessions_per_week_target" integer,
	"duration_hours" numeric(12, 2),
	"likes_count" integer DEFAULT 0,
	CONSTRAINT "training_plans_template_visibility_check" CHECK ("training_plans"."template_visibility" = any(array['private'::text, 'public'::text])),
	CONSTRAINT "training_plans_system_templates_public_check" CHECK ("training_plans"."is_system_template" = false or "training_plans"."template_visibility" = 'public'),
	CONSTRAINT "training_plans_template_profile_check" CHECK (("training_plans"."is_system_template" = true and "training_plans"."profile_id" is null) or ("training_plans"."is_system_template" = false and "training_plans"."profile_id" is not null))
);

CREATE TABLE "user_training_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"training_plan_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"target_date" date,
	"snapshot_structure" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_geometry" ADD CONSTRAINT "activity_geometry_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_geometry" ADD CONSTRAINT "activity_geometry_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_imports" ADD CONSTRAINT "activity_imports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_imports" ADD CONSTRAINT "activity_imports_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plan_derived_metrics_cache" ADD CONSTRAINT "activity_plan_derived_metrics_cache_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plan_derived_metrics_cache" ADD CONSTRAINT "activity_plan_derived_metrics_cache_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plan_refresh_queue" ADD CONSTRAINT "activity_plan_refresh_queue_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plan_refresh_queue" ADD CONSTRAINT "activity_plan_refresh_queue_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_summaries" ADD CONSTRAINT "activity_summaries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activity_summaries" ADD CONSTRAINT "activity_summaries_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coaches_athletes" ADD CONSTRAINT "coaches_athletes_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coaches_athletes" ADD CONSTRAINT "coaches_athletes_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coaching_invitations" ADD CONSTRAINT "coaching_invitations_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coaching_invitations" ADD CONSTRAINT "coaching_invitations_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "comments" ADD CONSTRAINT "comments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_grantee_profile_id_profiles_id_fk" FOREIGN KEY ("grantee_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_external_links" ADD CONSTRAINT "event_external_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_external_links" ADD CONSTRAINT "event_external_links_integration_account_id_integrations_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_external_links" ADD CONSTRAINT "event_external_links_event_profile_fkey" FOREIGN KEY ("event_id","profile_id") REFERENCES "public"."events"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_payloads" ADD CONSTRAINT "event_payloads_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_payloads" ADD CONSTRAINT "event_payloads_event_profile_fkey" FOREIGN KEY ("event_id","profile_id") REFERENCES "public"."events"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_recurrence" ADD CONSTRAINT "event_recurrence_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_recurrence" ADD CONSTRAINT "event_recurrence_series_id_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_recurrence" ADD CONSTRAINT "event_recurrence_event_profile_fkey" FOREIGN KEY ("event_id","profile_id") REFERENCES "public"."events"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_linked_activity_id_activities_id_fk" FOREIGN KEY ("linked_activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_user_training_plan_id_user_training_plans_id_fk" FOREIGN KEY ("user_training_plan_id") REFERENCES "public"."user_training_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_schedule_links" ADD CONSTRAINT "event_schedule_links_event_profile_fkey" FOREIGN KEY ("event_id","profile_id") REFERENCES "public"."events"("id","profile_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_profiles_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "group_event_activity_plans" ADD CONSTRAINT "group_event_activity_plans_group_event_id_group_events_id_fk" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_activity_plans" ADD CONSTRAINT "group_event_activity_plans_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_group_event_id_group_events_id_fk" FOREIGN KEY ("group_event_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_rsvps" ADD CONSTRAINT "group_event_rsvps_selected_group_event_activity_plan_id_group_event_activity_plans_id_fk" FOREIGN KEY ("selected_group_event_activity_plan_id") REFERENCES "public"."group_event_activity_plans"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_event_series_rsvps" ADD CONSTRAINT "group_event_series_rsvps_group_event_series_id_group_events_id_fk" FOREIGN KEY ("group_event_series_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_event_series_rsvps" ADD CONSTRAINT "group_event_series_rsvps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_series_id_group_events_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."group_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_profile_id_profiles_id_fk" FOREIGN KEY ("invited_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
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
ALTER TABLE "profile_estimation_state" ADD CONSTRAINT "profile_estimation_state_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "profile_goals" ADD CONSTRAINT "profile_goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_reference_activity_id_activities_id_fk" FOREIGN KEY ("reference_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "profile_training_settings" ADD CONSTRAINT "profile_training_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "provider_webhook_receipts" ADD CONSTRAINT "provider_webhook_receipts_job_id_provider_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."provider_sync_jobs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_training_plans" ADD CONSTRAINT "user_training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_training_plans" ADD CONSTRAINT "user_training_plans_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");
CREATE UNIQUE INDEX "activities_idx_key" ON "activities" USING btree ("idx");
CREATE INDEX "idx_activities_activity_plan" ON "activities" USING btree ("activity_plan_id") WHERE "activities"."activity_plan_id" is not null;
CREATE INDEX "idx_activities_profile_started" ON "activities" USING btree ("profile_id","started_at");
CREATE INDEX "idx_activities_started" ON "activities" USING btree ("started_at");
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("type");
CREATE INDEX "idx_activity_efforts_activity_id" ON "activity_efforts" USING btree ("activity_id");
CREATE INDEX "idx_activity_efforts_profile_id" ON "activity_efforts" USING btree ("profile_id");
CREATE INDEX "idx_activity_file_ingestions_activity_id" ON "activity_file_ingestions" USING btree ("activity_id");
CREATE INDEX "idx_activity_file_ingestions_profile_id" ON "activity_file_ingestions" USING btree ("profile_id");
CREATE INDEX "idx_activity_file_ingestions_status" ON "activity_file_ingestions" USING btree ("status");
CREATE INDEX "idx_activity_file_ingestions_provider_external" ON "activity_file_ingestions" USING btree ("provider","external_id") WHERE "activity_file_ingestions"."provider" is not null and "activity_file_ingestions"."external_id" is not null;
CREATE INDEX "idx_activity_geometry_profile_id" ON "activity_geometry" USING btree ("profile_id");
CREATE UNIQUE INDEX "idx_activity_imports_external_unique" ON "activity_imports" USING btree ("provider","external_id") WHERE "activity_imports"."external_id" is not null and "activity_imports"."provider" is not null;
CREATE INDEX "idx_activity_imports_profile_id" ON "activity_imports" USING btree ("profile_id");
CREATE INDEX "idx_activity_imports_provider_external" ON "activity_imports" USING btree ("provider","external_id") WHERE "activity_imports"."external_id" is not null;
CREATE INDEX "idx_activity_laps_activity_id" ON "activity_laps" USING btree ("activity_id");
CREATE INDEX "idx_activity_laps_profile_id" ON "activity_laps" USING btree ("profile_id");
CREATE UNIQUE INDEX "activity_plan_derived_metrics_cache_lookup_key" ON "activity_plan_derived_metrics_cache" USING btree ("activity_plan_id","profile_id","estimator_version","input_fingerprint");
CREATE INDEX "idx_activity_plan_derived_metrics_cache_profile_plan" ON "activity_plan_derived_metrics_cache" USING btree ("profile_id","activity_plan_id");
CREATE INDEX "idx_activity_plan_derived_metrics_cache_last_accessed_at" ON "activity_plan_derived_metrics_cache" USING btree ("last_accessed_at");
CREATE UNIQUE INDEX "activity_plan_refresh_queue_profile_plan_unique" ON "activity_plan_refresh_queue" USING btree ("profile_id","activity_plan_id");
CREATE INDEX "idx_activity_plan_refresh_queue_profile_queued_at" ON "activity_plan_refresh_queue" USING btree ("profile_id","queued_at");
CREATE INDEX "idx_activity_plan_refresh_queue_activity_plan_id" ON "activity_plan_refresh_queue" USING btree ("activity_plan_id");
CREATE UNIQUE INDEX "activity_plans_idx_key" ON "activity_plans" USING btree ("idx");
CREATE INDEX "idx_activity_plans_profile_id" ON "activity_plans" USING btree ("profile_id") WHERE "activity_plans"."profile_id" is not null;
CREATE INDEX "idx_activity_plans_system_templates" ON "activity_plans" USING btree ("is_system_template") WHERE "activity_plans"."is_system_template" = true;
CREATE INDEX "idx_activity_plans_route_id" ON "activity_plans" USING btree ("route_id") WHERE "activity_plans"."route_id" is not null;
CREATE INDEX "idx_activity_plans_visibility" ON "activity_plans" USING btree ("template_visibility");
CREATE UNIQUE INDEX "idx_activity_plans_import_identity" ON "activity_plans" USING btree ("profile_id","import_provider","import_external_id") WHERE "activity_plans"."import_provider" is not null and "activity_plans"."import_external_id" is not null;
CREATE UNIQUE INDEX "activity_routes_idx_key" ON "activity_routes" USING btree ("idx");
CREATE INDEX "idx_routes_profile_id" ON "activity_routes" USING btree ("profile_id") WHERE "activity_routes"."profile_id" is not null;
CREATE INDEX "idx_routes_name" ON "activity_routes" USING btree ("name");
CREATE INDEX "idx_routes_created_at" ON "activity_routes" USING btree ("created_at");
CREATE INDEX "idx_routes_is_system_template" ON "activity_routes" USING btree ("is_system_template") WHERE "activity_routes"."is_system_template" = true;
CREATE INDEX "idx_activity_summaries_profile_id" ON "activity_summaries" USING btree ("profile_id");
CREATE INDEX "idx_coaches_athletes_coach_id" ON "coaches_athletes" USING btree ("coach_id");
CREATE INDEX "idx_coaches_athletes_athlete_id" ON "coaches_athletes" USING btree ("athlete_id");
CREATE INDEX "idx_coaching_invitations_athlete_id" ON "coaching_invitations" USING btree ("athlete_id");
CREATE INDEX "idx_coaching_invitations_coach_id" ON "coaching_invitations" USING btree ("coach_id");
CREATE INDEX "idx_comments_entity" ON "comments" USING btree ("entity_type","entity_id");
CREATE INDEX "idx_comments_profile_id" ON "comments" USING btree ("profile_id","created_at");
CREATE INDEX "idx_comments_created_at" ON "comments" USING btree ("created_at");
CREATE UNIQUE INDEX "content_access_grants_source_unique" ON "content_access_grants" USING btree ("content_type","content_id","grantee_profile_id","access_level","source_type","source_id");
CREATE INDEX "idx_content_access_grants_grantee_content" ON "content_access_grants" USING btree ("grantee_profile_id","content_type","content_id");
CREATE INDEX "idx_content_access_grants_source" ON "content_access_grants" USING btree ("source_type","source_id");
CREATE INDEX "idx_content_access_grants_active_expiry" ON "content_access_grants" USING btree ("expires_at") WHERE "content_access_grants"."expires_at" is not null and "content_access_grants"."revoked_at" is null;
CREATE INDEX "idx_content_access_grants_actor_profile_id" ON "content_access_grants" USING btree ("actor_profile_id") WHERE "content_access_grants"."actor_profile_id" is not null;
CREATE INDEX "idx_conversation_participants_user_id" ON "conversation_participants" USING btree ("user_id");
CREATE UNIQUE INDEX "idx_event_external_links_identity_unique" ON "event_external_links" USING btree ("source_provider","integration_account_id","external_calendar_id","external_event_id","occurrence_key") WHERE "event_external_links"."source_provider" is not null and "event_external_links"."integration_account_id" is not null and "event_external_links"."external_calendar_id" is not null and "event_external_links"."external_event_id" is not null;
CREATE INDEX "idx_event_external_links_profile_id" ON "event_external_links" USING btree ("profile_id");
CREATE INDEX "idx_event_external_links_integration_calendar_updated" ON "event_external_links" USING btree ("integration_account_id","external_calendar_id","updated_at") WHERE "event_external_links"."integration_account_id" is not null and "event_external_links"."external_calendar_id" is not null;
CREATE INDEX "idx_event_payloads_profile_id" ON "event_payloads" USING btree ("profile_id");
CREATE INDEX "idx_event_recurrence_profile_id" ON "event_recurrence" USING btree ("profile_id");
CREATE UNIQUE INDEX "idx_event_recurrence_series_occurrence_unique" ON "event_recurrence" USING btree ("series_id","occurrence_key") WHERE "event_recurrence"."series_id" is not null;
CREATE INDEX "idx_event_schedule_links_profile_id" ON "event_schedule_links" USING btree ("profile_id");
CREATE INDEX "idx_event_schedule_links_training_plan_id" ON "event_schedule_links" USING btree ("training_plan_id") WHERE "event_schedule_links"."training_plan_id" is not null;
CREATE INDEX "idx_event_schedule_links_activity_plan_id" ON "event_schedule_links" USING btree ("activity_plan_id") WHERE "event_schedule_links"."activity_plan_id" is not null;
CREATE INDEX "idx_event_schedule_links_linked_activity_id" ON "event_schedule_links" USING btree ("linked_activity_id") WHERE "event_schedule_links"."linked_activity_id" is not null;
CREATE INDEX "idx_event_schedule_links_route_id" ON "event_schedule_links" USING btree ("route_id") WHERE "event_schedule_links"."route_id" is not null;
CREATE INDEX "idx_event_schedule_links_schedule_batch" ON "event_schedule_links" USING btree ("profile_id","schedule_batch_id") WHERE "event_schedule_links"."schedule_batch_id" is not null;
CREATE INDEX "idx_event_schedule_links_user_training_plan_id" ON "event_schedule_links" USING btree ("user_training_plan_id") WHERE "event_schedule_links"."user_training_plan_id" is not null;
CREATE UNIQUE INDEX "events_idx_key" ON "events" USING btree ("idx");
CREATE INDEX "idx_events_event_type_starts_at" ON "events" USING btree ("event_type","starts_at");
CREATE INDEX "idx_events_profile_starts_at" ON "events" USING btree ("profile_id","starts_at");
CREATE INDEX "idx_events_profile_status_starts_at" ON "events" USING btree ("profile_id","status","starts_at");
CREATE INDEX "idx_follows_following_id" ON "follows" USING btree ("following_id");
CREATE INDEX "group_event_activity_plans_event_sort_idx" ON "group_event_activity_plans" USING btree ("group_event_id","sort_order");
CREATE INDEX "idx_group_event_activity_plans_activity_plan_id" ON "group_event_activity_plans" USING btree ("activity_plan_id");
CREATE INDEX "group_event_rsvps_profile_status_idx" ON "group_event_rsvps" USING btree ("profile_id","status");
CREATE INDEX "idx_group_event_rsvps_selected_activity_plan_id" ON "group_event_rsvps" USING btree ("selected_group_event_activity_plan_id") WHERE "group_event_rsvps"."selected_group_event_activity_plan_id" is not null;
CREATE INDEX "group_event_series_rsvps_profile_status_idx" ON "group_event_series_rsvps" USING btree ("profile_id","status");
CREATE INDEX "group_events_group_starts_at_idx" ON "group_events" USING btree ("group_id","starts_at");
CREATE INDEX "group_events_group_cancelled_starts_at_idx" ON "group_events" USING btree ("group_id","cancelled_at","starts_at");
CREATE UNIQUE INDEX "group_events_series_occurrence_unique_idx" ON "group_events" USING btree ("series_id","occurrence_key") WHERE "group_events"."series_id" is not null;
CREATE INDEX "group_events_series_starts_at_idx" ON "group_events" USING btree ("series_id","starts_at") WHERE "group_events"."series_id" is not null;
CREATE INDEX "idx_group_events_created_by_profile_id" ON "group_events" USING btree ("created_by_profile_id") WHERE "group_events"."created_by_profile_id" is not null;
CREATE INDEX "idx_group_events_route_id" ON "group_events" USING btree ("route_id") WHERE "group_events"."route_id" is not null;
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
CREATE UNIQUE INDEX "integration_resource_links_idx_key" ON "integration_resource_links" USING btree ("idx");
CREATE INDEX "idx_integration_resource_links_profile" ON "integration_resource_links" USING btree ("profile_id");
CREATE INDEX "idx_integration_resource_links_integration" ON "integration_resource_links" USING btree ("integration_id");
CREATE INDEX "idx_integration_resource_links_internal" ON "integration_resource_links" USING btree ("resource_kind","internal_resource_id");
CREATE INDEX "idx_integration_resource_links_provider_external" ON "integration_resource_links" USING btree ("provider","external_id");
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
CREATE INDEX "idx_profile_estimation_state_updated_at" ON "profile_estimation_state" USING btree ("updated_at");
CREATE INDEX "idx_profile_goals_profile_id" ON "profile_goals" USING btree ("profile_id");
CREATE UNIQUE INDEX "profile_metrics_idx_key" ON "profile_metrics" USING btree ("idx");
CREATE INDEX "idx_profile_metrics_profile" ON "profile_metrics" USING btree ("profile_id","recorded_at");
CREATE INDEX "idx_profile_metrics_recorded_at" ON "profile_metrics" USING btree ("recorded_at");
CREATE INDEX "idx_profile_metrics_reference_activity" ON "profile_metrics" USING btree ("reference_activity_id") WHERE "profile_metrics"."reference_activity_id" is not null;
CREATE INDEX "idx_profile_metrics_temporal_lookup" ON "profile_metrics" USING btree ("profile_id","metric_type","recorded_at");
CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "profiles" USING btree ("username");
CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "profiles" USING btree ("email") WHERE "profiles"."email" is not null;
CREATE UNIQUE INDEX "provider_sync_jobs_idx_key" ON "provider_sync_jobs" USING btree ("idx");
CREATE INDEX "idx_provider_sync_jobs_status_run_at_priority" ON "provider_sync_jobs" USING btree ("status","run_at","priority");
CREATE INDEX "idx_provider_sync_jobs_provider_profile_status" ON "provider_sync_jobs" USING btree ("provider","profile_id","status");
CREATE INDEX "idx_provider_sync_jobs_dedupe_key" ON "provider_sync_jobs" USING btree ("dedupe_key");
CREATE INDEX "idx_provider_sync_jobs_lane_status" ON "provider_sync_jobs" USING btree ("sync_lane_key","status","run_at");
CREATE INDEX "idx_provider_sync_jobs_integration_id" ON "provider_sync_jobs" USING btree ("integration_id");
CREATE INDEX "idx_provider_sync_jobs_profile_id" ON "provider_sync_jobs" USING btree ("profile_id");
CREATE INDEX "idx_provider_sync_jobs_supersedes_job_id" ON "provider_sync_jobs" USING btree ("supersedes_job_id") WHERE "provider_sync_jobs"."supersedes_job_id" is not null;
CREATE UNIQUE INDEX "provider_sync_state_idx_key" ON "provider_sync_state" USING btree ("idx");
CREATE INDEX "idx_provider_sync_state_provider_next_sync" ON "provider_sync_state" USING btree ("provider","next_sync_at");
CREATE UNIQUE INDEX "provider_webhook_receipts_idx_key" ON "provider_webhook_receipts" USING btree ("idx");
CREATE INDEX "idx_provider_webhook_receipts_provider_status" ON "provider_webhook_receipts" USING btree ("provider","processing_status");
CREATE INDEX "idx_provider_webhook_receipts_job_id" ON "provider_webhook_receipts" USING btree ("job_id");
CREATE INDEX "idx_provider_webhook_receipts_integration_id" ON "provider_webhook_receipts" USING btree ("integration_id") WHERE "provider_webhook_receipts"."integration_id" is not null;
CREATE UNIQUE INDEX "training_plans_idx_key" ON "training_plans" USING btree ("idx");
CREATE INDEX "idx_training_plans_profile_id" ON "training_plans" USING btree ("profile_id") WHERE "training_plans"."profile_id" is not null;
CREATE INDEX "idx_training_plans_is_system_template" ON "training_plans" USING btree ("is_system_template") WHERE "training_plans"."is_system_template" = true;
CREATE INDEX "idx_training_plans_name" ON "training_plans" USING btree ("name");
CREATE INDEX "idx_training_plans_visibility" ON "training_plans" USING btree ("template_visibility");
CREATE INDEX "idx_user_training_plans_profile_id" ON "user_training_plans" USING btree ("profile_id");
CREATE INDEX "idx_user_training_plans_training_plan_id" ON "user_training_plans" USING btree ("training_plan_id");
CREATE INDEX "idx_user_training_plans_status" ON "user_training_plans" USING btree ("profile_id") WHERE "user_training_plans"."status" = 'active';
