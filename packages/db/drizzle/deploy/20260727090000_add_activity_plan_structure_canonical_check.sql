-- These structural helpers deliberately mirror the persisted V3 envelope. The Core
-- preflight remains the exact deployment authority; this constraint prevents malformed
-- rows from being introduced between those guarded migration checks.
create function public.activity_plan_jsonb_has_exact_keys(
  input jsonb,
  required_keys text[],
  optional_keys text[] default '{}'::text[]
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_typeof(input) = 'object'
    and required_keys <@ array(select pg_catalog.jsonb_object_keys(input))
    and array(select pg_catalog.jsonb_object_keys(input)) <@ (required_keys || optional_keys)
$$;

create function public.activity_plan_jsonb_is_uuid(input jsonb)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select pg_catalog.jsonb_typeof(input) = 'string'
    and input #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

create function public.activity_plan_jsonb_is_string(input jsonb, minimum integer, maximum integer)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select pg_catalog.jsonb_typeof(input) = 'string'
    and pg_catalog.char_length(input #>> '{}') between minimum and maximum
$$;

create function public.activity_plan_jsonb_is_integer_between(input jsonb, minimum numeric, maximum numeric)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select pg_catalog.jsonb_typeof(input) = 'number'
    and (input #>> '{}')::numeric = pg_catalog.trunc((input #>> '{}')::numeric)
    and (input #>> '{}')::numeric between minimum and maximum
$$;

create function public.activity_plan_target_is_canonical(input jsonb, activity_category text)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select public.activity_plan_jsonb_has_exact_keys(input, array['type', 'intensity'])
    and pg_catalog.jsonb_typeof(input -> 'type') = 'string'
    and pg_catalog.jsonb_typeof(input -> 'intensity') = 'number'
    and case input ->> 'type'
      when '%FTP' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 300 and activity_category = 'bike'
      when '%MaxHR' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 200 and activity_category in ('run', 'bike', 'swim', 'other')
      when '%ThresholdHR' then (input ->> 'intensity')::numeric > 0 and (input ->> 'intensity')::numeric <= 200 and activity_category in ('run', 'bike', 'swim')
      when 'watts' then (input ->> 'intensity')::numeric between 0 and 3000 and activity_category = 'bike'
      when 'bpm' then (input ->> 'intensity')::numeric between 30 and 250 and activity_category in ('run', 'bike', 'swim', 'other')
      when 'speed' then (input ->> 'intensity')::numeric between 0 and 100 and activity_category = 'run'
      when 'cadence' then (input ->> 'intensity')::numeric between 0 and 300 and activity_category in ('run', 'bike')
      when 'RPE' then (input ->> 'intensity')::numeric between 1 and 10
      else false
    end
$$;

create function public.activity_plan_duration_is_canonical(input jsonb, rest_only boolean default false)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select case input ->> 'type'
    when 'time' then public.activity_plan_jsonb_has_exact_keys(input, array['type', 'seconds'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'seconds', 1, 86400)
    when 'distance' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type', 'meters'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'meters', 1, 1000000)
    when 'repetitions' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type', 'count'])
      and public.activity_plan_jsonb_is_integer_between(input -> 'count', 1, 10000)
    when 'untilFinished' then not rest_only and public.activity_plan_jsonb_has_exact_keys(input, array['type'])
    else false
  end
$$;

create function public.activity_plan_segment_is_canonical(input jsonb)
returns boolean language sql immutable parallel safe security invoker set search_path = pg_catalog as $$
  select case input ->> 'role'
    when 'rest' then public.activity_plan_jsonb_has_exact_keys(input, array['id', 'name', 'role', 'duration'], array['notes'])
      and public.activity_plan_jsonb_is_uuid(input -> 'id')
      and public.activity_plan_jsonb_is_string(input -> 'name', 1, 100)
      and (input -> 'notes' is null or public.activity_plan_jsonb_is_string(input -> 'notes', 0, 1000))
      and public.activity_plan_duration_is_canonical(input -> 'duration', true)
    when 'activity' then public.activity_plan_jsonb_has_exact_keys(input, array['id', 'name', 'role', 'activity_category', 'intervals'], array['notes'])
      and public.activity_plan_jsonb_is_uuid(input -> 'id')
      and public.activity_plan_jsonb_is_string(input -> 'name', 1, 100)
      and (input -> 'notes' is null or public.activity_plan_jsonb_is_string(input -> 'notes', 0, 1000))
      and input ->> 'activity_category' in ('run', 'bike', 'swim', 'strength', 'other')
      and pg_catalog.jsonb_typeof(input -> 'intervals') = 'array'
      and pg_catalog.jsonb_array_length(input -> 'intervals') between 1 and 50
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(input -> 'intervals') interval_value
        where not public.activity_plan_jsonb_has_exact_keys(interval_value, array['id', 'name', 'repetitions', 'steps'], array['notes'])
          or not public.activity_plan_jsonb_is_uuid(interval_value -> 'id')
          or not public.activity_plan_jsonb_is_string(interval_value -> 'name', 1, 100)
          or not public.activity_plan_jsonb_is_integer_between(interval_value -> 'repetitions', 1, 50)
          or (interval_value -> 'notes' is not null and not public.activity_plan_jsonb_is_string(interval_value -> 'notes', 0, 1000))
          or pg_catalog.jsonb_typeof(interval_value -> 'steps') <> 'array'
          or pg_catalog.jsonb_array_length(interval_value -> 'steps') not between 1 and 20
          or exists (
            select 1 from pg_catalog.jsonb_array_elements(interval_value -> 'steps') step_value
            where not public.activity_plan_jsonb_has_exact_keys(step_value, array['id', 'name', 'duration', 'targets'], array['description', 'notes'])
              or not public.activity_plan_jsonb_is_uuid(step_value -> 'id')
              or not public.activity_plan_jsonb_is_string(step_value -> 'name', 1, 100)
              or (step_value -> 'description' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'description', 0, 500))
              or (step_value -> 'notes' is not null and not public.activity_plan_jsonb_is_string(step_value -> 'notes', 0, 1000))
              or not public.activity_plan_duration_is_canonical(step_value -> 'duration')
              or pg_catalog.jsonb_typeof(step_value -> 'targets') <> 'array'
              or pg_catalog.jsonb_array_length(step_value -> 'targets') not between 1 and 3
              or exists (
                select 1 from pg_catalog.jsonb_array_elements(step_value -> 'targets') target_value
                where not public.activity_plan_target_is_canonical(target_value, input ->> 'activity_category')
              )
          )
      )
    else false
  end
$$;

-- Document-wide constraints are kept separate from per-value shape checks above.
create function public.activity_plan_structure_is_canonical(input jsonb)
returns boolean language plpgsql immutable parallel safe security invoker set search_path = pg_catalog as $$
declare
  segment_value jsonb;
  interval_value jsonb;
  step_value jsonb;
  seen_ids text[] := '{}'::text[];
  activity_category text;
  activity_category_value text;
  prior_was_rest boolean := false;
  activity_count integer := 0;
  expanded_occurrences numeric := 0;
  explicit_timed_seconds numeric := 0;
  id_value text;
begin
  -- jsonb::text inserts canonical whitespace that JSON.stringify does not. Core's
  -- 1 MiB UTF-8 limit remains exact; this coarser database guard leaves bounded
  -- serialization headroom so a Core-valid document is not rejected here.
  if input is null
    or pg_catalog.octet_length(input::text) > 1200000
    or not public.activity_plan_jsonb_has_exact_keys(input, array['version', 'segments'])
    or input -> 'version' <> '3'::jsonb
    or pg_catalog.jsonb_typeof(input -> 'segments') <> 'array'
    or pg_catalog.jsonb_array_length(input -> 'segments') not between 1 and 64 then return false; end if;
  for segment_value in select value from pg_catalog.jsonb_array_elements(input -> 'segments') loop
    if not public.activity_plan_segment_is_canonical(segment_value) then return false; end if;
    id_value := segment_value ->> 'id';
    if id_value = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids, id_value);
    if segment_value ->> 'role' = 'rest' then
      if prior_was_rest then return false; end if;
      prior_was_rest := true;
      explicit_timed_seconds := explicit_timed_seconds + (segment_value -> 'duration' ->> 'seconds')::numeric;
    else
      prior_was_rest := false;
      activity_count := activity_count + 1;
      activity_category_value := segment_value ->> 'activity_category';
      if activity_category is null then activity_category := activity_category_value; elsif activity_category <> activity_category_value then return false; end if;
      for interval_value in select value from pg_catalog.jsonb_array_elements(segment_value -> 'intervals') loop
        id_value := interval_value ->> 'id';
        if id_value = any(seen_ids) then return false; end if;
        seen_ids := array_append(seen_ids, id_value);
        expanded_occurrences := expanded_occurrences + pg_catalog.jsonb_array_length(interval_value -> 'steps') * (interval_value ->> 'repetitions')::numeric;
        for step_value in select value from pg_catalog.jsonb_array_elements(interval_value -> 'steps') loop
          id_value := step_value ->> 'id';
          if id_value = any(seen_ids) then return false; end if;
          seen_ids := array_append(seen_ids, id_value);
          if step_value -> 'duration' ->> 'type' = 'time' then
            explicit_timed_seconds := explicit_timed_seconds + (step_value -> 'duration' ->> 'seconds')::numeric * (interval_value ->> 'repetitions')::numeric;
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  return activity_count > 0 and expanded_occurrences <= 1000 and explicit_timed_seconds <= 604800;
end
$$;

revoke all on function public.activity_plan_jsonb_has_exact_keys(jsonb, text[], text[]) from public;
revoke all on function public.activity_plan_jsonb_is_uuid(jsonb) from public;
revoke all on function public.activity_plan_jsonb_is_string(jsonb, integer, integer) from public;
revoke all on function public.activity_plan_jsonb_is_integer_between(jsonb, numeric, numeric) from public;
revoke all on function public.activity_plan_target_is_canonical(jsonb, text) from public;
revoke all on function public.activity_plan_duration_is_canonical(jsonb, boolean) from public;
revoke all on function public.activity_plan_segment_is_canonical(jsonb) from public;
revoke all on function public.activity_plan_structure_is_canonical(jsonb) from public;
grant execute on function public.activity_plan_jsonb_has_exact_keys(jsonb, text[], text[]) to service_role;
grant execute on function public.activity_plan_jsonb_is_uuid(jsonb) to service_role;
grant execute on function public.activity_plan_jsonb_is_string(jsonb, integer, integer) to service_role;
grant execute on function public.activity_plan_jsonb_is_integer_between(jsonb, numeric, numeric) to service_role;
grant execute on function public.activity_plan_target_is_canonical(jsonb, text) to service_role;
grant execute on function public.activity_plan_duration_is_canonical(jsonb, boolean) to service_role;
grant execute on function public.activity_plan_segment_is_canonical(jsonb) to service_role;
grant execute on function public.activity_plan_structure_is_canonical(jsonb) to service_role;

do $$
declare
  invalid_count bigint;
begin
  select count(*)
    into invalid_count
    from public.activity_plans
   where not public.activity_plan_structure_is_canonical(structure);

  if invalid_count <> 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'ActivityPlan canonical-structure migration aborted: %s offending row(s) require explicit environment reset or cleanup before retrying.',
        invalid_count
      ),
      hint = 'Do not delete, detach, rewrite, or preserve noncanonical ActivityPlans through this migration.';
  end if;
end
$$;

alter table public.activity_plans
  add constraint activity_plans_structure_canonical_check
  check (public.activity_plan_structure_is_canonical(structure));
