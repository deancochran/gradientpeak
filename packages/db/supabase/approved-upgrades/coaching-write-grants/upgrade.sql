-- Approved coaching write-grant RPC upgrade only. Use the guarded runner.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
CREATE OR REPLACE FUNCTION public.prevent_athlete_coaching_write_policy_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gradientpeak:athlete-coaching-write-policy:' || OLD.scope_key, 0));
  RAISE EXCEPTION 'coaching write policy versions are immutable';
END $$;

CREATE FUNCTION public.lock_athlete_coaching_write_policy_scope() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gradientpeak:athlete-coaching-write-policy:' || NEW.scope_key, 0));
  RETURN NEW;
END $$;

CREATE TRIGGER athlete_coaching_write_policy_versions_scope_lock BEFORE INSERT ON public.athlete_coaching_write_policy_versions FOR EACH ROW EXECUTE FUNCTION public.lock_athlete_coaching_write_policy_scope();

CREATE FUNCTION public.grant_athlete_coaching_write_access(p_actor_profile_id uuid, p_organization_id uuid, p_engagement_id uuid, p_scope_key text, p_policy_version_id uuid, p_policy_digest text, p_correlation_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_now timestamptz := pg_catalog.transaction_timestamp(); v_athlete_profile_id uuid; v_policy public.athlete_coaching_write_policy_versions%ROWTYPE; v_current_policy_id uuid; v_grant_id uuid; v_replay_count integer; v_matching_replay_count integer;
BEGIN
  IF p_scope_key NOT IN ('training_assignment', 'schedule_modification') OR p_policy_digest IS NULL OR pg_catalog.btrim(p_policy_digest) = '' OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'scope, policy digest, and correlation_id are required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.organizations AS organization WHERE organization.id=p_organization_id AND organization.suspended_at IS NULL AND organization.closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization not active' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gradientpeak:athlete-coaching-write-policy:' || p_scope_key, 0));
  SELECT engagement.athlete_profile_id INTO v_athlete_profile_id FROM public.coaching_engagements AS engagement WHERE engagement.organization_id=p_organization_id AND engagement.id=p_engagement_id AND engagement.paused_at IS NULL AND engagement.ended_at IS NULL AND engagement.created_at<=v_now FOR UPDATE;
  IF v_athlete_profile_id IS NULL OR v_athlete_profile_id <> p_actor_profile_id THEN RAISE EXCEPTION 'only the exact active engagement athlete may grant write access' USING ERRCODE = '42501'; END IF;
  SELECT policy.* INTO v_policy FROM public.athlete_coaching_write_policy_versions AS policy WHERE policy.id=p_policy_version_id AND policy.scope_key=p_scope_key FOR SHARE;
  IF v_policy.id IS NULL OR v_policy.effective_from>v_now OR v_policy.content_digest<>p_policy_digest THEN RAISE EXCEPTION 'displayed policy is absent, future, or does not match its digest' USING ERRCODE = '22023'; END IF;
  SELECT policy.id INTO v_current_policy_id FROM public.athlete_coaching_write_policy_versions AS policy WHERE policy.scope_key=p_scope_key AND policy.effective_from<=v_now ORDER BY policy.effective_from DESC, policy.id DESC LIMIT 1 FOR SHARE;
  IF v_current_policy_id IS DISTINCT FROM p_policy_version_id THEN RAISE EXCEPTION 'displayed policy is stale or retired' USING ERRCODE = '22023'; END IF;
  SELECT pg_catalog.count(*)::integer, pg_catalog.count(*) FILTER (WHERE audit.action='athlete.coaching_write_granted' AND audit.resource_type='athlete_coaching_write_grant' AND audit.actor_profile_id=p_actor_profile_id AND audit.details=pg_catalog.jsonb_build_object('engagement_id',p_engagement_id,'athlete_profile_id',p_actor_profile_id,'scope_key',p_scope_key,'policy_version_id',p_policy_version_id,'policy_digest',p_policy_digest))::integer INTO v_replay_count, v_matching_replay_count FROM public.organization_audit_events AS audit WHERE audit.organization_id=p_organization_id AND audit.correlation_id=p_correlation_id;
  IF v_replay_count > 0 THEN
    IF v_replay_count=1 AND v_matching_replay_count=1 THEN
      SELECT audit.resource_id INTO v_grant_id FROM public.organization_audit_events AS audit WHERE audit.organization_id=p_organization_id AND audit.correlation_id=p_correlation_id;
      RETURN v_grant_id;
    END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request' USING ERRCODE = '23505';
  END IF;
  SELECT grant_row.id INTO v_grant_id FROM public.athlete_coaching_write_grants AS grant_row WHERE grant_row.organization_id=p_organization_id AND grant_row.engagement_id=p_engagement_id AND grant_row.athlete_profile_id=p_actor_profile_id AND grant_row.scope_key=p_scope_key AND grant_row.revoked_at IS NULL FOR UPDATE;
  IF v_grant_id IS NOT NULL THEN RAISE EXCEPTION 'active write grant already exists for scope' USING ERRCODE = '23505'; END IF;
  INSERT INTO public.athlete_coaching_write_grants(organization_id,engagement_id,athlete_profile_id,scope_key,policy_version_id,granted_by_profile_id,granted_at) VALUES(p_organization_id,p_engagement_id,p_actor_profile_id,p_scope_key,p_policy_version_id,p_actor_profile_id,v_now) RETURNING id INTO v_grant_id;
  INSERT INTO public.organization_audit_events(organization_id,actor_profile_id,action,resource_type,resource_id,occurred_at,correlation_id,details) VALUES(p_organization_id,p_actor_profile_id,'athlete.coaching_write_granted','athlete_coaching_write_grant',v_grant_id,v_now,p_correlation_id,pg_catalog.jsonb_build_object('engagement_id',p_engagement_id,'athlete_profile_id',p_actor_profile_id,'scope_key',p_scope_key,'policy_version_id',p_policy_version_id,'policy_digest',p_policy_digest));
  RETURN v_grant_id;
END $$;

CREATE FUNCTION public.revoke_athlete_coaching_write_access(p_actor_profile_id uuid, p_organization_id uuid, p_grant_id uuid, p_correlation_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_now timestamptz := pg_catalog.transaction_timestamp(); v_grant public.athlete_coaching_write_grants%ROWTYPE; v_replay_count integer; v_matching_replay_count integer;
BEGIN
  IF p_correlation_id IS NULL THEN RAISE EXCEPTION 'correlation_id is required' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.organizations AS organization WHERE organization.id=p_organization_id AND organization.suspended_at IS NULL AND organization.closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization not active' USING ERRCODE = '42501'; END IF;
  SELECT grant_row.* INTO v_grant FROM public.athlete_coaching_write_grants AS grant_row JOIN public.coaching_engagements AS engagement ON engagement.organization_id=grant_row.organization_id AND engagement.id=grant_row.engagement_id AND engagement.athlete_profile_id=grant_row.athlete_profile_id WHERE grant_row.organization_id=p_organization_id AND grant_row.id=p_grant_id AND engagement.paused_at IS NULL AND engagement.ended_at IS NULL AND engagement.created_at<=v_now FOR UPDATE OF grant_row, engagement;
  IF v_grant.id IS NULL OR v_grant.athlete_profile_id<>p_actor_profile_id THEN RAISE EXCEPTION 'only the exact active engagement athlete may revoke write access' USING ERRCODE = '42501'; END IF;
  SELECT pg_catalog.count(*)::integer, pg_catalog.count(*) FILTER (WHERE audit.action='athlete.coaching_write_revoked' AND audit.resource_type='athlete_coaching_write_grant' AND audit.resource_id=p_grant_id AND audit.actor_profile_id=p_actor_profile_id AND audit.details=pg_catalog.jsonb_build_object('engagement_id',v_grant.engagement_id,'athlete_profile_id',p_actor_profile_id,'scope_key',v_grant.scope_key,'policy_version_id',v_grant.policy_version_id))::integer INTO v_replay_count, v_matching_replay_count FROM public.organization_audit_events AS audit WHERE audit.organization_id=p_organization_id AND audit.correlation_id=p_correlation_id;
  IF v_replay_count > 0 THEN
    IF v_replay_count=1 AND v_matching_replay_count=1 THEN RETURN p_grant_id; END IF;
    RAISE EXCEPTION 'correlation_id conflicts with another terminal request' USING ERRCODE = '23505';
  END IF;
  IF v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'write grant is already revoked' USING ERRCODE = '23505'; END IF;
  UPDATE public.athlete_coaching_write_grants SET revoked_at=v_now WHERE id=p_grant_id AND organization_id=p_organization_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'write grant state changed; refusing replacement revocation' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.organization_audit_events(organization_id,actor_profile_id,action,resource_type,resource_id,occurred_at,correlation_id,details) VALUES(p_organization_id,p_actor_profile_id,'athlete.coaching_write_revoked','athlete_coaching_write_grant',p_grant_id,v_now,p_correlation_id,pg_catalog.jsonb_build_object('engagement_id',v_grant.engagement_id,'athlete_profile_id',p_actor_profile_id,'scope_key',v_grant.scope_key,'policy_version_id',v_grant.policy_version_id));
  RETURN p_grant_id;
END $$;

REVOKE ALL ON FUNCTION public.grant_athlete_coaching_write_access(uuid,uuid,uuid,text,uuid,text,uuid), public.revoke_athlete_coaching_write_access(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_athlete_coaching_write_access(uuid,uuid,uuid,text,uuid,text,uuid), public.revoke_athlete_coaching_write_access(uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
