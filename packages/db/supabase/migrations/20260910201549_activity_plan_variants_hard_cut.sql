BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '10min';
SET LOCAL extra_float_digits = 1;

LOCK TABLE public.activity_plans, public.training_plans, public.planned_sessions, public.events
  IN SHARE ROW EXCLUSIVE MODE;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Convert a PostgreSQL Unicode string to fixed-width UTF-16 code units so object
-- keys sort exactly like JavaScript Array.prototype.sort, including astral keys.
CREATE OR REPLACE FUNCTION pg_temp.activity_plan_utf16_sort_key(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  code_point integer;
  index integer;
  result text := '';
BEGIN
  FOR index IN 1..pg_catalog.char_length(input)
  LOOP
    code_point := pg_catalog.ascii(pg_catalog.substr(input, index, 1));
    IF code_point <= 65535 THEN
      result := result || pg_catalog.lpad(pg_catalog.to_hex(code_point), 4, '0');
    ELSE
      code_point := code_point - 65536;
      result := result
        || pg_catalog.lpad(pg_catalog.to_hex(55296 + code_point / 1024), 4, '0')
        || pg_catalog.lpad(pg_catalog.to_hex(56320 + code_point % 1024), 4, '0');
    END IF;
  END LOOP;
  RETURN result;
END
$$;

-- JSON.parse produces IEEE-754 numbers and JSON.stringify uses ECMAScript's
-- decimal/exponent thresholds. PostgreSQL float8 output supplies the same
-- shortest round-trippable digits; this helper normalizes only their layout.
CREATE OR REPLACE FUNCTION pg_temp.activity_plan_canonical_json_number(input jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  decimal_exponent integer;
  digits text;
  explicit_exponent integer := 0;
  first_significant integer;
  float_value double precision;
  fraction_mark integer;
  integer_digits integer;
  mantissa text;
  negative boolean := false;
  raw text;
BEGIN
  float_value := (input #>> '{}')::double precision;
  raw := pg_catalog.lower(float_value::text);
  IF raw IN ('infinity', '-infinity', 'nan') THEN
    RAISE EXCEPTION 'canonical JSON rejects non-finite numbers';
  END IF;
  IF float_value = 0 THEN
    RETURN '0';
  END IF;
  IF pg_catalog.left(raw, 1) = '-' THEN
    negative := true;
    raw := pg_catalog.substr(raw, 2);
  END IF;
  IF pg_catalog.strpos(raw, 'e') > 0 THEN
    explicit_exponent := pg_catalog.split_part(raw, 'e', 2)::integer;
    mantissa := pg_catalog.split_part(raw, 'e', 1);
  ELSE
    mantissa := raw;
  END IF;

  fraction_mark := pg_catalog.strpos(mantissa, '.');
  integer_digits := CASE
    WHEN fraction_mark = 0 THEN pg_catalog.char_length(mantissa)
    ELSE fraction_mark - 1
  END;
  digits := pg_catalog.replace(mantissa, '.', '');
  first_significant := pg_catalog.char_length(digits) - pg_catalog.char_length(pg_catalog.ltrim(digits, '0'));
  decimal_exponent := integer_digits - first_significant - 1 + explicit_exponent;
  digits := pg_catalog.rtrim(pg_catalog.ltrim(digits, '0'), '0');

  IF decimal_exponent >= 21 OR decimal_exponent <= -7 THEN
    raw := pg_catalog.left(digits, 1)
      || CASE WHEN pg_catalog.char_length(digits) > 1 THEN '.' || pg_catalog.substr(digits, 2) ELSE '' END
      || 'e'
      || CASE WHEN decimal_exponent >= 0 THEN '+' ELSE '' END
      || decimal_exponent::text;
  ELSIF decimal_exponent >= 0 THEN
    raw := CASE
      WHEN pg_catalog.char_length(digits) <= decimal_exponent + 1
        THEN digits || pg_catalog.repeat('0', decimal_exponent + 1 - pg_catalog.char_length(digits))
      ELSE pg_catalog.substr(digits, 1, decimal_exponent + 1)
        || '.' || pg_catalog.substr(digits, decimal_exponent + 2)
    END;
  ELSE
    raw := '0.' || pg_catalog.repeat('0', -decimal_exponent - 1) || digits;
  END IF;

  RETURN CASE WHEN negative THEN '-' || raw ELSE raw END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.activity_plan_canonical_json(input jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  result text;
BEGIN
  CASE pg_catalog.jsonb_typeof(input)
    WHEN 'null' THEN RETURN 'null';
    WHEN 'boolean' THEN RETURN input::text;
    WHEN 'number' THEN RETURN pg_temp.activity_plan_canonical_json_number(input);
    WHEN 'string' THEN RETURN pg_catalog.to_jsonb(input #>> '{}')::text;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(pg_catalog.string_agg(
        pg_temp.activity_plan_canonical_json(element), ',' ORDER BY ordinality
      ), '') || ']'
      INTO result
      FROM pg_catalog.jsonb_array_elements(input) WITH ORDINALITY AS entries(element, ordinality);
      RETURN result;
    WHEN 'object' THEN
      SELECT '{' || COALESCE(pg_catalog.string_agg(
        pg_catalog.to_jsonb(key)::text || ':' || pg_temp.activity_plan_canonical_json(value),
        ',' ORDER BY pg_temp.activity_plan_utf16_sort_key(key) COLLATE "C"
      ), '') || '}'
      INTO result
      FROM pg_catalog.jsonb_each(input) AS entries(key, value);
      RETURN result;
    ELSE
      RAISE EXCEPTION 'canonical JSON rejects unsupported JSON type';
  END CASE;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.activity_plan_structure_hash(input jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT 'v1:sha256:' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_temp.activity_plan_canonical_json(input), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION public.activity_plan_document_is_canonical(input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  variant_value jsonb;
  variant_id text;
  variant_name text;
  default_variant_id text;
  activity_category text;
  seen_ids text[] := '{}'::text[];
  seen_names text[] := '{}'::text[];
  default_matches integer := 0;
BEGIN
  IF input IS NULL
    OR pg_catalog.jsonb_typeof(input) <> 'object'
    OR NOT public.activity_plan_jsonb_has_exact_keys(
      input,
      ARRAY['contractVersion', 'defaultVariantId', 'variants']
    )
    OR input -> 'contractVersion' <> '1'::jsonb
    OR NOT public.activity_plan_jsonb_is_uuid(input -> 'defaultVariantId')
    OR input ->> 'defaultVariantId' <> pg_catalog.lower(input ->> 'defaultVariantId')
    OR input ->> 'defaultVariantId' = '00000000-0000-0000-0000-000000000000'
    OR pg_catalog.jsonb_typeof(input -> 'variants') <> 'array'
    OR pg_catalog.jsonb_array_length(input -> 'variants') NOT BETWEEN 1 AND 16
  THEN
    RETURN false;
  END IF;

  default_variant_id := input ->> 'defaultVariantId';

  FOR variant_value IN
    SELECT value FROM pg_catalog.jsonb_array_elements(input -> 'variants')
  LOOP
    IF NOT public.activity_plan_jsonb_has_exact_keys(
      variant_value,
      ARRAY['id', 'name', 'structure']
    )
      OR NOT public.activity_plan_jsonb_is_uuid(variant_value -> 'id')
      OR variant_value ->> 'id' <> pg_catalog.lower(variant_value ->> 'id')
      OR variant_value ->> 'id' = '00000000-0000-0000-0000-000000000000'
      OR NOT public.activity_plan_jsonb_is_string(variant_value -> 'name', 1, 100)
      OR variant_value ->> 'name' <> pg_catalog.btrim(
        variant_value ->> 'name',
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      OR NOT public.activity_plan_structure_is_canonical(variant_value -> 'structure')
    THEN
      RETURN false;
    END IF;

    variant_id := variant_value ->> 'id';
    variant_name := pg_catalog.lower(variant_value ->> 'name');

    IF variant_id = ANY(seen_ids) OR variant_name = ANY(seen_names) THEN
      RETURN false;
    END IF;

    seen_ids := pg_catalog.array_append(seen_ids, variant_id);
    seen_names := pg_catalog.array_append(seen_names, variant_name);

    IF activity_category IS NULL THEN
      activity_category := variant_value -> 'structure' ->> 'activity_category';
    ELSIF activity_category <> variant_value -> 'structure' ->> 'activity_category' THEN
      RETURN false;
    END IF;

    IF variant_id = default_variant_id THEN
      default_matches := default_matches + 1;
    END IF;
  END LOOP;

  RETURN default_matches = 1;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.activity_plans
    WHERE structure ->> 'version' IS DISTINCT FROM '3'
      OR NOT public.activity_plan_structure_is_canonical(structure)
  ) THEN
    RAISE EXCEPTION 'activity-plan hard cut requires every stored plan to be canonical root V3';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.planned_sessions
    WHERE contract_version IS DISTINCT FROM 'planned-session-v1'
  ) THEN
    RAISE EXCEPTION 'activity-plan hard cut requires every planned session to use planned-session-v1';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_plans
    WHERE CASE
      WHEN pg_catalog.jsonb_typeof(structure) <> 'object'
        OR structure ->> 'version' IS DISTINCT FROM '1'
        OR pg_catalog.jsonb_typeof(structure -> 'sessions') <> 'array'
      THEN true
      ELSE pg_catalog.jsonb_array_length(structure -> 'sessions') < 1
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(structure -> 'sessions') AS session_value
          WHERE NOT public.activity_plan_jsonb_is_uuid(session_value -> 'activity_plan_id')
            OR session_value ? 'activity_plan_variant_id'
        )
    END
  ) THEN
    RAISE EXCEPTION 'activity-plan hard cut requires canonical unpinned training-plan sessions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.events AS event
    WHERE event.training_plan_id IS NOT NULL
      AND (
        SELECT pg_catalog.count(*)
        FROM public.planned_sessions AS planned_session
        WHERE planned_session.profile_id = event.profile_id
          AND planned_session.source_kind = 'training_plan'
          AND planned_session.training_plan_id = event.training_plan_id
          AND planned_session.activity_plan_id = event.activity_plan_id
          AND planned_session.planning_date = event.scheduled_date::date
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'event to planned-session backfill requires exactly one snapshot candidate per training-plan event';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.planned_sessions AS planned_session
    WHERE planned_session.source_kind = 'training_plan'
      AND (
        SELECT pg_catalog.count(*)
        FROM public.events AS event
        WHERE event.profile_id = planned_session.profile_id
          AND event.training_plan_id = planned_session.training_plan_id
          AND event.activity_plan_id = planned_session.activity_plan_id
          AND event.scheduled_date::date = planned_session.planning_date
      ) > 1
  ) THEN
    RAISE EXCEPTION 'event to planned-session backfill is ambiguous because one snapshot matches multiple training-plan events';
  END IF;
END
$$;

ALTER TABLE public.activity_plans
  DROP CONSTRAINT activity_plans_structure_canonical_check,
  DROP CONSTRAINT activity_plans_structure_v3_check;

DROP INDEX public.idx_activity_plans_structure_categories;

ALTER TABLE public.planned_sessions
  ADD COLUMN activity_plan_variant_id uuid,
  ADD COLUMN activity_plan_variant_name text,
  ADD COLUMN prescription_structure_hash text;

ALTER TABLE public.events
  ADD COLUMN planned_session_id uuid;

ALTER TABLE public.activity_plans DISABLE TRIGGER activity_plans_enforce_revision;

WITH transformed AS MATERIALIZED (
  SELECT
    id,
    pg_catalog.jsonb_build_object(
      'contractVersion', 1,
      'defaultVariantId', pg_catalog.lower(id::text),
      'variants', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', pg_catalog.lower(id::text),
          'name', 'Base',
          'structure', structure
        )
      )
    ) AS document
  FROM public.activity_plans
)
UPDATE public.activity_plans AS activity_plan
SET
  structure = transformed.document,
  structure_hash = pg_temp.activity_plan_structure_hash(transformed.document),
  revision = activity_plan.revision + 1
FROM transformed
WHERE activity_plan.id = transformed.id;

ALTER TABLE public.activity_plans ENABLE TRIGGER activity_plans_enforce_revision;

WITH transformed AS MATERIALIZED (
  SELECT
    id,
    pg_catalog.jsonb_set(
      structure,
      '{sessions}',
      (
        SELECT pg_catalog.jsonb_agg(
          session_value || pg_catalog.jsonb_build_object(
            'activity_plan_variant_id', session_value ->> 'activity_plan_id'
          )
          ORDER BY session_ordinality
        )
        FROM pg_catalog.jsonb_array_elements(structure -> 'sessions')
          WITH ORDINALITY AS session_row(session_value, session_ordinality)
      )
    ) AS document
  FROM public.training_plans
)
UPDATE public.training_plans AS training_plan
SET
  structure = transformed.document,
  structure_hash = pg_temp.activity_plan_structure_hash(transformed.document)
FROM transformed
WHERE training_plan.id = transformed.id;

UPDATE public.planned_sessions
SET
  contract_version = 'planned-session-v2',
  activity_plan_variant_id = activity_plan_id,
  activity_plan_variant_name = 'Base',
  prescription_structure_hash = pg_temp.activity_plan_structure_hash(prescription_structure);

UPDATE public.events AS event
SET planned_session_id = planned_session.id
FROM public.planned_sessions AS planned_session
WHERE event.training_plan_id IS NOT NULL
  AND planned_session.profile_id = event.profile_id
  AND planned_session.source_kind = 'training_plan'
  AND planned_session.training_plan_id = event.training_plan_id
  AND planned_session.activity_plan_id = event.activity_plan_id
  AND planned_session.planning_date = event.scheduled_date::date;

ALTER TABLE public.activity_plans
  ADD CONSTRAINT activity_plans_structure_document_v1_check
    CHECK (
      pg_catalog.jsonb_typeof(structure) = 'object'
      AND structure -> 'contractVersion' = '1'::jsonb
      AND pg_catalog.jsonb_typeof(structure -> 'defaultVariantId') = 'string'
      AND pg_catalog.jsonb_typeof(structure -> 'variants') = 'array'
      AND pg_catalog.jsonb_array_length(structure -> 'variants') BETWEEN 1 AND 16
      AND pg_catalog.pg_column_size(structure) <= 1048576
    ),
  ADD CONSTRAINT activity_plans_structure_canonical_check
    CHECK (public.activity_plan_document_is_canonical(structure));

CREATE INDEX idx_activity_plans_structure_category
  ON public.activity_plans ((structure #>> '{variants,0,structure,activity_category}'));

ALTER TABLE public.planned_sessions
  DROP CONSTRAINT planned_sessions_prescription_check,
  ALTER COLUMN contract_version SET DEFAULT 'planned-session-v2',
  ALTER COLUMN activity_plan_variant_id SET NOT NULL,
  ALTER COLUMN activity_plan_variant_name SET NOT NULL,
  ALTER COLUMN prescription_structure_hash SET NOT NULL,
  ADD CONSTRAINT planned_sessions_contract_version_check
    CHECK (contract_version = 'planned-session-v2'),
  ADD CONSTRAINT planned_sessions_variant_provenance_check
    CHECK (
      activity_plan_variant_id <> '00000000-0000-0000-0000-000000000000'::uuid
      AND activity_plan_variant_name = pg_catalog.btrim(
        activity_plan_variant_name,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      AND pg_catalog.char_length(activity_plan_variant_name) BETWEEN 1 AND 100
    ),
  ADD CONSTRAINT planned_sessions_prescription_check
    CHECK (
      activity_plan_revision > 0
      AND pg_catalog.jsonb_typeof(prescription_structure) = 'object'
      AND pg_catalog.pg_column_size(prescription_structure) <= 1048576
      AND prescription_structure_hash ~ '^v1:sha256:[0-9a-f]{64}$'
      AND (
        prescription_quantification IS NULL
        OR (
          pg_catalog.jsonb_typeof(prescription_quantification) = 'object'
          AND pg_catalog.pg_column_size(prescription_quantification) <= 262144
        )
      )
    );

ALTER TABLE public.planned_sessions
  ADD CONSTRAINT planned_sessions_id_profile_activity_plan_unique
    UNIQUE (id, profile_id, activity_plan_id);

ALTER TABLE public.events
  -- The three-column owner key prevents an event from claiming a different
  -- activity plan than the immutable snapshot references.
  ADD CONSTRAINT events_planned_session_owner_fkey
    FOREIGN KEY (planned_session_id, profile_id, activity_plan_id)
    REFERENCES public.planned_sessions (id, profile_id, activity_plan_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT events_planned_session_kind_check
    CHECK (planned_session_id IS NULL OR (event_type = 'planned' AND activity_plan_id IS NOT NULL)),
  ADD CONSTRAINT events_training_plan_session_check
    CHECK (training_plan_id IS NULL OR planned_session_id IS NOT NULL);

CREATE UNIQUE INDEX events_planned_session_unique
  ON public.events (planned_session_id)
  WHERE planned_session_id IS NOT NULL;

COMMIT;
