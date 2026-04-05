import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { Context } from "../../context";
import { getRequiredDb } from "../../db";

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
