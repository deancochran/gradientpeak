import { z } from "zod";
import { athleteIntelligenceRuntimeProjectionSchema } from "../application/athlete-intelligence/projection-orchestrator";
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
      .output(athleteIntelligenceRuntimeProjectionSchema)
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
