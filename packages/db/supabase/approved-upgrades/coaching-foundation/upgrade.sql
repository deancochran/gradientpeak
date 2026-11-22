-- Approved coaching foundation only. Use the guarded runner, never the fresh baseline.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_membership_id" uuid NOT NULL,
	"invitation_kind" text NOT NULL,
	"invited_profile_id" uuid,
	"invited_email" text,
	"requested_role_key" text,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_by_profile_id" uuid,
	"accepted_at" timestamp with time zone,
	"closed_by_membership_id" uuid,
	"declined_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_closer_check" CHECK (("status" in ('revoked','expired')) = ("closed_by_membership_id" is not null)),
	CONSTRAINT "organization_invitations_decline_check" CHECK (("status" = 'declined') = ("declined_by_profile_id" is not null) and ("declined_by_profile_id" is null or "invited_profile_id" is null or "declined_by_profile_id" = "invited_profile_id")),
	CONSTRAINT "organization_invitations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_invitations_recipient_check" CHECK (("invited_profile_id" is null) <> ("invited_email" is null)),
	CONSTRAINT "organization_invitations_email_non_empty" CHECK ("invited_email" is null or btrim("invited_email") <> ''),
	CONSTRAINT "organization_invitations_token_digest_non_empty" CHECK (btrim("token_digest") <> ''),
	CONSTRAINT "organization_invitations_role_check" CHECK (("invitation_kind" = 'staff' and "requested_role_key" is not null and "requested_role_key" in ('admin', 'coach')) or ("invitation_kind" = 'athlete' and "requested_role_key" is null)),
	CONSTRAINT "organization_invitations_acceptance_check" CHECK (("status" = 'accepted' and "accepted_by_profile_id" is not null and "accepted_at" is not null and "accepted_at" >= "created_at" and "accepted_at" < "expires_at" and ("invited_profile_id" is null or "accepted_by_profile_id" = "invited_profile_id")) or ("status" <> 'accepted' and "accepted_by_profile_id" is null and "accepted_at" is null)),
	CONSTRAINT "organization_invitations_expiry_check" CHECK ("expires_at" >= "created_at"),
	CONSTRAINT "organization_invitations_kind_check" CHECK ("invitation_kind" in ('staff', 'athlete')),
	CONSTRAINT "organization_invitations_status_check" CHECK ("status" in ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);

CREATE TABLE "organization_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_membership_id" uuid,
	CONSTRAINT "organization_groups_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_groups_archive_check" CHECK (("archived_at" is null) = ("archived_by_membership_id" is null) and ("archived_at" is null or "archived_at" >= "created_at")),
	CONSTRAINT "organization_groups_name_non_empty" CHECK (btrim("name") <> '')
);

CREATE TABLE "organization_group_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"added_by_membership_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_membership_id" uuid,
	CONSTRAINT "organization_group_athletes_end_actor_check" CHECK (("ended_at" is null) = ("ended_by_membership_id" is null)),
	CONSTRAINT "organization_group_athletes_chronology_check" CHECK ("ended_at" is null or "ended_at" >= "joined_at")
);

CREATE TABLE "organization_group_coach_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"coach_membership_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_membership_id" uuid,
	CONSTRAINT "organization_group_coach_assignments_end_actor_check" CHECK (("ended_at" is null) = ("ended_by_membership_id" is null)),
	CONSTRAINT "organization_group_coach_assignments_chronology_check" CHECK ("ended_at" is null or "ended_at" >= "assigned_at")
);

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_inviter_fkey" FOREIGN KEY ("organization_id","invited_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_profile_fkey" FOREIGN KEY ("invited_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_profile_fkey" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_declined_by_profile_id_profiles_id_fk" FOREIGN KEY ("declined_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_closer_fkey" FOREIGN KEY ("organization_id","closed_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_creator_fkey" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_groups" ADD CONSTRAINT "organization_groups_archiver_fkey" FOREIGN KEY ("organization_id","archived_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_ender_fkey" FOREIGN KEY ("organization_id","ended_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_ender_fkey" FOREIGN KEY ("organization_id","ended_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_group_fkey" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."organization_groups"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_engagement_fkey" FOREIGN KEY ("organization_id","engagement_id") REFERENCES "public"."coaching_engagements"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_athletes" ADD CONSTRAINT "organization_group_athletes_actor_fkey" FOREIGN KEY ("organization_id","added_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_group_fkey" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."organization_groups"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_coach_fkey" FOREIGN KEY ("organization_id","coach_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "organization_group_coach_assignments" ADD CONSTRAINT "organization_group_coach_assignments_actor_fkey" FOREIGN KEY ("organization_id","assigned_by_membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "organization_invitations_token_digest_unique" ON "organization_invitations" USING btree ("token_digest");

CREATE INDEX "organization_invitations_pending_recipient_idx" ON "organization_invitations" USING btree ("organization_id","invited_profile_id") WHERE "organization_invitations"."status" = 'pending' and "organization_invitations"."invited_profile_id" is not null;

CREATE INDEX "organization_groups_active_organization_idx" ON "organization_groups" USING btree ("organization_id","id") WHERE "organization_groups"."archived_at" is null;

CREATE UNIQUE INDEX "organization_group_athletes_current_unique" ON "organization_group_athletes" USING btree ("group_id","engagement_id") WHERE "organization_group_athletes"."ended_at" is null;

CREATE INDEX "organization_group_athletes_active_engagement_idx" ON "organization_group_athletes" USING btree ("organization_id","engagement_id") WHERE "organization_group_athletes"."ended_at" is null;

CREATE UNIQUE INDEX "organization_group_coach_assignments_current_unique" ON "organization_group_coach_assignments" USING btree ("group_id","coach_membership_id") WHERE "organization_group_coach_assignments"."ended_at" is null;

CREATE INDEX "organization_group_coach_assignments_active_coach_idx" ON "organization_group_coach_assignments" USING btree ("organization_id","coach_membership_id") WHERE "organization_group_coach_assignments"."ended_at" is null;

CREATE OR REPLACE FUNCTION "public"."coaching_athlete_read_access_decision"("p_actor_profile_id" "uuid", "p_organization_id" "uuid", "p_athlete_profile_id" "uuid", "p_scope_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
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
  LIMIT 1
  FOR SHARE;

  IF v_assignment_id IS NULL THEN
    SELECT group_assignment.id
    INTO v_assignment_id
    FROM public.organization_group_coach_assignments AS group_assignment
    JOIN public.organization_groups AS organization_group
      ON organization_group.organization_id = group_assignment.organization_id
      AND organization_group.id = group_assignment.group_id
    JOIN public.organization_group_athletes AS group_athlete
      ON group_athlete.organization_id = group_assignment.organization_id
      AND group_athlete.group_id = group_assignment.group_id
    WHERE group_assignment.organization_id = p_organization_id
      AND group_assignment.coach_membership_id = v_membership_id
      AND group_assignment.ended_at IS NULL
      AND group_assignment.assigned_at <= v_now
      AND organization_group.archived_at IS NULL
      AND group_athlete.engagement_id = v_engagement_id
      AND group_athlete.ended_at IS NULL
      AND group_athlete.joined_at <= v_now
    LIMIT 1
    FOR SHARE;
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization groups are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.archived_at IS NOT NULL
     OR NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'organization groups may only transition once from active to archived';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."guard_organization_group_authority"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  actor_id uuid;
  row_data jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  -- All new authority writers use the same fence as protected projection reads.
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF TG_TABLE_NAME = 'organization_groups' THEN
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by_membership_id ELSE NEW.archived_by_membership_id END;
  ELSIF TG_TABLE_NAME = 'organization_group_athletes' THEN
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.added_by_membership_id ELSE NEW.ended_by_membership_id END;
  ELSE
    actor_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.assigned_by_membership_id ELSE NEW.ended_by_membership_id END;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id = o.id AND m.id = actor_id
    WHERE o.id = NEW.organization_id AND o.suspended_at IS NULL AND o.closed_at IS NULL
      AND m.suspended_at IS NULL AND m.ended_at IS NULL AND m.created_at <= transaction_timestamp()
      AND (m.id = o.root_owner_membership_id OR EXISTS (
        SELECT 1 FROM public.organization_membership_role_grants r
        WHERE r.organization_id = o.id AND r.membership_id = m.id AND r.role_key = 'admin'
          AND r.revoked_at IS NULL AND r.granted_at <= transaction_timestamp()
      ))
  ) THEN RAISE EXCEPTION 'organization group mutation requires an active root owner or admin actor'; END IF;
  IF TG_OP = 'INSERT' AND (
    row_data->>'ended_at' IS NOT NULL OR row_data->>'archived_at' IS NOT NULL
    OR COALESCE((row_data->>'joined_at')::timestamptz, (row_data->>'assigned_at')::timestamptz,
                (row_data->>'created_at')::timestamptz) > transaction_timestamp()
  ) THEN RAISE EXCEPTION 'organization group relationships must begin active and effective now'; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE((row_data->>'ended_at')::timestamptz,
       (row_data->>'archived_at')::timestamptz) > transaction_timestamp() THEN
    RAISE EXCEPTION 'organization group revocation must be effective now';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."audit_organization_group_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  actor_id uuid;
  actor_profile uuid;
  row_data jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  actor_id := COALESCE((row_data->>'ended_by_membership_id')::uuid,
    (row_data->>'archived_by_membership_id')::uuid, (row_data->>'added_by_membership_id')::uuid,
    (row_data->>'assigned_by_membership_id')::uuid, (row_data->>'created_by_membership_id')::uuid);
  SELECT profile_id INTO STRICT actor_profile FROM public.organization_memberships
    WHERE organization_id = NEW.organization_id AND id = actor_id;
  INSERT INTO public.organization_audit_events
    (organization_id, actor_profile_id, actor_membership_id, action, resource_type, resource_id, details)
  VALUES (NEW.organization_id, actor_profile, actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'group_relationship_created' ELSE 'group_relationship_ended' END,
    TG_TABLE_NAME, NEW.id, '{}'::jsonb);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_athlete_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization group athlete memberships are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.added_by_membership_id IS DISTINCT FROM OLD.added_by_membership_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'organization group athlete memberships may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_organization_group_coach_assignment_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization group coach assignments are retained and cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.coach_membership_id IS DISTINCT FROM OLD.coach_membership_id
     OR NEW.assigned_by_membership_id IS DISTINCT FROM OLD.assigned_by_membership_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'organization group coach assignments may only transition once from active to ended';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_current_organization_group_relationship"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  relationship_row record;
  actor_membership_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'organization_group_athletes' THEN
    SELECT * INTO relationship_row FROM public.organization_group_athletes WHERE id = NEW.id;
    actor_membership_id := relationship_row.added_by_membership_id;
  ELSIF TG_TABLE_NAME = 'organization_group_coach_assignments' THEN
    SELECT * INTO relationship_row FROM public.organization_group_coach_assignments WHERE id = NEW.id;
    actor_membership_id := relationship_row.assigned_by_membership_id;
  ELSE
    RAISE EXCEPTION 'unexpected organization group relationship';
  END IF;
  IF relationship_row.ended_at IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations AS organization
    JOIN public.organization_groups AS organization_group ON organization_group.organization_id = organization.id
    JOIN public.organization_memberships AS actor ON actor.organization_id = organization.id AND actor.id = actor_membership_id
    WHERE organization.id = relationship_row.organization_id
      AND organization_group.id = relationship_row.group_id
      AND organization.suspended_at IS NULL AND organization.closed_at IS NULL
      AND organization_group.archived_at IS NULL
      AND actor.suspended_at IS NULL AND actor.ended_at IS NULL
      AND (actor.id = organization.root_owner_membership_id OR EXISTS (
        SELECT 1 FROM public.organization_membership_role_grants AS actor_grant
        WHERE actor_grant.organization_id = organization.id AND actor_grant.membership_id = actor.id
          AND actor_grant.role_key = 'admin' AND actor_grant.granted_at <= pg_catalog.transaction_timestamp()
          AND actor_grant.revoked_at IS NULL
      ))
  ) THEN RAISE EXCEPTION 'current organization group relationship requires an active root owner or admin actor and active organization group'; END IF;
  IF TG_TABLE_NAME = 'organization_group_athletes' THEN
  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_engagements AS engagement
    WHERE engagement.organization_id = relationship_row.organization_id AND engagement.id = relationship_row.engagement_id
      AND engagement.paused_at IS NULL AND engagement.ended_at IS NULL
  ) THEN RAISE EXCEPTION 'current organization group athlete membership requires an active engagement'; END IF;
  ELSE
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS coach
    JOIN public.organization_membership_role_grants AS grant_row ON grant_row.organization_id = coach.organization_id AND grant_row.membership_id = coach.id
    WHERE coach.organization_id = relationship_row.organization_id AND coach.id = relationship_row.coach_membership_id
      AND coach.suspended_at IS NULL AND coach.ended_at IS NULL AND grant_row.role_key = 'coach'
      AND grant_row.granted_at <= pg_catalog.transaction_timestamp() AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'current organization group coach assignment requires an active coach membership and grant'; END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_organization_invitation_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF TG_OP = 'INSERT' AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'organization invitations must start pending';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.status <> 'pending' OR NEW.status = 'pending'
    OR (pg_catalog.to_jsonb(NEW) - ARRAY['status','accepted_at','accepted_by_profile_id','closed_by_membership_id','declined_by_profile_id'])
       IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - ARRAY['status','accepted_at','accepted_by_profile_id','closed_by_membership_id','declined_by_profile_id'])
  ) THEN RAISE EXCEPTION 'invitation permits only one immutable pending-to-terminal transition'; END IF;
  IF NEW.status = 'accepted' AND (NEW.expires_at <= transaction_timestamp()
      OR NEW.accepted_at IS DISTINCT FROM transaction_timestamp()) THEN
    RAISE EXCEPTION 'accepted invitation must be unexpired and accepted now';
  END IF;
  IF NEW.status = 'declined' THEN RETURN NEW; END IF;
  IF NEW.status = 'expired' AND NEW.expires_at > transaction_timestamp() THEN
    RAISE EXCEPTION 'invitation has not yet expired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations AS organization
    JOIN public.organization_memberships AS actor
      ON actor.organization_id = organization.id AND actor.id =
        CASE WHEN NEW.status IN ('revoked','expired') THEN NEW.closed_by_membership_id ELSE NEW.invited_by_membership_id END
    WHERE organization.id = NEW.organization_id
      AND organization.suspended_at IS NULL AND organization.closed_at IS NULL
      AND actor.suspended_at IS NULL AND actor.ended_at IS NULL
      AND (
        actor.id = organization.root_owner_membership_id
        OR (NEW.requested_role_key IS DISTINCT FROM 'admin' AND EXISTS (
          SELECT 1 FROM public.organization_membership_role_grants AS actor_grant
          WHERE actor_grant.organization_id = organization.id AND actor_grant.membership_id = actor.id
            AND actor_grant.role_key = 'admin' AND actor_grant.granted_at <= pg_catalog.transaction_timestamp()
            AND actor_grant.revoked_at IS NULL
        ))
      )
  ) THEN
    RAISE EXCEPTION 'organization invitation requires an active authorized inviter';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organization_groups_retained BEFORE DELETE OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_mutation();

CREATE TRIGGER organization_invitations_actor_guard BEFORE INSERT OR UPDATE ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION public.validate_organization_invitation_actor();

CREATE TRIGGER organization_groups_authority_guard BEFORE INSERT OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();

CREATE TRIGGER organization_group_athletes_authority_guard BEFORE INSERT OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();

CREATE TRIGGER organization_group_coach_assignments_authority_guard BEFORE INSERT OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_organization_group_authority();

CREATE TRIGGER organization_groups_audit AFTER INSERT OR UPDATE ON public.organization_groups FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();

CREATE TRIGGER organization_group_athletes_audit AFTER INSERT OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();

CREATE TRIGGER organization_group_coach_assignments_audit AFTER INSERT OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.audit_organization_group_change();

CREATE TRIGGER organization_group_athletes_retained BEFORE DELETE OR UPDATE ON public.organization_group_athletes FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_athlete_mutation();

CREATE CONSTRAINT TRIGGER organization_group_athletes_current_authority_guard AFTER INSERT OR UPDATE ON public.organization_group_athletes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_organization_group_relationship();

CREATE TRIGGER organization_group_coach_assignments_retained BEFORE DELETE OR UPDATE ON public.organization_group_coach_assignments FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_group_coach_assignment_mutation();

CREATE CONSTRAINT TRIGGER organization_group_coach_assignments_current_authority_guard AFTER INSERT OR UPDATE ON public.organization_group_coach_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_current_organization_group_relationship();

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_invitations FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.organization_invitations TO service_role;

ALTER TABLE public.organization_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_groups FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.organization_groups TO service_role;

ALTER TABLE public.organization_group_athletes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_group_athletes FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.organization_group_athletes TO service_role;

ALTER TABLE public.organization_group_coach_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_group_coach_assignments FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.organization_group_coach_assignments TO service_role;
COMMIT;
