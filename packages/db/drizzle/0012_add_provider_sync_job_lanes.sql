ALTER TABLE "provider_sync_jobs" ADD COLUMN IF NOT EXISTS "operation" text;
ALTER TABLE "provider_sync_jobs" ADD COLUMN IF NOT EXISTS "sync_lane_key" text;
ALTER TABLE "provider_sync_jobs" ADD COLUMN IF NOT EXISTS "payload_hash" text;
ALTER TABLE "provider_sync_jobs" ADD COLUMN IF NOT EXISTS "supersedes_job_id" uuid;

UPDATE "provider_sync_jobs"
SET "operation" = CASE
  WHEN "job_type" LIKE '%.publish_%' THEN 'publish'
  WHEN "job_type" LIKE '%.unsync_%' THEN 'unsync'
  WHEN "job_type" LIKE '%.activity_history_%' THEN 'reconcile'
  ELSE "operation"
END
WHERE "operation" IS NULL;

UPDATE "provider_sync_jobs"
SET "sync_lane_key" = concat("provider"::text, ':', "integration_id"::text, ':', COALESCE("resource_kind"::text, 'resource'), ':', COALESCE("internal_resource_id"::text, "job_type"))
WHERE "sync_lane_key" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_provider_sync_jobs_lane_status" ON "provider_sync_jobs" USING btree ("sync_lane_key", "status", "run_at");
