-- Repair any rows inserted between the queue_sequence expansion and the
-- coexistence trigger. The legacy idx unique contract makes this remap safe.
do $$
begin
  lock table public.provider_sync_jobs in access exclusive mode;
  drop index public.provider_sync_jobs_queue_sequence_key;
  update public.provider_sync_jobs
  set queue_sequence = idx::bigint
  where queue_sequence is distinct from idx::bigint;
  perform pg_catalog.setval(
    pg_catalog.pg_get_serial_sequence('public.provider_sync_jobs', 'queue_sequence'),
    greatest(coalesce((select max(queue_sequence) from public.provider_sync_jobs), 0), 1),
    exists (select 1 from public.provider_sync_jobs)
  );
  create unique index provider_sync_jobs_queue_sequence_key
    on public.provider_sync_jobs using btree (queue_sequence);
end;
$$;
