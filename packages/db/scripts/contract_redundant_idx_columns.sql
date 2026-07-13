-- NOT AUTO-APPLIED. Future quiescent contract phase; no CASCADE is intentional.
-- STOP CONDITION: do not run until writes are paused, every old client/worker
-- that reads or writes idx has been retired, and the compatibility soak has
-- completed. The operator must set both transaction-local acknowledgements.
do $$
begin
  if current_setting('gradientpeak.idx_contract_writes_quiesced', true) is distinct from 'on'
    or current_setting('gradientpeak.idx_contract_old_clients_soaked', true) is distinct from 'on'
  then
    raise exception 'idx contract aborted: quiescence and old-client soak acknowledgements are required';
  end if;
end $$;

select pg_advisory_xact_lock(hashtextextended('gradientpeak.redundant-idx-contract', 0));
lock table
  public.activities,
  public.activity_plans,
  public.activity_routes,
  public.events,
  public.integration_resource_links,
  public.integrations,
  public.oauth_states,
  public.profiles,
  public.provider_sync_jobs,
  public.provider_sync_state,
  public.provider_webhook_receipts,
  public.training_plans
in access exclusive mode;

-- Abort unless the complete reviewed transition inventory is present and no
-- undeclared public idx column exists. profile_metrics.idx is substantive and
-- deliberately excluded from the contract set.
do $$
declare
  expected_tables constant text[] := array[
    'activities', 'activity_plans', 'activity_routes', 'events',
    'integration_resource_links', 'integrations', 'oauth_states', 'profiles',
    'provider_sync_jobs', 'provider_sync_state', 'provider_webhook_receipts',
    'training_plans'
  ];
  actual_tables text[];
begin
  select array_agg(table_name order by table_name) into actual_tables
  from information_schema.columns
  where table_schema = 'public' and column_name = 'idx' and table_name <> 'profile_metrics';

  if actual_tables is distinct from expected_tables then
    raise exception 'idx contract inventory mismatch: expected %, found %', expected_tables, actual_tables;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_metrics' and column_name = 'idx'
  ) then
    raise exception 'idx contract aborted: substantive profile_metrics.idx is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_sync_jobs'
      and column_name = 'queue_sequence' and data_type = 'bigint'
      and is_identity = 'YES' and identity_generation = 'BY DEFAULT'
  ) then
    raise exception 'idx contract aborted: provider queue_sequence identity is incomplete';
  end if;
end $$;

-- The coexistence trigger depends on idx and must be retired atomically with
-- the old-client contract. Rebase the surviving identity before dropping idx.
drop trigger synchronize_provider_sync_job_queue_sequence on public.provider_sync_jobs;
drop function public.synchronize_provider_sync_job_queue_sequence();
select pg_catalog.setval(
  pg_catalog.pg_get_serial_sequence('public.provider_sync_jobs', 'queue_sequence'),
  greatest(coalesce((select max(queue_sequence) from public.provider_sync_jobs), 0), 1),
  exists (select 1 from public.provider_sync_jobs)
);

alter table public.integrations drop constraint integrations_idx_unique;
alter table public.oauth_states drop constraint oauth_states_idx_unique;
drop index public.activities_idx_key;
drop index public.activity_plans_idx_key;
drop index public.activity_routes_idx_key;
drop index public.events_idx_key;
drop index public.integration_resource_links_idx_key;
drop index public.provider_sync_jobs_idx_key;
drop index public.provider_sync_state_idx_key;
drop index public.provider_webhook_receipts_idx_key;
drop index public.training_plans_idx_key;

alter table public.activities alter column idx drop default;
alter table public.activity_plans alter column idx drop default;
alter table public.activity_routes alter column idx drop default;
alter table public.events alter column idx drop default;
alter table public.integration_resource_links alter column idx drop default;
alter table public.integrations alter column idx drop default;
alter table public.oauth_states alter column idx drop default;
alter table public.provider_sync_jobs alter column idx drop default;
alter table public.provider_sync_state alter column idx drop default;
alter table public.provider_webhook_receipts alter column idx drop default;
alter table public.training_plans alter column idx drop default;

alter sequence public.activities_idx_seq owned by none;
alter sequence public.activity_plans_idx_seq owned by none;
alter sequence public.activity_routes_idx_seq owned by none;
alter sequence public.events_idx_seq owned by none;
alter sequence public.integration_resource_links_idx_seq owned by none;
alter sequence public.integrations_idx_seq owned by none;
alter sequence public.oauth_states_idx_seq owned by none;
alter sequence public.provider_sync_jobs_idx_seq owned by none;
alter sequence public.provider_sync_state_idx_seq owned by none;
alter sequence public.provider_webhook_receipts_idx_seq owned by none;
alter sequence public.training_plans_idx_seq owned by none;

drop sequence public.activities_idx_seq;
drop sequence public.activity_plans_idx_seq;
drop sequence public.activity_routes_idx_seq;
drop sequence public.events_idx_seq;
drop sequence public.integration_resource_links_idx_seq;
drop sequence public.integrations_idx_seq;
drop sequence public.oauth_states_idx_seq;
drop sequence public.provider_sync_jobs_idx_seq;
drop sequence public.provider_sync_state_idx_seq;
drop sequence public.provider_webhook_receipts_idx_seq;
drop sequence public.training_plans_idx_seq;

alter table public.activities drop column idx;
alter table public.activity_plans drop column idx;
alter table public.activity_routes drop column idx;
alter table public.events drop column idx;
alter table public.integration_resource_links drop column idx;
alter table public.integrations drop column idx;
alter table public.oauth_states drop column idx;
alter table public.profiles drop column idx;
alter table public.provider_sync_jobs drop column idx;
alter table public.provider_sync_state drop column idx;
alter table public.provider_webhook_receipts drop column idx;
alter table public.training_plans drop column idx;

-- Final catalog fingerprint: only the declared substantive idx remains, every
-- transitional relation is gone, and the explicit provider order survives.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and column_name = 'idx' and table_name <> 'profile_metrics'
  ) then
    raise exception 'idx contract final fingerprint failed: redundant idx column remains';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (c.relname like '%\_idx\_seq' escape '\' and c.relname <> 'profile_metrics_idx_seq')
  ) then
    raise exception 'idx contract final fingerprint failed: redundant idx sequence remains';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public'
      and tablename = 'provider_sync_jobs'
      and indexname = 'provider_sync_jobs_queue_sequence_key'
  ) then
    raise exception 'idx contract final fingerprint failed: queue_sequence index is missing';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.provider_sync_jobs'::regclass
      and tgname = 'synchronize_provider_sync_job_queue_sequence'
      and not tgisinternal
  ) then
    raise exception 'idx contract final fingerprint failed: queue coexistence trigger remains';
  end if;
end $$;
