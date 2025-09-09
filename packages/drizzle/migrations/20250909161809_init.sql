CREATE TYPE "public"."sync_status" AS ENUM('local_only', 'syncing', 'synced', 'sync_failed');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('bike', 'run', 'swim', 'strength', 'other');--> statement-breakpoint
CREATE TYPE "public"."completion_status" AS ENUM('pending', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('base', 'build', 'peak', 'recovery', 'custom');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"profile_id" uuid NOT NULL,
	"local_storage_path" text,
	"cloud_storage_path" text,
	"sync_status" "sync_status" DEFAULT 'local_only' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "activities_idx_unique" UNIQUE("idx")
);
--> statement-breakpoint
CREATE TABLE "activity_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"activity_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"total_time" integer,
	"moving_time" integer,
	"snapshot_weight_kg" numeric(5, 2),
	"snapshot_ftp" numeric(5, 2),
	"snapshot_threshold_hr" integer,
	"tss" numeric(6, 2),
	"ctl" numeric(6, 2),
	"atl" numeric(6, 2),
	"tsb" numeric(6, 2),
	"normalized_power" numeric(6, 2),
	"avg_power" numeric(6, 2),
	"peak_power" numeric(6, 2),
	"intensity_factor" numeric(4, 2),
	"variability_index" numeric(4, 2),
	"avg_heart_rate" numeric(4, 0),
	"max_heart_rate" numeric(4, 0),
	"avg_cadence" numeric(4, 0),
	"max_cadence" numeric(4, 0),
	"distance" numeric(8, 2),
	"avg_speed" numeric(5, 2),
	"max_speed" numeric(5, 2),
	"total_ascent" numeric(6, 2),
	"total_descent" numeric(6, 2),
	"adherence_score" numeric(4, 2),
	"workout_match" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "activity_results_idx_unique" UNIQUE("idx")
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"activity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"resolution" text,
	"original_size" integer NOT NULL,
	"data" double precision[],
	"data_latlng" double precision[][],
	"data_moving" boolean[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "activity_streams_idx_unique" UNIQUE("idx"),
	CONSTRAINT "uq_activity_stream_type" UNIQUE("activity_id","type"),
	CONSTRAINT "resolution_check" CHECK ("activity_streams"."resolution" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "planned_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"profile_id" uuid NOT NULL,
	"profile_plan_id" uuid,
	"scheduled_date" date NOT NULL,
	"name" text NOT NULL,
	"activity_type" "activity_type" NOT NULL,
	"description" text,
	"structure" jsonb NOT NULL,
	"structure_version" text DEFAULT '1.0' NOT NULL,
	"requires_ftp" boolean DEFAULT false,
	"requires_threshold_hr" boolean DEFAULT false,
	"estimated_duration" integer,
	"estimated_tss" numeric(6, 2),
	"completion_status" "completion_status" DEFAULT 'pending',
	"completed_activity_id" uuid,
	"completion_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "planned_activities_idx_unique" UNIQUE("idx")
);
--> statement-breakpoint
CREATE TABLE "profile_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"plan_type" "plan_type" DEFAULT 'custom' NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"snapshot_weight_kg" numeric(5, 2),
	"snapshot_ftp" numeric(5, 2),
	"snapshot_threshold_hr" integer,
	"config_version" text DEFAULT '1.0' NOT NULL,
	"config" jsonb NOT NULL,
	"completion_percentage" numeric(5, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "profile_plans_idx_unique" UNIQUE("idx")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"threshold_hr" integer,
	"ftp" integer,
	"weight_kg" numeric(5, 2),
	"gender" text,
	"dob" date,
	"username" text,
	"language" text DEFAULT 'en',
	"preferred_units" text DEFAULT 'metric',
	"avatar_url" text,
	"bio" text,
	"onboarded" boolean DEFAULT false,
	"last_ftp_update" timestamp,
	"last_threshold_hr_update" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "profiles_idx_unique" UNIQUE("idx"),
	CONSTRAINT "profiles_username_unique" UNIQUE("username"),
	CONSTRAINT "gender_check" CHECK ("profiles"."gender" in ('male', 'female', 'other')),
	CONSTRAINT "preferred_units_check" CHECK ("profiles"."preferred_units" in ('metric', 'imperial'))
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_results" ADD CONSTRAINT "activity_results_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_activities" ADD CONSTRAINT "planned_activities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_activities" ADD CONSTRAINT "planned_activities_profile_plan_id_profile_plans_id_fk" FOREIGN KEY ("profile_plan_id") REFERENCES "public"."profile_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_plans" ADD CONSTRAINT "profile_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;