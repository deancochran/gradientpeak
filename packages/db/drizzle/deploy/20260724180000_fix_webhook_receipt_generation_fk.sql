-- The immutable receipt generation is paired with integration_id. SET NULL would
-- violate that invariant when an integration is deleted; delete the owned receipt
-- instead of leaving a half-bound durable record.
alter table public.provider_webhook_receipts
  drop constraint if exists provider_webhook_receipts_integration_id_integrations_id_fk;

alter table public.provider_webhook_receipts
  add constraint provider_webhook_receipts_integration_id_integrations_id_fk
  foreign key (integration_id) references public.integrations(id) on delete cascade;
