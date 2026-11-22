import {
  coachingEngagements,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationGroupManagementRepository(db: DrizzleQueryExecutor) {
  const managerWhere = (organizationId: string, profileId: string) =>
    and(
      eq(organizations.id, organizationId),
      isNull(organizations.suspended_at),
      isNull(organizations.closed_at),
      eq(organizationMemberships.profile_id, profileId),
      isNull(organizationMemberships.suspended_at),
      isNull(organizationMemberships.ended_at),
      lte(organizationMemberships.created_at, sql`transaction_timestamp()`),
      or(
        eq(organizations.root_owner_membership_id, organizationMemberships.id),
        sql`exists (select 1 from ${organizationMembershipRoleGrants} role_grant where role_grant.organization_id = ${organizations.id} and role_grant.membership_id = ${organizationMemberships.id} and role_grant.role_key = 'admin' and role_grant.granted_at <= transaction_timestamp() and role_grant.revoked_at is null)`,
      ),
    );
  return {
    lockManager: async (organizationId: string, profileId: string) =>
      (
        await db
          .select({ membershipId: organizationMemberships.id })
          .from(organizations)
          .innerJoin(
            organizationMemberships,
            eq(organizationMemberships.organization_id, organizations.id),
          )
          .where(managerWhere(organizationId, profileId))
          .for("update", { of: organizations })
          .limit(1)
      )[0] ?? null,
    findManager: async (organizationId: string, profileId: string) =>
      (
        await db
          .select({ membershipId: organizationMemberships.id })
          .from(organizations)
          .innerJoin(
            organizationMemberships,
            eq(organizationMemberships.organization_id, organizations.id),
          )
          .where(managerWhere(organizationId, profileId))
          .limit(1)
      )[0] ?? null,
    listGroups: (organizationId: string, afterId: string | null, limit: number) =>
      db
        .select({
          id: organizationGroups.id,
          name: organizationGroups.name,
          description: organizationGroups.description,
          createdAt: organizationGroups.created_at,
        })
        .from(organizationGroups)
        .where(
          and(
            eq(organizationGroups.organization_id, organizationId),
            isNull(organizationGroups.archived_at),
            lte(organizationGroups.created_at, sql`transaction_timestamp()`),
            afterId ? gt(organizationGroups.id, afterId) : undefined,
          ),
        )
        .orderBy(organizationGroups.id)
        .limit(limit),
    hasGroupCursor: async (organizationId: string, id: string) =>
      (
        await db
          .select({ id: organizationGroups.id })
          .from(organizationGroups)
          .where(
            and(
              eq(organizationGroups.organization_id, organizationId),
              eq(organizationGroups.id, id),
            ),
          )
          .limit(1)
      ).length === 1,
    getGroup: async (organizationId: string, groupId: string, lock = false) => {
      const query = db
        .select({
          id: organizationGroups.id,
          name: organizationGroups.name,
          description: organizationGroups.description,
          createdAt: organizationGroups.created_at,
          archivedAt: organizationGroups.archived_at,
        })
        .from(organizationGroups)
        .where(
          and(
            eq(organizationGroups.organization_id, organizationId),
            eq(organizationGroups.id, groupId),
            lte(organizationGroups.created_at, sql`transaction_timestamp()`),
          ),
        )
        .limit(1);
      return (lock ? await query.for("update") : await query)[0] ?? null;
    },
    createGroup: (v: {
      id: string;
      organizationId: string;
      name: string;
      description: string | null;
      actorMembershipId: string;
    }) =>
      db
        .insert(organizationGroups)
        .values({
          id: v.id,
          organization_id: v.organizationId,
          name: v.name,
          description: v.description,
          created_by_membership_id: v.actorMembershipId,
        })
        .onConflictDoNothing()
        .returning({ id: organizationGroups.id }),
    archiveGroup: (organizationId: string, groupId: string, actorMembershipId: string) =>
      db
        .update(organizationGroups)
        .set({
          archived_at: sql`transaction_timestamp()`,
          archived_by_membership_id: actorMembershipId,
        })
        .where(
          and(
            eq(organizationGroups.organization_id, organizationId),
            eq(organizationGroups.id, groupId),
            isNull(organizationGroups.archived_at),
          ),
        )
        .returning({ id: organizationGroups.id }),
    listAthletes: (
      organizationId: string,
      groupId: string,
      afterId: string | null,
      limit: number,
    ) =>
      db
        .select({
          id: organizationGroupAthletes.id,
          engagementId: organizationGroupAthletes.engagement_id,
        })
        .from(organizationGroupAthletes)
        .innerJoin(
          coachingEngagements,
          eq(coachingEngagements.id, organizationGroupAthletes.engagement_id),
        )
        .where(
          and(
            eq(organizationGroupAthletes.organization_id, organizationId),
            eq(organizationGroupAthletes.group_id, groupId),
            isNull(organizationGroupAthletes.ended_at),
            lte(organizationGroupAthletes.joined_at, sql`transaction_timestamp()`),
            isNull(coachingEngagements.paused_at),
            isNull(coachingEngagements.ended_at),
            lte(coachingEngagements.created_at, sql`transaction_timestamp()`),
            afterId ? gt(organizationGroupAthletes.id, afterId) : undefined,
          ),
        )
        .orderBy(organizationGroupAthletes.id)
        .limit(limit),
    hasAthleteCursor: async (organizationId: string, groupId: string, id: string) =>
      (
        await db
          .select({ id: organizationGroupAthletes.id })
          .from(organizationGroupAthletes)
          .where(
            and(
              eq(organizationGroupAthletes.organization_id, organizationId),
              eq(organizationGroupAthletes.group_id, groupId),
              eq(organizationGroupAthletes.id, id),
            ),
          )
          .limit(1)
      ).length === 1,
    listCoaches: (organizationId: string, groupId: string, afterId: string | null, limit: number) =>
      db
        .select({
          id: organizationGroupCoachAssignments.id,
          membershipId: organizationGroupCoachAssignments.coach_membership_id,
        })
        .from(organizationGroupCoachAssignments)
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.id, organizationGroupCoachAssignments.coach_membership_id),
        )
        .where(
          and(
            eq(organizationGroupCoachAssignments.organization_id, organizationId),
            eq(organizationGroupCoachAssignments.group_id, groupId),
            isNull(organizationGroupCoachAssignments.ended_at),
            lte(organizationGroupCoachAssignments.assigned_at, sql`transaction_timestamp()`),
            isNull(organizationMemberships.suspended_at),
            isNull(organizationMemberships.ended_at),
            lte(organizationMemberships.created_at, sql`transaction_timestamp()`),
            sql`exists (select 1 from ${organizationMembershipRoleGrants} role_grant where role_grant.organization_id = ${organizationMemberships.organization_id} and role_grant.membership_id = ${organizationMemberships.id} and role_grant.role_key = 'coach' and role_grant.granted_at <= transaction_timestamp() and role_grant.revoked_at is null)`,
            afterId ? gt(organizationGroupCoachAssignments.id, afterId) : undefined,
          ),
        )
        .orderBy(organizationGroupCoachAssignments.id)
        .limit(limit),
    hasCoachCursor: async (organizationId: string, groupId: string, id: string) =>
      (
        await db
          .select({ id: organizationGroupCoachAssignments.id })
          .from(organizationGroupCoachAssignments)
          .where(
            and(
              eq(organizationGroupCoachAssignments.organization_id, organizationId),
              eq(organizationGroupCoachAssignments.group_id, groupId),
              eq(organizationGroupCoachAssignments.id, id),
            ),
          )
          .limit(1)
      ).length === 1,
    activeEngagement: async (organizationId: string, engagementId: string) =>
      (
        await db
          .select({ id: coachingEngagements.id })
          .from(coachingEngagements)
          .where(
            and(
              eq(coachingEngagements.organization_id, organizationId),
              eq(coachingEngagements.id, engagementId),
              isNull(coachingEngagements.paused_at),
              isNull(coachingEngagements.ended_at),
              lte(coachingEngagements.created_at, sql`transaction_timestamp()`),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    activeCoach: async (organizationId: string, membershipId: string) =>
      (
        await db
          .select({ id: organizationMemberships.id })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organization_id, organizationId),
              eq(organizationMemberships.id, membershipId),
              isNull(organizationMemberships.suspended_at),
              isNull(organizationMemberships.ended_at),
              lte(organizationMemberships.created_at, sql`transaction_timestamp()`),
              sql`exists (select 1 from ${organizationMembershipRoleGrants} role_grant where role_grant.organization_id = ${organizationMemberships.organization_id} and role_grant.membership_id = ${organizationMemberships.id} and role_grant.role_key = 'coach' and role_grant.granted_at <= transaction_timestamp() and role_grant.revoked_at is null)`,
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    addAthlete: (v: {
      id: string;
      organizationId: string;
      groupId: string;
      engagementId: string;
      actorMembershipId: string;
    }) =>
      db
        .insert(organizationGroupAthletes)
        .values({
          id: v.id,
          organization_id: v.organizationId,
          group_id: v.groupId,
          engagement_id: v.engagementId,
          added_by_membership_id: v.actorMembershipId,
        })
        .onConflictDoNothing()
        .returning({ id: organizationGroupAthletes.id }),
    assignCoach: (v: {
      id: string;
      organizationId: string;
      groupId: string;
      membershipId: string;
      actorMembershipId: string;
    }) =>
      db
        .insert(organizationGroupCoachAssignments)
        .values({
          id: v.id,
          organization_id: v.organizationId,
          group_id: v.groupId,
          coach_membership_id: v.membershipId,
          assigned_by_membership_id: v.actorMembershipId,
        })
        .onConflictDoNothing()
        .returning({ id: organizationGroupCoachAssignments.id }),
    getActiveAthleteLink: async (organizationId: string, groupId: string, id: string) =>
      (
        await db
          .select({
            id: organizationGroupAthletes.id,
            engagementId: organizationGroupAthletes.engagement_id,
          })
          .from(organizationGroupAthletes)
          .where(
            and(
              eq(organizationGroupAthletes.organization_id, organizationId),
              eq(organizationGroupAthletes.group_id, groupId),
              eq(organizationGroupAthletes.id, id),
              isNull(organizationGroupAthletes.ended_at),
            ),
          )
          .limit(1)
      )[0] ?? null,
    findActiveAthleteLink: async (organizationId: string, groupId: string, engagementId: string) =>
      (
        await db
          .select({
            id: organizationGroupAthletes.id,
            engagementId: organizationGroupAthletes.engagement_id,
          })
          .from(organizationGroupAthletes)
          .where(
            and(
              eq(organizationGroupAthletes.organization_id, organizationId),
              eq(organizationGroupAthletes.group_id, groupId),
              eq(organizationGroupAthletes.engagement_id, engagementId),
              isNull(organizationGroupAthletes.ended_at),
            ),
          )
          .limit(1)
      )[0] ?? null,
    getActiveCoachLink: async (organizationId: string, groupId: string, id: string) =>
      (
        await db
          .select({
            id: organizationGroupCoachAssignments.id,
            membershipId: organizationGroupCoachAssignments.coach_membership_id,
          })
          .from(organizationGroupCoachAssignments)
          .where(
            and(
              eq(organizationGroupCoachAssignments.organization_id, organizationId),
              eq(organizationGroupCoachAssignments.group_id, groupId),
              eq(organizationGroupCoachAssignments.id, id),
              isNull(organizationGroupCoachAssignments.ended_at),
            ),
          )
          .limit(1)
      )[0] ?? null,
    findActiveCoachLink: async (organizationId: string, groupId: string, membershipId: string) =>
      (
        await db
          .select({
            id: organizationGroupCoachAssignments.id,
            membershipId: organizationGroupCoachAssignments.coach_membership_id,
          })
          .from(organizationGroupCoachAssignments)
          .where(
            and(
              eq(organizationGroupCoachAssignments.organization_id, organizationId),
              eq(organizationGroupCoachAssignments.group_id, groupId),
              eq(organizationGroupCoachAssignments.coach_membership_id, membershipId),
              isNull(organizationGroupCoachAssignments.ended_at),
            ),
          )
          .limit(1)
      )[0] ?? null,
    endAthlete: (organizationId: string, groupId: string, id: string, actorMembershipId: string) =>
      db
        .update(organizationGroupAthletes)
        .set({ ended_at: sql`transaction_timestamp()`, ended_by_membership_id: actorMembershipId })
        .where(
          and(
            eq(organizationGroupAthletes.organization_id, organizationId),
            eq(organizationGroupAthletes.group_id, groupId),
            eq(organizationGroupAthletes.id, id),
            isNull(organizationGroupAthletes.ended_at),
          ),
        )
        .returning({ id: organizationGroupAthletes.id }),
    endCoach: (organizationId: string, groupId: string, id: string, actorMembershipId: string) =>
      db
        .update(organizationGroupCoachAssignments)
        .set({ ended_at: sql`transaction_timestamp()`, ended_by_membership_id: actorMembershipId })
        .where(
          and(
            eq(organizationGroupCoachAssignments.organization_id, organizationId),
            eq(organizationGroupCoachAssignments.group_id, groupId),
            eq(organizationGroupCoachAssignments.id, id),
            isNull(organizationGroupCoachAssignments.ended_at),
          ),
        )
        .returning({ id: organizationGroupCoachAssignments.id }),
  };
}
export type OrganizationGroupManagementRepository = ReturnType<
  typeof createOrganizationGroupManagementRepository
>;
