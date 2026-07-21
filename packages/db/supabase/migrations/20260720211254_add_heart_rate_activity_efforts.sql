-- Expand duration-curve evidence to heart rate and optional fixed distances.
-- Cast the new enum value to text in same-migration constraints because PostgreSQL
-- does not allow a newly added enum value to be used as an enum literal until commit.
alter type public.effort_type add value if not exists 'heart_rate';

alter table public.activity_efforts
  add column distance_meters integer;

alter table public.activity_efforts
  drop constraint activity_efforts_supported_combination_check,
  drop constraint activity_efforts_unit_compatibility_check,
  add constraint activity_efforts_distance_meters_bounds_check
    check (distance_meters is null or distance_meters between 1 and 1000000) not valid,
  add constraint activity_efforts_supported_combination_check
    check (
      (activity_category = 'bike' and effort_type = 'power')
      or (activity_category in ('run', 'swim') and effort_type = 'speed')
      or (activity_category in ('bike', 'run', 'swim') and effort_type::text = 'heart_rate')
    ) not valid,
  add constraint activity_efforts_unit_compatibility_check
    check (
      (activity_category = 'bike' and effort_type = 'power' and unit in ('watts', 'W'))
      or (activity_category in ('run', 'swim') and effort_type = 'speed' and unit in ('meters_per_second', 'm/s'))
      or (effort_type::text = 'heart_rate' and unit in ('bpm', 'beats_per_minute'))
    ) not valid,
  add constraint activity_efforts_heart_rate_bounds_check
    check (effort_type::text <> 'heart_rate' or value between 30 and 240) not valid;

alter table public.activity_efforts
  validate constraint activity_efforts_distance_meters_bounds_check,
  validate constraint activity_efforts_supported_combination_check,
  validate constraint activity_efforts_unit_compatibility_check,
  validate constraint activity_efforts_heart_rate_bounds_check;
