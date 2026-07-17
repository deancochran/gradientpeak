-- Supports bounded activity-plan category containment predicates without indexing
-- unrelated scalar projections from the plan structure.
set local lock_timeout = '5s';

create index if not exists idx_activity_plans_structure_categories
  on public.activity_plans using gin (structure jsonb_path_ops);
