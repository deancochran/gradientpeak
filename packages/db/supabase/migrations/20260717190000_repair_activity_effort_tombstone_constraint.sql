-- Repair databases where the hard cut replaced the bounded zero-tombstone
-- exception with an unconditionally positive effort-value constraint.
alter table public.activity_efforts
  drop constraint if exists activity_efforts_value_finite_positive_check,
  add constraint activity_efforts_value_finite_positive_check
    check (
      (value > 0 and value not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real))
      or (
        value = 0
        and activity_id is null
        and activity_category = 'bike'
        and effort_type = 'power'
        and source = 'manual'
        and method = 'profile_update_override'
        and provenance ->> 'override_state' = 'cleared'
      )
    ) not valid;

alter table public.activity_efforts
  validate constraint activity_efforts_value_finite_positive_check;
