import {
  coachingAssignments,
  coachingEngagements,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { and, eq, exists, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

const overviewRowSchema = z
  .object({
    active_engagement_count: z.coerce.number().int().nonnegative(),
    paused_engagement_count: z.coerce.number().int().nonnegative(),
    active_without_primary_count: z.coerce.number().int().nonnegative(),
    scope_kind: z.enum(["organization_admin", "assigned_engagements"]),
    snapshot_as_of: z.coerce.date(),
  })
  .strict();

/** One statement keeps authorization, assignment scope, and all aggregates on one database snapshot. */
export function createOrganizationCoachingQualityRepository(db: DrizzleQueryExecutor) {
  return {
    async readOverview(input: { organizationId: string; actorProfileId: string }) {
      const snapshot = db.$with("snapshot").as(
        db
          .select({ asOf: sql<Date>`transaction_timestamp()`.as("asOf") })
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .limit(1),
      );
      const actorMembership = db.$with("actor_membership").as(
        db
          .select({
            id: organizationMemberships.id,
            isAdmin:
              sql<boolean>`${organizationMemberships.id} = ${organizations.root_owner_membership_id} or ${exists(
                db
                  .select({ id: organizationMembershipRoleGrants.id })
                  .from(organizationMembershipRoleGrants)
                  .where(
                    and(
                      eq(organizationMembershipRoleGrants.organization_id, input.organizationId),
                      eq(
                        organizationMembershipRoleGrants.membership_id,
                        organizationMemberships.id,
                      ),
                      eq(organizationMembershipRoleGrants.role_key, "admin"),
                      isNull(organizationMembershipRoleGrants.revoked_at),
                      lte(organizationMembershipRoleGrants.granted_at, snapshot.asOf),
                    ),
                  ),
              )}`.as("isAdmin"),
          })
          .from(organizationMemberships)
          .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
          .innerJoin(snapshot, sql`true`)
          .where(
            and(
              eq(organizationMemberships.organization_id, input.organizationId),
              eq(organizationMemberships.profile_id, input.actorProfileId),
              isNull(organizationMemberships.suspended_at),
              isNull(organizationMemberships.ended_at),
              lte(organizationMemberships.created_at, snapshot.asOf),
              isNull(organizations.suspended_at),
              isNull(organizations.closed_at),
            ),
          ),
      );
      const actorScope = db.$with("actor_scope").as(
        db
          .select({
            membershipId: actorMembership.id,
            kind: sql<"organization_admin" | "assigned_engagements" | null>`case
              when ${actorMembership.isAdmin} then 'organization_admin'
              when ${exists(
                db
                  .select({ id: organizationMembershipRoleGrants.id })
                  .from(organizationMembershipRoleGrants)
                  .innerJoin(snapshot, sql`true`)
                  .where(
                    and(
                      eq(organizationMembershipRoleGrants.organization_id, input.organizationId),
                      eq(organizationMembershipRoleGrants.membership_id, actorMembership.id),
                      eq(organizationMembershipRoleGrants.role_key, "coach"),
                      isNull(organizationMembershipRoleGrants.revoked_at),
                      lte(organizationMembershipRoleGrants.granted_at, snapshot.asOf),
                    ),
                  ),
              )} then 'assigned_engagements'
            end`.as("kind"),
          })
          .from(actorMembership),
      );
      const allowedEngagements = db.$with("allowed_engagements").as(
        db
          .select({ id: coachingEngagements.id, pausedAt: coachingEngagements.paused_at })
          .from(coachingEngagements)
          .innerJoin(actorScope, sql`true`)
          .innerJoin(snapshot, sql`true`)
          .where(
            and(
              eq(coachingEngagements.organization_id, input.organizationId),
              isNull(coachingEngagements.ended_at),
              lte(coachingEngagements.created_at, snapshot.asOf),
              or(
                eq(actorScope.kind, "organization_admin"),
                exists(
                  db
                    .select({ id: coachingAssignments.id })
                    .from(coachingAssignments)
                    .innerJoin(
                      organizationMemberships,
                      and(
                        eq(
                          organizationMemberships.organization_id,
                          coachingAssignments.organization_id,
                        ),
                        eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
                      ),
                    )
                    .where(
                      and(
                        eq(coachingAssignments.organization_id, input.organizationId),
                        eq(coachingAssignments.engagement_id, coachingEngagements.id),
                        eq(coachingAssignments.coach_membership_id, actorScope.membershipId),
                        eq(organizationMemberships.profile_id, input.actorProfileId),
                        isNull(organizationMemberships.suspended_at),
                        isNull(organizationMemberships.ended_at),
                        lte(organizationMemberships.created_at, snapshot.asOf),
                        isNull(coachingAssignments.ended_at),
                        lte(coachingAssignments.assigned_at, snapshot.asOf),
                      ),
                    ),
                ),
                exists(
                  db
                    .select({ id: organizationGroupAthletes.id })
                    .from(organizationGroupAthletes)
                    .innerJoin(
                      organizationGroups,
                      and(
                        eq(
                          organizationGroups.organization_id,
                          organizationGroupAthletes.organization_id,
                        ),
                        eq(organizationGroups.id, organizationGroupAthletes.group_id),
                      ),
                    )
                    .innerJoin(
                      organizationGroupCoachAssignments,
                      and(
                        eq(
                          organizationGroupCoachAssignments.organization_id,
                          organizationGroupAthletes.organization_id,
                        ),
                        eq(
                          organizationGroupCoachAssignments.group_id,
                          organizationGroupAthletes.group_id,
                        ),
                      ),
                    )
                    .innerJoin(
                      organizationMemberships,
                      and(
                        eq(
                          organizationMemberships.organization_id,
                          organizationGroupCoachAssignments.organization_id,
                        ),
                        eq(
                          organizationMemberships.id,
                          organizationGroupCoachAssignments.coach_membership_id,
                        ),
                      ),
                    )
                    .where(
                      and(
                        eq(organizationGroupAthletes.organization_id, input.organizationId),
                        eq(organizationGroupAthletes.engagement_id, coachingEngagements.id),
                        isNull(organizationGroupAthletes.ended_at),
                        lte(organizationGroupAthletes.joined_at, snapshot.asOf),
                        isNull(organizationGroups.archived_at),
                        lte(organizationGroups.created_at, snapshot.asOf),
                        eq(
                          organizationGroupCoachAssignments.coach_membership_id,
                          actorScope.membershipId,
                        ),
                        eq(organizationMemberships.profile_id, input.actorProfileId),
                        isNull(organizationMemberships.suspended_at),
                        isNull(organizationMemberships.ended_at),
                        lte(organizationMemberships.created_at, snapshot.asOf),
                        isNull(organizationGroupCoachAssignments.ended_at),
                        lte(organizationGroupCoachAssignments.assigned_at, snapshot.asOf),
                      ),
                    ),
                ),
              ),
            ),
          ),
      );
      const [row] = await db
        .with(snapshot, actorMembership, actorScope, allowedEngagements)
        .select({
          scope_kind: actorScope.kind,
          snapshot_as_of: snapshot.asOf,
          active_engagement_count:
            sql<number>`count(${allowedEngagements.id}) filter (where ${allowedEngagements.pausedAt} is null)`
              .mapWith(Number)
              .as("active_engagement_count"),
          paused_engagement_count:
            sql<number>`count(${allowedEngagements.id}) filter (where ${allowedEngagements.pausedAt} is not null)`
              .mapWith(Number)
              .as("paused_engagement_count"),
          active_without_primary_count: sql<number>`count(${allowedEngagements.id}) filter (
            where ${allowedEngagements.pausedAt} is null and not ${exists(
              db
                .select({ id: coachingAssignments.id })
                .from(coachingAssignments)
                .where(
                  and(
                    eq(coachingAssignments.organization_id, input.organizationId),
                    eq(coachingAssignments.engagement_id, allowedEngagements.id),
                    eq(coachingAssignments.assignment_kind, "primary"),
                    isNull(coachingAssignments.ended_at),
                    lte(coachingAssignments.assigned_at, snapshot.asOf),
                  ),
                ),
            )}
          )`
            .mapWith(Number)
            .as("active_without_primary_count"),
        })
        .from(actorScope)
        .innerJoin(snapshot, sql`true`)
        .leftJoin(allowedEngagements, sql`true`)
        .where(sql`${actorScope.kind} is not null`)
        .groupBy(actorScope.kind, snapshot.asOf);
      return row ? overviewRowSchema.parse(row) : null;
    },
  };
}
