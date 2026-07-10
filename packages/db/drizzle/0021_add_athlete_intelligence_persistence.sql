CREATE TABLE IF NOT EXISTS "athlete_intelligence_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idx" serial NOT NULL,
  "profile_id" uuid NOT NULL,
  "input_fingerprint" text NOT NULL,
  "schema_version" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "athlete_intelligence_snapshots_id_profile_id_unique" UNIQUE("id","profile_id"),
  CONSTRAINT "athlete_intelligence_snapshots_profile_fingerprint_unique" UNIQUE("profile_id","input_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "athlete_intelligence_snapshots" ADD CONSTRAINT "athlete_intelligence_snapshots_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_intelligence_snapshots_idx_key" ON "athlete_intelligence_snapshots" USING btree ("idx");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_athlete_intelligence_snapshots_profile_created_at" ON "athlete_intelligence_snapshots" USING btree ("profile_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athlete_intelligence_predictions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idx" serial NOT NULL,
  "profile_id" uuid NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "model_version" text NOT NULL,
  "prediction_kind" text NOT NULL,
  "scenario_key" text DEFAULT '' NOT NULL,
  "schema_version" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "athlete_intelligence_predictions_idempotency_unique" UNIQUE("snapshot_id","model_version","prediction_kind","scenario_key")
);
--> statement-breakpoint
ALTER TABLE "athlete_intelligence_predictions" ADD CONSTRAINT "athlete_intelligence_predictions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "athlete_intelligence_predictions" ADD CONSTRAINT "athlete_intelligence_predictions_snapshot_profile_fkey" FOREIGN KEY ("snapshot_id","profile_id") REFERENCES "public"."athlete_intelligence_snapshots"("id","profile_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_intelligence_predictions_idx_key" ON "athlete_intelligence_predictions" USING btree ("idx");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_athlete_intelligence_predictions_profile_created_at" ON "athlete_intelligence_predictions" USING btree ("profile_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athlete_intelligence_recompute_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idx" serial NOT NULL,
  "profile_id" uuid NOT NULL,
  "target_input_fingerprint" text NOT NULL,
  "reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 8 NOT NULL,
  "run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "lock_expires_at" timestamp with time zone,
  "locked_by" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "athlete_intelligence_recompute_jobs_status_check" CHECK ("athlete_intelligence_recompute_jobs"."status" in ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT "athlete_intelligence_recompute_jobs_attempt_count_check" CHECK ("athlete_intelligence_recompute_jobs"."attempt_count" >= 0 and "athlete_intelligence_recompute_jobs"."attempt_count" <= "athlete_intelligence_recompute_jobs"."max_attempts")
);
--> statement-breakpoint
ALTER TABLE "athlete_intelligence_recompute_jobs" ADD CONSTRAINT "athlete_intelligence_recompute_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_intelligence_recompute_jobs_idx_key" ON "athlete_intelligence_recompute_jobs" USING btree ("idx");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_intelligence_recompute_jobs_active_profile_unique" ON "athlete_intelligence_recompute_jobs" USING btree ("profile_id") WHERE "athlete_intelligence_recompute_jobs"."status" in ('queued', 'running');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_athlete_intelligence_recompute_jobs_claim" ON "athlete_intelligence_recompute_jobs" USING btree ("status","run_at","lock_expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_athlete_intelligence_recompute_jobs_profile_status" ON "athlete_intelligence_recompute_jobs" USING btree ("profile_id","status");
