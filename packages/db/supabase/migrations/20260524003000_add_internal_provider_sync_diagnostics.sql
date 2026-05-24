create schema if not exists internal;

revoke all on schema internal from public;
revoke all on schema internal from anon;
revoke all on schema internal from authenticated;
grant usage on schema internal to service_role;

create or replace view internal.provider_sync_job_summary
with (security_invoker = true) as
select
  provider,
  status,
  count(*)::bigint as job_count,
  min(run_at) as next_run_at,
  max(updated_at) as last_updated_at,
  count(*) filter (where locked_at is not null and lock_expires_at > now())::bigint as locked_count,
  count(*) filter (where last_error is not null)::bigint as error_count
from public.provider_sync_jobs
group by provider, status;

create or replace view internal.provider_sync_state_summary
with (security_invoker = true) as
select
  provider,
  resource,
  sync_mode,
  count(*)::bigint as state_count,
  min(next_sync_at) as next_sync_at,
  max(last_sync_succeeded_at) as last_success_at,
  max(last_sync_failed_at) as last_failure_at,
  max(consecutive_failures) as max_consecutive_failures
from public.provider_sync_state
group by provider, resource, sync_mode;

revoke all on internal.provider_sync_job_summary from public;
revoke all on internal.provider_sync_job_summary from anon;
revoke all on internal.provider_sync_job_summary from authenticated;
grant select on internal.provider_sync_job_summary to service_role;

revoke all on internal.provider_sync_state_summary from public;
revoke all on internal.provider_sync_state_summary from anon;
revoke all on internal.provider_sync_state_summary from authenticated;
grant select on internal.provider_sync_state_summary to service_role;
