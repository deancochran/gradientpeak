-- Approved delegated-write consent upgrade only. Use the guarded runner.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
CREATE TABLE public.athlete_coaching_write_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  effective_from timestamptz NOT NULL,
  jurisdiction text NOT NULL,
  terms_text text NOT NULL,
  content_digest text NOT NULL,
  supersedes_policy_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_coaching_write_policy_versions_id_scope_unique UNIQUE (id, scope_key),
  CONSTRAINT athlete_coaching_write_policy_versions_scope_check CHECK (scope_key IN ('training_assignment', 'schedule_modification')),
  CONSTRAINT athlete_coaching_write_policy_versions_terms_non_empty CHECK (btrim(terms_text) <> ''),
  CONSTRAINT athlete_coaching_write_policy_versions_digest_non_empty CHECK (btrim(content_digest) <> ''),
  CONSTRAINT athlete_coaching_write_policy_versions_supersedes_not_self_check CHECK (supersedes_policy_version_id IS NULL OR supersedes_policy_version_id <> id),
  CONSTRAINT athlete_coaching_write_policy_versions_supersedes_scope_fkey FOREIGN KEY (supersedes_policy_version_id, scope_key) REFERENCES public.athlete_coaching_write_policy_versions(id, scope_key) ON DELETE RESTRICT
);
CREATE INDEX athlete_coaching_write_policy_versions_supersedes_scope_fkey_idx ON public.athlete_coaching_write_policy_versions(supersedes_policy_version_id, scope_key);

CREATE TABLE public.athlete_coaching_write_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  scope_key text NOT NULL,
  policy_version_id uuid NOT NULL,
  granted_by_profile_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT athlete_coaching_write_grants_authority_identity_unique UNIQUE (organization_id, engagement_id, athlete_profile_id, scope_key, id),
  CONSTRAINT athlete_coaching_write_grants_scope_check CHECK (scope_key IN ('training_assignment', 'schedule_modification')),
  CONSTRAINT athlete_coaching_write_grants_grantor_check CHECK (granted_by_profile_id = athlete_profile_id),
  CONSTRAINT athlete_coaching_write_grants_expiry_chronology_check CHECK (expires_at IS NULL OR expires_at >= granted_at),
  CONSTRAINT athlete_coaching_write_grants_revocation_chronology_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CONSTRAINT athlete_coaching_write_grants_engagement_fkey FOREIGN KEY (organization_id, engagement_id, athlete_profile_id) REFERENCES public.coaching_engagements(organization_id, id, athlete_profile_id) ON DELETE RESTRICT,
  CONSTRAINT athlete_coaching_write_grants_policy_scope_fkey FOREIGN KEY (policy_version_id, scope_key) REFERENCES public.athlete_coaching_write_policy_versions(id, scope_key) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX athlete_coaching_write_grants_current_unique ON public.athlete_coaching_write_grants(organization_id, engagement_id, athlete_profile_id, scope_key) WHERE revoked_at IS NULL;
CREATE INDEX athlete_coaching_write_grants_policy_scope_idx ON public.athlete_coaching_write_grants(policy_version_id, scope_key);
CREATE INDEX athlete_coaching_write_grants_engagement_fkey_idx ON public.athlete_coaching_write_grants(organization_id, engagement_id, athlete_profile_id);

CREATE FUNCTION public.prevent_athlete_coaching_write_policy_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'coaching write policy versions are immutable'; END $$;
CREATE FUNCTION public.validate_athlete_coaching_write_policy_supersession() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE predecessor_effective_from timestamptz;
BEGIN
  IF NEW.supersedes_policy_version_id IS NULL THEN RETURN NULL; END IF;
  SELECT effective_from INTO predecessor_effective_from FROM public.athlete_coaching_write_policy_versions
  WHERE id=NEW.supersedes_policy_version_id AND scope_key=NEW.scope_key;
  IF predecessor_effective_from IS NULL OR NEW.effective_from < predecessor_effective_from THEN
    RAISE EXCEPTION 'coaching write policy supersession must retain scope and cannot move effective chronology backward';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION public.guard_athlete_coaching_write_grant_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.engagement_id <> OLD.engagement_id OR NEW.athlete_profile_id <> OLD.athlete_profile_id OR NEW.scope_key <> OLD.scope_key OR NEW.policy_version_id <> OLD.policy_version_id OR NEW.granted_by_profile_id <> OLD.granted_by_profile_id OR NEW.granted_at <> OLD.granted_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'coaching write grant history is immutable except one revocation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER athlete_coaching_write_policy_versions_immutable BEFORE UPDATE OR DELETE ON public.athlete_coaching_write_policy_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_athlete_coaching_write_policy_mutation();
CREATE CONSTRAINT TRIGGER athlete_coaching_write_policy_versions_supersession_guard AFTER INSERT ON public.athlete_coaching_write_policy_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_athlete_coaching_write_policy_supersession();
CREATE TRIGGER athlete_coaching_write_grants_history_guard BEFORE UPDATE OR DELETE ON public.athlete_coaching_write_grants FOR EACH ROW EXECUTE FUNCTION public.guard_athlete_coaching_write_grant_history();

CREATE FUNCTION public.coaching_athlete_write_access_decision(p_actor_profile_id uuid, p_organization_id uuid, p_athlete_profile_id uuid, p_scope_key text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_now timestamptz := transaction_timestamp(); v_membership_id uuid; v_engagement_id uuid; v_grant public.athlete_coaching_write_grants%ROWTYPE; v_effective_from timestamptz;
BEGIN
  IF p_scope_key NOT IN ('training_assignment', 'schedule_modification') THEN RAISE EXCEPTION 'invalid coaching write scope' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.suspended_at IS NULL AND o.closed_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN 'organization_not_active'; END IF;
  SELECT m.id INTO v_membership_id FROM public.organization_memberships m WHERE m.organization_id=p_organization_id AND m.profile_id=p_actor_profile_id AND m.suspended_at IS NULL AND m.ended_at IS NULL FOR SHARE;
  IF v_membership_id IS NULL THEN RETURN 'membership_not_active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_membership_role_grants r WHERE r.organization_id=p_organization_id AND r.membership_id=v_membership_id AND r.role_key='coach' AND r.granted_at<=v_now AND r.revoked_at IS NULL FOR SHARE) THEN RETURN 'missing_coach_role'; END IF;
  SELECT e.id INTO v_engagement_id FROM public.coaching_engagements e WHERE e.organization_id=p_organization_id AND e.athlete_profile_id=p_athlete_profile_id AND e.paused_at IS NULL AND e.ended_at IS NULL AND e.created_at<=v_now ORDER BY e.created_at DESC, e.id DESC LIMIT 1 FOR SHARE;
  IF v_engagement_id IS NULL THEN RETURN 'engagement_not_active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_assignments a WHERE a.organization_id=p_organization_id AND a.engagement_id=v_engagement_id AND a.coach_membership_id=v_membership_id AND a.ended_at IS NULL AND a.assigned_at<=v_now FOR SHARE) THEN RETURN 'assignment_missing'; END IF;
  SELECT * INTO v_grant FROM public.athlete_coaching_write_grants g WHERE g.organization_id=p_organization_id AND g.engagement_id=v_engagement_id AND g.athlete_profile_id=p_athlete_profile_id AND g.scope_key=p_scope_key ORDER BY (g.revoked_at IS NULL) DESC, g.granted_at DESC, g.id DESC LIMIT 1 FOR SHARE;
  IF v_grant.id IS NULL OR v_grant.granted_at>v_now THEN RETURN 'grant_missing'; END IF;
  IF v_grant.revoked_at IS NOT NULL THEN RETURN 'grant_revoked'; END IF;
  IF v_grant.expires_at IS NOT NULL AND v_grant.expires_at<=v_now THEN RETURN 'grant_expired'; END IF;
  SELECT p.effective_from INTO v_effective_from FROM public.athlete_coaching_write_policy_versions p WHERE p.id=v_grant.policy_version_id AND p.scope_key=p_scope_key;
  IF v_effective_from IS NULL OR v_effective_from>v_now THEN RETURN 'grant_policy_not_effective'; END IF;
  RETURN 'allow';
END $$;

ALTER TABLE public.athlete_coaching_write_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_coaching_write_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.athlete_coaching_write_policy_versions, public.athlete_coaching_write_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.athlete_coaching_write_policy_versions, public.athlete_coaching_write_grants TO service_role;
REVOKE ALL ON FUNCTION public.coaching_athlete_write_access_decision(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_athlete_write_access_decision(uuid,uuid,uuid,text) TO service_role;
COMMIT;
