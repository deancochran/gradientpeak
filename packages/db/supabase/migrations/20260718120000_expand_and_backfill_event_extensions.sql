-- Consolidate one-to-one event extension data onto events. Abort rather than
-- choosing an authority when deployed rows disagree.
alter table public.events
  add column if not exists training_plan_id uuid,
  add column if not exists activity_plan_id uuid,
  add column if not exists linked_activity_id uuid,
  add column if not exists route_id uuid,
  add column if not exists schedule_batch_id uuid,
  add column if not exists source_provider text,
  add column if not exists integration_account_id uuid,
  add column if not exists external_calendar_id text,
  add column if not exists external_event_id text,
  add column if not exists occurrence_key text not null default '',
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_timezone text,
  add column if not exists series_id uuid,
  add column if not exists original_starts_at timestamptz,
  add column if not exists recurrence jsonb;

do $$
begin
  if exists (
    select 1 from public.event_schedule_links c
    left join public.events e on e.id = c.event_id
    where e.id is null or e.profile_id <> c.profile_id
  ) or exists (
    select 1 from public.event_external_links c
    left join public.events e on e.id = c.event_id
    where e.id is null or e.profile_id <> c.profile_id
  ) or exists (
    select 1 from public.event_recurrence c
    left join public.events e on e.id = c.event_id
    where e.id is null or e.profile_id <> c.profile_id
  ) then
    raise exception 'event extension consolidation aborted: orphan or profile mismatch';
  end if;

  if exists (
    select 1 from public.events e join public.event_schedule_links c on c.event_id = e.id
    where (e.training_plan_id is not null and c.training_plan_id is not null and e.training_plan_id <> c.training_plan_id)
       or (e.activity_plan_id is not null and c.activity_plan_id is not null and e.activity_plan_id <> c.activity_plan_id)
       or (e.linked_activity_id is not null and c.linked_activity_id is not null and e.linked_activity_id <> c.linked_activity_id)
       or (e.route_id is not null and c.route_id is not null and e.route_id <> c.route_id)
       or (e.schedule_batch_id is not null and c.schedule_batch_id is not null and e.schedule_batch_id <> c.schedule_batch_id)
  ) then
    raise exception 'event extension consolidation aborted: schedule authority conflict';
  end if;

  if exists (
    select 1 from public.events e join public.event_external_links c on c.event_id = e.id
    where (e.source_provider is not null and c.source_provider is not null and e.source_provider <> c.source_provider)
       or (e.integration_account_id is not null and c.integration_account_id is not null and e.integration_account_id <> c.integration_account_id)
       or (e.external_calendar_id is not null and c.external_calendar_id is not null and e.external_calendar_id <> c.external_calendar_id)
       or (e.external_event_id is not null and c.external_event_id is not null and e.external_event_id <> c.external_event_id)
       or (e.occurrence_key <> '' and e.occurrence_key <> c.occurrence_key)
  ) then
    raise exception 'event extension consolidation aborted: external identity authority conflict';
  end if;

  if exists (
    select 1 from public.events e join public.event_recurrence c on c.event_id = e.id
    where (e.recurrence_rule is not null and c.recurrence_rule is not null and e.recurrence_rule <> c.recurrence_rule)
       or (e.recurrence_timezone is not null and c.recurrence_timezone is not null and e.recurrence_timezone <> c.recurrence_timezone)
       or (e.series_id is not null and c.series_id is not null and e.series_id <> c.series_id)
       or (e.original_starts_at is not null and c.original_starts_at is not null and e.original_starts_at <> c.original_starts_at)
       or (e.recurrence is not null and c.recurrence is not null and e.recurrence is distinct from c.recurrence)
       or (e.occurrence_key <> '' and e.occurrence_key <> c.occurrence_key)
  ) then
    raise exception 'event extension consolidation aborted: recurrence authority conflict';
  end if;

  if exists (
    select 1 from public.event_external_links x
    join public.event_recurrence r using (event_id)
    where x.occurrence_key <> r.occurrence_key
  ) then
    raise exception 'event extension consolidation aborted: occurrence_key identity conflict';
  end if;
end $$;

update public.events e set
  training_plan_id = coalesce(e.training_plan_id, c.training_plan_id),
  activity_plan_id = coalesce(e.activity_plan_id, c.activity_plan_id),
  linked_activity_id = coalesce(e.linked_activity_id, c.linked_activity_id),
  route_id = coalesce(e.route_id, c.route_id),
  schedule_batch_id = coalesce(e.schedule_batch_id, c.schedule_batch_id)
from public.event_schedule_links c where c.event_id = e.id;

update public.events e set
  source_provider = coalesce(e.source_provider, c.source_provider),
  integration_account_id = coalesce(e.integration_account_id, c.integration_account_id),
  external_calendar_id = coalesce(e.external_calendar_id, c.external_calendar_id),
  external_event_id = coalesce(e.external_event_id, c.external_event_id),
  occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
from public.event_external_links c where c.event_id = e.id;

update public.events e set
  recurrence_rule = coalesce(e.recurrence_rule, c.recurrence_rule),
  recurrence_timezone = coalesce(e.recurrence_timezone, c.recurrence_timezone),
  series_id = coalesce(e.series_id, c.series_id),
  original_starts_at = coalesce(e.original_starts_at, c.original_starts_at),
  recurrence = coalesce(e.recurrence, c.recurrence),
  occurrence_key = coalesce(nullif(e.occurrence_key, ''), c.occurrence_key, '')
from public.event_recurrence c where c.event_id = e.id;

do $$
declare
  constraint_spec record;
  actual_definition text;
  expected_definition text;
begin
  for constraint_spec in
    select * from (values
      ('events_training_plan_id_fkey', 'foreign key (training_plan_id) references public.training_plans(id) on delete set null not valid'),
      ('events_activity_plan_id_fkey', 'foreign key (activity_plan_id) references public.activity_plans(id) on delete set null not valid'),
      ('events_linked_activity_id_fkey', 'foreign key (linked_activity_id) references public.activities(id) not valid'),
      ('events_route_id_fkey', 'foreign key (route_id) references public.activity_routes(id) not valid'),
      ('events_integration_account_id_fkey', 'foreign key (integration_account_id) references public.integrations(id) not valid'),
      ('events_series_id_fkey', 'foreign key (series_id) references public.events(id) not valid'),
      ('events_external_calendar_non_empty', 'check (external_calendar_id is null or btrim(external_calendar_id) <> '''') not valid'),
      ('events_external_event_non_empty', 'check (external_event_id is null or btrim(external_event_id) <> '''') not valid'),
      ('events_source_provider_non_empty', 'check (source_provider is null or btrim(source_provider) <> '''') not valid'),
      ('events_source_identity_complete', 'check ((source_provider is null and integration_account_id is null and external_calendar_id is null and external_event_id is null) or (source_provider is not null and integration_account_id is not null and external_calendar_id is not null and external_event_id is not null)) not valid'),
      ('events_recurrence_rule_non_empty', 'check (recurrence_rule is null or btrim(recurrence_rule) <> '''') not valid'),
      ('events_recurrence_timezone_non_empty', 'check (recurrence_timezone is null or btrim(recurrence_timezone) <> '''') not valid'),
      ('events_recurrence_timezone_requires_rule', 'check (recurrence_timezone is null or recurrence_rule is not null) not valid'),
      ('events_series_occurrence_key_required', 'check (series_id is null or btrim(occurrence_key) <> '''') not valid'),
      ('events_series_not_self', 'check (series_id is null or series_id <> id) not valid')
    ) as specifications(constraint_name, definition)
  loop
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.events'::regclass
        and conname = constraint_spec.constraint_name
    ) then
      execute format(
        'alter table public.events add constraint __event_consolidation_expected %s',
        constraint_spec.definition
      );
      select pg_get_constraintdef(oid) into actual_definition
      from pg_constraint
      where conrelid = 'public.events'::regclass
        and conname = constraint_spec.constraint_name;
      select pg_get_constraintdef(oid) into expected_definition
      from pg_constraint
      where conrelid = 'public.events'::regclass
        and conname = '__event_consolidation_expected';
      alter table public.events drop constraint __event_consolidation_expected;

      if actual_definition is distinct from expected_definition then
        execute format('alter table public.events drop constraint %I', constraint_spec.constraint_name);
      end if;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.events'::regclass
        and conname = constraint_spec.constraint_name
    ) then
      execute format(
        'alter table public.events add constraint %I %s',
        constraint_spec.constraint_name,
        constraint_spec.definition
      );
    end if;
  end loop;
end $$;

do $$
declare
  constraint_name text;
begin
  foreach constraint_name in array array[
    'events_training_plan_id_fkey',
    'events_activity_plan_id_fkey',
    'events_linked_activity_id_fkey',
    'events_route_id_fkey',
    'events_integration_account_id_fkey',
    'events_series_id_fkey',
    'events_external_calendar_non_empty',
    'events_external_event_non_empty',
    'events_source_provider_non_empty',
    'events_source_identity_complete',
    'events_recurrence_rule_non_empty',
    'events_recurrence_timezone_non_empty',
    'events_recurrence_timezone_requires_rule',
    'events_series_occurrence_key_required',
    'events_series_not_self'
  ] loop
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.events'::regclass
        and conname = constraint_name
        and not convalidated
    ) then
      execute format('alter table public.events validate constraint %I', constraint_name);
    end if;
  end loop;
end $$;

do $$
declare
  index_spec record;
  actual_definition text;
  expected_definition text;
begin
  for index_spec in
    select * from (values
      ('idx_events_external_identity_unique', 'create unique index __event_consolidation_expected_index on public.events(source_provider, integration_account_id, external_calendar_id, external_event_id, occurrence_key) where source_provider is not null and integration_account_id is not null and external_calendar_id is not null and external_event_id is not null'),
      ('idx_events_series_occurrence_unique', 'create unique index __event_consolidation_expected_index on public.events(series_id, occurrence_key) where series_id is not null'),
      ('idx_events_training_plan_id', 'create index __event_consolidation_expected_index on public.events(training_plan_id) where training_plan_id is not null'),
      ('idx_events_activity_plan_id', 'create index __event_consolidation_expected_index on public.events(activity_plan_id) where activity_plan_id is not null'),
      ('idx_events_linked_activity_id', 'create index __event_consolidation_expected_index on public.events(linked_activity_id) where linked_activity_id is not null'),
      ('idx_events_route_id', 'create index __event_consolidation_expected_index on public.events(route_id) where route_id is not null'),
      ('idx_events_schedule_batch', 'create index __event_consolidation_expected_index on public.events(profile_id, schedule_batch_id) where schedule_batch_id is not null'),
      ('idx_events_integration_calendar_updated', 'create index __event_consolidation_expected_index on public.events(integration_account_id, external_calendar_id, updated_at) where integration_account_id is not null and external_calendar_id is not null')
    ) as specifications(index_name, definition)
  loop
    if to_regclass('public.' || index_spec.index_name) is not null then
      execute index_spec.definition;
      select regexp_replace(pg_get_indexdef(to_regclass('public.' || index_spec.index_name)), 'INDEX [^ ]+ ON', 'INDEX ON')
        into actual_definition;
      select regexp_replace(pg_get_indexdef('public.__event_consolidation_expected_index'::regclass), 'INDEX [^ ]+ ON', 'INDEX ON')
        into expected_definition;
      drop index public.__event_consolidation_expected_index;

      if actual_definition is distinct from expected_definition then
        execute format('drop index public.%I', index_spec.index_name);
      end if;
    end if;

    if to_regclass('public.' || index_spec.index_name) is null then
      execute replace(index_spec.definition, '__event_consolidation_expected_index', index_spec.index_name);
    end if;
  end loop;
end $$;
