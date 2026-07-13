-- constrain profile preferred units
do $$
declare
  invalid_values text;
begin
  select string_agg(distinct preferred_units, ', ' order by preferred_units)
    into invalid_values
  from public.profiles
  where preferred_units is not null
    and preferred_units not in ('metric', 'imperial');

  if invalid_values is not null then
    raise exception 'profiles.preferred_units has unexpected nonnull values: %', invalid_values;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_preferred_units_check
  check (preferred_units is null or preferred_units in ('metric', 'imperial'));
