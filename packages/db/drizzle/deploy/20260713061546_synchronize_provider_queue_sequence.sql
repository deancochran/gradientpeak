-- Keep legacy idx and explicit queue_sequence workers on one immutable order
-- during the expand/soak window. Both defaults have fired before this trigger.
create function public.synchronize_provider_sync_job_queue_sequence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idx is null then
    raise exception 'provider_sync_jobs.idx must be generated during queue sequence coexistence';
  end if;
  new.queue_sequence := new.idx::bigint;
  return new;
end;
$$;

create trigger synchronize_provider_sync_job_queue_sequence
before insert on public.provider_sync_jobs
for each row execute function public.synchronize_provider_sync_job_queue_sequence();
