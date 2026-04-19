CREATE TABLE IF NOT EXISTS "activity_plan_refresh_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_plan_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_plan_refresh_queue" ADD CONSTRAINT "activity_plan_refresh_queue_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_refresh_queue" ADD CONSTRAINT "activity_plan_refresh_queue_activity_plan_id_activity_plans_id_fk" FOREIGN KEY ("activity_plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_plan_refresh_queue_profile_plan_unique" ON "activity_plan_refresh_queue" USING btree ("profile_id","activity_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_plan_refresh_queue_profile_queued_at" ON "activity_plan_refresh_queue" USING btree ("profile_id","queued_at");
