ALTER TABLE "activity_routes" ALTER COLUMN "profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "source_page_url" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "source_download_url" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "source_license" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "source_attribution" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "import_provider" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "import_external_id" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "activity_routes" ADD COLUMN IF NOT EXISTS "is_system_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_routes_profile_id";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_import_provider_non_empty_check";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_import_external_id_non_empty_check";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_source_page_url_non_empty_check";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_source_download_url_non_empty_check";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_system_templates_public_check";--> statement-breakpoint
ALTER TABLE "activity_routes" DROP CONSTRAINT IF EXISTS "activity_routes_system_template_check";--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_import_provider_non_empty_check" CHECK ("activity_routes"."import_provider" is null or btrim("activity_routes"."import_provider") <> '');--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_import_external_id_non_empty_check" CHECK ("activity_routes"."import_external_id" is null or btrim("activity_routes"."import_external_id") <> '');--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_source_page_url_non_empty_check" CHECK ("activity_routes"."source_page_url" is null or btrim("activity_routes"."source_page_url") <> '');--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_source_download_url_non_empty_check" CHECK ("activity_routes"."source_download_url" is null or btrim("activity_routes"."source_download_url") <> '');--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_system_templates_public_check" CHECK ("activity_routes"."is_system_template" = false or "activity_routes"."is_public" = true);--> statement-breakpoint
ALTER TABLE "activity_routes" ADD CONSTRAINT "activity_routes_system_template_check" CHECK (("activity_routes"."is_system_template" = true and "activity_routes"."profile_id" is null) or ("activity_routes"."is_system_template" = false and "activity_routes"."profile_id" is not null));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_profile_id" ON "activity_routes" USING btree ("profile_id") WHERE "activity_routes"."profile_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_is_system_template" ON "activity_routes" USING btree ("is_system_template") WHERE "activity_routes"."is_system_template" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_activity_routes_system_import_identity" ON "activity_routes" USING btree ("import_provider","import_external_id") WHERE "activity_routes"."is_system_template" = true and "activity_routes"."import_provider" is not null and "activity_routes"."import_external_id" is not null;--> statement-breakpoint
