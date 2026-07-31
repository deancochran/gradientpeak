import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { Context } from "../../context";
import { type DrizzleQueryExecutor, getRequiredDb } from "../../db";

type AssertProfileAccessParams = {
  ctx: Context;
  profileId: string;
};

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
  let hasAccess = false;

  try {
    const result = await db.execute(sql<{ has_access: boolean }>`
      select exists(
        select 1
        from coaching_assignments assignment
        inner join coaching_engagements engagement
          on engagement.organization_id = assignment.organization_id
          and engagement.id = assignment.engagement_id
        inner join organization_memberships membership
          on membership.organization_id = assignment.organization_id
          and membership.id = assignment.coach_membership_id
        inner join organization_membership_role_grants grant_row
          on grant_row.organization_id = membership.organization_id
          and grant_row.membership_id = membership.id
          and grant_row.role_key = 'coach'
          and grant_row.granted_at <= transaction_timestamp()
          and grant_row.revoked_at is null
        inner join organizations organization
          on organization.id = assignment.organization_id
        where membership.profile_id = ${requesterId}::uuid
          and engagement.athlete_profile_id = ${profileId}::uuid
          and assignment.ended_at is null
          and engagement.paused_at is null
          and engagement.ended_at is null
          and membership.suspended_at is null
          and membership.ended_at is null
          and organization.suspended_at is null
          and organization.closed_at is null
      ) as has_access
    `);

    hasAccess = Boolean(result.rows[0]?.has_access);
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to verify profile access",
    });
  }

  if (!hasAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this profile",
    });
  }
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
    const result = await tx.execute(sql`
      select assignment.id
      from coaching_assignments assignment
      inner join coaching_engagements engagement
        on engagement.organization_id = assignment.organization_id
        and engagement.id = assignment.engagement_id
      inner join organization_memberships membership
        on membership.organization_id = assignment.organization_id
        and membership.id = assignment.coach_membership_id
      inner join organization_membership_role_grants grant_row
        on grant_row.organization_id = membership.organization_id
        and grant_row.membership_id = membership.id
        and grant_row.role_key = 'coach'
        and grant_row.granted_at <= transaction_timestamp()
        and grant_row.revoked_at is null
      inner join organizations organization
        on organization.id = assignment.organization_id
      where membership.profile_id = ${actorId}::uuid
        and engagement.athlete_profile_id = ${input.profileId}::uuid
        and assignment.ended_at is null
        and engagement.paused_at is null
        and engagement.ended_at is null
        and membership.suspended_at is null
        and membership.ended_at is null
        and organization.suspended_at is null
        and organization.closed_at is null
      for update
    `);

    if (result.rows.length === 0) {
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
    tx.execute(sql<{ revoked: boolean }>`
      with ended_assignments as (
        update coaching_assignments assignment
        set ended_at = transaction_timestamp()
        from coaching_engagements engagement
        inner join organization_memberships membership
          on membership.organization_id = engagement.organization_id
        inner join organization_membership_role_grants grant_row
          on grant_row.organization_id = membership.organization_id
          and grant_row.membership_id = membership.id
          and grant_row.role_key = 'coach'
          and grant_row.granted_at <= transaction_timestamp()
          and grant_row.revoked_at is null
        inner join organizations organization
          on organization.id = engagement.organization_id
        where assignment.organization_id = engagement.organization_id
          and assignment.engagement_id = engagement.id
          and membership.id = assignment.coach_membership_id
          and membership.profile_id = ${input.coachId}::uuid
          and engagement.athlete_profile_id = ${input.athleteId}::uuid
          and assignment.ended_at is null
          and engagement.paused_at is null
          and engagement.ended_at is null
          and membership.suspended_at is null
          and membership.ended_at is null
          and organization.suspended_at is null
          and organization.closed_at is null
        returning assignment.organization_id, assignment.engagement_id, assignment.coach_membership_id
      ), ended_engagements as (
        update coaching_engagements engagement
        set ended_at = transaction_timestamp()
        from (
          select distinct organization_id, engagement_id from ended_assignments
        ) ended_assignment
        where engagement.organization_id = ended_assignment.organization_id
          and engagement.id = ended_assignment.engagement_id
          and engagement.ended_at is null
        returning engagement.organization_id
      ), revoked_role_grants as (
        update organization_membership_role_grants grant_row
        set revoked_at = transaction_timestamp()
        from (
          select distinct organization_id, coach_membership_id from ended_assignments
        ) ended_assignment
        where grant_row.organization_id = ended_assignment.organization_id
          and grant_row.membership_id = ended_assignment.coach_membership_id
          and grant_row.role_key = 'coach'
          and grant_row.revoked_at is null
        returning grant_row.id
      )
      select exists(select 1 from ended_assignments) as revoked
    `),
  );

  return Boolean(result.rows[0]?.revoked);
}
