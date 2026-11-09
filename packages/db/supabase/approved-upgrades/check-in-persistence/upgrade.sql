-- Approved check-in persistence compatibility upgrade only. Use a guarded disposable proof.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
-- Versioned coaching check-ins are backend-owned. A published version is an
-- immutable question snapshot; schedules and occurrences bind to that exact
-- version, so later template edits cannot reinterpret submitted answers.
CREATE TABLE public.check_in_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_templates_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT check_in_templates_creator_fkey
    FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_templates_name_non_empty CHECK (btrim(name) <> '')
);

CREATE TABLE public.check_in_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version_number integer NOT NULL,
  name text NOT NULL,
  questions jsonb NOT NULL,
  published_by_membership_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_template_versions_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT check_in_template_versions_template_version_unique UNIQUE (template_id, version_number),
  CONSTRAINT check_in_template_versions_template_fkey
    FOREIGN KEY (organization_id, template_id)
    REFERENCES public.check_in_templates(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_template_versions_publisher_fkey
    FOREIGN KEY (organization_id, published_by_membership_id)
    REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_template_versions_number_check CHECK (version_number > 0),
  CONSTRAINT check_in_template_versions_name_non_empty CHECK (btrim(name) <> ''),
  CONSTRAINT check_in_template_versions_questions_check
    CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 1 AND 20 AND pg_column_size(questions) <= 65536)
);

CREATE TABLE public.check_in_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  weekday text NOT NULL,
  local_time text NOT NULL,
  time_zone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_schedules_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT check_in_schedules_occurrence_binding_unique
    UNIQUE (organization_id, id, engagement_id, athlete_profile_id, template_version_id, local_time, time_zone),
  CONSTRAINT check_in_schedules_engagement_fkey
    FOREIGN KEY (organization_id, engagement_id, athlete_profile_id)
    REFERENCES public.coaching_engagements(organization_id, id, athlete_profile_id) ON DELETE RESTRICT,
  CONSTRAINT check_in_schedules_template_version_fkey
    FOREIGN KEY (organization_id, template_version_id)
    REFERENCES public.check_in_template_versions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_schedules_weekday_check
    CHECK (weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  CONSTRAINT check_in_schedules_local_time_check CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT check_in_schedules_time_zone_non_empty CHECK (btrim(time_zone) <> '')
);
CREATE INDEX check_in_schedules_athlete_idx
  ON public.check_in_schedules(organization_id, athlete_profile_id, created_at);

CREATE TABLE public.check_in_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  period_start_date date NOT NULL,
  scheduled_local_time text NOT NULL,
  time_zone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_occurrences_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT check_in_occurrences_submission_binding_unique
    UNIQUE (organization_id, id, engagement_id, athlete_profile_id, template_version_id),
  CONSTRAINT check_in_occurrences_schedule_period_unique UNIQUE (schedule_id, period_start_date),
  CONSTRAINT check_in_occurrences_schedule_binding_fkey
    FOREIGN KEY (organization_id, schedule_id, engagement_id, athlete_profile_id, template_version_id, scheduled_local_time, time_zone)
    REFERENCES public.check_in_schedules(organization_id, id, engagement_id, athlete_profile_id, template_version_id, local_time, time_zone)
    ON DELETE RESTRICT,
  CONSTRAINT check_in_occurrences_local_time_check CHECK (scheduled_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT check_in_occurrences_time_zone_non_empty CHECK (btrim(time_zone) <> '')
);
CREATE INDEX check_in_occurrences_athlete_period_idx
  ON public.check_in_occurrences(organization_id, athlete_profile_id, period_start_date);

CREATE TABLE public.check_in_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  occurrence_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  submission_revision integer NOT NULL,
  idempotency_key uuid NOT NULL,
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_membership_id uuid,
  reviewed_by_profile_id uuid,
  CONSTRAINT check_in_submissions_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT check_in_submissions_follow_up_binding_unique
    UNIQUE (organization_id, id, engagement_id, athlete_profile_id),
  CONSTRAINT check_in_submissions_occurrence_athlete_unique UNIQUE (occurrence_id, athlete_profile_id),
  CONSTRAINT check_in_submissions_athlete_idempotency_unique UNIQUE (athlete_profile_id, idempotency_key),
  CONSTRAINT check_in_submissions_occurrence_fkey
    FOREIGN KEY (organization_id, occurrence_id, engagement_id, athlete_profile_id, template_version_id)
    REFERENCES public.check_in_occurrences(organization_id, id, engagement_id, athlete_profile_id, template_version_id)
    ON DELETE RESTRICT,
  CONSTRAINT check_in_submissions_reviewer_fkey
    FOREIGN KEY (organization_id, reviewed_by_membership_id, reviewed_by_profile_id)
    REFERENCES public.organization_memberships(organization_id, id, profile_id) ON DELETE RESTRICT,
  CONSTRAINT check_in_submissions_revision_check CHECK (submission_revision > 0),
  CONSTRAINT check_in_submissions_answers_check
    CHECK (jsonb_typeof(answers) = 'array' AND jsonb_array_length(answers) <= 20 AND pg_column_size(answers) <= 65536),
  CONSTRAINT check_in_submissions_review_check
    CHECK ((reviewed_at IS NULL) = (reviewed_by_membership_id IS NULL)
      AND (reviewed_at IS NULL) = (reviewed_by_profile_id IS NULL)
      AND (reviewed_at IS NULL OR reviewed_at >= submitted_at))
);
CREATE INDEX check_in_submissions_athlete_submitted_idx
  ON public.check_in_submissions(organization_id, athlete_profile_id, submitted_at);

CREATE TABLE public.check_in_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  assigned_to_membership_id uuid,
  description text NOT NULL,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_in_follow_ups_submission_fkey
    FOREIGN KEY (organization_id, submission_id, engagement_id, athlete_profile_id)
    REFERENCES public.check_in_submissions(organization_id, id, engagement_id, athlete_profile_id)
    ON DELETE RESTRICT,
  CONSTRAINT check_in_follow_ups_creator_fkey
    FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_follow_ups_assignee_fkey
    FOREIGN KEY (organization_id, assigned_to_membership_id)
    REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_in_follow_ups_description_non_empty CHECK (btrim(description) <> '')
);
CREATE INDEX check_in_follow_ups_submission_idx
  ON public.check_in_follow_ups(submission_id, created_at);

-- PostgreSQL's timezone catalog is the durable authority for stored zone IDs.
-- A local occurrence is rejected if it falls in a daylight-saving gap or is
-- ambiguous. Comparing offsets one calendar day either side detects ordinary
-- and non-hour transitions (including Australia/Lord_Howe) without assuming a
-- one-hour shift; a failed round-trip detects skipped civil times.
CREATE FUNCTION public.check_in_is_valid_time_zone(target_time_zone text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = target_time_zone
  );
$$;

CREATE FUNCTION public.check_in_local_civil_time_is_valid(
  target_date date,
  target_time text,
  target_time_zone text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  local_value timestamp;
  resolved_value timestamptz;
  round_trip timestamp;
  offset_before interval;
  offset_after interval;
  alternate_value timestamptz;
BEGIN
  IF NOT public.check_in_is_valid_time_zone(target_time_zone) THEN RETURN false; END IF;
  IF target_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
  local_value := target_date + target_time::time;
  resolved_value := pg_catalog.timezone(target_time_zone, local_value);
  round_trip := pg_catalog.timezone(target_time_zone, resolved_value);
  IF round_trip IS DISTINCT FROM local_value THEN RETURN false; END IF;

  offset_before := pg_catalog.timezone(target_time_zone, resolved_value - interval '1 day')
    - pg_catalog.timezone('UTC', resolved_value - interval '1 day');
  offset_after := pg_catalog.timezone(target_time_zone, resolved_value + interval '1 day')
    - pg_catalog.timezone('UTC', resolved_value + interval '1 day');
  FOR alternate_value IN
    SELECT pg_catalog.timezone('UTC', local_value - offset_before)
    UNION
    SELECT pg_catalog.timezone('UTC', local_value - offset_after)
  LOOP
    IF alternate_value <> resolved_value
      AND pg_catalog.timezone(target_time_zone, alternate_value) = local_value THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RETURN false;
END;
$$;

CREATE FUNCTION public.check_in_json_has_exact_keys(payload jsonb, expected_keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(payload) = 'object'
    AND coalesce(array_agg(key ORDER BY key), ARRAY[]::text[]) = expected_keys
  FROM jsonb_object_keys(payload) AS key;
$$;

CREATE FUNCTION public.check_in_uuid_is_valid(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT value ~* '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$';
$$;

CREATE FUNCTION public.check_in_js_trim(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT btrim(value, U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

CREATE FUNCTION public.check_in_template_questions_are_valid(target_questions jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  question jsonb;
  choice jsonb;
  question_ids text[] := ARRAY[]::text[];
  choice_ids text[];
  question_id text;
  kind text;
  choices jsonb;
BEGIN
  IF jsonb_typeof(target_questions) <> 'array'
    OR jsonb_array_length(target_questions) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR question IN SELECT value FROM jsonb_array_elements(target_questions)
  LOOP
    kind := question->>'kind';
    IF (kind = 'single_select' AND NOT public.check_in_json_has_exact_keys(question, ARRAY['audience','choices','helpText','kind','label','questionId','required']))
      OR (kind IN ('scale_1_to_10','long_text') AND NOT public.check_in_json_has_exact_keys(question, ARRAY['audience','helpText','kind','label','questionId','required']))
      OR kind NOT IN ('scale_1_to_10','single_select','long_text')
      OR NOT public.check_in_uuid_is_valid(question->>'questionId')
      OR question->>'questionId' = ANY(question_ids)
      OR char_length(public.check_in_js_trim(coalesce(question->>'label', ''))) NOT BETWEEN 1 AND 240
      OR jsonb_typeof(question->'required') <> 'boolean'
      OR question->>'audience' <> 'athlete_and_assigned_coaches'
      OR (jsonb_typeof(question->'helpText') <> 'null' AND (jsonb_typeof(question->'helpText') <> 'string' OR char_length(public.check_in_js_trim(question->>'helpText')) NOT BETWEEN 1 AND 1000))
    THEN RETURN false; END IF;
    question_id := question->>'questionId';
    question_ids := array_append(question_ids, question_id);
    IF kind = 'single_select' THEN
      choices := question->'choices';
      IF jsonb_typeof(choices) <> 'array' OR jsonb_array_length(choices) NOT BETWEEN 2 AND 12 THEN RETURN false; END IF;
      choice_ids := ARRAY[]::text[];
      FOR choice IN SELECT value FROM jsonb_array_elements(choices)
      LOOP
        IF NOT public.check_in_json_has_exact_keys(choice, ARRAY['choiceId','label'])
          OR NOT public.check_in_uuid_is_valid(choice->>'choiceId')
          OR choice->>'choiceId' = ANY(choice_ids)
          OR char_length(public.check_in_js_trim(coalesce(choice->>'label', ''))) NOT BETWEEN 1 AND 160
        THEN RETURN false; END IF;
        choice_ids := array_append(choice_ids, choice->>'choiceId');
      END LOOP;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.check_in_submission_answers_are_valid(target_questions jsonb, target_answers jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  question jsonb;
  answer jsonb;
  matching_question jsonb;
  question_id text;
  answer_ids text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.check_in_template_questions_are_valid(target_questions)
    OR jsonb_typeof(target_answers) <> 'array'
    OR jsonb_array_length(target_answers) > 20 THEN RETURN false; END IF;
  FOR answer IN SELECT value FROM jsonb_array_elements(target_answers)
  LOOP
    question_id := answer->>'questionId';
    SELECT value INTO matching_question
    FROM jsonb_array_elements(target_questions)
    WHERE value->>'questionId' = question_id;
    IF matching_question IS NULL OR NOT public.check_in_uuid_is_valid(question_id)
      OR question_id = ANY(answer_ids) OR answer->>'kind' <> matching_question->>'kind' THEN RETURN false; END IF;
    IF (answer->>'kind' = 'scale_1_to_10'
          AND (NOT public.check_in_json_has_exact_keys(answer, ARRAY['kind','questionId','value'])
            OR jsonb_typeof(answer->'value') <> 'number'
            OR (answer->>'value')::numeric < 1 OR (answer->>'value')::numeric > 10
            OR trunc((answer->>'value')::numeric) <> (answer->>'value')::numeric))
      OR (answer->>'kind' = 'single_select'
          AND (NOT public.check_in_json_has_exact_keys(answer, ARRAY['choiceId','kind','questionId'])
            OR NOT public.check_in_uuid_is_valid(answer->>'choiceId')
            OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(matching_question->'choices') choice WHERE choice->>'choiceId' = answer->>'choiceId')))
      OR (answer->>'kind' = 'long_text'
          AND (NOT public.check_in_json_has_exact_keys(answer, ARRAY['kind','questionId','text'])
            OR jsonb_typeof(answer->'text') <> 'string'
            OR char_length(public.check_in_js_trim(answer->>'text')) NOT BETWEEN 1 AND 2000))
    THEN RETURN false; END IF;
    answer_ids := array_append(answer_ids, question_id);
  END LOOP;
  FOR question IN SELECT value FROM jsonb_array_elements(target_questions)
  LOOP
    IF (question->>'required')::boolean AND NOT (question->>'questionId' = ANY(answer_ids)) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.validate_check_in_occurrence_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  expected_weekday text;
  actual_weekday text;
BEGIN
  SELECT schedule.weekday INTO expected_weekday
  FROM public.check_in_schedules AS schedule
  WHERE schedule.organization_id = NEW.organization_id AND schedule.id = NEW.schedule_id;
  actual_weekday := CASE extract(dow FROM NEW.period_start_date)::integer
    WHEN 0 THEN 'sunday' WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday'
  END;
  IF expected_weekday IS NULL OR actual_weekday <> expected_weekday THEN
    RAISE EXCEPTION 'check-in occurrence period must match its schedule weekday'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_occurrences_schedule_weekday_check';
  END IF;
  IF NOT public.check_in_local_civil_time_is_valid(
    NEW.period_start_date, NEW.scheduled_local_time, NEW.time_zone
  ) THEN
    RAISE EXCEPTION 'check-in occurrence must use an unambiguous existing local civil time'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_occurrences_local_civil_time_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_check_in_occurrence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'check-in occurrences are append-only snapshots'
    USING ERRCODE = '23514', CONSTRAINT = 'check_in_occurrences_immutable';
END;
$$;

CREATE FUNCTION public.prevent_check_in_schedule_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.check_in_occurrences WHERE schedule_id = OLD.id)
    AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
      OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
      OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
      OR NEW.weekday IS DISTINCT FROM OLD.weekday
      OR NEW.local_time IS DISTINCT FROM OLD.local_time
      OR NEW.time_zone IS DISTINCT FROM OLD.time_zone)
  THEN
    RAISE EXCEPTION 'check-in schedule identity is immutable after an occurrence exists; create a replacement schedule'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_schedules_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_check_in_template_version_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_in_template_questions_are_valid(NEW.questions) THEN
    RAISE EXCEPTION 'check-in template questions do not match the published contract'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_template_versions_questions_contract';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_check_in_submission_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  version_questions jsonb;
BEGIN
  SELECT questions INTO version_questions
  FROM public.check_in_template_versions
  WHERE organization_id = NEW.organization_id AND id = NEW.template_version_id;
  IF NOT public.check_in_submission_answers_are_valid(version_questions, NEW.answers) THEN
    RAISE EXCEPTION 'check-in submission answers do not match the published version contract'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_submissions_answers_contract';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_check_in_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'published check-in template versions are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'check_in_template_versions_immutable';
END;
$$;

CREATE FUNCTION public.prevent_check_in_submission_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reviewed_at IS NOT NULL
      OR NEW.reviewed_by_membership_id IS NOT NULL
      OR NEW.reviewed_by_profile_id IS NOT NULL THEN
      RAISE EXCEPTION 'check-in submissions must begin unreviewed'
        USING ERRCODE = '23514', CONSTRAINT = 'check_in_submissions_initial_review_check';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'check-in submissions are retained'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_submissions_immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
    OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
    OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
    OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.submission_revision IS DISTINCT FROM OLD.submission_revision
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.answers IS DISTINCT FROM OLD.answers
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'check-in submission answers and identity are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_submissions_immutable';
  END IF;
  IF OLD.reviewed_at IS NOT NULL
    OR OLD.reviewed_by_membership_id IS NOT NULL
    OR OLD.reviewed_by_profile_id IS NOT NULL
    OR NEW.reviewed_at IS NULL
    OR NEW.reviewed_by_membership_id IS NULL
    OR NEW.reviewed_by_profile_id IS NULL THEN
    RAISE EXCEPTION 'check-in review may be recorded exactly once'
      USING ERRCODE = '23514', CONSTRAINT = 'check_in_submissions_review_once';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_check_in_occurrence_schedule() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_is_valid_time_zone(text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_local_civil_time_is_valid(date, text, text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_json_has_exact_keys(jsonb, text[]) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_uuid_is_valid(text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_js_trim(text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_template_questions_are_valid(jsonb) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_in_submission_answers_are_valid(jsonb, jsonb) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_check_in_occurrence_mutation() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_check_in_schedule_identity_mutation() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_check_in_template_version_payload() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_check_in_submission_payload() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_check_in_template_version_mutation() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_check_in_submission_mutation() FROM public, anon, authenticated, service_role;
ALTER TABLE public.check_in_schedules
  ADD CONSTRAINT check_in_schedules_time_zone_valid CHECK (public.check_in_is_valid_time_zone(time_zone));
ALTER TABLE public.check_in_occurrences
  ADD CONSTRAINT check_in_occurrences_time_zone_valid CHECK (public.check_in_is_valid_time_zone(time_zone));
CREATE TRIGGER check_in_occurrences_schedule_weekday_guard
BEFORE INSERT OR UPDATE ON public.check_in_occurrences
FOR EACH ROW EXECUTE FUNCTION public.validate_check_in_occurrence_schedule();
CREATE TRIGGER check_in_occurrences_retained
BEFORE DELETE OR UPDATE ON public.check_in_occurrences
FOR EACH ROW EXECUTE FUNCTION public.prevent_check_in_occurrence_mutation();
CREATE TRIGGER check_in_schedules_identity_guard
BEFORE UPDATE ON public.check_in_schedules
FOR EACH ROW EXECUTE FUNCTION public.prevent_check_in_schedule_identity_mutation();
CREATE TRIGGER check_in_template_versions_payload_guard
BEFORE INSERT ON public.check_in_template_versions
FOR EACH ROW EXECUTE FUNCTION public.validate_check_in_template_version_payload();
CREATE TRIGGER check_in_template_versions_immutable
BEFORE DELETE OR UPDATE ON public.check_in_template_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_check_in_template_version_mutation();
CREATE TRIGGER check_in_submissions_payload_guard
BEFORE INSERT OR UPDATE ON public.check_in_submissions
FOR EACH ROW EXECUTE FUNCTION public.validate_check_in_submission_payload();
CREATE TRIGGER check_in_submissions_retained
BEFORE INSERT OR DELETE OR UPDATE ON public.check_in_submissions
FOR EACH ROW EXECUTE FUNCTION public.prevent_check_in_submission_mutation();

ALTER TABLE public.check_in_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_follow_ups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.check_in_templates, public.check_in_template_versions,
  public.check_in_schedules, public.check_in_occurrences, public.check_in_submissions,
  public.check_in_follow_ups FROM anon, authenticated;
GRANT ALL ON TABLE public.check_in_templates, public.check_in_template_versions,
  public.check_in_schedules, public.check_in_occurrences, public.check_in_submissions,
  public.check_in_follow_ups TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.check_in_template_versions
  FROM service_role;
COMMIT;
