ALTER TABLE "activities" DROP COLUMN "schema_position";
ALTER TABLE "activities" DROP COLUMN "compliance_score";
ALTER TABLE "activity_results" DROP "activity_match";
ALTER TABLE "activity_results" ADD COLUMN "activity_match" boolean;
