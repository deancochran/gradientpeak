import {
  CreateCoachingInvitationSchema,
  normalizeCoachRoster,
  RespondToInvitationSchema,
} from "@repo/core";
import { coachesAthletes, coachingInvitations, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeInvitationRow(row: {
  athlete_id: string;
  coach_id: string;
  created_at: Date | string;
  id: string;
  status: "pending" | "accepted" | "declined";
  updated_at: Date | string;
}) {
  return {
    ...row,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

async function getInvitationById(db: ReturnType<typeof getRequiredDb>, invitationId: string) {
  const row =
    (
      await db
        .select({
          id: coachingInvitations.id,
          athlete_id: coachingInvitations.athlete_id,
          coach_id: coachingInvitations.coach_id,
          status: coachingInvitations.status,
          created_at: coachingInvitations.created_at,
          updated_at: coachingInvitations.updated_at,
        })
        .from(coachingInvitations)
        .where(eq(coachingInvitations.id, invitationId))
        .limit(1)
    )[0] ?? null;

  if (!row) {
    return null;
  }

  return serializeInvitationRow(row);
}

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

function toCoachResult(row: {
  coach_id: string;
  profile_avatar_url: string | null;
  profile_full_name: string | null;
  profile_id: string | null;
  profile_username: string | null;
}) {
  return {
    coach_id: row.coach_id,
    profiles: row.profile_id
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
  invite: protectedProcedure
    .input(CreateCoachingInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      // Ensure user is either the coach or the athlete
      if (ctx.session.user.id !== input.coach_id && ctx.session.user.id !== input.athlete_id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only invite for yourself",
        });
      }

      try {
        await db.insert(coachingInvitations).values({
          athlete_id: input.athlete_id,
          coach_id: input.coach_id,
          status: "pending",
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create coaching invitation",
        });
      }

      return { success: true };
    }),

  respond: protectedProcedure.input(RespondToInvitationSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    const invitation = await getInvitationById(db, input.invitation_id);

    if (!invitation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invitation not found",
      });
    }

    if (
      ctx.session.user.id !== invitation.athlete_id &&
      ctx.session.user.id !== invitation.coach_id
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(coachingInvitations)
          .set({
            status: input.status,
            updated_at: new Date(),
          })
          .where(eq(coachingInvitations.id, input.invitation_id));

        if (input.status === "accepted") {
          await tx.insert(coachesAthletes).values({
            coach_id: invitation.coach_id,
            athlete_id: invitation.athlete_id,
          });
        }
      });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to respond to coaching invitation",
      });
    }

    return { success: true };
  }),

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

  getCoach: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const row =
        (
          await db
            .select({
              coach_id: coachesAthletes.coach_id,
              profile_id: profiles.id,
              profile_full_name: profiles.full_name,
              profile_avatar_url: profiles.avatar_url,
              profile_username: profiles.username,
            })
            .from(coachesAthletes)
            .leftJoin(profiles, eq(profiles.id, coachesAthletes.coach_id))
            .where(eq(coachesAthletes.athlete_id, ctx.session.user.id))
            .limit(1)
        )[0] ?? null;

      return row ? toCoachResult(row) : null;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to load coach",
      });
    }
  }),
});
