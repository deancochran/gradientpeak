import {
  coachingAssignments,
  coachingEngagements,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, asc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationCoachAthleteRepository(db: DrizzleQueryExecutor) {
  return {
    async hasActiveCoachMembership(input: { organizationId: string; profileId: string }) {
      const [row] = await db
        .select({ membershipId: organizationMemberships.id })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
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
            sql`${organizationMembershipRoleGrants.granted_at} <= transaction_timestamp()`,
          ),
        )
        .where(
          and(
            eq(organizationMemberships.organization_id, input.organizationId),
            eq(organizationMemberships.profile_id, input.profileId),
            isNull(organizationMemberships.suspended_at),
            isNull(organizationMemberships.ended_at),
            sql`${organizationMemberships.created_at} <= transaction_timestamp()`,
            isNull(organizations.suspended_at),
            isNull(organizations.closed_at),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    listAssigned(input: {
      organizationId: string;
      coachProfileId: string;
      limit: number;
      cursor: string | null;
      search: string | null;
      athleteProfileId?: string;
    }) {
      const assignmentPredicate = sql`exists (
        select 1 from ${organizationMemberships} coach_membership
        where coach_membership.organization_id = ${input.organizationId}::uuid
          and coach_membership.profile_id = ${input.coachProfileId}::uuid
          and coach_membership.suspended_at is null and coach_membership.ended_at is null
          and coach_membership.created_at <= transaction_timestamp()
          and exists (select 1 from ${organizationMembershipRoleGrants} coach_role
            where coach_role.organization_id = coach_membership.organization_id
              and coach_role.membership_id = coach_membership.id
              and coach_role.role_key = 'coach' and coach_role.revoked_at is null
              and coach_role.granted_at <= transaction_timestamp())
          and (
            exists (select 1 from ${coachingAssignments} direct_assignment
              where direct_assignment.organization_id = ${input.organizationId}::uuid
                and direct_assignment.engagement_id = ${coachingEngagements.id}
                and direct_assignment.coach_membership_id = coach_membership.id
                and direct_assignment.ended_at is null
                and direct_assignment.assigned_at <= transaction_timestamp())
            or exists (select 1 from ${organizationGroupAthletes} group_athlete
              inner join ${organizationGroups} assigned_group
                on assigned_group.organization_id = group_athlete.organization_id
               and assigned_group.id = group_athlete.group_id
               and assigned_group.archived_at is null
               and assigned_group.created_at <= transaction_timestamp()
              inner join ${organizationGroupCoachAssignments} group_coach
                on group_coach.organization_id = group_athlete.organization_id
               and group_coach.group_id = group_athlete.group_id
               and group_coach.coach_membership_id = coach_membership.id
               and group_coach.ended_at is null
               and group_coach.assigned_at <= transaction_timestamp()
              where group_athlete.organization_id = ${input.organizationId}::uuid
                and group_athlete.engagement_id = ${coachingEngagements.id}
                and group_athlete.ended_at is null
                and group_athlete.joined_at <= transaction_timestamp())
          )
      )`;
      return db
        .selectDistinct({
          profileId: profiles.id,
          displayName: profiles.full_name,
          username: profiles.username,
        })
        .from(coachingEngagements)
        .innerJoin(profiles, eq(profiles.id, coachingEngagements.athlete_profile_id))
        .innerJoin(organizations, eq(organizations.id, coachingEngagements.organization_id))
        .where(
          and(
            eq(coachingEngagements.organization_id, input.organizationId),
            isNull(coachingEngagements.paused_at),
            isNull(coachingEngagements.ended_at),
            sql`${coachingEngagements.created_at} <= transaction_timestamp()`,
            isNull(organizations.suspended_at),
            isNull(organizations.closed_at),
            ...(input.athleteProfileId ? [eq(profiles.id, input.athleteProfileId)] : []),
            ...(input.cursor ? [gt(profiles.id, input.cursor)] : []),
            ...(input.search
              ? [
                  or(
                    ilike(profiles.full_name, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`),
                    ilike(profiles.username, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`),
                  ),
                ]
              : []),
            assignmentPredicate,
          ),
        )
        .orderBy(asc(profiles.id))
        .limit(input.limit + 1);
    },
  };
}
