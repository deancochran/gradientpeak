import { coachesAthletes } from "@repo/db";
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
        from coaches_athletes
        where coach_id = ${requesterId}::uuid
          and athlete_id = ${profileId}::uuid
          and revoked_at is null
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
 * Serializes a delegated write with relationship revocation. The same row lock
 * is taken by revokeProfileAccess, so a write either commits before revocation
 * or observes the revocation and fails closed. Owners never need that lock.
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
      select revision
      from coaches_athletes
      where coach_id = ${actorId}::uuid
        and athlete_id = ${input.profileId}::uuid
        and revoked_at is null
      for update
    `);

    if (result.rows.length !== 1) {
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
  const [row] = await db
    .update(coachesAthletes)
    .set({ revoked_at: new Date(), revision: sql`${coachesAthletes.revision} + 1` })
    .where(
      sql`${coachesAthletes.coach_id} = ${input.coachId}::uuid
        and ${coachesAthletes.athlete_id} = ${input.athleteId}::uuid
        and ${coachesAthletes.revoked_at} is null`,
    )
    .returning({ coach_id: coachesAthletes.coach_id });

  return Boolean(row);
}
