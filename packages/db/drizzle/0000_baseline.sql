CREATE TYPE "public"."activity_category" AS ENUM('run', 'bike', 'swim', 'strength', 'other');--> statement-breakpoint
CREATE TYPE "public"."effort_type" AS ENUM('power', 'speed');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('planned_activity', 'rest_day', 'race', 'custom', 'imported');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift');--> statement-breakpoint
CREATE TYPE "public"."like_entity_type" AS ENUM('activity', 'activity_plan', 'training_plan', 'route');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_message', 'coaching_invitation', 'coaching_invitation_accepted', 'coaching_invitation_declined', 'new_follower', 'follow_request');--> statement-breakpoint
CREATE TYPE "public"."profile_metric_type" AS ENUM('weight_kg', 'resting_hr', 'sleep_hours', 'hrv_rmssd', 'vo2_max', 'body_fat_percentage', 'hydration_level', 'stress_score', 'soreness_level', 'wellness_score', 'max_hr', 'lthr');--> statement-breakpoint
CREATE TYPE "public"."training_effect_label" AS ENUM('recovery', 'base', 'tempo', 'threshold', 'vo2max');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_plan_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"provider" "integration_provider",
	"external_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
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
	"fit_file_path" text,
	"fit_file_size" integer,
	"import_source" text,
	"import_file_type" text,
	"import_original_file_name" text,
	"notes" text,
	"polyline" text,
	"laps" jsonb,
	"map_bounds" jsonb,
	"likes_count" integer DEFAULT 0,
	"is_private" boolean DEFAULT true NOT NULL,
	CONSTRAINT "activities_distance_meters_check" CHECK ("activities"."distance_meters" >= 0),
	CONSTRAINT "activities_duration_seconds_check" CHECK ("activities"."duration_seconds" >= 0),
	CONSTRAINT "activities_moving_seconds_check" CHECK ("activities"."moving_seconds" >= 0),
	CONSTRAINT "chk_moving_time" CHECK ("activities"."moving_seconds" >= 0 and "activities"."moving_seconds" <= "activities"."duration_seconds"),
	CONSTRAINT "activities_import_file_type_non_empty_check" CHECK ("activities"."import_file_type" is null or btrim("activities"."import_file_type") <> ''),
	CONSTRAINT "activities_import_original_file_name_non_empty_check" CHECK ("activities"."import_original_file_name" is null or btrim("activities"."import_original_file_name") <> ''),
	CONSTRAINT "activities_import_source_check" CHECK ("activities"."import_source" is null or "activities"."import_source" = 'manual_historical')
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "activity_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid,
	"route_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"activity_category" "activity_category" NOT NULL,
	"structure" jsonb,
	"version" text DEFAULT '1.0' NOT NULL,
	"template_visibility" text DEFAULT 'private' NOT NULL,
	"import_provider" text,
	"import_external_id" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"likes_count" integer DEFAULT 0,
	CONSTRAINT "activity_plans_template_visibility_check" CHECK ("activity_plans"."template_visibility" = any(array['private'::text, 'public'::text])),
	CONSTRAINT "activity_plans_import_provider_non_empty_check" CHECK ("activity_plans"."import_provider" is null or btrim("activity_plans"."import_provider") <> ''),
	CONSTRAINT "activity_plans_import_external_id_non_empty_check" CHECK ("activity_plans"."import_external_id" is null or btrim("activity_plans"."import_external_id") <> ''),
	CONSTRAINT "activity_plans_system_templates_public_check" CHECK ("activity_plans"."is_system_template" = false or "activity_plans"."template_visibility" = 'public'),
	CONSTRAINT "activity_plans_system_template_check" CHECK (("activity_plans"."is_system_template" = true and "activity_plans"."profile_id" is null) or ("activity_plans"."is_system_template" = false and "activity_plans"."profile_id" is not null)),
	CONSTRAINT "activity_plans_has_content" CHECK ("activity_plans"."structure" is not null or "activity_plans"."route_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "activity_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"activity_category" "activity_category" NOT NULL,
	"file_path" text NOT NULL,
	"total_distance" integer NOT NULL,
	"total_ascent" integer,
	"total_descent" integer,
	"source" text,
	"elevation_polyline" text,
	"polyline" text NOT NULL,
	"likes_count" integer DEFAULT 0,
	CONSTRAINT "activity_routes_total_distance_check" CHECK ("activity_routes"."total_distance" >= 0),
	CONSTRAINT "activity_routes_total_ascent_check" CHECK ("activity_routes"."total_ascent" >= 0),
	CONSTRAINT "activity_routes_total_descent_check" CHECK ("activity_routes"."total_descent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"group_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"training_plan_id" uuid,
	"activity_plan_id" uuid,
	"linked_activity_id" uuid,
	"event_type" "event_type" NOT NULL,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"notes" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
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
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"scheduled_date" text,
	"read_only" boolean,
	"lifecycle" jsonb,
	"recurrence" jsonb,
	"payload" jsonb,
	"route_id" uuid,
	CONSTRAINT "events_external_calendar_non_empty" CHECK ("events"."external_calendar_id" is null or btrim("events"."external_calendar_id") <> ''),
	CONSTRAINT "events_external_event_non_empty" CHECK ("events"."external_event_id" is null or btrim("events"."external_event_id") <> ''),
	CONSTRAINT "events_recurrence_timezone_requires_rule" CHECK ("events"."recurrence_timezone" is null or "events"."recurrence_rule" is not null),
	CONSTRAINT "events_series_not_self" CHECK ("events"."series_id" is null or "events"."series_id" <> "events"."id"),
	CONSTRAINT "events_series_occurrence_key_required" CHECK ("events"."series_id" is null or btrim("events"."occurrence_key") <> ''),
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
	CONSTRAINT "events_time_window" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_idx_unique" UNIQUE("idx"),
	CONSTRAINT "unique_integration_type" UNIQUE("profile_id","provider")
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"profile_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" "like_entity_type" NOT NULL,
	CONSTRAINT "likes_profile_entity_unique" UNIQUE("profile_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "profile_training_settings" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"email" text,
	"full_name" text,
	"username" text,
	"avatar_url" text,
	"bio" text,
	"dob" timestamp with time zone,
	"gender" "gender",
	"language" text,
	"preferred_units" text,
	"onboarded" boolean,
	"is_public" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idx" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"profile_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	CONSTRAINT "unique_event_per_provider" UNIQUE("event_id","provider")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_linked_activity_id_activities_id_fk" FOREIGN KEY ("linked_activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_integration_account_id_integrations_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_training_plan_id_user_training_plans_id_fk" FOREIGN KEY ("user_training_plan_id") REFERENCES "public"."user_training_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_route_id_activity_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."activity_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_profiles_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_goals" ADD CONSTRAINT "profile_goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_reference_activity_id_activities_id_fk" FOREIGN KEY ("reference_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_training_settings" ADD CONSTRAINT "profile_training_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_events" ADD CONSTRAINT "synced_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_events" ADD CONSTRAINT "synced_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_training_plans" ADD CONSTRAINT "user_training_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_training_plans" ADD CONSTRAINT "user_training_plans_training_plan_id_training_plans_id_fk" FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_idx_key" ON "activities" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_activities_activity_plan" ON "activities" USING btree ("activity_plan_id") WHERE "activities"."activity_plan_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_activities_external_unique" ON "activities" USING btree ("provider","external_id") WHERE "activities"."external_id" is not null and "activities"."provider" is not null;--> statement-breakpoint
CREATE INDEX "idx_activities_provider_external" ON "activities" USING btree ("provider","external_id") WHERE "activities"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_activities_profile_started" ON "activities" USING btree ("profile_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_activities_started" ON "activities" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_plans_idx_key" ON "activity_plans" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_activity_plans_profile_id" ON "activity_plans" USING btree ("profile_id") WHERE "activity_plans"."profile_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_activity_plans_system_templates" ON "activity_plans" USING btree ("is_system_template") WHERE "activity_plans"."is_system_template" = true;--> statement-breakpoint
CREATE INDEX "idx_activity_plans_route_id" ON "activity_plans" USING btree ("route_id") WHERE "activity_plans"."route_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_activity_plans_visibility" ON "activity_plans" USING btree ("template_visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_activity_plans_import_identity" ON "activity_plans" USING btree ("profile_id","import_provider","import_external_id") WHERE "activity_plans"."import_provider" is not null and "activity_plans"."import_external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_routes_idx_key" ON "activity_routes" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_routes_profile_id" ON "activity_routes" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_routes_name" ON "activity_routes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_routes_activity_category" ON "activity_routes" USING btree ("activity_category");--> statement-breakpoint
CREATE INDEX "idx_routes_created_at" ON "activity_routes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_entity" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_comments_profile_id" ON "comments" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_created_at" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idx_key" ON "events" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_events_activity_plan" ON "events" USING btree ("activity_plan_id") WHERE "events"."activity_plan_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_event_type_starts_at" ON "events" USING btree ("event_type","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_external_identity_unique" ON "events" USING btree ("source_provider","integration_account_id","external_calendar_id","external_event_id","occurrence_key") WHERE "events"."source_provider" is not null and "events"."integration_account_id" is not null and "events"."external_calendar_id" is not null and "events"."external_event_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_integration_calendar_updated" ON "events" USING btree ("integration_account_id","external_calendar_id","updated_at") WHERE "events"."integration_account_id" is not null and "events"."external_calendar_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_profile_starts_at" ON "events" USING btree ("profile_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_events_profile_status_starts_at" ON "events" USING btree ("profile_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_series_occurrence_unique" ON "events" USING btree ("series_id","occurrence_key") WHERE "events"."series_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_training_plan" ON "events" USING btree ("training_plan_id") WHERE "events"."training_plan_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_schedule_batch" ON "events" USING btree ("profile_id","schedule_batch_id") WHERE "events"."schedule_batch_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_user_training_plan" ON "events" USING btree ("user_training_plan_id") WHERE "events"."user_training_plan_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_follows_following_id" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_profile_id" ON "integrations" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_external_id" ON "integrations" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_provider" ON "integrations" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_integrations_expires_at" ON "integrations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_likes_entity" ON "likes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_read_at" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_states_expires_at" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_states_profile_id" ON "oauth_states" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_profile_goals_profile_id" ON "profile_goals" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_metrics_idx_key" ON "profile_metrics" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_profile_metrics_profile" ON "profile_metrics" USING btree ("profile_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_profile_metrics_recorded_at" ON "profile_metrics" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "idx_profile_metrics_reference_activity" ON "profile_metrics" USING btree ("reference_activity_id") WHERE "profile_metrics"."reference_activity_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_profile_metrics_temporal_lookup" ON "profile_metrics" USING btree ("profile_id","metric_type","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "profiles" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "profiles" USING btree ("email") WHERE "profiles"."email" is not null;--> statement-breakpoint
CREATE INDEX "idx_synced_events_profile" ON "synced_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_synced_events_event" ON "synced_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_synced_events_provider" ON "synced_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plans_idx_key" ON "training_plans" USING btree ("idx");--> statement-breakpoint
CREATE INDEX "idx_training_plans_profile_id" ON "training_plans" USING btree ("profile_id") WHERE "training_plans"."profile_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_training_plans_is_system_template" ON "training_plans" USING btree ("is_system_template") WHERE "training_plans"."is_system_template" = true;--> statement-breakpoint
CREATE INDEX "idx_training_plans_name" ON "training_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_training_plans_visibility" ON "training_plans" USING btree ("template_visibility");--> statement-breakpoint
CREATE INDEX "idx_user_training_plans_profile_id" ON "user_training_plans" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_user_training_plans_training_plan_id" ON "user_training_plans" USING btree ("training_plan_id");--> statement-breakpoint
CREATE INDEX "idx_user_training_plans_status" ON "user_training_plans" USING btree ("profile_id") WHERE "user_training_plans"."status" = 'active';
