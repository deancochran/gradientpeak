-- This file is declared autocommit in migration-ledger.json.
-- CREATE INDEX CONCURRENTLY cannot run inside an explicit transaction.
create index concurrently idx_events_planned_day_summary
  on public.events using btree (profile_id, scheduled_date, starts_at, id, activity_plan_id)
  where event_type = 'planned' and status in ('scheduled', 'completed');
