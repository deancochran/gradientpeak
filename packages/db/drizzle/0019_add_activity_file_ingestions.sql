CREATE TYPE "public"."activity_file_ingestion_source" AS ENUM('mobile_recording', 'manual_import', 'provider_sync');--> statement-breakpoint
CREATE TYPE "public"."activity_file_ingestion_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_file_ingestions" (
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
--> statement-breakpoint
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_file_ingestions" ADD CONSTRAINT "activity_file_ingestions_activity_profile_fkey" FOREIGN KEY ("activity_id","profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_file_ingestions_activity_id" ON "activity_file_ingestions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_file_ingestions_profile_id" ON "activity_file_ingestions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_file_ingestions_status" ON "activity_file_ingestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_file_ingestions_provider_external" ON "activity_file_ingestions" USING btree ("provider","external_id") WHERE "provider" is not null and "external_id" is not null;
