ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "training_plan_id" uuid,
  ADD COLUMN IF NOT EXISTS "activity_plan_id" uuid,
  ADD COLUMN IF NOT EXISTS "linked_activity_id" uuid,
  ADD COLUMN IF NOT EXISTS "route_id" uuid,
  ADD COLUMN IF NOT EXISTS "schedule_batch_id" uuid,
  ADD COLUMN IF NOT EXISTS "source_provider" text,
  ADD COLUMN IF NOT EXISTS "integration_account_id" uuid,
  ADD COLUMN IF NOT EXISTS "external_calendar_id" text,
  ADD COLUMN IF NOT EXISTS "external_event_id" text,
  ADD COLUMN IF NOT EXISTS "occurrence_key" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "recurrence_rule" text,
  ADD COLUMN IF NOT EXISTS "recurrence_timezone" text,
  ADD COLUMN IF NOT EXISTS "series_id" uuid,
  ADD COLUMN IF NOT EXISTS "original_starts_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "recurrence" jsonb;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM event_schedule_links c LEFT JOIN events e ON e.id = c.event_id
    WHERE e.id IS NULL OR e.profile_id <> c.profile_id
  ) OR EXISTS (
    SELECT 1 FROM event_external_links c LEFT JOIN events e ON e.id = c.event_id
    WHERE e.id IS NULL OR e.profile_id <> c.profile_id
  ) OR EXISTS (
    SELECT 1 FROM event_recurrence c LEFT JOIN events e ON e.id = c.event_id
    WHERE e.id IS NULL OR e.profile_id <> c.profile_id
  ) THEN RAISE EXCEPTION 'event extension consolidation aborted: orphan or profile mismatch'; END IF;

  IF EXISTS (
    SELECT 1 FROM events e JOIN event_schedule_links c ON c.event_id = e.id
    WHERE (e.training_plan_id IS NOT NULL AND c.training_plan_id IS NOT NULL AND e.training_plan_id <> c.training_plan_id)
       OR (e.activity_plan_id IS NOT NULL AND c.activity_plan_id IS NOT NULL AND e.activity_plan_id <> c.activity_plan_id)
       OR (e.linked_activity_id IS NOT NULL AND c.linked_activity_id IS NOT NULL AND e.linked_activity_id <> c.linked_activity_id)
       OR (e.route_id IS NOT NULL AND c.route_id IS NOT NULL AND e.route_id <> c.route_id)
       OR (e.schedule_batch_id IS NOT NULL AND c.schedule_batch_id IS NOT NULL AND e.schedule_batch_id <> c.schedule_batch_id)
  ) THEN RAISE EXCEPTION 'event extension consolidation aborted: schedule authority conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM events e JOIN event_external_links c ON c.event_id = e.id
    WHERE (e.source_provider IS NOT NULL AND c.source_provider IS NOT NULL AND e.source_provider <> c.source_provider)
       OR (e.integration_account_id IS NOT NULL AND c.integration_account_id IS NOT NULL AND e.integration_account_id <> c.integration_account_id)
       OR (e.external_calendar_id IS NOT NULL AND c.external_calendar_id IS NOT NULL AND e.external_calendar_id <> c.external_calendar_id)
       OR (e.external_event_id IS NOT NULL AND c.external_event_id IS NOT NULL AND e.external_event_id <> c.external_event_id)
       OR (e.occurrence_key <> '' AND e.occurrence_key <> c.occurrence_key)
  ) THEN RAISE EXCEPTION 'event extension consolidation aborted: external identity authority conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM events e JOIN event_recurrence c ON c.event_id = e.id
    WHERE (e.recurrence_rule IS NOT NULL AND c.recurrence_rule IS NOT NULL AND e.recurrence_rule <> c.recurrence_rule)
       OR (e.recurrence_timezone IS NOT NULL AND c.recurrence_timezone IS NOT NULL AND e.recurrence_timezone <> c.recurrence_timezone)
       OR (e.series_id IS NOT NULL AND c.series_id IS NOT NULL AND e.series_id <> c.series_id)
       OR (e.original_starts_at IS NOT NULL AND c.original_starts_at IS NOT NULL AND e.original_starts_at <> c.original_starts_at)
       OR (e.recurrence IS NOT NULL AND c.recurrence IS NOT NULL AND e.recurrence IS DISTINCT FROM c.recurrence)
       OR (e.occurrence_key <> '' AND e.occurrence_key <> c.occurrence_key)
  ) OR EXISTS (
    SELECT 1 FROM event_external_links x JOIN event_recurrence r USING (event_id)
    WHERE x.occurrence_key <> r.occurrence_key
  ) THEN RAISE EXCEPTION 'event extension consolidation aborted: recurrence or occurrence identity conflict'; END IF;
END $$;
--> statement-breakpoint
UPDATE events e SET
  training_plan_id = coalesce(e.training_plan_id, c.training_plan_id),
  activity_plan_id = coalesce(e.activity_plan_id, c.activity_plan_id),
  linked_activity_id = coalesce(e.linked_activity_id, c.linked_activity_id),
  route_id = coalesce(e.route_id, c.route_id),
  schedule_batch_id = coalesce(e.schedule_batch_id, c.schedule_batch_id)
FROM event_schedule_links c WHERE c.event_id = e.id;
--> statement-breakpoint
UPDATE events e SET
  source_provider = coalesce(e.source_provider, c.source_provider),
  integration_account_id = coalesce(e.integration_account_id, c.integration_account_id),
  external_calendar_id = coalesce(e.external_calendar_id, c.external_calendar_id),
  external_event_id = coalesce(e.external_event_id, c.external_event_id),
  occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
FROM event_external_links c WHERE c.event_id = e.id;
--> statement-breakpoint
UPDATE events e SET
  recurrence_rule = coalesce(e.recurrence_rule, c.recurrence_rule),
  recurrence_timezone = coalesce(e.recurrence_timezone, c.recurrence_timezone),
  series_id = coalesce(e.series_id, c.series_id),
  original_starts_at = coalesce(e.original_starts_at, c.original_starts_at),
  recurrence = coalesce(e.recurrence, c.recurrence),
  occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
FROM event_recurrence c WHERE c.event_id = e.id;
--> statement-breakpoint
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_training_plan_id_fkey,
  DROP CONSTRAINT IF EXISTS events_activity_plan_id_fkey,
  DROP CONSTRAINT IF EXISTS events_linked_activity_id_fkey,
  DROP CONSTRAINT IF EXISTS events_route_id_fkey,
  DROP CONSTRAINT IF EXISTS events_integration_account_id_fkey,
  DROP CONSTRAINT IF EXISTS events_series_id_fkey,
  DROP CONSTRAINT IF EXISTS events_external_calendar_non_empty,
  DROP CONSTRAINT IF EXISTS events_external_event_non_empty,
  DROP CONSTRAINT IF EXISTS events_source_provider_non_empty,
  DROP CONSTRAINT IF EXISTS events_source_identity_complete,
  DROP CONSTRAINT IF EXISTS events_recurrence_rule_non_empty,
  DROP CONSTRAINT IF EXISTS events_recurrence_timezone_non_empty,
  DROP CONSTRAINT IF EXISTS events_recurrence_timezone_requires_rule,
  DROP CONSTRAINT IF EXISTS events_series_occurrence_key_required,
  DROP CONSTRAINT IF EXISTS events_series_not_self;
--> statement-breakpoint
ALTER TABLE events
  ADD CONSTRAINT events_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES training_plans(id) ON DELETE SET NULL,
  ADD CONSTRAINT events_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES activity_plans(id) ON DELETE SET NULL,
  ADD CONSTRAINT events_linked_activity_id_fkey FOREIGN KEY (linked_activity_id) REFERENCES activities(id),
  ADD CONSTRAINT events_route_id_fkey FOREIGN KEY (route_id) REFERENCES activity_routes(id),
  ADD CONSTRAINT events_integration_account_id_fkey FOREIGN KEY (integration_account_id) REFERENCES integrations(id),
  ADD CONSTRAINT events_series_id_fkey FOREIGN KEY (series_id) REFERENCES events(id),
  ADD CONSTRAINT events_external_calendar_non_empty CHECK (external_calendar_id IS NULL OR btrim(external_calendar_id) <> ''),
  ADD CONSTRAINT events_external_event_non_empty CHECK (external_event_id IS NULL OR btrim(external_event_id) <> ''),
  ADD CONSTRAINT events_source_provider_non_empty CHECK (source_provider IS NULL OR btrim(source_provider) <> ''),
  ADD CONSTRAINT events_source_identity_complete CHECK ((source_provider IS NULL AND integration_account_id IS NULL AND external_calendar_id IS NULL AND external_event_id IS NULL) OR (source_provider IS NOT NULL AND integration_account_id IS NOT NULL AND external_calendar_id IS NOT NULL AND external_event_id IS NOT NULL)),
  ADD CONSTRAINT events_recurrence_rule_non_empty CHECK (recurrence_rule IS NULL OR btrim(recurrence_rule) <> ''),
  ADD CONSTRAINT events_recurrence_timezone_non_empty CHECK (recurrence_timezone IS NULL OR btrim(recurrence_timezone) <> ''),
  ADD CONSTRAINT events_recurrence_timezone_requires_rule CHECK (recurrence_timezone IS NULL OR recurrence_rule IS NOT NULL),
  ADD CONSTRAINT events_series_occurrence_key_required CHECK (series_id IS NULL OR btrim(occurrence_key) <> ''),
  ADD CONSTRAINT events_series_not_self CHECK (series_id IS NULL OR series_id <> id);
--> statement-breakpoint
DROP INDEX IF EXISTS idx_events_external_identity_unique;
DROP INDEX IF EXISTS idx_events_series_occurrence_unique;
DROP INDEX IF EXISTS idx_events_training_plan_id;
DROP INDEX IF EXISTS idx_events_activity_plan_id;
DROP INDEX IF EXISTS idx_events_linked_activity_id;
DROP INDEX IF EXISTS idx_events_route_id;
DROP INDEX IF EXISTS idx_events_schedule_batch;
DROP INDEX IF EXISTS idx_events_integration_calendar_updated;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_events_external_identity_unique ON events(source_provider, integration_account_id, external_calendar_id, external_event_id, occurrence_key) WHERE source_provider IS NOT NULL AND integration_account_id IS NOT NULL AND external_calendar_id IS NOT NULL AND external_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_events_series_occurrence_unique ON events(series_id, occurrence_key) WHERE series_id IS NOT NULL;
CREATE INDEX idx_events_training_plan_id ON events(training_plan_id) WHERE training_plan_id IS NOT NULL;
CREATE INDEX idx_events_activity_plan_id ON events(activity_plan_id) WHERE activity_plan_id IS NOT NULL;
CREATE INDEX idx_events_linked_activity_id ON events(linked_activity_id) WHERE linked_activity_id IS NOT NULL;
CREATE INDEX idx_events_route_id ON events(route_id) WHERE route_id IS NOT NULL;
CREATE INDEX idx_events_schedule_batch ON events(profile_id, schedule_batch_id) WHERE schedule_batch_id IS NOT NULL;
CREATE INDEX idx_events_integration_calendar_updated ON events(integration_account_id, external_calendar_id, updated_at) WHERE integration_account_id IS NOT NULL AND external_calendar_id IS NOT NULL;
