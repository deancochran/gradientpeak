import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CoachingQualityOverviewAccessError,
  readCoachingQualityOverview,
} from "../application/organizations/read-coaching-quality-overview";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const inputSchema = z.object({ organizationId: z.string().uuid() }).strict();
const outputSchema = z
  .object({
    actorProfileId: z.string().uuid(),
    organizationId: z.string().uuid(),
    scopeKind: z.enum(["organization_admin", "assigned_engagements"]),
    scopeExplanation: z.string(),
    snapshotAsOf: z.date(),
    definitions: z
      .object({
        version: z.literal("coaching-quality-overview.v1"),
        activeEngagements: z.string(),
        pausedEngagements: z.string(),
        activeWithoutPrimary: z.string(),
        snapshotAsOf: z.string(),
      })
      .strict(),
    aggregates: z
      .object({
        activeEngagementCount: z.number().int().nonnegative(),
        pausedEngagementCount: z.number().int().nonnegative(),
        activeWithoutPrimaryCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const organizationCoachingQualityRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(inputSchema)
    .output(outputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await readCoachingQualityOverview({
          db: getRequiredDb(ctx),
          organizationId: input.organizationId,
          actorProfileId: ctx.session.user.id,
        });
      } catch (error) {
        if (error instanceof CoachingQualityOverviewAccessError)
          throw new TRPCError({ code: "FORBIDDEN", message: "Coaching quality access required" });
        throw error;
      }
    }),
});
