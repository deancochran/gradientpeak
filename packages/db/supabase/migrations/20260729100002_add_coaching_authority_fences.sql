-- Dormant coaching authority fences. Activation requires proof of a deployed,
-- non-client trusted-server identity/role; this migration intentionally grants nobody EXECUTE.
CREATE UNIQUE INDEX organization_audit_events_correlation_action_unique
  ON public.organization_audit_events (organization_id, correlation_id, action)
  WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_organization_root_owner() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  target_organization_id uuid;
  root_membership_id uuid;
BEGIN
  target_organization_id := COALESCE(
    (pg_catalog.to_jsonb(NEW)->>'organization_id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'organization_id')::uuid,
    (pg_catalog.to_jsonb(NEW)->>'id')::uuid,
    (pg_catalog.to_jsonb(OLD)->>'id')::uuid
  );
  SELECT root_owner_membership_id INTO root_membership_id
  FROM public.organizations
  WHERE id = target_organization_id
  FOR UPDATE;
  IF FOUND AND EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = target_organization_id
      AND closed_at IS NULL
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      WHERE membership.organization_id = target_organization_id
        AND membership.id = root_membership_id
        AND membership.suspended_at IS NULL
        AND membership.ended_at IS NULL
    ) THEN
      RAISE EXCEPTION 'active or suspended organization % must retain an active root-owner membership', target_organization_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS grant_row
      WHERE grant_row.organization_id = target_organization_id
        AND grant_row.membership_id = root_membership_id
        AND grant_row.role_key = 'admin'
        AND grant_row.granted_at <= pg_catalog.transaction_timestamp()
        AND grant_row.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'root-owner membership % must retain an effective admin grant', root_membership_id;
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION public.guard_organization_root_owner_transfer() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_expected_guard text;
  v_transfer_owner name;
BEGIN
  IF NEW.root_owner_membership_id IS NOT DISTINCT FROM OLD.root_owner_membership_id THEN
    RETURN NEW;
  END IF;

  v_expected_guard := pg_catalog.format(
    '%s:%s:%s',
    NEW.id,
    OLD.root_owner_membership_id,
    NEW.root_owner_membership_id
  );
  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
  INTO v_transfer_owner
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.transfer_organization_root_ownership(uuid,uuid,uuid,boolean,text,uuid)'
  );
  IF CURRENT_USER IS DISTINCT FROM v_transfer_owner
    OR pg_catalog.current_setting('gradientpeak.coaching_root_transfer_guard', true)
      IS DISTINCT FROM v_expected_guard THEN
    RAISE EXCEPTION 'root ownership may change only through the guarded transfer command';
  END IF;

  PERFORM pg_catalog.set_config('gradientpeak.coaching_root_transfer_guard', '', true);
  RETURN NEW;
END
$$;

CREATE TRIGGER organizations_root_owner_transfer_command_guard
BEFORE UPDATE OF root_owner_membership_id ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_root_owner_transfer();

CREATE FUNCTION public.coaching_athlete_read_access_decision(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_athlete_profile_id uuid,
  p_scope_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_membership_id uuid;
  v_membership_suspended_at timestamp with time zone;
  v_membership_ended_at timestamp with time zone;
  v_granted_at timestamp with time zone;
  v_engagement_id uuid;
  v_engagement_paused_at timestamp with time zone;
  v_engagement_ended_at timestamp with time zone;
  v_engagement_created_at timestamp with time zone;
  v_assignment_id uuid;
  v_consent_id uuid;
  v_policy_version_id uuid;
  v_consent_granted_at timestamp with time zone;
  v_consent_expires_at timestamp with time zone;
  v_consent_ended_at timestamp with time zone;
  v_successor_consent_id uuid;
  v_policy_effective_from timestamp with time zone;
BEGIN
  IF p_scope_key IS NULL OR p_scope_key NOT IN (
    'basic_profile',
    'training',
    'activities',
    'metrics',
    'goals',
    'calendar'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid coaching athlete read scope';
  END IF;

  -- FOR SHARE conflicts with ordinary lifecycle UPDATE. Every writer below first
  -- takes this organization row FOR UPDATE, so authorization and a future
  -- projection read can remain in one linearized transaction.
  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
    AND organization.suspended_at IS NULL
    AND organization.closed_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN 'organization_not_active';
  END IF;

  SELECT
    membership.id,
    membership.suspended_at,
    membership.ended_at
  INTO
    v_membership_id,
    v_membership_suspended_at,
    v_membership_ended_at
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
  FOR SHARE;

  IF v_membership_id IS NULL
    OR v_membership_suspended_at IS NOT NULL
    OR v_membership_ended_at IS NOT NULL THEN
    RETURN 'membership_not_active';
  END IF;

  SELECT grant_row.granted_at
  INTO v_granted_at
  FROM public.organization_membership_role_grants AS grant_row
  WHERE grant_row.organization_id = p_organization_id
    AND grant_row.membership_id = v_membership_id
    AND grant_row.role_key = 'coach'
    AND grant_row.revoked_at IS NULL
  ORDER BY grant_row.granted_at DESC, grant_row.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_granted_at IS NULL OR v_granted_at > v_now THEN
    RETURN 'missing_coach_role';
  END IF;

  SELECT
    engagement.id,
    engagement.paused_at,
    engagement.ended_at,
    engagement.created_at
  INTO
    v_engagement_id,
    v_engagement_paused_at,
    v_engagement_ended_at,
    v_engagement_created_at
  FROM public.coaching_engagements AS engagement
  WHERE engagement.organization_id = p_organization_id
    AND engagement.athlete_profile_id = p_athlete_profile_id
  ORDER BY
    (engagement.ended_at IS NULL) DESC,
    engagement.created_at DESC,
    engagement.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_engagement_id IS NULL
    OR v_engagement_paused_at IS NOT NULL
    OR v_engagement_ended_at IS NOT NULL
    OR v_engagement_created_at > v_now THEN
    RETURN 'engagement_not_active';
  END IF;

  SELECT assignment.id
  INTO v_assignment_id
  FROM public.coaching_assignments AS assignment
  WHERE assignment.organization_id = p_organization_id
    AND assignment.engagement_id = v_engagement_id
    AND assignment.coach_membership_id = v_membership_id
    AND assignment.ended_at IS NULL
    AND assignment.assigned_at <= v_now
  ORDER BY assignment.assigned_at DESC, assignment.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_assignment_id IS NULL THEN
    RETURN 'assignment_missing';
  END IF;

  SELECT
    consent.id,
    consent.policy_version_id,
    consent.granted_at,
    consent.expires_at,
    consent.ended_at,
    consent.superseded_by_consent_id
  INTO
    v_consent_id,
    v_policy_version_id,
    v_consent_granted_at,
    v_consent_expires_at,
    v_consent_ended_at,
    v_successor_consent_id
  FROM public.athlete_data_sharing_consents AS consent
  WHERE consent.organization_id = p_organization_id
    AND consent.engagement_id = v_engagement_id
    AND consent.athlete_profile_id = p_athlete_profile_id
    AND consent.scope_key = p_scope_key
  ORDER BY
    (consent.ended_at IS NULL) DESC,
    consent.granted_at DESC,
    consent.id DESC
  LIMIT 1
  FOR SHARE;

  IF v_consent_id IS NULL THEN
    RETURN 'consent_missing';
  END IF;

  IF v_consent_ended_at IS NOT NULL OR v_successor_consent_id IS NOT NULL THEN
    RETURN 'consent_ended';
  END IF;

  IF v_consent_granted_at > v_now THEN
    RETURN 'consent_missing';
  END IF;

  IF v_consent_expires_at IS NOT NULL AND v_consent_expires_at <= v_now THEN
    RETURN 'consent_expired';
  END IF;

  SELECT policy.effective_from
  INTO v_policy_effective_from
  FROM public.athlete_consent_policy_versions AS policy
  WHERE policy.id = v_policy_version_id
    AND policy.scope_key = p_scope_key;

  IF v_policy_effective_from IS NULL OR v_policy_effective_from > v_now THEN
    RETURN 'consent_policy_not_effective';
  END IF;

  RETURN 'allow';
END
$$;

CREATE FUNCTION public.transfer_organization_root_ownership(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_target_membership_id uuid,
  p_recent_reauthentication_verified boolean,
  p_reason_code text,
  p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_target_profile_id uuid;
  v_replay_count integer;
  v_matching_replay_count integer;
BEGIN
  IF p_recent_reauthentication_verified IS DISTINCT FROM true
    OR p_target_membership_id IS NULL
    OR p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'reauthentication, a target membership, lowercase reason_code, and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.root_ownership_transferred'
        AND audit.resource_id = p_target_membership_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another root transfer request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  IF v_organization.root_owner_membership_id = p_target_membership_id THEN
    RAISE EXCEPTION 'target membership is already the root owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS root_membership
    WHERE root_membership.organization_id = p_organization_id
      AND root_membership.id = v_organization.root_owner_membership_id
      AND root_membership.profile_id = p_actor_profile_id
      AND root_membership.suspended_at IS NULL
      AND root_membership.ended_at IS NULL
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'only the active root owner may transfer organization ownership';
  END IF;

  SELECT target_membership.profile_id
  INTO v_target_profile_id
  FROM public.organization_memberships AS target_membership
  WHERE target_membership.organization_id = p_organization_id
    AND target_membership.id = p_target_membership_id
    AND target_membership.suspended_at IS NULL
    AND target_membership.ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target root-owner membership is not active in organization';
  END IF;

  PERFORM 1
  FROM public.organization_membership_role_grants AS grant_row
  WHERE grant_row.organization_id = p_organization_id
    AND grant_row.membership_id = p_target_membership_id
    AND grant_row.role_key = 'admin'
    AND grant_row.granted_at <= v_now
    AND grant_row.revoked_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target root-owner membership requires an effective admin grant';
  END IF;

  PERFORM pg_catalog.set_config(
    'gradientpeak.coaching_root_transfer_guard',
    pg_catalog.format(
      '%s:%s:%s',
      p_organization_id,
      v_organization.root_owner_membership_id,
      p_target_membership_id
    ),
    true
  );

  UPDATE public.organizations
  SET root_owner_membership_id = p_target_membership_id,
      updated_at = v_now
  WHERE id = p_organization_id;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_organization.root_owner_membership_id,
    'organization.root_ownership_transferred',
    'organization_membership',
    p_target_membership_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'previous_root_owner_membership_id', v_organization.root_owner_membership_id,
      'target_profile_id', v_target_profile_id
    )
  );
END
$$;

CREATE FUNCTION public.end_organization_membership(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_membership_id uuid,
  p_reason_code text,
  p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_target_membership public.organization_memberships%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_revoked_grants integer;
  v_ended_assignments integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.membership_ended'
        AND audit.resource_id = p_membership_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.suspended_at IS NOT NULL OR v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is not active';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  IF v_actor_membership_id IS NULL THEN
    RAISE EXCEPTION 'actor membership is not active';
  END IF;

  SELECT membership.*
  INTO v_target_membership
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF v_actor_membership_id = p_membership_id
    OR v_organization.root_owner_membership_id = p_membership_id THEN
    RAISE EXCEPTION 'target membership cannot be ended';
  END IF;

  IF v_actor_membership_id <> v_organization.root_owner_membership_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS actor_grant
      WHERE actor_grant.organization_id = p_organization_id
        AND actor_grant.membership_id = v_actor_membership_id
        AND actor_grant.role_key = 'admin'
        AND actor_grant.granted_at <= v_now
        AND actor_grant.revoked_at IS NULL
    ) OR EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS target_grant
      WHERE target_grant.organization_id = p_organization_id
        AND target_grant.membership_id = p_membership_id
        AND target_grant.role_key = 'admin'
        AND target_grant.granted_at <= v_now
        AND target_grant.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'actor lacks membership-end authority';
    END IF;
  END IF;

  IF v_target_membership.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.organization_memberships
  SET ended_at = v_now, suspended_at = NULL
  WHERE organization_id = p_organization_id
    AND id = p_membership_id;

  UPDATE public.organization_membership_role_grants
  SET revoked_at = v_now
  WHERE organization_id = p_organization_id
    AND membership_id = p_membership_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_grants = ROW_COUNT;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND coach_membership_id = p_membership_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'organization.membership_ended',
    'organization_membership',
    p_membership_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'revoked_grants', v_revoked_grants,
      'ended_assignments', v_ended_assignments
    )
  );
END
$$;

CREATE FUNCTION public.end_coaching_engagement(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_engagement_id uuid,
  p_reason_code text,
  p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_engagement public.coaching_engagements%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_ended_assignments integer;
  v_ended_consents integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'coaching.engagement_ended'
        AND audit.resource_id = p_engagement_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  SELECT engagement.*
  INTO v_engagement
  FROM public.coaching_engagements AS engagement
  WHERE engagement.organization_id = p_organization_id
    AND engagement.id = p_engagement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'engagement not found';
  END IF;

  IF p_actor_profile_id <> v_engagement.athlete_profile_id
    AND v_actor_membership_id IS DISTINCT FROM v_organization.root_owner_membership_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_role_grants AS grant_row
      WHERE grant_row.organization_id = p_organization_id
        AND grant_row.membership_id = v_actor_membership_id
        AND grant_row.role_key = 'admin'
        AND grant_row.granted_at <= v_now
        AND grant_row.revoked_at IS NULL
    ) THEN
    RAISE EXCEPTION 'actor lacks engagement-end authority';
  END IF;

  IF v_engagement.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.coaching_engagements
  SET ended_at = v_now, paused_at = NULL
  WHERE organization_id = p_organization_id
    AND id = p_engagement_id;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND engagement_id = p_engagement_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND engagement_id = p_engagement_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_consents = ROW_COUNT;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'coaching.engagement_ended',
    'coaching_engagement',
    p_engagement_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'ended_assignments', v_ended_assignments,
      'ended_consents', v_ended_consents
    )
  );
END
$$;

CREATE FUNCTION public.withdraw_athlete_consent(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_consent_id uuid,
  p_reason_code text,
  p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_actor_membership_id uuid;
  v_consent public.athlete_data_sharing_consents%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
BEGIN
  IF p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'a lowercase reason_code and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'athlete.consent_withdrawn'
        AND audit.resource_id = p_consent_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  SELECT membership.id
  INTO v_actor_membership_id
  FROM public.organization_memberships AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.profile_id = p_actor_profile_id
    AND membership.suspended_at IS NULL
    AND membership.ended_at IS NULL
  FOR UPDATE;

  SELECT consent.*
  INTO v_consent
  FROM public.athlete_data_sharing_consents AS consent
  WHERE consent.organization_id = p_organization_id
    AND consent.id = p_consent_id
  FOR UPDATE;

  IF NOT FOUND OR v_consent.athlete_profile_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'only the exact athlete may withdraw consent';
  END IF;

  IF v_consent.ended_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND id = p_consent_id;

  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_actor_membership_id,
    'athlete.consent_withdrawn',
    'athlete_data_sharing_consent',
    p_consent_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object('reason_code', p_reason_code)
  );
END
$$;

CREATE FUNCTION public.close_organization(
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_recent_reauthentication_verified boolean,
  p_reason_code text,
  p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamp with time zone := pg_catalog.transaction_timestamp();
  v_organization public.organizations%ROWTYPE;
  v_replay_count integer;
  v_matching_replay_count integer;
  v_revoked_grants integer;
  v_ended_engagements integer;
  v_ended_assignments integer;
  v_ended_consents integer;
BEGIN
  IF p_recent_reauthentication_verified IS DISTINCT FROM true
    OR p_correlation_id IS NULL
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[a-z0-9][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'reauthentication, a lowercase reason_code, and correlation_id are required';
  END IF;

  SELECT organization.*
  INTO v_organization
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit.action = 'organization.closed'
        AND audit.resource_id = p_organization_id
        AND audit.actor_profile_id = p_actor_profile_id
        AND audit.details ->> 'reason_code' = p_reason_code
    )::integer
  INTO v_replay_count, v_matching_replay_count
  FROM public.organization_audit_events AS audit
  WHERE audit.organization_id = p_organization_id
    AND audit.correlation_id = p_correlation_id;

  IF v_replay_count > 0 THEN
    IF v_replay_count = 1 AND v_matching_replay_count = 1 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request';
  END IF;

  IF v_organization.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'organization is closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS root_membership
    WHERE root_membership.organization_id = p_organization_id
      AND root_membership.id = v_organization.root_owner_membership_id
      AND root_membership.profile_id = p_actor_profile_id
      AND root_membership.suspended_at IS NULL
      AND root_membership.ended_at IS NULL
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'only the active root owner may close organization';
  END IF;

  UPDATE public.organizations
  SET closed_at = v_now, suspended_at = NULL
  WHERE id = p_organization_id;

  UPDATE public.organization_membership_role_grants
  SET revoked_at = v_now
  WHERE organization_id = p_organization_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_grants = ROW_COUNT;

  UPDATE public.coaching_engagements
  SET ended_at = v_now, paused_at = NULL
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_engagements = ROW_COUNT;

  UPDATE public.coaching_assignments
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_assignments = ROW_COUNT;

  UPDATE public.athlete_data_sharing_consents
  SET ended_at = v_now
  WHERE organization_id = p_organization_id
    AND ended_at IS NULL;
  GET DIAGNOSTICS v_ended_consents = ROW_COUNT;

  -- Membership rows intentionally remain unchanged. The closed organization is
  -- the authority fence; memberships retain historical identity/attribution.
  INSERT INTO public.organization_audit_events (
    organization_id,
    actor_profile_id,
    actor_membership_id,
    action,
    resource_type,
    resource_id,
    occurred_at,
    correlation_id,
    details
  ) VALUES (
    p_organization_id,
    p_actor_profile_id,
    v_organization.root_owner_membership_id,
    'organization.closed',
    'organization',
    p_organization_id,
    v_now,
    p_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason_code', p_reason_code,
      'revoked_grants', v_revoked_grants,
      'ended_engagements', v_ended_engagements,
      'ended_assignments', v_ended_assignments,
      'ended_consents', v_ended_consents
    )
  );
END
$$;

COMMENT ON FUNCTION public.coaching_athlete_read_access_decision(uuid, uuid, uuid, text)
  IS 'Dormant until deployed trusted-server identity/role proof is accepted.';
COMMENT ON FUNCTION public.guard_organization_root_owner_transfer()
  IS 'Defense in depth for the EXECUTE-only transfer path; runtime roles must never receive direct organization UPDATE, and the transfer function owner remains the trusted migration boundary.';
COMMENT ON FUNCTION public.transfer_organization_root_ownership(uuid, uuid, uuid, boolean, text, uuid)
  IS 'Dormant; activation requires an EXECUTE-only trusted-server role with no organization table DML plus independently verified reauthentication proof.';
COMMENT ON FUNCTION public.end_organization_membership(uuid, uuid, uuid, text, uuid)
  IS 'Dormant until deployed trusted-server identity/role proof is accepted.';
COMMENT ON FUNCTION public.end_coaching_engagement(uuid, uuid, uuid, text, uuid)
  IS 'Dormant until deployed trusted-server identity/role proof is accepted.';
COMMENT ON FUNCTION public.withdraw_athlete_consent(uuid, uuid, uuid, text, uuid)
  IS 'Dormant until deployed trusted-server identity/role proof is accepted.';
COMMENT ON FUNCTION public.close_organization(uuid, uuid, boolean, text, uuid)
  IS 'Dormant until deployed trusted-server identity/role proof is accepted.';

REVOKE ALL ON FUNCTION public.coaching_athlete_read_access_decision(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_organization_root_owner_transfer()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_organization_root_ownership(uuid, uuid, uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.end_organization_membership(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.end_coaching_engagement(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.withdraw_athlete_consent(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_organization(uuid, uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
