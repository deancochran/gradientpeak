DO $$ BEGIN
 CREATE TYPE "integration_resource_kind" AS ENUM('event', 'activity_plan', 'activity_route', 'activity');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "synced_events" RENAME TO "integration_resource_links";--> statement-breakpoint
ALTER TABLE "integration_resource_links" RENAME COLUMN "event_id" TO "internal_resource_id";--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD COLUMN IF NOT EXISTS "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD COLUMN IF NOT EXISTS "resource_kind" "integration_resource_kind";--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD COLUMN IF NOT EXISTS "payload_hash" text;--> statement-breakpoint
UPDATE "integration_resource_links"
SET "updated_at" = COALESCE("updated_at", "synced_at", "created_at")
WHERE "updated_at" IS NULL;--> statement-breakpoint
UPDATE "integration_resource_links"
SET "resource_kind" = 'event'
WHERE "resource_kind" IS NULL;--> statement-breakpoint
UPDATE "integration_resource_links" AS links
SET "integration_id" = integrations."id"
FROM "integrations"
WHERE links."integration_id" IS NULL
  AND integrations."profile_id" = links."profile_id"
  AND integrations."provider" = links."provider";--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
   SELECT 1
   FROM "integration_resource_links"
   WHERE "integration_id" IS NULL
 ) THEN
   RAISE EXCEPTION 'integration_resource_links migration failed: missing integration_id backfill';
 END IF;
END $$;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "integration_resource_links_idx_seq";--> statement-breakpoint
SELECT setval(
  'integration_resource_links_idx_seq',
  GREATEST(COALESCE((SELECT MAX("idx") FROM "integration_resource_links"), 0), 1),
  true
);--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "idx" SET DEFAULT nextval('integration_resource_links_idx_seq');--> statement-breakpoint
UPDATE "integration_resource_links"
SET "idx" = nextval('integration_resource_links_idx_seq')
WHERE "idx" IS NULL;--> statement-breakpoint
ALTER SEQUENCE "integration_resource_links_idx_seq" OWNED BY "integration_resource_links"."idx";--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "idx" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "integration_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ALTER COLUMN "resource_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_resource_links" DROP CONSTRAINT IF EXISTS "unique_event_per_provider";--> statement-breakpoint
ALTER TABLE "integration_resource_links" DROP CONSTRAINT IF EXISTS "synced_events_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "integration_resource_links" DROP CONSTRAINT IF EXISTS "synced_events_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_synced_events_profile";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_synced_events_event";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_synced_events_provider";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_resource_links_idx_key" ON "integration_resource_links" USING btree ("idx");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_resource_links_internal_unique" ON "integration_resource_links" USING btree ("integration_id", "resource_kind", "internal_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_resource_links_external_unique" ON "integration_resource_links" USING btree ("integration_id", "resource_kind", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_resource_links_profile" ON "integration_resource_links" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_resource_links_integration" ON "integration_resource_links" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_resource_links_internal" ON "integration_resource_links" USING btree ("resource_kind", "internal_resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_integration_resource_links_provider_external" ON "integration_resource_links" USING btree ("provider", "external_id");
