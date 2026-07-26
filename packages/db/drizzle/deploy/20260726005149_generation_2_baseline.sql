--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_file_ingestion_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_file_ingestion_source AS ENUM (
    'mobile_recording',
    'manual_import',
    'provider_sync'
);


--
-- Name: activity_file_ingestion_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_file_ingestion_status AS ENUM (
    'pending_upload',
    'uploaded',
    'processing',
    'ready',
    'failed'
);


--
-- Name: activity_session_rpe_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_session_rpe_source AS ENUM (
    'user',
    'provider',
    'manual'
);


--
-- Name: effort_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.effort_type AS ENUM (
    'power',
    'speed',
    'heart_rate'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'scheduled',
    'completed',
    'cancelled'
);


--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'planned',
    'race_target',
    'custom',
    'imported'
);


--
-- Name: evidence_observation_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evidence_observation_source AS ENUM (
    'manual',
    'test',
    'imported',
    'provider',
    'estimated',
    'derived'
);


--
-- Name: gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender AS ENUM (
    'male',
    'female',
    'other'
);


--
-- Name: integration_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.integration_provider AS ENUM (
    'strava',
    'wahoo',
    'trainingpeaks',
    'garmin',
    'zwift'
);


--
-- Name: integration_resource_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.integration_resource_kind AS ENUM (
    'event',
    'activity_plan',
    'activity_route',
    'activity'
);


--
-- Name: like_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.like_entity_type AS ENUM (
    'activity',
    'activity_plan',
    'training_plan',
    'route'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'new_message',
    'coaching_invitation',
    'coaching_invitation_accepted',
    'coaching_invitation_declined',
    'new_follower',
    'follow_request',
    'group_event_cancelled'
);


--
-- Name: profile_metric_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.profile_metric_type AS ENUM (
    'weight_kg',
    'ftp',
    'resting_hr',
    'sleep_hours',
    'hrv_rmssd',
    'vo2_max',
    'body_fat_percentage',
    'hydration_level',
    'stress_score',
    'soreness_level',
    'wellness_score',
    'max_hr',
    'lthr',
    'threshold_pace_seconds_per_km',
    'css_seconds_per_100m'
);


--
-- Name: training_effect_label; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.training_effect_label AS ENUM (
    'recovery',
    'base',
    'tempo',
    'threshold',
    'vo2max'
);


--
-- Name: activity_artifact_content_path(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_artifact_content_path(target_profile_id uuid, target_digest text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  select 'artifacts/sha256/'||target_profile_id::text||'/'||target_digest
$$;


--
-- Name: activity_parent_segment_set_constraint_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_parent_segment_set_constraint_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.validate_activity_segment_set(new.id);
  return null;
end $$;


--
-- Name: activity_segment_set_constraint_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_segment_set_constraint_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.validate_activity_segment_set(coalesce(new.activity_id, old.activity_id));
  return null;
end $$;


--
-- Name: block_activity_artifact_direct_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_activity_artifact_direct_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.availability<>'deleted'
    or current_setting('gradientpeak.artifact_hard_delete_authorized',true) is distinct from 'on' then
    raise exception 'activity artifact delete requires completed service lifecycle';
  end if;
  return old;
end $$;


--
-- Name: enforce_activity_artifact_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_activity_artifact_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if row(new.profile_id, new.digest_algorithm, new.digest, new.byte_size, new.bucket, new.path,
         new.media_type, new.format, new.original_name, new.first_accepted_at)
     is distinct from
     row(old.profile_id, old.digest_algorithm, old.digest, old.byte_size, old.bucket, old.path,
         old.media_type, old.format, old.original_name, old.first_accepted_at) then
    raise exception 'accepted activity artifact byte identity is immutable';
  end if;
  if new.availability is distinct from old.availability then
    if current_setting('gradientpeak.artifact_lifecycle_authorized',true) is distinct from 'on' then
      raise exception 'activity artifact lifecycle requires authorized service workflow';
    end if;
    if not ((old.availability='accepted' and new.availability='deletion_pending')
      or (old.availability='deletion_pending' and new.availability='deleted')) then
      raise exception 'invalid activity artifact lifecycle transition';
    end if;
  end if;
  return new;
end $$;


--
-- Name: finalize_activity_artifact_deletion(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_activity_artifact_deletion(target_id uuid, storage_deleted boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not storage_deleted then raise exception 'storage deletion proof is required'; end if;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deleted',deleted_at=now()
  where id=target_id and availability='deletion_pending';
  if not found then raise exception 'artifact is not deletion_pending or does not exist'; end if;
end $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    full_name text;
    user_email text;
    base_username text;
    unique_suffix text;
    final_username text;
begin
    full_name := nullif(btrim(coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        concat_ws(' ',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        )
    )), '');

    user_email := coalesce(
        nullif(new.email, ''),
        nullif(new.raw_user_meta_data->>'email', ''),
        new.id::text || '@users.local'
    );

    base_username := coalesce(
        nullif(concat_ws('',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        ), ''),
        split_part(user_email, '@', 1),
        'user'
    );

    unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
    final_username := left(base_username || unique_suffix, 50);

    insert into public.users (id, name, email, email_verified, image)
    values (
        new.id,
        coalesce(full_name, split_part(user_email, '@', 1), 'User'),
        user_email,
        coalesce(new.email_confirmed_at is not null, false),
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        name = coalesce(public.users.name, excluded.name),
        email = coalesce(public.users.email, excluded.email),
        image = coalesce(public.users.image, excluded.image),
        updated_at = now();

    insert into public.profiles (id, email, full_name, username, avatar_url)
    values (
        new.id,
        new.email,
        full_name,
        final_username,
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        email = coalesce(public.profiles.email, excluded.email),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        username = coalesce(public.profiles.username, excluded.username),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

    return new;
end;
$$;


--
-- Name: purge_deleted_activity_artifact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_deleted_activity_artifact(target_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform set_config('gradientpeak.artifact_hard_delete_authorized','on',true);
  delete from public.activity_artifacts where id=target_id and availability='deleted';
  if not found then raise exception 'artifact tombstone is not deletable'; end if;
end $$;


--
-- Name: reject_activity_session_rpe_evidence_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_activity_session_rpe_evidence_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'activity_session_rpe_evidence is immutable';
end;
$$;


--
-- Name: request_activity_artifact_deletion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_activity_artifact_deletion(target_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from public.activity_artifacts where id=target_id and availability='accepted' for update;
  if not found then raise exception 'artifact is not accepted or does not exist'; end if;
  update public.activity_segments set source_artifact_id=null,source_session_index=null,source_message_index=null
    where source_artifact_id=target_id;
  update public.activity_file_ingestions set artifact_id=null,status='failed',claim_token=null,lease_expires_at=null,
    failed_at=coalesce(failed_at,now()),last_error_code='artifact_deletion_requested',
    last_error_message='Accepted source artifact entered controlled deletion',updated_at=now()
    where artifact_id=target_id;
  delete from public.activity_artifact_links where artifact_id=target_id;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deletion_pending',deletion_requested_at=now()
  where id=target_id and availability='accepted';
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_artifact_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_artifact_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    artifact_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role text NOT NULL,
    ordinal integer NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    provider_revision text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_artifact_links_current_source_check CHECK (((NOT is_current) OR (role = 'source'::text))),
    CONSTRAINT activity_artifact_links_ordinal_check CHECK ((ordinal >= 0)),
    CONSTRAINT activity_artifact_links_role_check CHECK ((role = ANY (ARRAY['source'::text, 'supplemental'::text, 'export'::text])))
);


--
-- Name: switch_activity_source_artifact(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.switch_activity_source_artifact(target_activity_id uuid, target_artifact_id uuid, target_profile_id uuid, target_provider_revision text DEFAULT NULL::text) RETURNS public.activity_artifact_links
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare inserted public.activity_artifact_links;
begin
  perform 1 from public.activities where id=target_activity_id and profile_id=target_profile_id for update;
  if not found then raise exception 'activity/profile not found'; end if;
  update public.activity_artifact_links set is_current=false
    where activity_id=target_activity_id and role='source' and is_current;
  insert into public.activity_artifact_links(activity_id,artifact_id,profile_id,role,ordinal,is_current,provider_revision)
  values(target_activity_id,target_artifact_id,target_profile_id,'source',
    coalesce((select max(ordinal)+1 from public.activity_artifact_links where activity_id=target_activity_id and role='source'),0),
    true,target_provider_revision) returning * into inserted;
  return inserted;
end $$;


--
-- Name: validate_activity_effort_segment_range(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_activity_effort_segment_range() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare segment_record record;
begin
  if new.activity_id is null then return new; end if;
  select start_offset_ms,end_offset_ms,category into segment_record from public.activity_segments
    where id=new.segment_id and activity_id=new.activity_id and profile_id=new.profile_id;
  if not found or segment_record.category<>new.activity_category
    or new.start_offset is null or new.start_offset*1000<segment_record.start_offset_ms
    or (new.start_offset+new.duration_seconds)*1000>segment_record.end_offset_ms then
    raise exception 'activity effort must be contained by its matching-category segment';
  end if;
  return new;
end $$;


--
-- Name: validate_activity_segment_set(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_activity_segment_set(target_activity_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  parent_record record;
  segment_count integer;
  max_ordinal integer;
  summed_active bigint;
  summed_moving bigint;
  complete_count integer;
begin
  select elapsed_ms, active_ms, moving_ms,timing_coverage into parent_record
  from public.activities where id = target_activity_id;
  if not found then return; end if;

  select count(*), max(ordinal), sum(active_ms), sum(moving_ms),
    count(*) filter(where timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    into segment_count, max_ordinal, summed_active, summed_moving,complete_count
  from public.activity_segments where activity_id = target_activity_id;
  if segment_count = 0 or max_ordinal <> segment_count - 1 then
    raise exception 'activity % segment ordinals must be contiguous from zero', target_activity_id;
  end if;
  if exists (select 1 from public.activity_segments where activity_id = target_activity_id and end_offset_ms > parent_record.elapsed_ms) then
    raise exception 'activity % segment exceeds parent elapsed bounds', target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    left join public.activity_segments p on p.activity_id=s.activity_id and p.ordinal=s.ordinal-1
    left join public.activity_segments n on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='transition'
      and (p.role is distinct from 'activity' or n.role is distinct from 'activity')
  ) then raise exception 'activity % transition must be between activity segments', target_activity_id; end if;
  if exists (
    select 1 from public.activity_segments s join public.activity_segments n
      on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='rest' and n.role='rest'
  ) then raise exception 'activity % has consecutive rest segments', target_activity_id; end if;
  if parent_record.timing_coverage='complete' then
    if complete_count<>segment_count then
      raise exception 'activity % complete parent requires complete timing for every segment',target_activity_id;
    end if;
    if parent_record.active_ms is distinct from summed_active or parent_record.moving_ms is distinct from summed_moving then
      raise exception 'activity % complete timing does not reconcile with segments',target_activity_id;
    end if;
  elsif parent_record.active_ms is not null or parent_record.moving_ms is not null then
    raise exception 'activity % partial/unavailable parent timing totals must be null',target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    where s.activity_id=target_activity_id
       and (s.summary->>'version' is distinct from s.summary_version::text
         or s.summary#>>'{timing,timingCoverage}' is distinct from s.timing_coverage
         or (s.summary#>>'{timing,activeMs}')::bigint is distinct from s.active_ms
         or (s.summary#>>'{timing,movingMs}')::bigint is distinct from s.moving_ms)
  ) then raise exception 'activity % segment summary timing/version mismatch', target_activity_id; end if;
end $$;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid NOT NULL,
    activity_plan_id uuid,
    name text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL,
    notes text,
    provider public.integration_provider,
    external_id text,
    distance_meters integer DEFAULT 0 NOT NULL,
    elevation_gain_meters numeric(10,2),
    elevation_loss_meters numeric(10,2),
    calories integer,
    avg_heart_rate integer,
    max_heart_rate integer,
    avg_power integer,
    max_power integer,
    avg_cadence integer,
    max_cadence integer,
    avg_speed_mps numeric(6,2),
    max_speed_mps numeric(6,2),
    normalized_speed_mps numeric(6,2),
    normalized_graded_speed_mps numeric(6,2),
    avg_temperature numeric,
    avg_swolf numeric,
    efficiency_factor numeric,
    aerobic_decoupling numeric,
    pool_length numeric,
    total_strokes integer,
    device_manufacturer text,
    device_product text,
    polyline text,
    laps jsonb DEFAULT '[]'::jsonb NOT NULL,
    map_bounds jsonb,
    content_visibility text DEFAULT 'private'::text NOT NULL,
    elapsed_ms bigint NOT NULL,
    active_ms bigint,
    moving_ms bigint,
    timing_coverage text DEFAULT 'unavailable'::text NOT NULL,
    segments_revision integer DEFAULT 1 NOT NULL,
    parser_version text NOT NULL,
    decoded_contract_version text NOT NULL,
    materializer_version text NOT NULL,
    segments_generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activities_active_ms_check CHECK (((active_ms IS NULL) OR ((active_ms >= 0) AND (active_ms <= elapsed_ms)))),
    CONSTRAINT activities_content_visibility_check CHECK ((content_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text]))),
    CONSTRAINT activities_distance_meters_check CHECK ((distance_meters >= 0)),
    CONSTRAINT activities_elapsed_ms_check CHECK ((elapsed_ms > 0)),
    CONSTRAINT activities_laps_array_check CHECK ((jsonb_typeof(laps) = 'array'::text)),
    CONSTRAINT activities_laps_count_check CHECK ((jsonb_array_length(laps) <= 1000)),
    CONSTRAINT activities_laps_size_check CHECK ((pg_column_size(laps) <= 1048576)),
    CONSTRAINT activities_moving_ms_check CHECK (((moving_ms IS NULL) OR ((moving_ms >= 0) AND (moving_ms <= COALESCE(active_ms, elapsed_ms))))),
    CONSTRAINT activities_moving_time_check CHECK (((moving_ms IS NULL) OR (active_ms IS NULL) OR (moving_ms <= active_ms))),
    CONSTRAINT activities_provider_identity_check CHECK (((provider IS NULL) = (external_id IS NULL))),
    CONSTRAINT activities_segments_revision_check CHECK ((segments_revision > 0)),
    CONSTRAINT activities_timing_coverage_values_check CHECK ((((timing_coverage = 'complete'::text) AND (active_ms IS NOT NULL) AND (moving_ms IS NOT NULL)) OR ((timing_coverage = ANY (ARRAY['partial'::text, 'unavailable'::text])) AND (active_ms IS NULL) AND (moving_ms IS NULL))))
);


--
-- Name: activity_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    digest_algorithm text DEFAULT 'sha256'::text NOT NULL,
    digest text NOT NULL,
    byte_size bigint NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    media_type text NOT NULL,
    format text NOT NULL,
    original_name text,
    availability text DEFAULT 'accepted'::text NOT NULL,
    first_accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    retention_until timestamp with time zone,
    deletion_requested_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT activity_artifacts_availability_check CHECK ((availability = ANY (ARRAY['accepted'::text, 'deletion_pending'::text, 'deleted'::text]))),
    CONSTRAINT activity_artifacts_byte_size_check CHECK ((byte_size > 0)),
    CONSTRAINT activity_artifacts_content_addressed_path_check CHECK ((path = public.activity_artifact_content_path(profile_id, digest))),
    CONSTRAINT activity_artifacts_lifecycle_check CHECK ((((availability = 'accepted'::text) AND (deletion_requested_at IS NULL) AND (deleted_at IS NULL)) OR ((availability = 'deletion_pending'::text) AND (deletion_requested_at IS NOT NULL) AND (deleted_at IS NULL)) OR ((availability = 'deleted'::text) AND (deletion_requested_at IS NOT NULL) AND (deleted_at IS NOT NULL)))),
    CONSTRAINT activity_artifacts_path_check CHECK (((btrim(bucket) <> ''::text) AND (btrim(path) <> ''::text))),
    CONSTRAINT activity_artifacts_sha256_check CHECK (((digest_algorithm = 'sha256'::text) AND (digest ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: activity_efforts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_efforts (
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    profile_id uuid NOT NULL,
    activity_id uuid,
    recorded_at timestamp with time zone NOT NULL,
    effort_type public.effort_type NOT NULL,
    duration_seconds integer NOT NULL,
    start_offset integer,
    unit text NOT NULL,
    value real NOT NULL,
    source public.evidence_observation_source,
    method text,
    calculation_version text,
    quality_score numeric,
    provenance jsonb,
    segment_id uuid,
    activity_category text NOT NULL,
    distance_meters integer,
    CONSTRAINT activity_efforts_activity_segment_check CHECK ((((activity_id IS NULL) AND (segment_id IS NULL)) OR ((activity_id IS NOT NULL) AND (segment_id IS NOT NULL)))),
    CONSTRAINT activity_efforts_bike_power_max_check CHECK (((activity_category <> 'bike'::text) OR (effort_type <> 'power'::public.effort_type) OR (value <= (3000)::double precision))),
    CONSTRAINT activity_efforts_calculation_version_not_blank_check CHECK (((calculation_version IS NULL) OR (btrim(calculation_version) <> ''::text))),
    CONSTRAINT activity_efforts_distance_meters_bounds_check CHECK (((distance_meters IS NULL) OR ((distance_meters >= 1) AND (distance_meters <= 1000000)))),
    CONSTRAINT activity_efforts_heart_rate_bounds_check CHECK ((((effort_type)::text <> 'heart_rate'::text) OR ((value >= (30)::double precision) AND (value <= (240)::double precision)))),
    CONSTRAINT activity_efforts_method_not_blank_check CHECK (((method IS NULL) OR (btrim(method) <> ''::text))),
    CONSTRAINT activity_efforts_provenance_object_check CHECK (((provenance IS NULL) OR (jsonb_typeof(provenance) = 'object'::text))),
    CONSTRAINT activity_efforts_quality_score_range_check CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric)))),
    CONSTRAINT activity_efforts_run_speed_bounds_check CHECK (((activity_category <> 'run'::text) OR (effort_type <> 'speed'::public.effort_type) OR ((value >= (0.3)::double precision) AND (value <= (13)::double precision)))),
    CONSTRAINT activity_efforts_supported_combination_check CHECK ((((activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type)) OR ((activity_category = ANY (ARRAY['run'::text, 'swim'::text])) AND (effort_type = 'speed'::public.effort_type)) OR ((activity_category = ANY (ARRAY['bike'::text, 'run'::text, 'swim'::text])) AND ((effort_type)::text = 'heart_rate'::text)))),
    CONSTRAINT activity_efforts_swim_speed_bounds_check CHECK (((activity_category <> 'swim'::text) OR (effort_type <> 'speed'::public.effort_type) OR ((value >= (0.1)::double precision) AND (value <= (3)::double precision)))),
    CONSTRAINT activity_efforts_unit_compatibility_check CHECK ((((activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type) AND (unit = 'watts'::text)) OR ((activity_category = ANY (ARRAY['run'::text, 'swim'::text])) AND (effort_type = 'speed'::public.effort_type) AND (unit = 'meters_per_second'::text)) OR (((effort_type)::text = 'heart_rate'::text) AND (unit = 'bpm'::text)))),
    CONSTRAINT activity_efforts_value_finite_positive_check CHECK (COALESCE((((value > (0)::double precision) AND (value <> ALL (ARRAY['NaN'::real, 'Infinity'::real, '-Infinity'::real]))) OR ((value = (0)::double precision) AND (activity_id IS NULL) AND (activity_category = 'bike'::text) AND (effort_type = 'power'::public.effort_type) AND (source = 'manual'::public.evidence_observation_source) AND (method = 'profile_update_override'::text) AND ((provenance ->> 'override_state'::text) = 'cleared'::text))), false))
);


--
-- Name: activity_file_ingestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_file_ingestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid,
    profile_id uuid NOT NULL,
    source public.activity_file_ingestion_source NOT NULL,
    provider public.integration_provider,
    external_id text,
    status public.activity_file_ingestion_status DEFAULT 'pending_upload'::public.activity_file_ingestion_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error_message text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    artifact_id uuid,
    integration_id uuid,
    operation_key text NOT NULL,
    claim_token uuid,
    lease_expires_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    staging_bucket text,
    staging_path text,
    expected_sha256 text,
    expected_byte_size integer,
    expected_format text,
    expected_media_type text,
    accepted_sha256 text,
    accepted_byte_size integer,
    accepted_bucket text,
    accepted_path text,
    accepted_media_type text,
    accepted_format text,
    uploaded_at timestamp with time zone,
    staging_cleanup_pending boolean DEFAULT false NOT NULL,
    staging_cleaned_at timestamp with time zone,
    staging_cleanup_error text,
    CONSTRAINT activity_file_ingestions_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT activity_file_ingestions_claim_check CHECK (((claim_token IS NULL) = (lease_expires_at IS NULL))),
    CONSTRAINT activity_file_ingestions_operation_key_check CHECK ((btrim(operation_key) <> ''::text)),
    CONSTRAINT activity_file_ingestions_ready_check CHECK (((status <> 'ready'::public.activity_file_ingestion_status) OR ((activity_id IS NOT NULL) AND (artifact_id IS NOT NULL))))
);


--
-- Name: activity_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_plans (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid,
    name text NOT NULL,
    description text,
    notes text,
    structure jsonb NOT NULL,
    template_visibility text DEFAULT 'private'::text NOT NULL,
    import_provider text,
    import_external_id text,
    is_system_template boolean DEFAULT false NOT NULL,
    content_visibility text DEFAULT 'private'::text NOT NULL,
    structure_hash text NOT NULL,
    gps_recording_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT activity_plans_content_visibility_check CHECK ((content_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text]))),
    CONSTRAINT activity_plans_import_external_id_non_empty_check CHECK (((import_external_id IS NULL) OR (btrim(import_external_id) <> ''::text))),
    CONSTRAINT activity_plans_import_provider_non_empty_check CHECK (((import_provider IS NULL) OR (btrim(import_provider) <> ''::text))),
    CONSTRAINT activity_plans_structure_hash_check CHECK ((structure_hash ~ '^v1:sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT activity_plans_structure_v3_check CHECK (((jsonb_typeof(structure) = 'object'::text) AND ((structure ->> 'version'::text) = '3'::text) AND (jsonb_typeof((structure -> 'segments'::text)) = 'array'::text) AND ((jsonb_array_length((structure -> 'segments'::text)) >= 1) AND (jsonb_array_length((structure -> 'segments'::text)) <= 64)) AND (pg_column_size(structure) <= 1048576))),
    CONSTRAINT activity_plans_system_template_check CHECK ((((is_system_template = true) AND (profile_id IS NULL)) OR ((is_system_template = false) AND (profile_id IS NOT NULL)))),
    CONSTRAINT activity_plans_system_templates_public_check CHECK (((is_system_template = false) OR ((template_visibility = 'public'::text) AND (content_visibility = 'public'::text)))),
    CONSTRAINT activity_plans_template_visibility_check CHECK ((template_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text])))
);


--
-- Name: activity_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_routes (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid,
    name text NOT NULL,
    description text,
    file_path text NOT NULL,
    total_distance integer NOT NULL,
    total_ascent integer,
    total_descent integer,
    elevation_polyline text,
    polyline text NOT NULL,
    is_system_template boolean DEFAULT false NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    CONSTRAINT activity_routes_system_template_check CHECK ((((is_system_template = true) AND (profile_id IS NULL)) OR ((is_system_template = false) AND (profile_id IS NOT NULL)))),
    CONSTRAINT activity_routes_system_templates_public_check CHECK (((is_system_template = false) OR (is_public = true))),
    CONSTRAINT activity_routes_total_ascent_check CHECK ((total_ascent >= 0)),
    CONSTRAINT activity_routes_total_descent_check CHECK ((total_descent >= 0)),
    CONSTRAINT activity_routes_total_distance_check CHECK ((total_distance >= 0))
);


--
-- Name: activity_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_segments (
    id uuid NOT NULL,
    activity_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    ordinal integer NOT NULL,
    role text NOT NULL,
    category text,
    start_offset_ms bigint NOT NULL,
    end_offset_ms bigint NOT NULL,
    source_artifact_id uuid,
    source_session_index integer,
    source_message_index integer,
    raw_type_string text,
    raw_type_integer integer,
    raw_sport_string text,
    raw_sport_integer integer,
    summary jsonb NOT NULL,
    summary_version integer DEFAULT 1 NOT NULL,
    timing_coverage text NOT NULL,
    active_ms bigint,
    moving_ms bigint,
    segment_revision integer DEFAULT 1 NOT NULL,
    parser_version text NOT NULL,
    materializer_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_segments_moving_check CHECK (((moving_ms IS NULL) OR ((moving_ms >= 0) AND (moving_ms <= COALESCE(active_ms, (end_offset_ms - start_offset_ms)))))),
    CONSTRAINT activity_segments_offset_check CHECK (((start_offset_ms >= 0) AND (end_offset_ms > start_offset_ms))),
    CONSTRAINT activity_segments_ordinal_check CHECK ((ordinal >= 0)),
    CONSTRAINT activity_segments_revision_check CHECK ((segment_revision > 0)),
    CONSTRAINT activity_segments_role_category_check CHECK ((((role = 'activity'::text) AND (category IS NOT NULL)) OR ((role <> 'activity'::text) AND (category IS NULL)))),
    CONSTRAINT activity_segments_role_check CHECK ((role = ANY (ARRAY['activity'::text, 'transition'::text, 'rest'::text, 'unknown'::text]))),
    CONSTRAINT activity_segments_source_indexes_check CHECK ((((source_session_index IS NULL) AND (source_message_index IS NULL)) OR (source_artifact_id IS NOT NULL))),
    CONSTRAINT activity_segments_summary_check CHECK (((summary_version = 1) AND (jsonb_typeof(summary) = 'object'::text) AND (pg_column_size(summary) <= 1048576))),
    CONSTRAINT activity_segments_timing_check CHECK (((active_ms IS NULL) OR ((active_ms >= 0) AND (active_ms <= (end_offset_ms - start_offset_ms))))),
    CONSTRAINT activity_segments_timing_coverage_check CHECK ((timing_coverage = ANY (ARRAY['complete'::text, 'partial'::text, 'unavailable'::text]))),
    CONSTRAINT activity_segments_timing_coverage_values_check CHECK ((((timing_coverage = 'complete'::text) AND (active_ms IS NOT NULL) AND (moving_ms IS NOT NULL)) OR ((timing_coverage = 'partial'::text) AND (num_nonnulls(active_ms, moving_ms) > 0)) OR ((timing_coverage = 'unavailable'::text) AND (active_ms IS NULL) AND (moving_ms IS NULL)))),
    CONSTRAINT activity_segments_unknown_source_check CHECK (((role <> 'unknown'::text) OR (num_nonnulls(raw_type_string, raw_type_integer, raw_sport_string, raw_sport_integer) > 0)))
);


--
-- Name: activity_session_rpe_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_session_rpe_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    corrected_at timestamp with time zone,
    rpe integer NOT NULL,
    scale text NOT NULL,
    scale_version text NOT NULL,
    source public.activity_session_rpe_source NOT NULL,
    operation_id uuid NOT NULL,
    correction_of_id uuid,
    provenance jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_session_rpe_evidence_correction_manual_check CHECK (((correction_of_id IS NULL) OR (source = 'manual'::public.activity_session_rpe_source))),
    CONSTRAINT activity_session_rpe_evidence_correction_timestamp_check CHECK (((correction_of_id IS NULL) = (corrected_at IS NULL))),
    CONSTRAINT activity_session_rpe_evidence_provenance_object_check CHECK ((jsonb_typeof(provenance) = 'object'::text)),
    CONSTRAINT activity_session_rpe_evidence_rpe_bounds_check CHECK (((rpe >= 1) AND (rpe <= 10))),
    CONSTRAINT activity_session_rpe_evidence_scale_not_blank_check CHECK ((btrim(scale) <> ''::text)),
    CONSTRAINT activity_session_rpe_evidence_scale_version_not_blank_check CHECK ((btrim(scale_version) <> ''::text))
);


--
-- Name: api_rate_limit_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_rate_limit_windows (
    key_hash text NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    count integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT api_rate_limit_windows_count_check CHECK ((count > 0))
);


--
-- Name: canonical_activity_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canonical_activity_categories (
    code text NOT NULL,
    display_name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: coaches_athletes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaches_athletes (
    coach_id uuid NOT NULL,
    athlete_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revision integer DEFAULT 1 NOT NULL,
    CONSTRAINT coaches_athletes_revision_positive CHECK ((revision > 0))
);


--
-- Name: coaching_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaching_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    athlete_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid NOT NULL,
    profile_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: content_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_access_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type text NOT NULL,
    content_id uuid NOT NULL,
    grantee_profile_id uuid NOT NULL,
    actor_profile_id uuid,
    access_level text NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_at timestamp with time zone,
    last_read_message_id uuid,
    CONSTRAINT conversation_participants_read_cursor_pair_check CHECK (((last_read_at IS NULL) = (last_read_message_id IS NULL)))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    group_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid NOT NULL,
    event_type public.event_type NOT NULL,
    status public.event_status DEFAULT 'scheduled'::public.event_status NOT NULL,
    title text NOT NULL,
    description text,
    notes text,
    all_day boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    scheduled_date text NOT NULL,
    read_only boolean,
    training_plan_id uuid,
    activity_plan_id uuid,
    linked_activity_id uuid,
    route_id uuid,
    recurrence_rule text,
    recurrence_timezone text,
    series_id uuid,
    source_provider text,
    occurrence_key text DEFAULT ''::text NOT NULL,
    original_starts_at timestamp with time zone,
    integration_account_id uuid,
    external_calendar_id text,
    external_event_id text,
    schedule_batch_id uuid,
    lifecycle jsonb,
    recurrence jsonb,
    payload jsonb,
    CONSTRAINT events_external_calendar_non_empty CHECK (((external_calendar_id IS NULL) OR (btrim(external_calendar_id) <> ''::text))),
    CONSTRAINT events_external_event_non_empty CHECK (((external_event_id IS NULL) OR (btrim(external_event_id) <> ''::text))),
    CONSTRAINT events_recurrence_rule_non_empty CHECK (((recurrence_rule IS NULL) OR (btrim(recurrence_rule) <> ''::text))),
    CONSTRAINT events_recurrence_timezone_non_empty CHECK (((recurrence_timezone IS NULL) OR (btrim(recurrence_timezone) <> ''::text))),
    CONSTRAINT events_recurrence_timezone_requires_rule CHECK (((recurrence_timezone IS NULL) OR (recurrence_rule IS NOT NULL))),
    CONSTRAINT events_series_not_self CHECK (((series_id IS NULL) OR (series_id <> id))),
    CONSTRAINT events_series_occurrence_key_required CHECK (((series_id IS NULL) OR (btrim(occurrence_key) <> ''::text))),
    CONSTRAINT events_source_identity_complete CHECK ((((source_provider IS NULL) AND (integration_account_id IS NULL) AND (external_calendar_id IS NULL) AND (external_event_id IS NULL)) OR ((source_provider IS NOT NULL) AND (integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL) AND (external_event_id IS NOT NULL)))),
    CONSTRAINT events_source_provider_non_empty CHECK (((source_provider IS NULL) OR (btrim(source_provider) <> ''::text))),
    CONSTRAINT events_time_window CHECK (((ends_at IS NULL) OR (ends_at > starts_at)))
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: group_event_rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_event_rsvps (
    group_event_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_event_rsvps_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'declined'::text, 'tentative'::text])))
);


--
-- Name: group_event_series_rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_event_series_rsvps (
    group_event_series_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_event_series_rsvps_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'declined'::text, 'tentative'::text])))
);


--
-- Name: group_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    series_id uuid,
    created_by_profile_id uuid,
    title text,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    timezone text,
    recurrence_rule text,
    recurrence_timezone text,
    occurrence_key text,
    location_name text,
    route_id uuid,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_plan_id uuid,
    CONSTRAINT group_events_location_name_non_empty CHECK (((location_name IS NULL) OR (btrim(location_name) <> ''::text))),
    CONSTRAINT group_events_occurrence_key_required CHECK (((series_id IS NULL) OR ((occurrence_key IS NOT NULL) AND (btrim(occurrence_key) <> ''::text)))),
    CONSTRAINT group_events_recurrence_rule_non_empty CHECK (((recurrence_rule IS NULL) OR (btrim(recurrence_rule) <> ''::text))),
    CONSTRAINT group_events_recurrence_timezone_non_empty CHECK (((recurrence_timezone IS NULL) OR (btrim(recurrence_timezone) <> ''::text))),
    CONSTRAINT group_events_recurrence_timezone_requires_rule CHECK (((recurrence_timezone IS NULL) OR (recurrence_rule IS NOT NULL))),
    CONSTRAINT group_events_recurring_series_timezone_required CHECK (((recurrence_rule IS NULL) OR (timezone IS NOT NULL))),
    CONSTRAINT group_events_root_title_required CHECK (((series_id IS NOT NULL) OR (title IS NOT NULL))),
    CONSTRAINT group_events_series_not_self CHECK (((series_id IS NULL) OR (series_id <> id))),
    CONSTRAINT group_events_time_window CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT group_events_timezone_non_empty CHECK (((timezone IS NULL) OR (btrim(timezone) <> ''::text))),
    CONSTRAINT group_events_title_non_empty CHECK (((title IS NULL) OR (btrim(title) <> ''::text)))
);


--
-- Name: group_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    invited_profile_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: group_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'cancelled'::text])))
);


--
-- Name: group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_memberships (
    group_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))),
    CONSTRAINT group_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'left'::text, 'removed'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by_profile_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    avatar_url text,
    cover_url text,
    access_level text DEFAULT 'public'::text NOT NULL,
    join_policy text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT groups_access_level_check CHECK ((access_level = ANY (ARRAY['public'::text, 'members_only'::text]))),
    CONSTRAINT groups_join_policy_check CHECK ((join_policy = ANY (ARRAY['open'::text, 'request_to_join'::text, 'invite_only'::text]))),
    CONSTRAINT groups_name_non_empty CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT groups_slug_non_empty CHECK ((btrim(slug) <> ''::text))
);


--
-- Name: integration_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_credentials (
    integration_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp with time zone,
    scope text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    reconnect_required_at timestamp with time zone
);


--
-- Name: integration_resource_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_resource_links (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone,
    profile_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    provider public.integration_provider NOT NULL,
    resource_kind public.integration_resource_kind NOT NULL,
    internal_resource_id uuid NOT NULL,
    external_id text NOT NULL,
    provider_updated_at timestamp with time zone,
    provider_metadata jsonb,
    payload_hash text
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    provider public.integration_provider NOT NULL,
    external_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lifecycle_status text DEFAULT 'active'::text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    disconnect_requested_at timestamp with time zone,
    disconnected_at timestamp with time zone,
    remote_revoked_at timestamp with time zone
);


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    profile_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    entity_type public.like_entity_type NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    read_at timestamp with time zone
);


--
-- Name: multisport_cutover_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisport_cutover_audits (
    run_id uuid NOT NULL,
    manifest_checksum text NOT NULL,
    final_manifest_checksum text NOT NULL,
    snapshot_hash text NOT NULL,
    staging_hash text NOT NULL,
    backup_hash text NOT NULL,
    storage_archive_hash text NOT NULL,
    storage_inventory_hash text NOT NULL,
    status text NOT NULL,
    migrated_at timestamp with time zone DEFAULT now() NOT NULL,
    audited_at timestamp with time zone
);


--
-- Name: multisport_cutover_template_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisport_cutover_template_audits (
    run_id uuid NOT NULL,
    activity_plan_id uuid NOT NULL,
    before_semantic_hash text,
    after_semantic_hash text NOT NULL,
    source_semantic_hash text,
    is_new_source boolean NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    entity_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: oauth_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state text NOT NULL,
    profile_id uuid NOT NULL,
    provider public.integration_provider NOT NULL,
    mobile_redirect_uri text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    callback_uri text,
    requested_scope text,
    verifier_hash text
);


--
-- Name: organization_membership_role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_membership_role_grants (
    organization_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    role_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_membership_role_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: organization_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_permissions (
    key text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_permissions_description_non_empty CHECK ((btrim(description) <> ''::text)),
    CONSTRAINT organization_permissions_key_check CHECK ((key = 'coaching.access'::text))
);


--
-- Name: organization_role_permission_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_role_permission_grants (
    role_id uuid NOT NULL,
    permission_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_roles_key_non_empty CHECK ((btrim(key) <> ''::text)),
    CONSTRAINT organization_roles_name_non_empty CHECK ((btrim(name) <> ''::text))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by_profile_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_name_non_empty CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT organizations_slug_non_empty CHECK ((btrim(slug) <> ''::text))
);


--
-- Name: profile_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_goals (
    id uuid NOT NULL,
    profile_id uuid NOT NULL,
    title text NOT NULL,
    priority integer NOT NULL,
    activity_category text,
    target_date date,
    target_payload jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: profile_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_metrics (
    id uuid NOT NULL,
    idx integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid NOT NULL,
    metric_type public.profile_metric_type NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    unit text NOT NULL,
    notes text,
    reference_activity_id uuid,
    value numeric NOT NULL,
    source public.evidence_observation_source,
    method text,
    calculation_version text,
    quality_score numeric,
    provenance jsonb,
    CONSTRAINT profile_metrics_calculation_version_not_blank_check CHECK (((calculation_version IS NULL) OR (btrim(calculation_version) <> ''::text))),
    CONSTRAINT profile_metrics_method_not_blank_check CHECK (((method IS NULL) OR (btrim(method) <> ''::text))),
    CONSTRAINT profile_metrics_provenance_object_check CHECK (((provenance IS NULL) OR (jsonb_typeof(provenance) = 'object'::text))),
    CONSTRAINT profile_metrics_quality_score_range_check CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric)))),
    CONSTRAINT profile_metrics_value_check CHECK ((value >= (0)::numeric))
);


--
-- Name: profile_metrics_idx_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_metrics_idx_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_metrics_idx_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_metrics_idx_seq OWNED BY public.profile_metrics.idx;


--
-- Name: profile_training_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_training_settings (
    profile_id uuid NOT NULL,
    settings jsonb NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    full_name text,
    username text,
    avatar_url text,
    cover_url text,
    bio text,
    dob timestamp with time zone,
    gender public.gender,
    language text,
    preferred_units text,
    onboarded boolean,
    is_public boolean DEFAULT false NOT NULL,
    planning_timezone text,
    default_content_visibility text DEFAULT 'private'::text NOT NULL,
    CONSTRAINT profiles_default_content_visibility_check CHECK ((default_content_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text]))),
    CONSTRAINT profiles_preferred_units_check CHECK (((preferred_units IS NULL) OR (preferred_units = ANY (ARRAY['metric'::text, 'imperial'::text]))))
);


--
-- Name: provider_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    provider public.integration_provider NOT NULL,
    job_type text NOT NULL,
    operation text,
    resource_kind public.integration_resource_kind,
    internal_resource_id uuid,
    sync_lane_key text,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 8 NOT NULL,
    dedupe_key text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    payload_hash text,
    supersedes_job_id uuid,
    last_error text,
    locked_at timestamp with time zone,
    lock_expires_at timestamp with time zone,
    locked_by text,
    queue_sequence bigint NOT NULL,
    integration_generation integer DEFAULT 1 NOT NULL
);


--
-- Name: provider_sync_jobs_queue_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.provider_sync_jobs ALTER COLUMN queue_sequence ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.provider_sync_jobs_queue_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: provider_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    integration_id uuid NOT NULL,
    provider public.integration_provider NOT NULL,
    resource text NOT NULL,
    publish_horizon_days integer,
    sync_mode text NOT NULL,
    last_sync_started_at timestamp with time zone,
    last_sync_succeeded_at timestamp with time zone,
    last_sync_failed_at timestamp with time zone,
    next_sync_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_error text,
    cursor text,
    high_watermark timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: provider_webhook_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_webhook_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    provider public.integration_provider NOT NULL,
    integration_id uuid,
    provider_account_id text,
    provider_event_id text,
    event_type text NOT NULL,
    object_type text,
    object_id text,
    payload jsonb NOT NULL,
    payload_hash text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    job_id uuid,
    last_error text,
    integration_generation integer
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL
);


--
-- Name: training_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plans (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_id uuid,
    name text NOT NULL,
    description text,
    structure jsonb NOT NULL,
    template_visibility text DEFAULT 'private'::text NOT NULL,
    is_system_template boolean DEFAULT false NOT NULL,
    sessions_per_week_target integer,
    duration_hours numeric(12,2),
    content_visibility text DEFAULT 'private'::text NOT NULL,
    structure_hash text NOT NULL,
    CONSTRAINT training_plans_content_visibility_check CHECK ((content_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text]))),
    CONSTRAINT training_plans_structure_hash_check CHECK ((structure_hash ~ '^v1:sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT training_plans_structure_v1_check CHECK (((jsonb_typeof(structure) = 'object'::text) AND ((structure ->> 'version'::text) = '1'::text) AND (jsonb_typeof((structure -> 'sessions'::text)) = 'array'::text) AND (jsonb_array_length((structure -> 'sessions'::text)) > 0) AND (pg_column_size(structure) <= 1048576))),
    CONSTRAINT training_plans_system_templates_public_check CHECK (((is_system_template = false) OR ((template_visibility = 'public'::text) AND (content_visibility = 'public'::text)))),
    CONSTRAINT training_plans_template_profile_check CHECK ((((is_system_template = true) AND (profile_id IS NULL)) OR ((is_system_template = false) AND (profile_id IS NOT NULL)))),
    CONSTRAINT training_plans_template_visibility_check CHECK ((template_visibility = ANY (ARRAY['private'::text, 'followers'::text, 'public'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_metrics idx; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_metrics ALTER COLUMN idx SET DEFAULT nextval('public.profile_metrics_idx_seq'::regclass);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: activities activities_id_profile_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_id_profile_id_unique UNIQUE (id, profile_id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activity_artifact_links activity_artifact_links_activity_artifact_profile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_activity_artifact_profile_unique UNIQUE (activity_id, artifact_id, profile_id);


--
-- Name: activity_artifact_links activity_artifact_links_activity_artifact_role_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_activity_artifact_role_unique UNIQUE (activity_id, artifact_id, role);


--
-- Name: activity_artifact_links activity_artifact_links_activity_role_ordinal_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_activity_role_ordinal_unique UNIQUE (activity_id, role, ordinal);


--
-- Name: activity_artifact_links activity_artifact_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_pkey PRIMARY KEY (id);


--
-- Name: activity_artifacts activity_artifacts_bucket_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifacts
    ADD CONSTRAINT activity_artifacts_bucket_path_unique UNIQUE (bucket, path);


--
-- Name: activity_artifacts activity_artifacts_id_profile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifacts
    ADD CONSTRAINT activity_artifacts_id_profile_unique UNIQUE (id, profile_id);


--
-- Name: activity_artifacts activity_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifacts
    ADD CONSTRAINT activity_artifacts_pkey PRIMARY KEY (id);


--
-- Name: activity_artifacts activity_artifacts_profile_digest_size_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifacts
    ADD CONSTRAINT activity_artifacts_profile_digest_size_unique UNIQUE (profile_id, digest_algorithm, digest, byte_size);


--
-- Name: activity_efforts activity_efforts_duration_seconds_bounds_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_efforts
    ADD CONSTRAINT activity_efforts_duration_seconds_bounds_check CHECK (((duration_seconds >= 1) AND (duration_seconds <= 14400)));


--
-- Name: activity_efforts activity_efforts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_efforts
    ADD CONSTRAINT activity_efforts_pkey PRIMARY KEY (id);


--
-- Name: activity_file_ingestions activity_file_ingestions_accepted_hash_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_accepted_hash_check CHECK (((accepted_sha256 IS NULL) OR (accepted_sha256 ~ '^[0-9a-f]{64}$'::text)));


--
-- Name: activity_file_ingestions activity_file_ingestions_accepted_metadata_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_accepted_metadata_check CHECK (((num_nonnulls(accepted_sha256, accepted_byte_size, accepted_bucket, accepted_path, accepted_media_type, accepted_format, uploaded_at) = ANY (ARRAY[0, 7])) AND ((accepted_sha256 IS NULL) OR ((status = 'ready'::public.activity_file_ingestion_status) AND (btrim(accepted_bucket) <> ''::text) AND (btrim(accepted_path) <> ''::text) AND (accepted_format = ANY (ARRAY['fit'::text, 'gpx'::text, 'tcx'::text])) AND (accepted_path = ((('artifacts/sha256/'::text || (profile_id)::text) || '/'::text) || accepted_sha256))))));


--
-- Name: activity_file_ingestions activity_file_ingestions_accepted_size_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_accepted_size_check CHECK (((accepted_byte_size IS NULL) OR (accepted_byte_size > 0)));


--
-- Name: activity_file_ingestions activity_file_ingestions_claim_artifact_match_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_claim_artifact_match_check CHECK (((expected_sha256 IS NULL) OR (accepted_sha256 IS NULL) OR ((accepted_sha256 = expected_sha256) AND (accepted_byte_size = expected_byte_size) AND (accepted_bucket = staging_bucket) AND (accepted_format = expected_format) AND (accepted_media_type = expected_media_type))));


--
-- Name: activity_file_ingestions activity_file_ingestions_cleanup_state_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_cleanup_state_check CHECK ((((NOT staging_cleanup_pending) OR ((status = 'ready'::public.activity_file_ingestion_status) AND (staging_path IS NOT NULL) AND (accepted_path IS NOT NULL))) AND ((staging_cleaned_at IS NULL) OR ((NOT staging_cleanup_pending) AND (staging_path IS NOT NULL))) AND ((staging_cleanup_error IS NULL) OR staging_cleanup_pending) AND (NOT ((staging_cleaned_at IS NOT NULL) AND (staging_cleanup_error IS NOT NULL)))));


--
-- Name: activity_file_ingestions activity_file_ingestions_expected_hash_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_expected_hash_check CHECK (((expected_sha256 IS NULL) OR (expected_sha256 ~ '^[0-9a-f]{64}$'::text)));


--
-- Name: activity_file_ingestions activity_file_ingestions_expected_size_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_expected_size_check CHECK (((expected_byte_size IS NULL) OR (expected_byte_size > 0)));


--
-- Name: activity_file_ingestions activity_file_ingestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_pkey PRIMARY KEY (id);


--
-- Name: activity_file_ingestions activity_file_ingestions_processing_claim_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_processing_claim_check CHECK ((((status = 'processing'::public.activity_file_ingestion_status) AND (claim_token IS NOT NULL) AND (lease_expires_at IS NOT NULL)) OR ((status <> 'processing'::public.activity_file_ingestion_status) AND (claim_token IS NULL) AND (lease_expires_at IS NULL))));


--
-- Name: activity_file_ingestions activity_file_ingestions_staging_metadata_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_staging_metadata_check CHECK (((num_nonnulls(staging_bucket, staging_path, expected_sha256, expected_byte_size, expected_format, expected_media_type) = ANY (ARRAY[0, 6])) AND ((staging_bucket IS NULL) OR ((btrim(staging_bucket) <> ''::text) AND (btrim(staging_path) <> ''::text) AND (((expected_format = 'fit'::text) AND (expected_media_type = 'application/vnd.ant.fit'::text)) OR ((expected_format = 'gpx'::text) AND (expected_media_type = 'application/gpx+xml'::text)) OR ((expected_format = 'tcx'::text) AND (expected_media_type = 'application/vnd.garmin.tcx+xml'::text)))))));


--
-- Name: activity_plans activity_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_plans
    ADD CONSTRAINT activity_plans_pkey PRIMARY KEY (id);


--
-- Name: activity_routes activity_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_routes
    ADD CONSTRAINT activity_routes_pkey PRIMARY KEY (id);


--
-- Name: activity_segments activity_segments_activity_id_int8range_excl; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_activity_id_int8range_excl EXCLUDE USING gist (activity_id WITH =, int8range(start_offset_ms, end_offset_ms, '[)'::text) WITH &&) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: activity_segments activity_segments_activity_ordinal_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_activity_ordinal_unique UNIQUE (activity_id, ordinal);


--
-- Name: activity_segments activity_segments_effort_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_effort_category_unique UNIQUE (id, activity_id, profile_id, category);


--
-- Name: activity_segments activity_segments_id_activity_profile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_id_activity_profile_unique UNIQUE (id, activity_id, profile_id);


--
-- Name: activity_segments activity_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_pkey PRIMARY KEY (id);


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_id_activity_profile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_id_activity_profile_unique UNIQUE (id, activity_id, profile_id);


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_pkey PRIMARY KEY (id);


--
-- Name: api_rate_limit_windows api_rate_limit_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_rate_limit_windows
    ADD CONSTRAINT api_rate_limit_windows_pkey PRIMARY KEY (key_hash, window_started_at);


--
-- Name: canonical_activity_categories canonical_activity_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_activity_categories
    ADD CONSTRAINT canonical_activity_categories_pkey PRIMARY KEY (code);


--
-- Name: coaches_athletes coaches_athletes_coach_id_athlete_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches_athletes
    ADD CONSTRAINT coaches_athletes_coach_id_athlete_id_pk PRIMARY KEY (coach_id, athlete_id);


--
-- Name: coaching_invitations coaching_invitations_athlete_coach_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_invitations
    ADD CONSTRAINT coaching_invitations_athlete_coach_unique UNIQUE (athlete_id, coach_id);


--
-- Name: coaching_invitations coaching_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_invitations
    ADD CONSTRAINT coaching_invitations_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: content_access_grants content_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants
    ADD CONSTRAINT content_access_grants_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_pk PRIMARY KEY (conversation_id, user_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: events events_id_profile_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_id_profile_id_unique UNIQUE (id, profile_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: follows follows_follower_id_following_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_following_id_pk PRIMARY KEY (follower_id, following_id);


--
-- Name: group_event_rsvps group_event_rsvps_group_event_id_profile_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_rsvps
    ADD CONSTRAINT group_event_rsvps_group_event_id_profile_id_pk PRIMARY KEY (group_event_id, profile_id);


--
-- Name: group_event_series_rsvps group_event_series_rsvps_group_event_series_id_profile_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_series_rsvps
    ADD CONSTRAINT group_event_series_rsvps_group_event_series_id_profile_id_pk PRIMARY KEY (group_event_series_id, profile_id);


--
-- Name: group_events group_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_pkey PRIMARY KEY (id);


--
-- Name: group_invitations group_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_pkey PRIMARY KEY (id);


--
-- Name: group_join_requests group_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_join_requests
    ADD CONSTRAINT group_join_requests_pkey PRIMARY KEY (id);


--
-- Name: group_memberships group_memberships_group_id_profile_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships
    ADD CONSTRAINT group_memberships_group_id_profile_id_pk PRIMARY KEY (group_id, profile_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: integration_credentials integration_credentials_generation_positive; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.integration_credentials
    ADD CONSTRAINT integration_credentials_generation_positive CHECK ((generation > 0));


--
-- Name: integration_credentials integration_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_pkey PRIMARY KEY (integration_id);


--
-- Name: integration_resource_links integration_resource_links_external_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_resource_links
    ADD CONSTRAINT integration_resource_links_external_unique UNIQUE (integration_id, resource_kind, external_id);


--
-- Name: integration_resource_links integration_resource_links_internal_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_resource_links
    ADD CONSTRAINT integration_resource_links_internal_unique UNIQUE (integration_id, resource_kind, internal_resource_id);


--
-- Name: integration_resource_links integration_resource_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_resource_links
    ADD CONSTRAINT integration_resource_links_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_disconnect_timestamps_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_disconnect_timestamps_check CHECK ((((lifecycle_status = 'active'::text) AND (disconnect_requested_at IS NULL) AND (disconnected_at IS NULL)) OR ((lifecycle_status = 'disconnect_pending'::text) AND (disconnect_requested_at IS NOT NULL) AND (disconnected_at IS NULL)) OR ((lifecycle_status = 'disconnected'::text) AND (disconnect_requested_at IS NOT NULL) AND (disconnected_at IS NOT NULL))));


--
-- Name: integrations integrations_generation_positive_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_generation_positive_check CHECK ((generation > 0));


--
-- Name: integrations integrations_lifecycle_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['active'::text, 'disconnect_pending'::text, 'disconnected'::text])));


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (id);


--
-- Name: likes likes_profile_entity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_profile_entity_unique UNIQUE (profile_id, entity_type, entity_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: multisport_cutover_audits multisport_cutover_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisport_cutover_audits
    ADD CONSTRAINT multisport_cutover_audits_pkey PRIMARY KEY (run_id);


--
-- Name: multisport_cutover_template_audits multisport_cutover_template_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisport_cutover_template_audits
    ADD CONSTRAINT multisport_cutover_template_audits_pkey PRIMARY KEY (run_id, activity_plan_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_states oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (id);


--
-- Name: organization_membership_role_grants organization_membership_role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership_role_grants
    ADD CONSTRAINT organization_membership_role_grants_pkey PRIMARY KEY (membership_id, role_id);


--
-- Name: organization_memberships organization_memberships_id_organization_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_id_organization_unique UNIQUE (id, organization_id);


--
-- Name: organization_memberships organization_memberships_organization_profile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_profile_unique UNIQUE (organization_id, profile_id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organization_permissions organization_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_permissions
    ADD CONSTRAINT organization_permissions_pkey PRIMARY KEY (key);


--
-- Name: organization_role_permission_grants organization_role_permission_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permission_grants
    ADD CONSTRAINT organization_role_permission_grants_pkey PRIMARY KEY (role_id, permission_key);


--
-- Name: organization_roles organization_roles_id_organization_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_roles
    ADD CONSTRAINT organization_roles_id_organization_unique UNIQUE (id, organization_id);


--
-- Name: organization_roles organization_roles_organization_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_roles
    ADD CONSTRAINT organization_roles_organization_key_unique UNIQUE (organization_id, key);


--
-- Name: organization_roles organization_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_roles
    ADD CONSTRAINT organization_roles_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: profile_goals profile_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_goals
    ADD CONSTRAINT profile_goals_pkey PRIMARY KEY (id);


--
-- Name: profile_metrics profile_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_metrics
    ADD CONSTRAINT profile_metrics_pkey PRIMARY KEY (id);


--
-- Name: profile_training_settings profile_training_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_training_settings
    ADD CONSTRAINT profile_training_settings_pkey PRIMARY KEY (profile_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: provider_sync_jobs provider_sync_jobs_integration_generation_positive_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.provider_sync_jobs
    ADD CONSTRAINT provider_sync_jobs_integration_generation_positive_check CHECK ((integration_generation > 0));


--
-- Name: provider_sync_jobs provider_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_jobs
    ADD CONSTRAINT provider_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: provider_sync_state provider_sync_state_integration_resource_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_state
    ADD CONSTRAINT provider_sync_state_integration_resource_unique UNIQUE (integration_id, resource);


--
-- Name: provider_sync_state provider_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_state
    ADD CONSTRAINT provider_sync_state_pkey PRIMARY KEY (id);


--
-- Name: provider_webhook_receipts provider_webhook_receipts_event_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_event_unique UNIQUE (provider, provider_account_id, provider_event_id);


--
-- Name: provider_webhook_receipts provider_webhook_receipts_integration_generation_pair_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_integration_generation_pair_check CHECK (((integration_id IS NULL) = (integration_generation IS NULL)));


--
-- Name: provider_webhook_receipts provider_webhook_receipts_integration_generation_positive_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_integration_generation_positive_check CHECK (((integration_generation IS NULL) OR (integration_generation > 0)));


--
-- Name: provider_webhook_receipts provider_webhook_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_key_key UNIQUE (key);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);


--
-- Name: training_plans training_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_pkey PRIMARY KEY (id);


--
-- Name: integrations unique_integration_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT unique_integration_type UNIQUE (profile_id, provider);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: accounts_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "accounts_userId_idx" ON public.accounts USING btree (user_id);


--
-- Name: activity_artifact_links_current_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_artifact_links_current_source_unique ON public.activity_artifact_links USING btree (activity_id) WHERE ((role = 'source'::text) AND is_current);


--
-- Name: activity_file_ingestions_profile_operation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_file_ingestions_profile_operation_unique ON public.activity_file_ingestions USING btree (profile_id, operation_key);


--
-- Name: activity_session_rpe_evidence_one_replacement_per_evidence_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_session_rpe_evidence_one_replacement_per_evidence_uniq ON public.activity_session_rpe_evidence USING btree (correction_of_id) WHERE (correction_of_id IS NOT NULL);


--
-- Name: activity_session_rpe_evidence_profile_operation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_session_rpe_evidence_profile_operation_unique ON public.activity_session_rpe_evidence USING btree (profile_id, operation_id);


--
-- Name: content_access_grants_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX content_access_grants_source_unique ON public.content_access_grants USING btree (content_type, content_id, grantee_profile_id, access_level, source_type, source_id);


--
-- Name: group_event_rsvps_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_event_rsvps_profile_status_idx ON public.group_event_rsvps USING btree (profile_id, status);


--
-- Name: group_event_series_rsvps_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_event_series_rsvps_profile_status_idx ON public.group_event_series_rsvps USING btree (profile_id, status);


--
-- Name: group_events_group_cancelled_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_events_group_cancelled_starts_at_idx ON public.group_events USING btree (group_id, cancelled_at, starts_at);


--
-- Name: group_events_group_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_events_group_starts_at_idx ON public.group_events USING btree (group_id, starts_at);


--
-- Name: group_events_series_occurrence_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX group_events_series_occurrence_unique_idx ON public.group_events USING btree (series_id, occurrence_key) WHERE (series_id IS NOT NULL);


--
-- Name: group_events_series_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_events_series_starts_at_idx ON public.group_events USING btree (series_id, starts_at) WHERE (series_id IS NOT NULL);


--
-- Name: group_invitations_invited_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_invitations_invited_profile_status_idx ON public.group_invitations USING btree (invited_profile_id, status);


--
-- Name: group_invitations_pending_profile_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX group_invitations_pending_profile_unique_idx ON public.group_invitations USING btree (group_id, invited_profile_id) WHERE (status = 'pending'::text);


--
-- Name: group_join_requests_group_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_join_requests_group_status_idx ON public.group_join_requests USING btree (group_id, status);


--
-- Name: group_join_requests_pending_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX group_join_requests_pending_unique_idx ON public.group_join_requests USING btree (group_id, profile_id) WHERE (status = 'pending'::text);


--
-- Name: group_memberships_group_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_memberships_group_status_idx ON public.group_memberships USING btree (group_id, status);


--
-- Name: group_memberships_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_memberships_profile_status_idx ON public.group_memberships USING btree (profile_id, status);


--
-- Name: groups_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_created_at_idx ON public.groups USING btree (created_at DESC NULLS LAST) WHERE (deleted_at IS NULL);


--
-- Name: groups_slug_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX groups_slug_unique_idx ON public.groups USING btree (slug) WHERE (deleted_at IS NULL);


--
-- Name: idx_activities_activity_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_activity_plan ON public.activities USING btree (activity_plan_id) WHERE (activity_plan_id IS NOT NULL);


--
-- Name: idx_activities_content_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_content_visibility ON public.activities USING btree (content_visibility);


--
-- Name: idx_activities_profile_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_profile_started ON public.activities USING btree (profile_id, started_at);


--
-- Name: idx_activities_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_provider_external ON public.activities USING btree (provider, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_activities_provider_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_activities_provider_external_unique ON public.activities USING btree (provider, external_id) WHERE ((provider IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: idx_activities_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_started ON public.activities USING btree (started_at);


--
-- Name: idx_activity_artifact_links_artifact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_artifact_links_artifact ON public.activity_artifact_links USING btree (artifact_id);


--
-- Name: idx_activity_artifacts_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_artifacts_profile ON public.activity_artifacts USING btree (profile_id);


--
-- Name: idx_activity_efforts_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_efforts_activity_id ON public.activity_efforts USING btree (activity_id);


--
-- Name: idx_activity_efforts_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_efforts_profile_id ON public.activity_efforts USING btree (profile_id);


--
-- Name: idx_activity_efforts_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_efforts_segment_id ON public.activity_efforts USING btree (segment_id);


--
-- Name: idx_activity_file_ingestions_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_activity_id ON public.activity_file_ingestions USING btree (activity_id);


--
-- Name: idx_activity_file_ingestions_activity_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_activity_profile ON public.activity_file_ingestions USING btree (activity_id, profile_id);


--
-- Name: idx_activity_file_ingestions_artifact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_artifact_id ON public.activity_file_ingestions USING btree (artifact_id) WHERE (artifact_id IS NOT NULL);


--
-- Name: idx_activity_file_ingestions_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_profile_id ON public.activity_file_ingestions USING btree (profile_id);


--
-- Name: idx_activity_file_ingestions_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_provider_external ON public.activity_file_ingestions USING btree (provider, external_id) WHERE ((provider IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: idx_activity_file_ingestions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_file_ingestions_status ON public.activity_file_ingestions USING btree (status);


--
-- Name: idx_activity_plans_content_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_plans_content_visibility ON public.activity_plans USING btree (content_visibility);


--
-- Name: idx_activity_plans_import_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_activity_plans_import_identity ON public.activity_plans USING btree (profile_id, import_provider, import_external_id) WHERE ((import_provider IS NOT NULL) AND (import_external_id IS NOT NULL));


--
-- Name: idx_activity_plans_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_plans_profile_id ON public.activity_plans USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: idx_activity_plans_structure_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_plans_structure_categories ON public.activity_plans USING gin (structure jsonb_path_ops);


--
-- Name: idx_activity_plans_system_templates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_plans_system_templates ON public.activity_plans USING btree (is_system_template) WHERE (is_system_template = true);


--
-- Name: idx_activity_plans_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_plans_visibility ON public.activity_plans USING btree (template_visibility);


--
-- Name: idx_activity_segments_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_segments_activity ON public.activity_segments USING btree (activity_id, ordinal);


--
-- Name: idx_activity_segments_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_segments_category ON public.activity_segments USING btree (category) WHERE (category IS NOT NULL);


--
-- Name: idx_activity_session_rpe_evidence_activity_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_session_rpe_evidence_activity_recorded ON public.activity_session_rpe_evidence USING btree (activity_id, recorded_at, id) WHERE (correction_of_id IS NULL);


--
-- Name: idx_api_rate_limit_windows_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_rate_limit_windows_expiry ON public.api_rate_limit_windows USING btree (expires_at);


--
-- Name: idx_coaches_athletes_active_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coaches_athletes_active_lookup ON public.coaches_athletes USING btree (coach_id, athlete_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_coaches_athletes_athlete_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coaches_athletes_athlete_id ON public.coaches_athletes USING btree (athlete_id);


--
-- Name: idx_coaches_athletes_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coaches_athletes_coach_id ON public.coaches_athletes USING btree (coach_id);


--
-- Name: idx_coaching_invitations_athlete_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coaching_invitations_athlete_id ON public.coaching_invitations USING btree (athlete_id);


--
-- Name: idx_coaching_invitations_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coaching_invitations_coach_id ON public.coaching_invitations USING btree (coach_id);


--
-- Name: idx_comments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_created_at ON public.comments USING btree (created_at);


--
-- Name: idx_comments_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_entity ON public.comments USING btree (entity_type, entity_id);


--
-- Name: idx_comments_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_profile_id ON public.comments USING btree (profile_id, created_at);


--
-- Name: idx_content_access_grants_active_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_active_expiry ON public.content_access_grants USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND (revoked_at IS NULL));


--
-- Name: idx_content_access_grants_actor_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_actor_profile_id ON public.content_access_grants USING btree (actor_profile_id) WHERE (actor_profile_id IS NOT NULL);


--
-- Name: idx_content_access_grants_grantee_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_grantee_content ON public.content_access_grants USING btree (grantee_profile_id, content_type, content_id);


--
-- Name: idx_content_access_grants_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_access_grants_source ON public.content_access_grants USING btree (source_type, source_id);


--
-- Name: idx_conversation_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants USING btree (user_id);


--
-- Name: idx_events_activity_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_activity_plan_id ON public.events USING btree (activity_plan_id) WHERE (activity_plan_id IS NOT NULL);


--
-- Name: idx_events_event_type_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_event_type_starts_at ON public.events USING btree (event_type, starts_at);


--
-- Name: idx_events_external_identity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_events_external_identity_unique ON public.events USING btree (source_provider, integration_account_id, external_calendar_id, external_event_id, occurrence_key) WHERE ((source_provider IS NOT NULL) AND (integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL) AND (external_event_id IS NOT NULL));


--
-- Name: idx_events_integration_calendar_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_integration_calendar_updated ON public.events USING btree (integration_account_id, external_calendar_id, updated_at) WHERE ((integration_account_id IS NOT NULL) AND (external_calendar_id IS NOT NULL));


--
-- Name: idx_events_linked_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_linked_activity_id ON public.events USING btree (linked_activity_id) WHERE (linked_activity_id IS NOT NULL);


--
-- Name: idx_events_profile_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_profile_starts_at ON public.events USING btree (profile_id, starts_at);


--
-- Name: idx_events_profile_status_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_profile_status_starts_at ON public.events USING btree (profile_id, status, starts_at);


--
-- Name: idx_events_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_route_id ON public.events USING btree (route_id) WHERE (route_id IS NOT NULL);


--
-- Name: idx_events_schedule_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_schedule_batch ON public.events USING btree (profile_id, schedule_batch_id) WHERE (schedule_batch_id IS NOT NULL);


--
-- Name: idx_events_series_occurrence_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_events_series_occurrence_unique ON public.events USING btree (series_id, occurrence_key) WHERE (series_id IS NOT NULL);


--
-- Name: idx_events_training_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_training_plan_id ON public.events USING btree (training_plan_id) WHERE (training_plan_id IS NOT NULL);


--
-- Name: idx_follows_following_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_following_id ON public.follows USING btree (following_id);


--
-- Name: idx_group_events_activity_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_events_activity_plan_id ON public.group_events USING btree (activity_plan_id) WHERE (activity_plan_id IS NOT NULL);


--
-- Name: idx_group_events_created_by_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_events_created_by_profile_id ON public.group_events USING btree (created_by_profile_id) WHERE (created_by_profile_id IS NOT NULL);


--
-- Name: idx_group_events_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_events_route_id ON public.group_events USING btree (route_id) WHERE (route_id IS NOT NULL);


--
-- Name: idx_group_join_requests_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_join_requests_profile_id ON public.group_join_requests USING btree (profile_id);


--
-- Name: idx_groups_created_by_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_created_by_profile_id ON public.groups USING btree (created_by_profile_id);


--
-- Name: idx_integration_credentials_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_credentials_expires_at ON public.integration_credentials USING btree (expires_at);


--
-- Name: idx_integration_resource_links_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_resource_links_integration ON public.integration_resource_links USING btree (integration_id);


--
-- Name: idx_integration_resource_links_internal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_resource_links_internal ON public.integration_resource_links USING btree (resource_kind, internal_resource_id);


--
-- Name: idx_integration_resource_links_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_resource_links_profile ON public.integration_resource_links USING btree (profile_id);


--
-- Name: idx_integration_resource_links_provider_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_resource_links_provider_external ON public.integration_resource_links USING btree (provider, external_id);


--
-- Name: idx_integrations_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_external_id ON public.integrations USING btree (external_id);


--
-- Name: idx_integrations_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_profile_id ON public.integrations USING btree (profile_id);


--
-- Name: idx_integrations_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_provider ON public.integrations USING btree (provider);


--
-- Name: idx_likes_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_entity ON public.likes USING btree (entity_type, entity_id);


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_notifications_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_actor_id ON public.notifications USING btree (actor_id);


--
-- Name: idx_notifications_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_oauth_states_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states USING btree (expires_at);


--
-- Name: idx_oauth_states_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_states_profile_id ON public.oauth_states USING btree (profile_id);


--
-- Name: idx_profile_goals_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_goals_profile_id ON public.profile_goals USING btree (profile_id);


--
-- Name: idx_profile_metrics_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_metrics_profile ON public.profile_metrics USING btree (profile_id, recorded_at);


--
-- Name: idx_profile_metrics_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_metrics_recorded_at ON public.profile_metrics USING btree (recorded_at);


--
-- Name: idx_profile_metrics_reference_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_metrics_reference_activity ON public.profile_metrics USING btree (reference_activity_id) WHERE (reference_activity_id IS NOT NULL);


--
-- Name: idx_profile_metrics_temporal_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_metrics_temporal_lookup ON public.profile_metrics USING btree (profile_id, metric_type, recorded_at);


--
-- Name: idx_provider_sync_jobs_dedupe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_dedupe_key ON public.provider_sync_jobs USING btree (dedupe_key);


--
-- Name: idx_provider_sync_jobs_integration_generation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_integration_generation_status ON public.provider_sync_jobs USING btree (integration_id, integration_generation, status);


--
-- Name: idx_provider_sync_jobs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_integration_id ON public.provider_sync_jobs USING btree (integration_id);


--
-- Name: idx_provider_sync_jobs_lane_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_lane_status ON public.provider_sync_jobs USING btree (sync_lane_key, status, run_at);


--
-- Name: idx_provider_sync_jobs_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_profile_id ON public.provider_sync_jobs USING btree (profile_id);


--
-- Name: idx_provider_sync_jobs_provider_profile_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_provider_profile_status ON public.provider_sync_jobs USING btree (provider, profile_id, status);


--
-- Name: idx_provider_sync_jobs_status_run_at_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_status_run_at_priority ON public.provider_sync_jobs USING btree (status, run_at, priority);


--
-- Name: idx_provider_sync_jobs_supersedes_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_jobs_supersedes_job_id ON public.provider_sync_jobs USING btree (supersedes_job_id) WHERE (supersedes_job_id IS NOT NULL);


--
-- Name: idx_provider_sync_state_provider_next_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_sync_state_provider_next_sync ON public.provider_sync_state USING btree (provider, next_sync_at);


--
-- Name: idx_provider_webhook_receipts_integration_generation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_webhook_receipts_integration_generation_status ON public.provider_webhook_receipts USING btree (integration_id, integration_generation, processing_status) WHERE (integration_id IS NOT NULL);


--
-- Name: idx_provider_webhook_receipts_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_webhook_receipts_integration_id ON public.provider_webhook_receipts USING btree (integration_id) WHERE (integration_id IS NOT NULL);


--
-- Name: idx_provider_webhook_receipts_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_webhook_receipts_job_id ON public.provider_webhook_receipts USING btree (job_id);


--
-- Name: idx_provider_webhook_receipts_provider_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_webhook_receipts_provider_status ON public.provider_webhook_receipts USING btree (provider, processing_status);


--
-- Name: idx_routes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_created_at ON public.activity_routes USING btree (created_at);


--
-- Name: idx_routes_is_system_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_is_system_template ON public.activity_routes USING btree (is_system_template) WHERE (is_system_template = true);


--
-- Name: idx_routes_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_name ON public.activity_routes USING btree (name);


--
-- Name: idx_routes_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_profile_id ON public.activity_routes USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: idx_training_plans_content_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_content_visibility ON public.training_plans USING btree (content_visibility);


--
-- Name: idx_training_plans_is_system_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_is_system_template ON public.training_plans USING btree (is_system_template) WHERE (is_system_template = true);


--
-- Name: idx_training_plans_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_name ON public.training_plans USING btree (name);


--
-- Name: idx_training_plans_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_profile_id ON public.training_plans USING btree (profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: idx_training_plans_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_visibility ON public.training_plans USING btree (template_visibility);


--
-- Name: integrations_provider_external_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integrations_provider_external_id_unique ON public.integrations USING btree (provider, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: organization_membership_role_grants_role_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_membership_role_grants_role_status_idx ON public.organization_membership_role_grants USING btree (role_id, status);


--
-- Name: organization_memberships_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_profile_status_idx ON public.organization_memberships USING btree (profile_id, status);


--
-- Name: organizations_created_by_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_created_by_profile_id_idx ON public.organizations USING btree (created_by_profile_id);


--
-- Name: organizations_slug_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_unique_idx ON public.organizations USING btree (slug);


--
-- Name: profile_metrics_idx_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_metrics_idx_key ON public.profile_metrics USING btree (idx);


--
-- Name: profiles_email_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_email_unique_idx ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: profiles_username_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_unique_idx ON public.profiles USING btree (username);


--
-- Name: provider_sync_jobs_queue_sequence_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX provider_sync_jobs_queue_sequence_key ON public.provider_sync_jobs USING btree (queue_sequence);


--
-- Name: sessions_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sessions_userId_idx" ON public.sessions USING btree (user_id);


--
-- Name: verifications_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verifications_identifier_idx ON public.verifications USING btree (identifier);


--
-- Name: activities activities_validate_segment_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER activities_validate_segment_set AFTER INSERT OR UPDATE ON public.activities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.activity_parent_segment_set_constraint_trigger();


--
-- Name: activity_artifacts activity_artifacts_block_direct_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_artifacts_block_direct_delete BEFORE DELETE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.block_activity_artifact_direct_delete();


--
-- Name: activity_artifacts activity_artifacts_immutable_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_artifacts_immutable_before_update BEFORE UPDATE ON public.activity_artifacts FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_artifact_immutable();


--
-- Name: activity_efforts activity_efforts_validate_segment_range; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_efforts_validate_segment_range BEFORE INSERT OR UPDATE ON public.activity_efforts FOR EACH ROW EXECUTE FUNCTION public.validate_activity_effort_segment_range();


--
-- Name: activity_segments activity_segments_validate_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER activity_segments_validate_set AFTER INSERT OR DELETE OR UPDATE ON public.activity_segments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.activity_segment_set_constraint_trigger();


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_reject_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_session_rpe_evidence_reject_update BEFORE UPDATE ON public.activity_session_rpe_evidence FOR EACH ROW EXECUTE FUNCTION public.reject_activity_session_rpe_evidence_mutation();


--
-- Name: accounts accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activities activities_activity_plan_id_activity_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_activity_plan_id_activity_plans_id_fk FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL;


--
-- Name: activities activities_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: activity_artifact_links activity_artifact_links_activity_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_activity_profile_fkey FOREIGN KEY (activity_id, profile_id) REFERENCES public.activities(id, profile_id) ON DELETE CASCADE;


--
-- Name: activity_artifact_links activity_artifact_links_artifact_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifact_links
    ADD CONSTRAINT activity_artifact_links_artifact_profile_fkey FOREIGN KEY (artifact_id, profile_id) REFERENCES public.activity_artifacts(id, profile_id) ON DELETE RESTRICT;


--
-- Name: activity_artifacts activity_artifacts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_artifacts
    ADD CONSTRAINT activity_artifacts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: activity_efforts activity_efforts_activity_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_efforts
    ADD CONSTRAINT activity_efforts_activity_category_fkey FOREIGN KEY (activity_category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT;


--
-- Name: activity_efforts activity_efforts_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_efforts
    ADD CONSTRAINT activity_efforts_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_efforts activity_efforts_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_efforts
    ADD CONSTRAINT activity_efforts_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: activity_efforts activity_efforts_segment_activity_profile_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_efforts
    ADD CONSTRAINT activity_efforts_segment_activity_profile_category_fkey FOREIGN KEY (segment_id, activity_id, profile_id, activity_category) REFERENCES public.activity_segments(id, activity_id, profile_id, category) ON DELETE CASCADE;


--
-- Name: activity_file_ingestions activity_file_ingestions_activity_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_activity_profile_fkey FOREIGN KEY (activity_id, profile_id) REFERENCES public.activities(id, profile_id) ON DELETE CASCADE;


--
-- Name: activity_file_ingestions activity_file_ingestions_artifact_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_artifact_profile_fkey FOREIGN KEY (artifact_id, profile_id) REFERENCES public.activity_artifacts(id, profile_id) ON DELETE RESTRICT;


--
-- Name: activity_file_ingestions activity_file_ingestions_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: activity_file_ingestions activity_file_ingestions_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_file_ingestions
    ADD CONSTRAINT activity_file_ingestions_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: activity_plans activity_plans_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_plans
    ADD CONSTRAINT activity_plans_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: activity_routes activity_routes_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_routes
    ADD CONSTRAINT activity_routes_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: activity_segments activity_segments_activity_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_activity_profile_fkey FOREIGN KEY (activity_id, profile_id) REFERENCES public.activities(id, profile_id) ON DELETE CASCADE;


--
-- Name: activity_segments activity_segments_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_category_fkey FOREIGN KEY (category) REFERENCES public.canonical_activity_categories(code) ON DELETE RESTRICT;


--
-- Name: activity_segments activity_segments_source_link_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_segments
    ADD CONSTRAINT activity_segments_source_link_fkey FOREIGN KEY (activity_id, source_artifact_id, profile_id) REFERENCES public.activity_artifact_links(activity_id, artifact_id, profile_id) ON DELETE RESTRICT;


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_activity_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_activity_profile_fkey FOREIGN KEY (activity_id, profile_id) REFERENCES public.activities(id, profile_id) ON DELETE CASCADE;


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_correction_same_activity_profile_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_correction_same_activity_profile_ FOREIGN KEY (correction_of_id, activity_id, profile_id) REFERENCES public.activity_session_rpe_evidence(id, activity_id, profile_id) ON DELETE RESTRICT;


--
-- Name: activity_session_rpe_evidence activity_session_rpe_evidence_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_session_rpe_evidence
    ADD CONSTRAINT activity_session_rpe_evidence_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: coaches_athletes coaches_athletes_athlete_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches_athletes
    ADD CONSTRAINT coaches_athletes_athlete_id_profiles_id_fk FOREIGN KEY (athlete_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: coaches_athletes coaches_athletes_coach_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches_athletes
    ADD CONSTRAINT coaches_athletes_coach_id_profiles_id_fk FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: coaching_invitations coaching_invitations_athlete_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_invitations
    ADD CONSTRAINT coaching_invitations_athlete_id_profiles_id_fk FOREIGN KEY (athlete_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: coaching_invitations coaching_invitations_coach_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_invitations
    ADD CONSTRAINT coaching_invitations_coach_id_profiles_id_fk FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: content_access_grants content_access_grants_actor_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants
    ADD CONSTRAINT content_access_grants_actor_profile_id_profiles_id_fk FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: content_access_grants content_access_grants_grantee_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_grants
    ADD CONSTRAINT content_access_grants_grantee_profile_id_profiles_id_fk FOREIGN KEY (grantee_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_activity_plan_id_activity_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_activity_plan_id_activity_plans_id_fk FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL;


--
-- Name: events events_integration_account_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_integration_account_id_integrations_id_fk FOREIGN KEY (integration_account_id) REFERENCES public.integrations(id);


--
-- Name: events events_linked_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_linked_activity_id_activities_id_fk FOREIGN KEY (linked_activity_id) REFERENCES public.activities(id);


--
-- Name: events events_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_route_id_activity_routes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_route_id_activity_routes_id_fk FOREIGN KEY (route_id) REFERENCES public.activity_routes(id);


--
-- Name: events events_series_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_series_id_events_id_fk FOREIGN KEY (series_id) REFERENCES public.events(id);


--
-- Name: events events_training_plan_id_training_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_training_plan_id_training_plans_id_fk FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE SET NULL;


--
-- Name: follows follows_follower_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_profiles_id_fk FOREIGN KEY (follower_id) REFERENCES public.profiles(id);


--
-- Name: follows follows_following_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_profiles_id_fk FOREIGN KEY (following_id) REFERENCES public.profiles(id);


--
-- Name: group_event_rsvps group_event_rsvps_group_event_id_group_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_rsvps
    ADD CONSTRAINT group_event_rsvps_group_event_id_group_events_id_fk FOREIGN KEY (group_event_id) REFERENCES public.group_events(id) ON DELETE CASCADE;


--
-- Name: group_event_rsvps group_event_rsvps_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_rsvps
    ADD CONSTRAINT group_event_rsvps_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_event_series_rsvps group_event_series_rsvps_group_event_series_id_group_events_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_series_rsvps
    ADD CONSTRAINT group_event_series_rsvps_group_event_series_id_group_events_id_ FOREIGN KEY (group_event_series_id) REFERENCES public.group_events(id) ON DELETE CASCADE;


--
-- Name: group_event_series_rsvps group_event_series_rsvps_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_event_series_rsvps
    ADD CONSTRAINT group_event_series_rsvps_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_events group_events_activity_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL;


--
-- Name: group_events group_events_created_by_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_created_by_profile_id_profiles_id_fk FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_events group_events_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_events group_events_route_id_activity_routes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_route_id_activity_routes_id_fk FOREIGN KEY (route_id) REFERENCES public.activity_routes(id) ON DELETE SET NULL;


--
-- Name: group_events group_events_series_id_group_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_events
    ADD CONSTRAINT group_events_series_id_group_events_id_fk FOREIGN KEY (series_id) REFERENCES public.group_events(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_invited_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_invitations
    ADD CONSTRAINT group_invitations_invited_profile_id_profiles_id_fk FOREIGN KEY (invited_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_join_requests group_join_requests_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_join_requests
    ADD CONSTRAINT group_join_requests_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_join_requests group_join_requests_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_join_requests
    ADD CONSTRAINT group_join_requests_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_memberships group_memberships_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships
    ADD CONSTRAINT group_memberships_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_memberships group_memberships_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships
    ADD CONSTRAINT group_memberships_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_profile_id_profiles_id_fk FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: integration_credentials integration_credentials_integration_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_integration_id_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: integration_resource_links integration_resource_links_integration_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_resource_links
    ADD CONSTRAINT integration_resource_links_integration_id_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: integration_resource_links integration_resource_links_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_resource_links
    ADD CONSTRAINT integration_resource_links_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: likes likes_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_profiles_id_fk FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: multisport_cutover_template_audits multisport_cutover_template_audits_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisport_cutover_template_audits
    ADD CONSTRAINT multisport_cutover_template_audits_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.multisport_cutover_audits(run_id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_actor_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_profiles_id_fk FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: oauth_states oauth_states_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: organization_membership_role_grants organization_membership_role_grants_membership_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership_role_grants
    ADD CONSTRAINT organization_membership_role_grants_membership_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE CASCADE;


--
-- Name: organization_membership_role_grants organization_membership_role_grants_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership_role_grants
    ADD CONSTRAINT organization_membership_role_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_membership_role_grants organization_membership_role_grants_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership_role_grants
    ADD CONSTRAINT organization_membership_role_grants_role_fkey FOREIGN KEY (role_id, organization_id) REFERENCES public.organization_roles(id, organization_id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: organization_role_permission_grants organization_role_permission_grants_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permission_grants
    ADD CONSTRAINT organization_role_permission_grants_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.organization_permissions(key) ON DELETE RESTRICT;


--
-- Name: organization_role_permission_grants organization_role_permission_grants_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_role_permission_grants
    ADD CONSTRAINT organization_role_permission_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.organization_roles(id) ON DELETE CASCADE;


--
-- Name: organization_roles organization_roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_roles
    ADD CONSTRAINT organization_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: profile_goals profile_goals_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_goals
    ADD CONSTRAINT profile_goals_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: profile_metrics profile_metrics_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_metrics
    ADD CONSTRAINT profile_metrics_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_metrics profile_metrics_reference_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_metrics
    ADD CONSTRAINT profile_metrics_reference_activity_id_activities_id_fk FOREIGN KEY (reference_activity_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: profile_training_settings profile_training_settings_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_training_settings
    ADD CONSTRAINT profile_training_settings_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: provider_sync_jobs provider_sync_jobs_integration_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_jobs
    ADD CONSTRAINT provider_sync_jobs_integration_id_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: provider_sync_jobs provider_sync_jobs_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_jobs
    ADD CONSTRAINT provider_sync_jobs_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: provider_sync_state provider_sync_state_integration_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_sync_state
    ADD CONSTRAINT provider_sync_state_integration_id_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: provider_webhook_receipts provider_webhook_receipts_integration_id_integrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_integration_id_integrations_id_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: provider_webhook_receipts provider_webhook_receipts_job_id_provider_sync_jobs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_webhook_receipts
    ADD CONSTRAINT provider_webhook_receipts_job_id_provider_sync_jobs_id_fk FOREIGN KEY (job_id) REFERENCES public.provider_sync_jobs(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: training_plans training_plans_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_artifact_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_artifact_links ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_efforts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_efforts ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_file_ingestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_file_ingestions ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_session_rpe_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_session_rpe_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: api_rate_limit_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_rate_limit_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: canonical_activity_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canonical_activity_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: coaches_athletes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaches_athletes ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaching_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: content_access_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_access_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: group_event_rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_event_rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: group_event_series_rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_event_series_rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: group_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_events ENABLE ROW LEVEL SECURITY;

--
-- Name: group_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: group_join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: group_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_resource_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_resource_links ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: multisport_cutover_audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.multisport_cutover_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: multisport_cutover_template_audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.multisport_cutover_template_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_membership_role_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_membership_role_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_role_permission_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_role_permission_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_training_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_training_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_webhook_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provider_webhook_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: training_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION finalize_activity_artifact_deletion(target_id uuid, storage_deleted boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalize_activity_artifact_deletion(target_id uuid, storage_deleted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_activity_artifact_deletion(target_id uuid, storage_deleted boolean) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION purge_deleted_activity_artifact(target_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_deleted_activity_artifact(target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_deleted_activity_artifact(target_id uuid) TO service_role;


--
-- Name: FUNCTION reject_activity_session_rpe_evidence_mutation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reject_activity_session_rpe_evidence_mutation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_activity_session_rpe_evidence_mutation() TO service_role;


--
-- Name: FUNCTION request_activity_artifact_deletion(target_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_activity_artifact_deletion(target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_activity_artifact_deletion(target_id uuid) TO service_role;


--
-- Name: TABLE activity_artifact_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_artifact_links TO service_role;


--
-- Name: FUNCTION switch_activity_source_artifact(target_activity_id uuid, target_artifact_id uuid, target_profile_id uuid, target_provider_revision text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.switch_activity_source_artifact(target_activity_id uuid, target_artifact_id uuid, target_profile_id uuid, target_provider_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.switch_activity_source_artifact(target_activity_id uuid, target_artifact_id uuid, target_profile_id uuid, target_provider_revision text) TO service_role;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounts TO service_role;


--
-- Name: TABLE activities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activities TO service_role;


--
-- Name: TABLE activity_artifacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_artifacts TO service_role;


--
-- Name: TABLE activity_efforts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_efforts TO service_role;


--
-- Name: TABLE activity_file_ingestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_file_ingestions TO service_role;


--
-- Name: TABLE activity_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_plans TO service_role;


--
-- Name: TABLE activity_routes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_routes TO service_role;


--
-- Name: TABLE activity_segments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_segments TO service_role;


--
-- Name: TABLE activity_session_rpe_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_session_rpe_evidence TO service_role;


--
-- Name: TABLE api_rate_limit_windows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_rate_limit_windows TO service_role;


--
-- Name: TABLE canonical_activity_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.canonical_activity_categories TO service_role;


--
-- Name: TABLE coaches_athletes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaches_athletes TO service_role;


--
-- Name: TABLE coaching_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaching_invitations TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE content_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.content_access_grants TO service_role;


--
-- Name: TABLE conversation_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_participants TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversations TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE follows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.follows TO service_role;


--
-- Name: TABLE group_event_rsvps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_event_rsvps TO service_role;


--
-- Name: TABLE group_event_series_rsvps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_event_series_rsvps TO service_role;


--
-- Name: TABLE group_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_events TO service_role;


--
-- Name: TABLE group_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_invitations TO service_role;


--
-- Name: TABLE group_join_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_join_requests TO service_role;


--
-- Name: TABLE group_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_memberships TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: TABLE integration_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_credentials TO service_role;


--
-- Name: TABLE integration_resource_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integration_resource_links TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integrations TO service_role;


--
-- Name: TABLE likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.likes TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE multisport_cutover_audits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.multisport_cutover_audits TO service_role;


--
-- Name: TABLE multisport_cutover_template_audits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.multisport_cutover_template_audits TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE oauth_states; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.oauth_states TO service_role;


--
-- Name: TABLE organization_membership_role_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_membership_role_grants TO service_role;


--
-- Name: TABLE organization_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_memberships TO service_role;


--
-- Name: TABLE organization_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_permissions TO service_role;


--
-- Name: TABLE organization_role_permission_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_role_permission_grants TO service_role;


--
-- Name: TABLE organization_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_roles TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE profile_goals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_goals TO service_role;


--
-- Name: TABLE profile_metrics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_metrics TO service_role;


--
-- Name: SEQUENCE profile_metrics_idx_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.profile_metrics_idx_seq TO service_role;


--
-- Name: TABLE profile_training_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_training_settings TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE provider_sync_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provider_sync_jobs TO service_role;


--
-- Name: SEQUENCE provider_sync_jobs_queue_sequence_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.provider_sync_jobs_queue_sequence_seq TO service_role;


--
-- Name: TABLE provider_sync_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provider_sync_state TO service_role;


--
-- Name: TABLE provider_webhook_receipts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provider_webhook_receipts TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sessions TO service_role;


--
-- Name: TABLE training_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.training_plans TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE verifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verifications TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

-- Repository-owned storage configuration (pg_dump schema-only omits rows).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('activity-files', 'activity-files', false, 52428800, array['application/fit', 'application/gpx+xml', 'application/octet-stream', 'application/tcx+xml', 'application/vnd.ant.fit', 'application/vnd.garmin.tcx+xml', 'application/xml', 'text/xml']::text[]);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('gpx-routes', 'gpx-routes', false, 10485760, array['application/gpx+xml', 'application/vnd.garmin.tcx+xml', 'application/xml']::text[]);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png']::text[]);
create policy "Service role can manage all activity files" on storage.objects for all to service_role using ((bucket_id = 'activity-files'::text)) with check ((bucket_id = 'activity-files'::text));
create policy "Users can manage their own avatar" on storage.objects for all to public using (((bucket_id = 'profile-avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))) with check (((bucket_id = 'profile-avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy "Users can manage their own routes" on storage.objects for all to public using (((bucket_id = 'gpx-routes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))) with check (((bucket_id = 'gpx-routes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy "Users can read their own activity files" on storage.objects for select to public using (((bucket_id = 'activity-files'::text) AND ((storage.foldername(name))[1] = 'activities'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));
create policy "Users can upload their own activity files" on storage.objects for insert to public with check (((bucket_id = 'activity-files'::text) AND ((storage.foldername(name))[1] = 'activities'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));

-- Repository-owned auth cross-schema trigger.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enforce the backend-owned ACL/RLS contract, including exact revocations that
-- schema-only dumps do not serialize when inherited from PUBLIC.
DO $$
DECLARE record_row record;
BEGIN
  FOR record_row IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
  LOOP
    IF record_row.relkind IN ('r', 'p') THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', record_row.schema_name, record_row.relation_name);
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated', record_row.schema_name, record_row.relation_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO service_role', record_row.schema_name, record_row.relation_name);
    ELSE
      EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated', record_row.schema_name, record_row.relation_name);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO service_role', record_row.schema_name, record_row.relation_name);
    END IF;
  END LOOP;
END $$;

-- SECURITY DEFINER helpers are trigger/internal-only; never expose callable
-- definer functions through PUBLIC, anon, or authenticated roles.
DO $$
DECLARE function_row record;
BEGIN
  FOR function_row IN
    SELECT p.oid::regprocedure AS identity
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_row.identity);
    EXECUTE format('GRANT ALL ON FUNCTION %s TO postgres, service_role', function_row.identity);
  END LOOP;
END $$;
