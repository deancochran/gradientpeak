import { athleteIntelligenceProjectionSchema } from "@repo/core";
import { z } from "zod";
import { evaluateAthleteIntelligence } from "../application/athlete-intelligence/read-model";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const evaluateInputSchema = z
  .object({
    goalId: z.string().uuid(),
  })
  .strict();

export function createAthleteIntelligenceRouter(
  evaluateProjection: typeof evaluateAthleteIntelligence = evaluateAthleteIntelligence,
) {
  return createTRPCRouter({
    evaluate: protectedProcedure
      .input(evaluateInputSchema)
      .output(athleteIntelligenceProjectionSchema)
      .query(({ ctx, input }) =>
        evaluateProjection({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          goalId: input.goalId,
        }),
      ),
  });
}

export const athleteIntelligenceRouter = createAthleteIntelligenceRouter();
