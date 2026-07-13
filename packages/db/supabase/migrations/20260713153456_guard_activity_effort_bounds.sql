-- Keep these constraints NOT VALID until historical outliers (including known
-- 4240 W efforts) can be reviewed. PostgreSQL still enforces NOT VALID check
-- constraints for new or updated rows without scanning or rewriting old data.
-- Historical rows that violate any guard cannot receive metadata-only updates
-- until their stored effort fields are remediated in a separately approved flow.
alter table public.activity_efforts
  add constraint activity_efforts_duration_seconds_bounds_check
    check (duration_seconds between 1 and 14400) not valid,
  add constraint activity_efforts_value_finite_positive_check
    check (
      (
        value > 0
        and value not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real)
      )
      or (
        value = 0
        and activity_id is null
        and activity_category = 'bike'
        and effort_type = 'power'
        and source = 'manual'
        and method = 'profile_update_override'
        and provenance ->> 'override_state' = 'cleared'
      )
    ) not valid,
  add constraint activity_efforts_supported_combination_check
    check (
      (activity_category = 'bike' and effort_type = 'power')
      or (activity_category in ('run', 'swim') and effort_type = 'speed')
    ) not valid,
  add constraint activity_efforts_unit_compatibility_check
    check (
      (
        activity_category = 'bike'
        and effort_type = 'power'
        and unit in ('watts', 'W')
      )
      or (
        activity_category in ('run', 'swim')
        and effort_type = 'speed'
        and unit in ('meters_per_second', 'm/s')
      )
    ) not valid,
  add constraint activity_efforts_bike_power_max_check
    check (activity_category <> 'bike' or effort_type <> 'power' or value <= 3000) not valid,
  add constraint activity_efforts_run_speed_bounds_check
    check (
      activity_category <> 'run'
      or effort_type <> 'speed'
      or (value >= 0.3 and value <= 13)
    ) not valid,
  add constraint activity_efforts_swim_speed_bounds_check
    check (
      activity_category <> 'swim'
      or effort_type <> 'speed'
      or (value >= 0.1 and value <= 3)
    ) not valid;
