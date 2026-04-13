CREATE TABLE IF NOT EXISTS "coaches_athletes" (
	"coach_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_athletes_coach_id_athlete_id_pk" PRIMARY KEY("coach_id","athlete_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coaching_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_invitations_athlete_coach_unique" UNIQUE("athlete_id","coach_id")
);
--> statement-breakpoint
ALTER TABLE "activity_plans" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches_athletes" ADD CONSTRAINT "coaches_athletes_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches_athletes" ADD CONSTRAINT "coaches_athletes_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_invitations" ADD CONSTRAINT "coaching_invitations_athlete_id_profiles_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_invitations" ADD CONSTRAINT "coaching_invitations_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coaches_athletes_coach_id" ON "coaches_athletes" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coaches_athletes_athlete_id" ON "coaches_athletes" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coaching_invitations_athlete_id" ON "coaching_invitations" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coaching_invitations_coach_id" ON "coaching_invitations" USING btree ("coach_id");
