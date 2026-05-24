ALTER TABLE "profile_estimation_state" ADD COLUMN "dirty_since" timestamp with time zone;
ALTER TABLE "activity_efforts" DROP CONSTRAINT IF EXISTS "activity_efforts_activity_id_activities_id_fk";
ALTER TABLE "activity_efforts" ADD CONSTRAINT "activity_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;
