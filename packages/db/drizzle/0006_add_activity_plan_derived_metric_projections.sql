CREATE TABLE IF NOT EXISTS "derived_metric_projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "activity_plan_derived_metrics_cache" ADD CONSTRAINT "activity_plan_derived_metrics_cache_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_derived_metrics_cache" ADD CONSTRAINT "activity_plan_derived_metrics_cache_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_plan_derived_metrics_cache_lookup_key" ON "activity_plan_derived_metrics_cache" USING btree ("activity_plan_id","profile_id","estimator_version","input_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_plan_derived_metrics_cache_profile_plan" ON "activity_plan_derived_metrics_cache" USING btree ("profile_id","activity_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_plan_derived_metrics_cache_last_accessed_at" ON "activity_plan_derived_metrics_cache" USING btree ("last_accessed_at");
