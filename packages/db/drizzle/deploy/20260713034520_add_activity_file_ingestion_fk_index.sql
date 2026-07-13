-- Keep this advisor index separate from the RLS/ACL repair. The bounded lock
-- timeout avoids waiting indefinitely for activity ingestion writes. Reassess
-- whether concurrently is required from production size/write evidence before apply.
set local lock_timeout = '5s';

create index if not exists idx_activity_file_ingestions_activity_profile
  on public.activity_file_ingestions (activity_id, profile_id);
