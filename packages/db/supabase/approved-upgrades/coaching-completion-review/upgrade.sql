-- Approved coaching completion review only. Use the guarded runner, never the fresh baseline.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
CREATE TABLE "coaching_completion_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"athlete_profile_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"evidence_version" text NOT NULL,
	"reviewed_by_profile_id" uuid NOT NULL,
	"reviewed_by_membership_id" uuid NOT NULL,
	"review_authority_kind" text NOT NULL,
	"reviewed_by_assignment_id" uuid,
	"reviewed_by_group_coach_assignment_id" uuid,
	"reviewed_by_group_athlete_membership_id" uuid,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_completion_reviews_evidence_unique" UNIQUE("engagement_id","session_id","evidence_version"),
	CONSTRAINT "coaching_completion_reviews_authority_path_check" CHECK (("review_authority_kind" = 'direct' and "reviewed_by_assignment_id" is not null and "reviewed_by_group_coach_assignment_id" is null and "reviewed_by_group_athlete_membership_id" is null) or ("review_authority_kind" = 'group' and "reviewed_by_assignment_id" is null and "reviewed_by_group_coach_assignment_id" is not null and "reviewed_by_group_athlete_membership_id" is not null))
);

ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_review_identity_unique" UNIQUE("organization_id","engagement_id","coach_membership_id","id");

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_engagement_fkey" FOREIGN KEY ("organization_id","engagement_id","athlete_profile_id") REFERENCES "public"."coaching_engagements"("organization_id","id","athlete_profile_id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_session_fkey" FOREIGN KEY ("session_id","athlete_profile_id") REFERENCES "public"."planned_sessions"("id","profile_id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_activity_fkey" FOREIGN KEY ("activity_id","athlete_profile_id") REFERENCES "public"."activities"("id","profile_id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_reviewer_membership_fkey" FOREIGN KEY ("organization_id","reviewed_by_membership_id","reviewed_by_profile_id") REFERENCES "public"."organization_memberships"("organization_id","id","profile_id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_reviewer_assignment_fkey" FOREIGN KEY ("organization_id","engagement_id","reviewed_by_membership_id","reviewed_by_assignment_id") REFERENCES "public"."coaching_assignments"("organization_id","engagement_id","coach_membership_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_group_coach_assignment_fkey" FOREIGN KEY ("reviewed_by_group_coach_assignment_id") REFERENCES "public"."organization_group_coach_assignments"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "coaching_completion_reviews" ADD CONSTRAINT "coaching_completion_reviews_group_athlete_membership_fkey" FOREIGN KEY ("reviewed_by_group_athlete_membership_id") REFERENCES "public"."organization_group_athletes"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX "coaching_completion_reviews_pending_lookup_idx" ON "coaching_completion_reviews" USING btree ("engagement_id","session_id","evidence_version");

CREATE OR REPLACE FUNCTION "public"."validate_coaching_completion_review_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  linked_activity_id uuid;
  required_scope text;
BEGIN
  -- This is the common authority fence used by coaching writers. The session row
  -- is also locked so an acknowledgement linearizes with a completion relink.
  PERFORM 1 FROM public.organizations AS organization
  WHERE organization.id = NEW.organization_id
    AND organization.suspended_at IS NULL AND organization.closed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion review requires an active organization';
  END IF;

  SELECT session.completed_activity_id INTO linked_activity_id
  FROM public.planned_sessions AS session
  WHERE session.id = NEW.session_id AND session.profile_id = NEW.athlete_profile_id
  FOR UPDATE;
  IF NOT FOUND OR linked_activity_id IS DISTINCT FROM NEW.activity_id THEN
    RAISE EXCEPTION 'completion review requires the currently linked completed activity';
  END IF;
  PERFORM 1 FROM public.activities AS activity
  WHERE activity.id = NEW.activity_id AND activity.profile_id = NEW.athlete_profile_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion review activity ownership mismatch';
  END IF;
  -- Group authority lifecycle writers hold the organization row first, then
  -- mutate these exact retained facts. Lock them in the same order before the
  -- authority predicate so a committed revoke/archive cannot be acknowledged
  -- from an earlier group-relationship observation.
  IF NEW.review_authority_kind = 'group' THEN
    PERFORM 1
    FROM public.organization_group_coach_assignments AS group_assignment
    JOIN public.organization_groups AS organization_group
      ON organization_group.organization_id = group_assignment.organization_id
      AND organization_group.id = group_assignment.group_id
    JOIN public.organization_group_athletes AS group_athlete
      ON group_athlete.organization_id = group_assignment.organization_id
      AND group_athlete.group_id = group_assignment.group_id
    WHERE group_assignment.organization_id = NEW.organization_id
      AND group_assignment.id = NEW.reviewed_by_group_coach_assignment_id
      AND group_athlete.id = NEW.reviewed_by_group_athlete_membership_id
    FOR SHARE OF group_assignment, organization_group, group_athlete;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'completion review group authority facts are unavailable';
    END IF;
  END IF;

  PERFORM 1
  FROM public.coaching_engagements AS engagement
  JOIN public.organization_memberships AS membership
    ON membership.organization_id = engagement.organization_id
      AND membership.id = NEW.reviewed_by_membership_id
  JOIN public.organization_membership_role_grants AS coach_grant
    ON coach_grant.organization_id = membership.organization_id AND coach_grant.membership_id = membership.id
  WHERE engagement.organization_id = NEW.organization_id
    AND engagement.id = NEW.engagement_id
    AND engagement.athlete_profile_id = NEW.athlete_profile_id
    AND engagement.paused_at IS NULL AND engagement.ended_at IS NULL
    AND membership.profile_id = NEW.reviewed_by_profile_id
    AND membership.suspended_at IS NULL AND membership.ended_at IS NULL
    AND coach_grant.role_key = 'coach' AND coach_grant.revoked_at IS NULL
    AND coach_grant.granted_at <= pg_catalog.transaction_timestamp()
    AND (
      (NEW.review_authority_kind = 'direct' AND EXISTS (
        SELECT 1 FROM public.coaching_assignments AS assignment
        WHERE assignment.organization_id = engagement.organization_id
          AND assignment.engagement_id = engagement.id
          AND assignment.id = NEW.reviewed_by_assignment_id
          AND assignment.coach_membership_id = NEW.reviewed_by_membership_id
          AND assignment.ended_at IS NULL
          AND assignment.assigned_at <= pg_catalog.transaction_timestamp()
      ))
      OR
      (NEW.review_authority_kind = 'group' AND EXISTS (
        SELECT 1
        FROM public.organization_group_coach_assignments AS group_assignment
        JOIN public.organization_groups AS organization_group
          ON organization_group.organization_id = group_assignment.organization_id
          AND organization_group.id = group_assignment.group_id
        JOIN public.organization_group_athletes AS group_athlete
          ON group_athlete.organization_id = group_assignment.organization_id
          AND group_athlete.group_id = group_assignment.group_id
        WHERE group_assignment.organization_id = engagement.organization_id
          AND group_assignment.id = NEW.reviewed_by_group_coach_assignment_id
          AND group_assignment.coach_membership_id = NEW.reviewed_by_membership_id
          AND group_assignment.ended_at IS NULL
          AND group_assignment.assigned_at <= pg_catalog.transaction_timestamp()
          AND organization_group.archived_at IS NULL
          AND group_athlete.id = NEW.reviewed_by_group_athlete_membership_id
          AND group_athlete.engagement_id = engagement.id
          AND group_athlete.ended_at IS NULL
          AND group_athlete.joined_at <= pg_catalog.transaction_timestamp()
      ))
    )
  FOR SHARE OF engagement, membership, coach_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion review requires an active assigned coach';
  END IF;

  FOREACH required_scope IN ARRAY ARRAY['activities', 'calendar'] LOOP
    PERFORM 1 FROM public.athlete_data_sharing_consents AS consent
    WHERE consent.organization_id = NEW.organization_id
      AND consent.engagement_id = NEW.engagement_id
      AND consent.athlete_profile_id = NEW.athlete_profile_id
      AND consent.scope_key = required_scope
      AND consent.ended_at IS NULL AND consent.superseded_by_consent_id IS NULL
      AND consent.granted_at <= pg_catalog.transaction_timestamp()
      AND (consent.expires_at IS NULL OR consent.expires_at > pg_catalog.transaction_timestamp())
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'completion review requires active % consent', required_scope;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."prevent_coaching_completion_review_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION 'coaching completion reviews are immutable';
END $$;

CREATE TRIGGER coaching_completion_reviews_authority BEFORE INSERT ON public.coaching_completion_reviews FOR EACH ROW EXECUTE FUNCTION public.validate_coaching_completion_review_insert();

CREATE TRIGGER coaching_completion_reviews_immutable BEFORE DELETE OR UPDATE ON public.coaching_completion_reviews FOR EACH ROW EXECUTE FUNCTION public.prevent_coaching_completion_review_mutation();

ALTER TABLE public.coaching_completion_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.coaching_completion_reviews FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.coaching_completion_reviews TO service_role;

REVOKE ALL ON FUNCTION public.validate_coaching_completion_review_insert() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_coaching_completion_review_mutation() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
