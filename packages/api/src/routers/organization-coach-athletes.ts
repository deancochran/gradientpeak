import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CoachAthleteDirectoryAccessError,
  findAssignedCoachAthlete,
  listAssignedCoachAthletes,
} from "../application/organizations/list-assigned-coach-athletes";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().nullable().default(null),
    search: z.string().trim().min(1).max(120).nullable().default(null),
  })
  .strict();
const outputSchema = z
  .object({
    items: z.array(
      z
        .object({
          profileId: z.string().uuid(),
          displayName: z.string().nullable(),
          username: z.string().nullable(),
        })
        .strict(),
    ),
    nextCursor: z.string().uuid().nullable(),
    hasMore: z.boolean(),
  })
  .strict();
export const organizationCoachAthletesRouter = createTRPCRouter({
  getAssigned: protectedProcedure
    .input(
      z.object({ organizationId: z.string().uuid(), athleteProfileId: z.string().uuid() }).strict(),
    )
    .output(outputSchema.shape.items.element.nullable())
    .query(({ ctx, input }) =>
      findAssignedCoachAthlete({
        db: getRequiredDb(ctx),
        coachProfileId: ctx.session.user.id,
        ...input,
      }),
    ),
  listAssigned: protectedProcedure
    .input(inputSchema)
    .output(outputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listAssignedCoachAthletes({
          db: getRequiredDb(ctx),
          coachProfileId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        if (error instanceof CoachAthleteDirectoryAccessError)
          throw new TRPCError({ code: "FORBIDDEN", message: "Coaching access required" });
        throw error;
      }
    }),
});
