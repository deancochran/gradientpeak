-- Provider accounts are globally owned. Do not merge, delete, or reassign
-- legacy rows here: an operator must resolve any conflict deliberately.
do $$
declare
  duplicate_group_count integer;
begin
  select count(*) into duplicate_group_count
  from (
    select 1
    from public.integrations
    where external_id is not null
    group by provider, external_id
    having count(*) > 1
    limit 10
  ) duplicate_groups;

  if duplicate_group_count > 0 then
    raise exception
      'cannot enforce provider account ownership: detected % duplicate provider-account group(s) (details redacted)',
      duplicate_group_count;
  end if;
end
$$;

create unique index integrations_provider_external_id_unique
  on public.integrations (provider, external_id)
  where external_id is not null;
