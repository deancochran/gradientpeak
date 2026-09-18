BEGIN;

-- Separate current-authoring authority. Do not tighten the historical validator:
-- old rows and captured resolution manifests have a different compatibility contract.
-- activity-plan-authoring:functions:start
CREATE OR REPLACE FUNCTION public.activity_plan_js_trim(input text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT btrim(input, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_utf16_key(input text)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE code_point integer; hex_key text := '';
BEGIN
  FOR position IN 1..char_length(input) LOOP
    code_point := ascii(substr(input, position, 1));
    IF code_point > 65535 THEN
      code_point := code_point - 65536;
      hex_key := hex_key || lpad(to_hex(55296 + code_point / 1024),4,'0') || lpad(to_hex(56320 + mod(code_point,1024)),4,'0');
    ELSE hex_key := hex_key || lpad(to_hex(code_point),4,'0'); END IF;
  END LOOP;
  RETURN decode(hex_key,'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_js_length(input text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT char_length(input) + count(*) FILTER (WHERE ascii(substr(input, position, 1)) > 65535)::integer
  FROM generate_series(1,char_length(input)) AS position
$$;

-- Core uses JSON.stringify on finite IEEE-754 numbers. Select the shortest
-- round-tripping decimal precision from the exact IEEE-754 binary rational
-- (ties to an even significand), then apply
-- ECMAScript's fixed/exponent thresholds. Merely copying float8::text is wrong
-- for values such as -61346878300597980, where PostgreSQL prints ...97984.
CREATE OR REPLACE FUNCTION public.activity_plan_js_number(input jsonb)
RETURNS text LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog SET extra_float_digits = 3 AS $$
DECLARE number_value double precision; rendered text; digits text; sign text := '';
  exact_decimal numeric; candidate numeric; other_candidate numeric; unit_value numeric; truncated numeric;
  exponent_value integer; scale_value integer; binary_exponent integer; power_exponent integer;
  binary_value bytea; significand numeric; power_factor numeric; power_result numeric := 1;
  matched boolean := false;
BEGIN
  number_value := (input #>> '{}')::double precision;
  IF number_value = 0 THEN RETURN '0'; END IF;
  IF number_value::text IN ('Infinity','-Infinity','NaN') THEN RAISE EXCEPTION 'non-finite canonical JSON number' USING ERRCODE='22003'; END IF;
  rendered := number_value::text;
  binary_value := float8send(abs(number_value));
  binary_exponent := (get_byte(binary_value,0) & 127) * 16 + get_byte(binary_value,1) / 16;
  significand := get_byte(binary_value,1) & 15;
  FOR byte_index IN 2..7 LOOP significand := significand * 256 + get_byte(binary_value,byte_index); END LOOP;
  IF binary_exponent = 0 THEN binary_exponent := -1074;
  ELSE significand := significand + 4503599627370496; binary_exponent := binary_exponent - 1075; END IF;
  power_factor := CASE WHEN binary_exponent < 0 THEN 5 ELSE 2 END;
  power_exponent := abs(binary_exponent);
  WHILE power_exponent > 0 LOOP
    IF mod(power_exponent,2) = 1 THEN power_result := power_result * power_factor; END IF;
    power_exponent := power_exponent / 2;
    IF power_exponent > 0 THEN power_factor := power_factor * power_factor; END IF;
  END LOOP;
  exact_decimal := significand * power_result;
  IF binary_exponent < 0 THEN exact_decimal := (exact_decimal::text || 'e' || binary_exponent::text)::numeric; END IF;
  IF number_value < 0 THEN exact_decimal := -exact_decimal; END IF;
  IF strpos(rendered,'e') > 0 THEN exponent_value := split_part(rendered,'e',2)::integer;
  ELSE
    rendered := ltrim(rendered,'-');
    IF split_part(rendered,'.',1) <> '0' THEN exponent_value := length(split_part(rendered,'.',1))-1;
    ELSE digits := split_part(rendered,'.',2); exponent_value := -(length(digits)-length(ltrim(digits,'0'))+1); END IF;
  END IF;
  FOR precision_value IN 1..17 LOOP
    scale_value := precision_value-exponent_value-1;
    unit_value := ('1e' || (-scale_value)::text)::numeric;
    candidate := round(exact_decimal,scale_value); truncated := trunc(exact_decimal,scale_value);
    IF abs(exact_decimal-truncated) = unit_value/2 AND mod(abs(truncated/unit_value),2) = 0 THEN candidate := truncated; END IF;
    IF abs(candidate) <= 1.7976931348623157e308::numeric AND candidate::double precision = number_value THEN matched := true; EXIT; END IF;
    -- At a binary exponent boundary the round-trip interval is asymmetric.
    -- Check the other decimal neighbor as well before increasing precision.
    other_candidate := candidate + CASE WHEN candidate < exact_decimal THEN unit_value ELSE -unit_value END;
    IF abs(other_candidate) <= 1.7976931348623157e308::numeric AND other_candidate::double precision = number_value THEN candidate := other_candidate; matched := true; EXIT; END IF;
  END LOOP;
  IF NOT matched THEN RAISE EXCEPTION 'unable to canonicalize finite JavaScript number' USING ERRCODE='22003'; END IF;
  rendered := abs(candidate)::text;
  IF strpos(rendered,'.') > 0 THEN rendered := rtrim(rtrim(rendered,'0'),'.'); END IF;
  IF candidate < 0 THEN sign := '-'; END IF;
  IF abs(candidate) >= 0.000001 AND abs(candidate) < 1e21::numeric THEN RETURN sign || rendered; END IF;
  IF split_part(rendered,'.',1) <> '0' THEN exponent_value := length(split_part(rendered,'.',1))-1;
  ELSE digits := split_part(rendered,'.',2); exponent_value := -(length(digits)-length(ltrim(digits,'0'))+1); END IF;
  digits := rtrim(ltrim(replace(rendered,'.',''),'0'),'0');
  RETURN sign || left(digits,1) || CASE WHEN length(digits)>1 THEN '.' || substr(digits,2) ELSE '' END
    || 'e' || CASE WHEN exponent_value >= 0 THEN '+' ELSE '-' END || abs(exponent_value)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_canonical_json(input jsonb)
RETURNS text LANGUAGE plpgsql STABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE result text := ''; entry record; separator text := '';
BEGIN
  CASE jsonb_typeof(input)
    WHEN 'object' THEN
      -- JS enumerates array-index properties numerically, then the remaining
      -- keys in the UTF-16 order established by normalizeCanonicalJson().
      FOR entry IN SELECT e.key, e.value FROM jsonb_each(input) e
        ORDER BY CASE WHEN e.key ~ '^(0|[1-9][0-9]{0,9})$' THEN CASE WHEN e.key::bigint < 4294967295 THEN e.key::bigint ELSE 4294967295 END ELSE 4294967295 END,
          public.activity_plan_utf16_key(e.key)
      LOOP
        result := result || separator || to_jsonb(entry.key)::text || ':' || public.activity_plan_core_canonical_json(entry.value); separator := ',';
      END LOOP;
      RETURN '{' || result || '}';
    WHEN 'array' THEN
      FOR entry IN SELECT value FROM jsonb_array_elements(input) LOOP
        result := result || separator || public.activity_plan_core_canonical_json(entry.value); separator := ',';
      END LOOP;
      RETURN '[' || result || ']';
    WHEN 'number' THEN RETURN public.activity_plan_js_number(input);
    ELSE RETURN input::text;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_normalize_adaptation(input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE result jsonb := input; control jsonb; state_value jsonb; values_value jsonb; ordinal integer;
BEGIN
  IF input IS NULL OR input = 'null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  FOR control, ordinal IN SELECT value, ordinality::integer-1 FROM jsonb_array_elements(input->'controls') WITH ORDINALITY LOOP
    control := jsonb_set(control,'{key}',to_jsonb(public.activity_plan_js_trim(control->>'key')));
    control := jsonb_set(control,'{label}',to_jsonb(public.activity_plan_js_trim(control->>'label')));
    result := jsonb_set(result,ARRAY['controls',ordinal::text],control);
  END LOOP;
  IF input ? 'allowedStates' THEN
    FOR state_value, ordinal IN SELECT value, ordinality::integer-1 FROM jsonb_array_elements(input->'allowedStates') WITH ORDINALITY LOOP
      state_value := jsonb_set(state_value,'{label}',to_jsonb(public.activity_plan_js_trim(state_value->>'label')));
      SELECT jsonb_object_agg(public.activity_plan_js_trim(e.key),e.value) INTO values_value FROM jsonb_each(state_value->'values') e;
      state_value := jsonb_set(state_value,'{values}',values_value);
      result := jsonb_set(result,ARRAY['allowedStates',ordinal::text],state_value);
    END LOOP;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_structure_hash(input jsonb)
RETURNS text LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT 'v1:sha256:' || encode(sha256(convert_to(public.activity_plan_core_canonical_json(input),'UTF8')),'hex')
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_core_semantic_hash(input jsonb, adaptation jsonb, intent text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT public.activity_plan_core_structure_hash(jsonb_build_object('structure',input,'adaptation',public.activity_plan_core_normalize_adaptation(adaptation),'training_intent',intent))
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_structure_is_valid(input jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  historical jsonb := input;
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  si integer; ii integer; ti integer; category text; duration_type text;
  types text[]; objective_count integer; intensity numeric;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR octet_length(input::text) > 1200000
    OR jsonb_typeof(input->'segments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(input->'segments') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
  category := input->>'activity_category';
  FOR segment, si IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(input->'segments') WITH ORDINALITY LOOP
    IF segment->>'role' = 'activity' THEN
      IF jsonb_typeof(segment->'intervals') IS DISTINCT FROM 'array' OR jsonb_array_length(segment->'intervals') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
      FOR interval_value, ii IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY LOOP
        IF jsonb_typeof(interval_value->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(interval_value->'steps') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
        FOR step_value, ti IN SELECT value, ordinality::integer - 1 FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY LOOP
          IF step_value->>'purpose' IS NULL OR step_value->>'purpose' NOT IN ('warmup','work','recovery','cooldown','technique') THEN RETURN false; END IF;
          duration_type := step_value->'duration'->>'type';
          IF duration_type IS NULL OR NOT (
            duration_type = 'time'
            OR (duration_type = 'distance' AND category IN ('run','bike','swim'))
            OR (duration_type = 'repetitions' AND category = 'strength')
          ) THEN RETURN false; END IF;
          IF jsonb_typeof(step_value->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(step_value->'targets') NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
          IF duration_type = 'repetitions' AND (jsonb_array_length(step_value->'targets') <> 1 OR step_value->'targets'->0->>'type' IS DISTINCT FROM 'RPE') THEN RETURN false; END IF;
          types := '{}'; objective_count := 0;
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            IF target->>'type' = ANY(types) THEN RETURN false; END IF;
            types := array_append(types, target->>'type');
            IF target->>'type' NOT IN ('RPE','cadence') THEN objective_count := objective_count + 1; END IF;
            intensity := (target->>'intensity')::numeric;
            IF target->>'type' = 'RPE' AND (intensity NOT BETWEEN 1 AND 10 OR mod(intensity * 2, 1) <> 0) THEN RETURN false; END IF;
            IF target->>'type' = '%MaxHR' AND intensity > 100 THEN RETURN false; END IF;
            IF duration_type = 'distance' AND target->>'type' = 'speed' AND intensity <= 0 THEN RETURN false; END IF;
          END LOOP;
          IF objective_count > 1 OR (objective_count = 0 AND NOT ('RPE' = ANY(types))) THEN RETURN false; END IF;
          -- The historical SQL shape predates optional purpose. Strip only that
          -- field in a copy, then reuse its bounded structural/type validation.
          historical := jsonb_set(historical, ARRAY['segments',si::text,'intervals',ii::text,'steps',ti::text], step_value - 'purpose');
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN public.activity_plan_structure_is_canonical(historical) IS TRUE;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_intent_is_valid(input jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  segment jsonb; interval_value jsonb; step_value jsonb; target jsonb;
  work_count numeric := 0; work_seconds numeric := 0; recovery_seconds numeric := 0;
  seconds numeric; repeats numeric; intensity numeric;
  high_intensity boolean := false; threshold_intensity boolean := false; technique boolean := false;
BEGIN
  IF intent IS NULL OR intent NOT IN ('recovery','aerobic_base','durable_endurance','threshold_development','race_specific','vo2max','anaerobic_capacity','muscular_endurance','speed_skill','technique','strength_support','general_maintenance') THEN RETURN false; END IF;
  FOR segment IN SELECT value FROM jsonb_array_elements(input->'segments') LOOP
    IF segment->>'role' = 'rest' THEN recovery_seconds := recovery_seconds + (segment->'duration'->>'seconds')::numeric;
    ELSE
      FOR interval_value IN SELECT value FROM jsonb_array_elements(segment->'intervals') LOOP
        repeats := (interval_value->>'repetitions')::numeric;
        FOR step_value IN SELECT value FROM jsonb_array_elements(interval_value->'steps') LOOP
          seconds := CASE WHEN step_value->'duration'->>'type' = 'time' THEN (step_value->'duration'->>'seconds')::numeric * repeats ELSE 0 END;
          IF step_value->>'purpose' = 'work' THEN work_count := work_count + repeats; work_seconds := work_seconds + seconds;
          ELSIF step_value->>'purpose' = 'recovery' THEN recovery_seconds := recovery_seconds + seconds;
          ELSIF step_value->>'purpose' = 'technique' THEN technique := true; END IF;
          FOR target IN SELECT value FROM jsonb_array_elements(step_value->'targets') LOOP
            intensity := (target->>'intensity')::numeric;
            high_intensity := high_intensity OR CASE target->>'type'
              WHEN '%FTP' THEN intensity >= 105 WHEN '%ThresholdHR' THEN intensity >= 100
              WHEN '%MaxHR' THEN intensity >= 90 WHEN 'RPE' THEN intensity >= 8 ELSE false END;
            threshold_intensity := threshold_intensity OR CASE target->>'type'
              WHEN '%FTP' THEN intensity BETWEEN 88 AND 105 WHEN '%ThresholdHR' THEN intensity BETWEEN 95 AND 105
              WHEN '%MaxHR' THEN intensity BETWEEN 80 AND 95 WHEN 'RPE' THEN intensity >= 6 ELSE false END;
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  IF intent IN ('vo2max','threshold_development','anaerobic_capacity','speed_skill') AND work_count = 0 THEN RETURN false; END IF;
  IF intent IN ('vo2max','threshold_development','anaerobic_capacity') AND work_seconds > 0 AND recovery_seconds > 0 AND work_seconds / recovery_seconds < 0.5 THEN RETURN false; END IF;
  RETURN NOT ((intent = 'vo2max' AND NOT high_intensity) OR (intent = 'threshold_development' AND NOT threshold_intensity)
    OR (intent = 'recovery' AND high_intensity) OR (intent = 'technique' AND NOT technique));
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_uuid_is_valid(input jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_typeof(input) = 'string' AND (input #>> '{}') ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$', false)
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_authoring_content_is_valid(input jsonb, adaptation jsonb, intent text)
RETURNS boolean LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
DECLARE
  control jsonb; target jsonb; range_value jsonb; state_value jsonb; values_value jsonb;
  segment jsonb; interval_value jsonb; step_value jsonb;
  bindings jsonb := '[]'::jsonb; binding jsonb; owners jsonb := '{}'::jsonb; defaults jsonb := '{}'::jsonb;
  ranges jsonb := '{}'::jsonb; states jsonb := '[{}]'::jsonb; next_states jsonb; seen_states jsonb := '[]'::jsonb;
  keys text[] := '{}'::text[]; control_ids text[] := '{}'::text[]; state_ids text[] := '{}'::text[];
  key text; kind text; unit_key text; first_unit text; quantity text; field_path text[];
  minimum numeric; maximum numeric; default_value numeric; increment numeric; steps double precision;
  state_count numeric := 1; cardinality integer; amount numeric;
  si integer; ii integer; ti integer; target_index integer; matches integer;
  resolved jsonb; has_default boolean := false; entry record;
BEGIN
  IF NOT public.activity_plan_authoring_structure_is_valid(input) OR NOT public.activity_plan_authoring_intent_is_valid(input, intent) THEN RETURN false; END IF;
  IF adaptation IS NULL OR adaptation = 'null'::jsonb THEN RETURN true; END IF;
  IF public.activity_plan_jsonb_has_exact_keys(adaptation, ARRAY['controls'], ARRAY['allowedStates']) IS NOT TRUE
    OR jsonb_typeof(adaptation->'controls') IS DISTINCT FROM 'array'
    OR jsonb_array_length(adaptation->'controls') NOT BETWEEN 1 AND 32 THEN RETURN false; END IF;
  FOR control IN SELECT value FROM jsonb_array_elements(adaptation->'controls') LOOP
    IF public.activity_plan_jsonb_has_exact_keys(control, ARRAY['id','key','label','kind','range','targets']) IS NOT TRUE
      OR NOT public.activity_plan_authoring_uuid_is_valid(control->'id')
      OR jsonb_typeof(control->'key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(control->'label') IS DISTINCT FROM 'string'
      OR public.activity_plan_js_length(public.activity_plan_js_trim(control->>'label')) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(control->'targets') IS DISTINCT FROM 'array'
      OR jsonb_array_length(control->'targets') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
    key := public.activity_plan_js_trim(control->>'key'); kind := control->>'kind';
    IF public.activity_plan_js_length(key) NOT BETWEEN 1 AND 64 OR key !~ '^[a-z][a-z0-9_]*$' OR key = ANY(keys)
      OR control->>'id' = ANY(control_ids) OR kind IS NULL
      OR kind NOT IN ('interval_repetitions','step_quantity','recovery_quantity','target_intensity') THEN RETURN false; END IF;
    keys := array_append(keys, key); control_ids := array_append(control_ids, control->>'id');
    range_value := control->'range';
    IF public.activity_plan_jsonb_has_exact_keys(range_value, ARRAY['minimum','default','maximum','increment']) IS NOT TRUE
      OR EXISTS (SELECT 1 FROM jsonb_each(range_value) AS r WHERE jsonb_typeof(r.value) <> 'number') THEN RETURN false; END IF;
    minimum := (range_value->>'minimum')::numeric; maximum := (range_value->>'maximum')::numeric;
    default_value := (range_value->>'default')::numeric; increment := (range_value->>'increment')::numeric;
    IF increment <= 0 OR minimum > default_value OR default_value > maximum THEN RETURN false; END IF;
    FOREACH amount IN ARRAY ARRAY[default_value, maximum] LOOP
      -- Core's alignment contract uses IEEE-754 arithmetic after JSON decoding.
      steps := (amount::double precision - minimum::double precision) / increment::double precision;
      IF abs(steps - round(steps)) > 0.000000001 OR abs(round(steps)) > 9007199254740991 THEN RETURN false; END IF;
    END LOOP;
    state_count := state_count * (round((maximum - minimum) / increment) + 1);
    defaults := defaults || jsonb_build_object(key, default_value);
    ranges := ranges || jsonb_build_object(key, range_value);
    first_unit := NULL;
    FOR target IN SELECT value FROM jsonb_array_elements(control->'targets') LOOP
      IF target->>'type' = 'rest_segment' THEN
        IF kind <> 'recovery_quantity' OR public.activity_plan_jsonb_has_exact_keys(target, ARRAY['type','segmentId']) IS NOT TRUE THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO segment, si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id' = target->>'segmentId';
        IF segment IS NULL OR segment->>'role' <> 'rest' THEN RETURN false; END IF;
        field_path := ARRAY['segments',si::text,'duration','seconds']; unit_key := 'time';
      ELSE
        IF public.activity_plan_jsonb_has_exact_keys(target,
          CASE target->>'type'
            WHEN 'interval_repetitions' THEN ARRAY['type','activitySegmentId','intervalId']
            WHEN 'target_intensity' THEN ARRAY['type','activitySegmentId','intervalId','stepId','targetType']
            ELSE ARRAY['type','activitySegmentId','intervalId','stepId','quantityType'] END) IS NOT TRUE THEN RETURN false; END IF;
        IF NOT public.activity_plan_authoring_uuid_is_valid(target->'activitySegmentId') OR NOT public.activity_plan_authoring_uuid_is_valid(target->'intervalId') THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO segment, si FROM jsonb_array_elements(input->'segments') WITH ORDINALITY WHERE value->>'id' = target->>'activitySegmentId';
        IF segment IS NULL OR segment->>'role' <> 'activity' THEN RETURN false; END IF;
        SELECT value, ordinality::integer - 1 INTO interval_value, ii FROM jsonb_array_elements(segment->'intervals') WITH ORDINALITY WHERE value->>'id' = target->>'intervalId';
        IF interval_value IS NULL THEN RETURN false; END IF;
        field_path := ARRAY['segments',si::text,'intervals',ii::text];
        IF target->>'type' = 'interval_repetitions' THEN
          IF kind <> 'interval_repetitions' THEN RETURN false; END IF;
          field_path := field_path || ARRAY['repetitions']; unit_key := 'interval_repetitions';
        ELSE
          IF NOT public.activity_plan_authoring_uuid_is_valid(target->'stepId') THEN RETURN false; END IF;
          SELECT value, ordinality::integer - 1 INTO step_value, ti FROM jsonb_array_elements(interval_value->'steps') WITH ORDINALITY WHERE value->>'id' = target->>'stepId';
          IF step_value IS NULL THEN RETURN false; END IF;
          field_path := field_path || ARRAY['steps',ti::text];
          IF target->>'type' = 'target_intensity' THEN
            IF kind <> 'target_intensity' THEN RETURN false; END IF;
            SELECT count(*) INTO matches FROM jsonb_array_elements(step_value->'targets') AS v WHERE v->>'type' = target->>'targetType';
            IF matches <> 1 THEN RETURN false; END IF;
            SELECT ordinality::integer - 1 INTO target_index FROM jsonb_array_elements(step_value->'targets') WITH ORDINALITY WHERE value->>'type' = target->>'targetType';
            IF public.activity_plan_target_is_canonical(jsonb_build_object('type', target->>'targetType', 'intensity', minimum), input->>'activity_category') IS NOT TRUE
              OR public.activity_plan_target_is_canonical(jsonb_build_object('type', target->>'targetType', 'intensity', maximum), input->>'activity_category') IS NOT TRUE THEN RETURN false; END IF;
            field_path := field_path || ARRAY['targets',target_index::text,'intensity']; unit_key := 'intensity:' || (target->>'targetType');
          ELSE
            IF ((kind = 'step_quantity' AND target->>'type' = 'step_quantity') OR (kind = 'recovery_quantity' AND target->>'type' = 'recovery_step' AND step_value->>'purpose' = 'recovery')) IS NOT TRUE THEN RETURN false; END IF;
            quantity := target->>'quantityType';
            IF quantity IS NULL OR quantity NOT IN ('time','distance','repetitions') OR quantity IS DISTINCT FROM step_value->'duration'->>'type' THEN RETURN false; END IF;
            field_path := field_path || ARRAY['duration', CASE quantity WHEN 'time' THEN 'seconds' WHEN 'distance' THEN 'meters' ELSE 'count' END]; unit_key := quantity;
          END IF;
        END IF;
      END IF;
      IF kind <> 'target_intensity' AND (minimum < 1 OR mod(minimum,1) <> 0 OR mod(maximum,1) <> 0 OR mod(default_value,1) <> 0 OR mod(increment,1) <> 0) THEN RETURN false; END IF;
      IF first_unit IS NOT NULL AND first_unit <> unit_key THEN RETURN false; END IF;
      first_unit := unit_key;
      IF (input #>> field_path)::numeric IS DISTINCT FROM default_value THEN RETURN false; END IF;
      IF owners ? field_path::text AND owners->>field_path::text <> key THEN RETURN false; END IF;
      owners := owners || jsonb_build_object(field_path::text, key);
      bindings := bindings || jsonb_build_array(jsonb_build_object('key',key,'path',to_jsonb(field_path)));
    END LOOP;
  END LOOP;
  IF adaptation ? 'allowedStates' THEN
    IF jsonb_typeof(adaptation->'allowedStates') IS DISTINCT FROM 'array' OR jsonb_array_length(adaptation->'allowedStates') NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF;
    states := '[]'::jsonb;
    FOR state_value IN SELECT value FROM jsonb_array_elements(adaptation->'allowedStates') LOOP
      IF public.activity_plan_jsonb_has_exact_keys(state_value, ARRAY['id','label','values']) IS NOT TRUE
        OR NOT public.activity_plan_authoring_uuid_is_valid(state_value->'id') OR state_value->>'id' = ANY(state_ids)
        OR jsonb_typeof(state_value->'label') IS DISTINCT FROM 'string' OR public.activity_plan_js_length(public.activity_plan_js_trim(state_value->>'label')) NOT BETWEEN 1 AND 100
        OR jsonb_typeof(state_value->'values') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      state_ids := array_append(state_ids, state_value->>'id');
      SELECT coalesce(jsonb_object_agg(public.activity_plan_js_trim(e.key), e.value), '{}'::jsonb) INTO values_value FROM jsonb_each(state_value->'values') e;
      IF public.activity_plan_jsonb_has_exact_keys(values_value, keys) IS NOT TRUE THEN RETURN false; END IF;
      FOR entry IN SELECT * FROM jsonb_each(values_value) LOOP
        IF jsonb_typeof(entry.value) <> 'number' THEN RETURN false; END IF;
        range_value := ranges->entry.key; amount := (entry.value #>> '{}')::numeric;
        minimum := (range_value->>'minimum')::numeric; maximum := (range_value->>'maximum')::numeric; increment := (range_value->>'increment')::numeric;
        steps := (amount::double precision - minimum::double precision) / increment::double precision;
        IF amount < minimum OR amount > maximum OR abs(steps-round(steps)) > 0.000000001 THEN RETURN false; END IF;
      END LOOP;
      IF seen_states @> jsonb_build_array(values_value) THEN RETURN false; END IF;
      seen_states := seen_states || jsonb_build_array(values_value);
      has_default := has_default OR values_value = defaults;
      states := states || jsonb_build_array(values_value);
    END LOOP;
    IF NOT has_default THEN RETURN false; END IF;
  ELSE
    IF state_count > 10000 THEN RETURN false; END IF;
    FOREACH key IN ARRAY keys LOOP
      range_value := ranges->key; minimum := (range_value->>'minimum')::numeric;
      maximum := (range_value->>'maximum')::numeric; increment := (range_value->>'increment')::numeric;
      cardinality := round((maximum - minimum)/increment)::integer + 1;
      next_states := '[]'::jsonb;
      FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP
        FOR offset_index IN 0..cardinality-1 LOOP
          amount := CASE WHEN offset_index = cardinality-1 THEN maximum ELSE minimum + offset_index*increment END;
          next_states := next_states || jsonb_build_array(values_value || jsonb_build_object(key,amount));
        END LOOP;
      END LOOP;
      states := next_states;
    END LOOP;
  END IF;
  FOR values_value IN SELECT value FROM jsonb_array_elements(states) LOOP
    resolved := input;
    FOR binding IN SELECT value FROM jsonb_array_elements(bindings) LOOP
      SELECT array_agg(value) INTO field_path FROM jsonb_array_elements_text(binding->'path');
      resolved := jsonb_set(resolved, field_path, values_value->(binding->>'key'));
    END LOOP;
    IF NOT public.activity_plan_authoring_structure_is_valid(resolved) OR NOT public.activity_plan_authoring_intent_is_valid(resolved,intent) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_authoring()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.structure IS DISTINCT FROM OLD.structure
    OR NEW.adaptation IS DISTINCT FROM OLD.adaptation OR NEW.training_intent IS DISTINCT FROM OLD.training_intent
    OR NEW.structure_hash IS DISTINCT FROM OLD.structure_hash OR NEW.semantic_hash IS DISTINCT FROM OLD.semantic_hash THEN
    IF public.activity_plan_authoring_content_is_valid(NEW.structure, NEW.adaptation, NEW.training_intent) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_authoring_guard',
        MESSAGE = 'ACTIVITY_PLAN_AUTHORING_INVALID_CONTENT';
    END IF;
    IF NEW.structure_hash IS DISTINCT FROM public.activity_plan_core_structure_hash(NEW.structure)
      OR NEW.semantic_hash IS DISTINCT FROM public.activity_plan_core_semantic_hash(NEW.structure,NEW.adaptation,NEW.training_intent) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'activity_plans_hash_guard', MESSAGE = 'ACTIVITY_PLAN_HASH_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_activity_plan_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.structure IS DISTINCT FROM OLD.structure OR NEW.adaptation IS DISTINCT FROM OLD.adaptation
    OR NEW.training_intent IS DISTINCT FROM OLD.training_intent THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;
-- activity-plan-authoring:functions:end

-- Widen the existing shape gate, without scanning or retrofitting historical rows.
-- The authoring trigger below owns inserts and semantic edits; metadata-only
-- changes to historical rows intentionally retain their old compatibility contract.
ALTER TABLE public.activity_plans DROP CONSTRAINT activity_plans_structure_canonical_check;
ALTER TABLE public.activity_plans ADD CONSTRAINT activity_plans_structure_canonical_check
  CHECK (public.activity_plan_structure_is_canonical(structure) OR public.activity_plan_authoring_structure_is_valid(structure)) NOT VALID;

-- activity-plan-authoring:triggers:start
DROP TRIGGER IF EXISTS activity_plans_authoring_guard ON public.activity_plans;
CREATE TRIGGER activity_plans_authoring_guard BEFORE INSERT OR UPDATE ON public.activity_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_plan_authoring();
DROP TRIGGER IF EXISTS activity_plans_enforce_revision ON public.activity_plans;
CREATE TRIGGER activity_plans_enforce_revision BEFORE UPDATE ON public.activity_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_plan_revision();
-- activity-plan-authoring:triggers:end

-- activity-plan-authoring:acl:start
REVOKE ALL ON FUNCTION public.activity_plan_js_trim(text), public.activity_plan_utf16_key(text), public.activity_plan_js_length(text),
  public.activity_plan_js_number(jsonb), public.activity_plan_core_canonical_json(jsonb), public.activity_plan_core_normalize_adaptation(jsonb),
  public.activity_plan_core_structure_hash(jsonb), public.activity_plan_core_semantic_hash(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_plan_js_trim(text), public.activity_plan_utf16_key(text), public.activity_plan_js_length(text),
  public.activity_plan_js_number(jsonb), public.activity_plan_core_canonical_json(jsonb), public.activity_plan_core_normalize_adaptation(jsonb),
  public.activity_plan_core_structure_hash(jsonb), public.activity_plan_core_semantic_hash(jsonb,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb),
  public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_uuid_is_valid(jsonb),
  public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text), public.enforce_activity_plan_authoring()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activity_plan_authoring_structure_is_valid(jsonb),
  public.activity_plan_authoring_intent_is_valid(jsonb,text), public.activity_plan_authoring_uuid_is_valid(jsonb),
  public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text), public.enforce_activity_plan_authoring()
  TO service_role;
-- activity-plan-authoring:acl:end

COMMIT;
