CREATE TYPE "evidence_observation_source" AS ENUM ('manual', 'test', 'imported', 'provider', 'estimated', 'derived');--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD COLUMN "source" "evidence_observation_source";--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD COLUMN "calculation_version" text;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD COLUMN "quality_score" numeric;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_method_not_blank_check" CHECK ("activity_efforts"."method" IS NULL OR btrim("activity_efforts"."method") <> '');--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_calculation_version_not_blank_check" CHECK ("activity_efforts"."calculation_version" IS NULL OR btrim("activity_efforts"."calculation_version") <> '');--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_quality_score_range_check" CHECK ("activity_efforts"."quality_score" IS NULL OR ("activity_efforts"."quality_score" >= 0 AND "activity_efforts"."quality_score" <= 1));--> statement-breakpoint
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_provenance_object_check" CHECK ("activity_efforts"."provenance" IS NULL OR jsonb_typeof("activity_efforts"."provenance") = 'object');--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD COLUMN "source" "evidence_observation_source";--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD COLUMN "calculation_version" text;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD COLUMN "quality_score" numeric;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_method_not_blank_check" CHECK ("profile_metrics"."method" IS NULL OR btrim("profile_metrics"."method") <> '');--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_calculation_version_not_blank_check" CHECK ("profile_metrics"."calculation_version" IS NULL OR btrim("profile_metrics"."calculation_version") <> '');--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_quality_score_range_check" CHECK ("profile_metrics"."quality_score" IS NULL OR ("profile_metrics"."quality_score" >= 0 AND "profile_metrics"."quality_score" <= 1));--> statement-breakpoint
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_provenance_object_check" CHECK ("profile_metrics"."provenance" IS NULL OR jsonb_typeof("profile_metrics"."provenance") = 'object');
