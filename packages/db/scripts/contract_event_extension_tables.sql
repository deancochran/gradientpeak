-- NOT AUTO-APPLIED. Future quiescent contract phase; no CASCADE is intentional.
-- STOP CONDITION: do not run until every legacy event/iCal/provider worker is drained,
-- event writes are paused, and the parent-authority application is deployed everywhere.
select pg_advisory_xact_lock(hashtextextended('gradientpeak.event-extension-cutover', 0));
lock table public.events, public.event_schedule_links, public.event_external_links, public.event_recurrence in access exclusive mode;

-- Abort if a legacy child received a conflicting write after the one-time backfill.
do $$
begin
  if exists (
    select 1 from public.events e join public.event_schedule_links c on c.event_id = e.id
    where (e.training_plan_id is not null and c.training_plan_id is not null and e.training_plan_id <> c.training_plan_id)
       or (e.activity_plan_id is not null and c.activity_plan_id is not null and e.activity_plan_id <> c.activity_plan_id)
       or (e.linked_activity_id is not null and c.linked_activity_id is not null and e.linked_activity_id <> c.linked_activity_id)
       or (e.route_id is not null and c.route_id is not null and e.route_id <> c.route_id)
       or (e.schedule_batch_id is not null and c.schedule_batch_id is not null and e.schedule_batch_id <> c.schedule_batch_id)
  ) or exists (
    select 1 from public.events e join public.event_external_links c on c.event_id = e.id
    where (e.source_provider is not null and c.source_provider is not null and e.source_provider <> c.source_provider)
       or (e.integration_account_id is not null and c.integration_account_id is not null and e.integration_account_id <> c.integration_account_id)
       or (e.external_calendar_id is not null and c.external_calendar_id is not null and e.external_calendar_id <> c.external_calendar_id)
       or (e.external_event_id is not null and c.external_event_id is not null and e.external_event_id <> c.external_event_id)
       or (e.occurrence_key <> '' and e.occurrence_key <> c.occurrence_key)
  ) or exists (
    select 1 from public.events e join public.event_recurrence c on c.event_id = e.id
    where (e.recurrence_rule is not null and c.recurrence_rule is not null and e.recurrence_rule <> c.recurrence_rule)
       or (e.recurrence_timezone is not null and c.recurrence_timezone is not null and e.recurrence_timezone <> c.recurrence_timezone)
       or (e.series_id is not null and c.series_id is not null and e.series_id <> c.series_id)
       or (e.original_starts_at is not null and c.original_starts_at is not null and e.original_starts_at <> c.original_starts_at)
       or (e.recurrence is not null and c.recurrence is not null and e.recurrence is distinct from c.recurrence)
       or (e.occurrence_key <> '' and e.occurrence_key <> c.occurrence_key)
  ) then
    raise exception 'event extension contract aborted: parent/child authority conflict';
  end if;
end $$;

-- Final reconciliation fills only missing parent values; parent authority never loses.
update public.events e set
  training_plan_id = coalesce(e.training_plan_id, c.training_plan_id), activity_plan_id = coalesce(e.activity_plan_id, c.activity_plan_id),
  linked_activity_id = coalesce(e.linked_activity_id, c.linked_activity_id), route_id = coalesce(e.route_id, c.route_id),
  schedule_batch_id = coalesce(e.schedule_batch_id, c.schedule_batch_id)
from public.event_schedule_links c where c.event_id = e.id;
update public.events e set
  source_provider = coalesce(e.source_provider, c.source_provider), integration_account_id = coalesce(e.integration_account_id, c.integration_account_id),
  external_calendar_id = coalesce(e.external_calendar_id, c.external_calendar_id), external_event_id = coalesce(e.external_event_id, c.external_event_id),
  occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
from public.event_external_links c where c.event_id = e.id;
update public.events e set
  recurrence_rule = coalesce(e.recurrence_rule, c.recurrence_rule), recurrence_timezone = coalesce(e.recurrence_timezone, c.recurrence_timezone),
  series_id = coalesce(e.series_id, c.series_id), original_starts_at = coalesce(e.original_starts_at, c.original_starts_at),
  recurrence = coalesce(e.recurrence, c.recurrence), occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
from public.event_recurrence c where c.event_id = e.id;

drop table public.event_schedule_links;
drop table public.event_external_links;
drop table public.event_recurrence;
