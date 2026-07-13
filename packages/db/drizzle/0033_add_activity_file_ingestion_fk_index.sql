-- Keep this advisor index separate from the RLS/ACL repair. The bounded lock
-- timeout avoids waiting indefinitely for activity ingestion writes. Reassess
-- whether CONCURRENTLY is required from production size/write evidence before apply.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_file_ingestions_activity_profile" ON "activity_file_ingestions" USING btree ("activity_id", "profile_id");
