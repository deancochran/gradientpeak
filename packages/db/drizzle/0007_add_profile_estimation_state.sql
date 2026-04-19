CREATE TABLE IF NOT EXISTS "profile_estimation_state" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"metrics_revision" integer DEFAULT 0 NOT NULL,
	"performance_revision" integer DEFAULT 0 NOT NULL,
	"fitness_revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_estimation_state" ADD CONSTRAINT "profile_estimation_state_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_estimation_state_updated_at" ON "profile_estimation_state" USING btree ("updated_at");
