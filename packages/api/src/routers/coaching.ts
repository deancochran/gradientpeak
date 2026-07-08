import { normalizeCoachRoster } from "@repo/core";
import { coachesAthletes, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function toRosterEntry(row: {
  athlete_id: string;
  profile_avatar_url: string | null;
  profile_full_name: string | null;
  profile_id: string | null;
  profile_username: string | null;
}) {
  return {
    athlete_id: row.athlete_id,
    profile: row.profile_id
      ? {
          id: row.profile_id,
          avatar_url: row.profile_avatar_url,
          full_name: row.profile_full_name,
          username: row.profile_username,
        }
      : null,
  };
}

export const coachingRouter = createTRPCRouter({
  getRoster: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const rows = await db
        .select({
          athlete_id: coachesAthletes.athlete_id,
          profile_id: profiles.id,
          profile_full_name: profiles.full_name,
          profile_avatar_url: profiles.avatar_url,
          profile_username: profiles.username,
        })
        .from(coachesAthletes)
        .leftJoin(profiles, eq(profiles.id, coachesAthletes.athlete_id))
        .where(eq(coachesAthletes.coach_id, ctx.session.user.id));

      return normalizeCoachRoster(rows.map((row) => toRosterEntry(row)));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to load roster",
      });
    }
  }),
});
