-- Canonicalize persisted activity-effort units before narrowing the durable contract.
-- Values are scaled with their legacy unit; aliases are never merely relabelled.
do $$
begin
  if exists (
    select 1
    from public.activity_efforts
    where not (
      (effort_type = 'power' and lower(btrim(unit)) in ('w', 'watt', 'watts', 'kw', 'kilowatt', 'kilowatts'))
      or (effort_type = 'speed' and lower(btrim(unit)) in (
        'm/s', 'meters_per_second', 'mps', 'meterpersecond', 'meterspersecond',
        'km/h', 'kph', 'kmh', 'kilometersperhour', 'mph', 'milesperhour'
      ))
      or (effort_type::text = 'heart_rate' and lower(btrim(unit)) in ('bpm', 'beatsperminute', 'beats_per_minute'))
    )
  ) then
    raise exception 'activity_efforts contains an unknown or incompatible effort unit';
  end if;
end $$;

update public.activity_efforts
set
  value = case lower(btrim(unit))
    when 'kw' then value * 1000
    when 'kilowatt' then value * 1000
    when 'kilowatts' then value * 1000
    when 'km/h' then value / 3.6
    when 'kph' then value / 3.6
    when 'kmh' then value / 3.6
    when 'kilometersperhour' then value / 3.6
    when 'mph' then value * 0.44704
    when 'milesperhour' then value * 0.44704
    else value
  end,
  unit = case
    when effort_type = 'power' then 'watts'
    when effort_type = 'speed' then 'meters_per_second'
    when effort_type::text = 'heart_rate' then 'bpm'
  end;

do $$
begin
  if exists (
    select 1
    from public.activity_efforts
    where (effort_type = 'power' and unit <> 'watts')
       or (effort_type = 'speed' and unit <> 'meters_per_second')
       or (effort_type::text = 'heart_rate' and unit <> 'bpm')
  ) then
    raise exception 'activity_efforts unit canonicalization did not converge';
  end if;
end $$;

alter table public.activity_efforts
  drop constraint if exists activity_efforts_unit_compatibility_check,
  add constraint activity_efforts_unit_compatibility_check
    check (
      (activity_category = 'bike' and effort_type = 'power' and unit = 'watts')
      or (activity_category in ('run', 'swim') and effort_type = 'speed' and unit = 'meters_per_second')
      or (effort_type::text = 'heart_rate' and unit = 'bpm')
    );
