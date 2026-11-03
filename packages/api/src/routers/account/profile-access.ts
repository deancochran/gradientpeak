import {
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Context } from "../../context";
import { type DrizzleQueryExecutor, getRequiredDb } from "../../db";

type AssertProfileAccessParams = {
  ctx: Context;
  profileId: string;
};

async function findActiveCoachingAssignment(
  db: DrizzleQueryExecutor,
  input: { actorId: string; profileId: string; lock?: boolean },
) {
  const query = db
    .select({ id: coachingAssignments.id })
    .from(coachingAssignments)
    .innerJoin(
      coachingEngagements,
      and(
        eq(coachingEngagements.organization_id, coachingAssignments.organization_id),
        eq(coachingEngagements.id, coachingAssignments.engagement_id),
      ),
    )
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organization_id, coachingAssignments.organization_id),
        eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
      ),
    )
    .innerJoin(
      organizationMembershipRoleGrants,
      and(
        eq(
          organizationMembershipRoleGrants.organization_id,
          organizationMemberships.organization_id,
        ),
        eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
        eq(organizationMembershipRoleGrants.role_key, "coach"),
        lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
        isNull(organizationMembershipRoleGrants.revoked_at),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, coachingAssignments.organization_id))
    .where(
      and(
        eq(organizationMemberships.profile_id, input.actorId),
        eq(coachingEngagements.athlete_profile_id, input.profileId),
        isNull(coachingAssignments.ended_at),
        isNull(coachingEngagements.paused_at),
        isNull(coachingEngagements.ended_at),
        isNull(organizationMemberships.suspended_at),
        isNull(organizationMemberships.ended_at),
        isNull(organizations.suspended_at),
        isNull(organizations.closed_at),
      ),
    );

  return input.lock ? query.for("update").limit(1) : query.limit(1);
}

export async function assertProfileAccess({
  ctx,
  profileId,
}: AssertProfileAccessParams): Promise<void> {
  const requesterId = ctx.session?.user?.id;

  if (!requesterId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (requesterId === profileId) {
    return;
  }

  const db = getRequiredDb(ctx);
  try {
    const assignments = await findActiveCoachingAssignment(db, {
      actorId: requesterId,
      profileId,
    });
    if (assignments.length > 0) return;
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to verify profile access",
    });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You are not authorized to access this profile",
  });
}

/**
 * Serializes delegated writes with relationship lifecycle transitions. Owners
 * never need an assignment lock.
 */
export async function withProfileWriteAccess<T>(input: {
  ctx: Context;
  profileId: string;
  write: (db: DrizzleQueryExecutor) => Promise<T>;
}): Promise<T> {
  const actorId = input.ctx.session?.user?.id;
  if (!actorId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const db = getRequiredDb(input.ctx);

  if (actorId === input.profileId) return input.write(db);

  return db.transaction(async (tx) => {
    const result = await findActiveCoachingAssignment(tx, {
      actorId,
      profileId: input.profileId,
      lock: true,
    });

    if (result.length === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not authorized to access this profile",
      });
    }

    return input.write(tx);
  });
}
