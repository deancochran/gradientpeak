CREATE TABLE IF NOT EXISTS "provider_sync_state" (
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
	CONSTRAINT "provider_sync_state_idx_key" UNIQUE("idx"),
	CONSTRAINT "provider_sync_state_integration_resource_unique" UNIQUE("integration_id","resource")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idx" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"job_type" text NOT NULL,
	"resource_kind" "integration_resource_kind",
	"internal_resource_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"lock_expires_at" timestamp with time zone,
	"locked_by" text,
	CONSTRAINT "provider_sync_jobs_idx_key" UNIQUE("idx")
);
--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD CONSTRAINT "provider_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_sync_state_provider_next_sync" ON "provider_sync_state" USING btree ("provider","next_sync_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_sync_jobs_status_run_at_priority" ON "provider_sync_jobs" USING btree ("status","run_at","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_sync_jobs_provider_profile_status" ON "provider_sync_jobs" USING btree ("provider","profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_sync_jobs_dedupe_key" ON "provider_sync_jobs" USING btree ("dedupe_key");
