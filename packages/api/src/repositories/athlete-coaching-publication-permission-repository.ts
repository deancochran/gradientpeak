import {
  athletePlanEditGrants,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

/** Reads only an athlete's currently effective publication-permission choices. */
export function createAthleteCoachingPublicationPermissionRepository(db: DrizzleQueryExecutor) {
  return {
    listCurrentOptions(input: { athleteProfileId: string; now: Date }) {
      return db
        .selectDistinct({
          organizationId: organizations.id,
          organizationName: organizations.name,
          coachMembershipId: organizationMemberships.id,
          coachName: sql<string>`coalesce(${profiles.full_name}, ${profiles.username}, 'Coach')`,
          currentGrantId: athletePlanEditGrants.id,
        })
        .from(coachingEngagements)
        .innerJoin(organizations, eq(organizations.id, coachingEngagements.organization_id))
        .innerJoin(
          coachingAssignments,
          and(
            eq(coachingAssignments.organization_id, coachingEngagements.organization_id),
            eq(coachingAssignments.engagement_id, coachingEngagements.id),
            isNull(coachingAssignments.ended_at),
            sql`${coachingAssignments.assigned_at} <= ${input.now}`,
          ),
        )
        .innerJoin(
          organizationMemberships,
          and(
            eq(organizationMemberships.organization_id, coachingAssignments.organization_id),
            eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
            isNull(organizationMemberships.ended_at),
            isNull(organizationMemberships.suspended_at),
            sql`${organizationMemberships.created_at} <= ${input.now}`,
          ),
        )
        .innerJoin(profiles, eq(profiles.id, organizationMemberships.profile_id))
        .innerJoin(
          organizationMembershipRoleGrants,
          and(
            eq(
              organizationMembershipRoleGrants.organization_id,
              organizationMemberships.organization_id,
            ),
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
            isNull(organizationMembershipRoleGrants.revoked_at),
            sql`${organizationMembershipRoleGrants.granted_at} <= ${input.now}`,
          ),
        )
        .leftJoin(
          athletePlanEditGrants,
          and(
            eq(athletePlanEditGrants.organization_id, coachingEngagements.organization_id),
            eq(athletePlanEditGrants.engagement_id, coachingEngagements.id),
            eq(athletePlanEditGrants.athlete_profile_id, input.athleteProfileId),
            eq(athletePlanEditGrants.coach_membership_id, coachingAssignments.coach_membership_id),
            isNull(athletePlanEditGrants.revoked_at),
            sql`${athletePlanEditGrants.granted_at} <= ${input.now}`,
            sql`(${athletePlanEditGrants.expires_at} is null or ${athletePlanEditGrants.expires_at} > ${input.now})`,
          ),
        )
        .where(
          and(
            eq(coachingEngagements.athlete_profile_id, input.athleteProfileId),
            isNull(coachingEngagements.ended_at),
            isNull(coachingEngagements.paused_at),
            sql`${coachingEngagements.created_at} <= ${input.now}`,
            isNull(organizations.closed_at),
            isNull(organizations.suspended_at),
          ),
        )
        .orderBy(asc(organizations.name), asc(organizationMemberships.id));
    },
  };
}
