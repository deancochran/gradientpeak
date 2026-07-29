-- Coaching foundation enforce phase. The prior expand guard guarantees no legacy data is guessed.
ALTER TABLE public.organizations
  ALTER COLUMN root_owner_membership_id SET NOT NULL,
  ALTER COLUMN timezone SET NOT NULL,
  ADD CONSTRAINT organizations_timezone_non_empty CHECK (btrim(timezone) <> ''),
  ADD CONSTRAINT organizations_lifecycle_check CHECK (closed_at IS NULL OR suspended_at IS NULL);

ALTER TABLE public.organization_memberships
  ALTER COLUMN status DROP NOT NULL,
  ALTER COLUMN status DROP DEFAULT,
  ADD CONSTRAINT organization_memberships_lifecycle_check CHECK (ended_at IS NULL OR suspended_at IS NULL);
ALTER TABLE public.organization_membership_role_grants DROP CONSTRAINT organization_membership_role_grants_membership_fkey;
ALTER TABLE public.organization_memberships DROP CONSTRAINT organization_memberships_organization_id_fkey;
ALTER TABLE public.organization_memberships DROP CONSTRAINT organization_memberships_profile_id_fkey;
ALTER TABLE public.organization_memberships DROP CONSTRAINT organization_memberships_id_organization_unique;
ALTER TABLE public.organization_memberships
  ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_memberships_organization_id_id_unique UNIQUE (organization_id, id),
  ADD CONSTRAINT organization_memberships_organization_id_id_profile_unique UNIQUE (organization_id, id, profile_id);
CREATE INDEX organization_memberships_active_profile_idx ON public.organization_memberships (profile_id, organization_id) WHERE suspended_at IS NULL AND ended_at IS NULL;
CREATE INDEX organization_memberships_active_organization_idx ON public.organization_memberships (organization_id, id) WHERE suspended_at IS NULL AND ended_at IS NULL;

ALTER TABLE public.organization_membership_role_grants
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN role_key SET NOT NULL,
  ALTER COLUMN granted_at SET DEFAULT now(),
  ALTER COLUMN granted_at SET NOT NULL,
  DROP CONSTRAINT organization_membership_role_grants_pkey;
ALTER TABLE public.organization_membership_role_grants
  ALTER COLUMN role_id DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL,
  ALTER COLUMN status DROP DEFAULT,
  ADD CONSTRAINT organization_membership_role_grants_pkey PRIMARY KEY (id),
  ADD CONSTRAINT organization_membership_role_grants_role_key_check CHECK (role_key IN ('admin', 'coach')),
  ADD CONSTRAINT organization_membership_role_grants_revocation_chronology_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at);
ALTER TABLE public.organization_membership_role_grants DROP CONSTRAINT organization_membership_role_grants_organization_id_fkey;
ALTER TABLE public.organization_membership_role_grants DROP CONSTRAINT organization_membership_role_grants_role_fkey;
ALTER TABLE public.organization_membership_role_grants
  ADD CONSTRAINT organization_membership_role_grants_membership_fkey FOREIGN KEY (organization_id, membership_id) REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_membership_role_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_membership_role_grants_role_fkey FOREIGN KEY (role_id, organization_id) REFERENCES public.organization_roles(id, organization_id) ON DELETE RESTRICT;
DROP INDEX public.organization_membership_role_grants_role_status_idx;
CREATE UNIQUE INDEX organization_membership_role_grants_active_unique ON public.organization_membership_role_grants (organization_id, membership_id, role_key) WHERE revoked_at IS NULL;

ALTER TABLE public.organization_roles DROP CONSTRAINT organization_roles_organization_id_fkey;
ALTER TABLE public.organization_roles ADD CONSTRAINT organization_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.organization_role_permission_grants DROP CONSTRAINT organization_role_permission_grants_role_id_fkey;
ALTER TABLE public.organization_role_permission_grants ADD CONSTRAINT organization_role_permission_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.organization_roles(id) ON DELETE RESTRICT;

CREATE TABLE public.coaching_engagements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  paused_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT coaching_engagements_pkey PRIMARY KEY (id),
  CONSTRAINT coaching_engagements_organization_id_id_unique UNIQUE (organization_id, id),
  CONSTRAINT coaching_engagements_organization_id_id_athlete_unique UNIQUE (organization_id, id, athlete_profile_id),
  CONSTRAINT coaching_engagements_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT coaching_engagements_athlete_profile_fkey FOREIGN KEY (athlete_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT coaching_engagements_lifecycle_check CHECK (ended_at IS NULL OR paused_at IS NULL)
);
CREATE UNIQUE INDEX coaching_engagements_current_unique ON public.coaching_engagements (organization_id, athlete_profile_id) WHERE ended_at IS NULL;
CREATE INDEX coaching_engagements_athlete_profile_organization_idx ON public.coaching_engagements (athlete_profile_id, organization_id);

CREATE TABLE public.coaching_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  coach_membership_id uuid NOT NULL,
  assignment_kind text NOT NULL,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  ended_at timestamp with time zone,
  CONSTRAINT coaching_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT coaching_assignments_engagement_fkey FOREIGN KEY (organization_id, engagement_id) REFERENCES public.coaching_engagements(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT coaching_assignments_membership_fkey FOREIGN KEY (organization_id, coach_membership_id) REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT coaching_assignments_kind_check CHECK (assignment_kind IN ('primary', 'supporting')),
  CONSTRAINT coaching_assignments_chronology_check CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX coaching_assignments_active_primary_unique ON public.coaching_assignments (engagement_id) WHERE assignment_kind = 'primary' AND ended_at IS NULL;
CREATE UNIQUE INDEX coaching_assignments_active_kind_unique ON public.coaching_assignments (engagement_id, coach_membership_id, assignment_kind) WHERE ended_at IS NULL;
CREATE INDEX coaching_assignments_active_coach_membership_idx ON public.coaching_assignments (organization_id, coach_membership_id) WHERE ended_at IS NULL;

CREATE TABLE public.athlete_consent_policy_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scope_key text NOT NULL,
  effective_from timestamp with time zone NOT NULL,
  jurisdiction text NOT NULL,
  terms_text text NOT NULL,
  content_digest text NOT NULL,
  supersedes_policy_version_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT athlete_consent_policy_versions_pkey PRIMARY KEY (id),
  CONSTRAINT athlete_consent_policy_versions_id_scope_unique UNIQUE (id, scope_key),
  CONSTRAINT athlete_consent_policy_versions_scope_check CHECK (scope_key IN ('basic_profile', 'training', 'activities', 'metrics', 'goals', 'calendar')),
  CONSTRAINT athlete_consent_policy_versions_terms_non_empty CHECK (btrim(terms_text) <> ''),
  CONSTRAINT athlete_consent_policy_versions_digest_non_empty CHECK (btrim(content_digest) <> ''),
  CONSTRAINT athlete_consent_policy_versions_supersedes_not_self_check CHECK (supersedes_policy_version_id IS NULL OR supersedes_policy_version_id <> id),
  CONSTRAINT athlete_consent_policy_versions_supersedes_scope_fkey FOREIGN KEY (supersedes_policy_version_id, scope_key) REFERENCES public.athlete_consent_policy_versions(id, scope_key) ON DELETE RESTRICT
);

CREATE TABLE public.athlete_data_sharing_consents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  athlete_profile_id uuid NOT NULL,
  scope_key text NOT NULL,
  policy_version_id uuid NOT NULL,
  granted_by_profile_id uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  ended_at timestamp with time zone,
  superseded_by_consent_id uuid,
  CONSTRAINT athlete_data_sharing_consents_pkey PRIMARY KEY (id),
  CONSTRAINT athlete_data_sharing_consents_authority_identity_unique UNIQUE (organization_id, engagement_id, athlete_profile_id, scope_key, id),
  CONSTRAINT athlete_data_sharing_consents_engagement_fkey FOREIGN KEY (organization_id, engagement_id, athlete_profile_id) REFERENCES public.coaching_engagements(organization_id, id, athlete_profile_id) ON DELETE RESTRICT,
  CONSTRAINT athlete_data_sharing_consents_policy_scope_fkey FOREIGN KEY (policy_version_id, scope_key) REFERENCES public.athlete_consent_policy_versions(id, scope_key) ON DELETE RESTRICT,
  CONSTRAINT athlete_data_sharing_consents_successor_fkey FOREIGN KEY (organization_id, engagement_id, athlete_profile_id, scope_key, superseded_by_consent_id) REFERENCES public.athlete_data_sharing_consents(organization_id, engagement_id, athlete_profile_id, scope_key, id) ON DELETE RESTRICT,
  CONSTRAINT athlete_data_sharing_consents_grantor_check CHECK (granted_by_profile_id = athlete_profile_id),
  CONSTRAINT athlete_data_sharing_consents_expiry_chronology_check CHECK (expires_at IS NULL OR expires_at >= granted_at),
  CONSTRAINT athlete_data_sharing_consents_end_chronology_check CHECK (ended_at IS NULL OR ended_at >= granted_at),
  CONSTRAINT athlete_data_sharing_consents_successor_not_self_check CHECK (superseded_by_consent_id IS NULL OR superseded_by_consent_id <> id)
);
CREATE UNIQUE INDEX athlete_data_sharing_consents_current_unique ON public.athlete_data_sharing_consents (organization_id, engagement_id, athlete_profile_id, scope_key) WHERE ended_at IS NULL;
CREATE INDEX athlete_data_sharing_consents_policy_scope_idx ON public.athlete_data_sharing_consents (policy_version_id, scope_key);
CREATE INDEX athlete_data_sharing_consents_successor_idx ON public.athlete_data_sharing_consents (superseded_by_consent_id) WHERE superseded_by_consent_id IS NOT NULL;

CREATE TABLE public.organization_audit_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  actor_profile_id uuid,
  actor_membership_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  correlation_id uuid,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT organization_audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT organization_audit_events_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT organization_audit_events_actor_profile_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT organization_audit_events_actor_membership_fkey FOREIGN KEY (organization_id, actor_membership_id) REFERENCES public.organization_memberships(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT organization_audit_events_actor_identity_fkey FOREIGN KEY (organization_id, actor_membership_id, actor_profile_id) REFERENCES public.organization_memberships(organization_id, id, profile_id) ON DELETE RESTRICT,
  CONSTRAINT organization_audit_events_actor_membership_profile_check CHECK (actor_membership_id IS NULL OR actor_profile_id IS NOT NULL),
  CONSTRAINT organization_audit_events_action_non_empty CHECK (btrim(action) <> ''),
  CONSTRAINT organization_audit_events_resource_type_non_empty CHECK (btrim(resource_type) <> ''),
  CONSTRAINT organization_audit_events_details_object CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX organization_audit_events_organization_occurred_idx ON public.organization_audit_events (organization_id, occurred_at);
CREATE INDEX organization_audit_events_actor_membership_idx ON public.organization_audit_events (organization_id, actor_membership_id) WHERE actor_membership_id IS NOT NULL;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_root_owner_membership_fkey
  FOREIGN KEY (id, root_owner_membership_id)
  REFERENCES public.organization_memberships(organization_id, id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.prevent_organization_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'organization audit events are append-only';
END $$;

CREATE FUNCTION public.prevent_policy_version_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'athlete consent policy versions are immutable';
END $$;

CREATE FUNCTION public.prevent_coaching_engagement_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'accepted coaching engagements are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'coaching engagement identity and terminal end facts are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.prevent_coaching_assignment_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coaching assignments are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.coach_membership_id IS DISTINCT FROM OLD.coach_membership_id
     OR NEW.assignment_kind IS DISTINCT FROM OLD.assignment_kind
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR OLD.ended_at IS NOT NULL
     OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'coaching assignments may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.prevent_role_grant_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'role grants are retained and may only be revoked';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
     OR NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.role_key IS DISTINCT FROM OLD.role_key
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
     OR OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'role grants may only transition once from active to revoked';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.prevent_consent_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'athlete data sharing consents are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.athlete_profile_id IS DISTINCT FROM OLD.athlete_profile_id
     OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
     OR NEW.granted_by_profile_id IS DISTINCT FROM OLD.granted_by_profile_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at)
     OR (OLD.superseded_by_consent_id IS NOT NULL AND NEW.superseded_by_consent_id IS DISTINCT FROM OLD.superseded_by_consent_id) THEN
    RAISE EXCEPTION 'consent authority identity and grant facts are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validate_current_coaching_assignment() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  assignment_row public.coaching_assignments%ROWTYPE;
BEGIN
  SELECT * INTO assignment_row FROM public.coaching_assignments WHERE id = NEW.id;
  IF assignment_row.ended_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.coaching_engagements e ON e.organization_id = o.id AND e.id = assignment_row.engagement_id
    JOIN public.organization_memberships m ON m.organization_id = o.id AND m.id = assignment_row.coach_membership_id
    JOIN public.organization_membership_role_grants g ON g.organization_id = o.id AND g.membership_id = m.id
    WHERE o.id = assignment_row.organization_id
      AND o.suspended_at IS NULL AND o.closed_at IS NULL
      AND e.paused_at IS NULL AND e.ended_at IS NULL
      AND m.suspended_at IS NULL AND m.ended_at IS NULL
      AND g.role_key = 'coach' AND g.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'current coaching assignment requires an active organization, engagement, membership, and coach grant';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.validate_policy_supersession() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  predecessor_effective_from timestamp with time zone;
BEGIN
  IF NEW.supersedes_policy_version_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT effective_from INTO predecessor_effective_from
  FROM public.athlete_consent_policy_versions
  WHERE id = NEW.supersedes_policy_version_id AND scope_key = NEW.scope_key;
  IF predecessor_effective_from IS NULL OR NEW.effective_from < predecessor_effective_from THEN
    RAISE EXCEPTION 'policy supersession must retain scope and cannot move effective chronology backward';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.validate_consent_supersession() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  consent_row public.athlete_data_sharing_consents%ROWTYPE;
  successor_row public.athlete_data_sharing_consents%ROWTYPE;
BEGIN
  SELECT * INTO consent_row FROM public.athlete_data_sharing_consents WHERE id = NEW.id;
  IF consent_row.superseded_by_consent_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF consent_row.superseded_by_consent_id = consent_row.id OR consent_row.ended_at IS NULL THEN
    RAISE EXCEPTION 'a consent successor requires an ended predecessor and cannot reference itself';
  END IF;
  SELECT * INTO successor_row FROM public.athlete_data_sharing_consents WHERE id = consent_row.superseded_by_consent_id;
  IF successor_row.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'consent successor must be current when linked';
  END IF;
  IF successor_row.granted_at < consent_row.granted_at OR consent_row.ended_at > successor_row.granted_at THEN
    RAISE EXCEPTION 'consent successor chronology is invalid';
  END IF;
  IF EXISTS (
    WITH RECURSIVE consent_chain(id, successor_id, path, cycle) AS (
      SELECT c.id, c.superseded_by_consent_id, ARRAY[c.id], false
      FROM public.athlete_data_sharing_consents c
      WHERE c.id = consent_row.id
      UNION ALL
      SELECT next_consent.id,
             next_consent.superseded_by_consent_id,
             consent_chain.path || next_consent.id,
             next_consent.id = ANY(consent_chain.path)
      FROM consent_chain
      JOIN public.athlete_data_sharing_consents next_consent ON next_consent.id = consent_chain.successor_id
      WHERE consent_chain.successor_id IS NOT NULL AND NOT consent_chain.cycle
    )
    SELECT 1 FROM consent_chain WHERE cycle
  ) THEN
    RAISE EXCEPTION 'consent supersession cannot contain a cycle';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.validate_organization_root_owner() RETURNS trigger
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
  SELECT root_owner_membership_id INTO root_membership_id FROM public.organizations WHERE id = target_organization_id FOR UPDATE;
  IF FOUND AND EXISTS (SELECT 1 FROM public.organizations WHERE id = target_organization_id AND closed_at IS NULL) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = target_organization_id AND m.id = root_membership_id
        AND m.suspended_at IS NULL AND m.ended_at IS NULL
    ) THEN RAISE EXCEPTION 'active or suspended organization % must retain an active root-owner membership', target_organization_id; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_membership_role_grants g
      WHERE g.organization_id = target_organization_id AND g.membership_id = root_membership_id
        AND g.role_key = 'admin' AND g.revoked_at IS NULL
    ) THEN RAISE EXCEPTION 'root-owner membership % must retain an active admin grant', root_membership_id; END IF;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.prevent_organization_audit_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_policy_version_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_coaching_engagement_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_coaching_assignment_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_role_grant_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_consent_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_current_coaching_assignment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_policy_supersession() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_consent_supersession() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_organization_root_owner() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER organization_audit_events_append_only BEFORE UPDATE OR DELETE ON public.organization_audit_events FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_audit_event_mutation();
CREATE TRIGGER athlete_consent_policy_versions_immutable BEFORE UPDATE OR DELETE ON public.athlete_consent_policy_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_policy_version_mutation();
CREATE TRIGGER coaching_engagements_retained BEFORE UPDATE OR DELETE ON public.coaching_engagements FOR EACH ROW EXECUTE FUNCTION public.prevent_coaching_engagement_mutation();
CREATE TRIGGER coaching_assignments_retained BEFORE UPDATE OR DELETE ON public.coaching_assignments FOR EACH ROW EXECUTE FUNCTION public.prevent_coaching_assignment_mutation();
CREATE TRIGGER organization_membership_role_grants_revoke_only BEFORE UPDATE OR DELETE ON public.organization_membership_role_grants FOR EACH ROW EXECUTE FUNCTION public.prevent_role_grant_mutation();
CREATE TRIGGER athlete_data_sharing_consents_immutable BEFORE UPDATE OR DELETE ON public.athlete_data_sharing_consents FOR EACH ROW EXECUTE FUNCTION public.prevent_consent_mutation();
CREATE CONSTRAINT TRIGGER coaching_assignments_current_authority_guard AFTER INSERT OR UPDATE ON public.coaching_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_coaching_assignment();
CREATE CONSTRAINT TRIGGER athlete_consent_policy_versions_supersession_guard AFTER INSERT ON public.athlete_consent_policy_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_policy_supersession();
CREATE CONSTRAINT TRIGGER athlete_data_sharing_consents_supersession_guard AFTER INSERT OR UPDATE ON public.athlete_data_sharing_consents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_consent_supersession();
CREATE CONSTRAINT TRIGGER organizations_root_owner_guard AFTER INSERT OR UPDATE OR DELETE ON public.organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE CONSTRAINT TRIGGER memberships_root_owner_guard AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();
CREATE CONSTRAINT TRIGGER grants_root_owner_guard AFTER INSERT OR UPDATE OR DELETE ON public.organization_membership_role_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_organization_root_owner();

ALTER TABLE public.coaching_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_consent_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_data_sharing_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organizations, public.organization_memberships, public.organization_membership_role_grants, public.organization_roles, public.organization_permissions, public.organization_role_permission_grants, public.coaching_engagements, public.coaching_assignments, public.athlete_consent_policy_versions, public.athlete_data_sharing_consents, public.organization_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.organizations, public.organization_memberships, public.organization_membership_role_grants, public.organization_roles, public.organization_permissions, public.organization_role_permission_grants, public.coaching_engagements, public.coaching_assignments, public.athlete_consent_policy_versions, public.athlete_data_sharing_consents, public.organization_audit_events TO service_role;
