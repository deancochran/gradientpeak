-- Disconnect is a durable lifecycle, not a destructive local delete. Defaults make
-- existing integrations/jobs active at generation one without a table rewrite.
alter table public.integrations
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists generation integer not null default 1,
  add column if not exists disconnect_requested_at timestamp with time zone,
  add column if not exists disconnected_at timestamp with time zone,
  add column if not exists remote_revoked_at timestamp with time zone,
  add constraint integrations_lifecycle_status_check
    check (lifecycle_status in ('active', 'disconnect_pending', 'disconnected')) not valid,
  add constraint integrations_generation_positive_check check (generation > 0) not valid,
  add constraint integrations_disconnect_timestamps_check
    check (
      (lifecycle_status = 'active' and disconnect_requested_at is null and disconnected_at is null)
      or (lifecycle_status = 'disconnect_pending' and disconnect_requested_at is not null and disconnected_at is null)
      or (lifecycle_status = 'disconnected' and disconnect_requested_at is not null and disconnected_at is not null)
    ) not valid;

alter table public.provider_sync_jobs
  add column if not exists integration_generation integer not null default 1,
  add constraint provider_sync_jobs_integration_generation_positive_check
    check (integration_generation > 0) not valid;

create index if not exists idx_provider_sync_jobs_integration_generation_status
  on public.provider_sync_jobs (integration_id, integration_generation, status);

alter table public.provider_webhook_receipts
  add column if not exists integration_generation integer,
  add constraint provider_webhook_receipts_integration_generation_pair_check
    check ((integration_id is null) = (integration_generation is null)) not valid,
  add constraint provider_webhook_receipts_integration_generation_positive_check
    check (integration_generation is null or integration_generation > 0) not valid;

create index if not exists idx_provider_webhook_receipts_integration_generation_status
  on public.provider_webhook_receipts (integration_id, integration_generation, processing_status)
  where integration_id is not null;
