import {
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../../context";
import { type DrizzleQueryExecutor, getRequiredDb } from "../../db";

type AssertProfileAccessParams = {
  ctx: Context;
  profileId: string;
};

const revokedProfileAccessSchema = z.object({ revoked: z.boolean() });

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
 * Serializes a delegated write with assignment revocation. The same assignment
 * row lock is taken by revokeProfileAccess, so a write either commits before
 * revocation or observes the revocation and fails closed. Owners never need
 * that lock.
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

export async function revokeProfileAccess(input: {
  ctx: Context;
  coachId: string;
  athleteId: string;
}): Promise<boolean> {
  const callerId = input.ctx.session?.user?.id;
  if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (callerId !== input.coachId && callerId !== input.athleteId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const db = getRequiredDb(input.ctx);
  const result = await db.transaction((tx) =>
    tx.execute(sql`
      with ended_assignments as (
        update ${coachingAssignments}
        set ended_at = transaction_timestamp()
        from ${coachingEngagements}
        inner join ${organizationMemberships}
          on ${organizationMemberships.organization_id} = ${coachingEngagements.organization_id}
        inner join ${organizationMembershipRoleGrants}
          on ${organizationMembershipRoleGrants.organization_id} = ${organizationMemberships.organization_id}
          and ${organizationMembershipRoleGrants.membership_id} = ${organizationMemberships.id}
          and ${organizationMembershipRoleGrants.role_key} = 'coach'
          and ${organizationMembershipRoleGrants.granted_at} <= transaction_timestamp()
          and ${organizationMembershipRoleGrants.revoked_at} is null
        inner join ${organizations}
          on ${organizations.id} = ${coachingEngagements.organization_id}
        where ${coachingAssignments.organization_id} = ${coachingEngagements.organization_id}
          and ${coachingAssignments.engagement_id} = ${coachingEngagements.id}
          and ${organizationMemberships.id} = ${coachingAssignments.coach_membership_id}
          and ${organizationMemberships.profile_id} = ${input.coachId}
          and ${coachingEngagements.athlete_profile_id} = ${input.athleteId}
          and ${coachingAssignments.ended_at} is null
          and ${coachingEngagements.paused_at} is null
          and ${coachingEngagements.ended_at} is null
          and ${organizationMemberships.suspended_at} is null
          and ${organizationMemberships.ended_at} is null
          and ${organizations.suspended_at} is null
          and ${organizations.closed_at} is null
        returning ${coachingAssignments.organization_id}, ${coachingAssignments.engagement_id}, ${coachingAssignments.coach_membership_id}
      ), ended_engagements as (
        update ${coachingEngagements}
        set ended_at = transaction_timestamp()
        from (
          select distinct organization_id, engagement_id from ended_assignments
        ) ended_assignment
        where ${coachingEngagements.organization_id} = ended_assignment.organization_id
          and ${coachingEngagements.id} = ended_assignment.engagement_id
          and ${coachingEngagements.ended_at} is null
        returning ${coachingEngagements.organization_id}
      ), revoked_role_grants as (
        update ${organizationMembershipRoleGrants}
        set revoked_at = transaction_timestamp()
        from (
          select distinct organization_id, coach_membership_id from ended_assignments
        ) ended_assignment
        where ${organizationMembershipRoleGrants.organization_id} = ended_assignment.organization_id
          and ${organizationMembershipRoleGrants.membership_id} = ended_assignment.coach_membership_id
          and ${organizationMembershipRoleGrants.role_key} = 'coach'
          and ${organizationMembershipRoleGrants.revoked_at} is null
        returning ${organizationMembershipRoleGrants.id}
      )
      select exists(select 1 from ended_assignments) as revoked
    `),
  );

  return result.rows[0] ? revokedProfileAccessSchema.parse(result.rows[0]).revoked : false;
}
