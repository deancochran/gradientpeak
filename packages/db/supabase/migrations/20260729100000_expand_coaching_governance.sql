-- Coaching foundation expand phase. Existing authority is never guessed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations) THEN
    RAISE EXCEPTION 'Coaching governance migration requires explicit root-owner resolution for every existing organization; no ownership is inferred';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships) THEN
    RAISE EXCEPTION 'Coaching governance migration requires explicit membership lifecycle classification; no inactive membership meaning is inferred';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_membership_role_grants)
     OR EXISTS (SELECT 1 FROM public.organization_roles)
     OR EXISTS (SELECT 1 FROM public.organization_permissions)
     OR EXISTS (SELECT 1 FROM public.organization_role_permission_grants) THEN
    RAISE EXCEPTION 'Coaching governance migration requires explicit legacy RBAC inventory/resolution; custom roles, duplicate authority, and legacy grants are not guessed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.coaches_athletes)
     OR EXISTS (SELECT 1 FROM public.coaching_invitations) THEN
    RAISE EXCEPTION 'Coaching governance migration requires explicit legacy coaching relationship inventory; engagements and consents are never fabricated';
  END IF;
END $$;

ALTER TABLE public.organizations
  ADD COLUMN root_owner_membership_id uuid,
  ADD COLUMN timezone text,
  ADD COLUMN suspended_at timestamp with time zone,
  ADD COLUMN closed_at timestamp with time zone;

ALTER TABLE public.organization_memberships
  ADD COLUMN suspended_at timestamp with time zone,
  ADD COLUMN ended_at timestamp with time zone;

ALTER TABLE public.organization_membership_role_grants
  ADD COLUMN id uuid,
  ADD COLUMN role_key text,
  ADD COLUMN granted_at timestamp with time zone,
  ADD COLUMN revoked_at timestamp with time zone;
