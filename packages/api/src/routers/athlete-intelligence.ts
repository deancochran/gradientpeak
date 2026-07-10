import { z } from "zod";
import { evaluateAthleteIntelligence } from "../application/athlete-intelligence/read-model";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const evaluateInputSchema = z
  .object({
    goalId: z.string().uuid(),
    includeScheduleContext: z.boolean().optional(),
  })
  .strict();

export const athleteIntelligenceRouter = createTRPCRouter({
  evaluate: protectedProcedure.input(evaluateInputSchema).query(({ ctx, input }) =>
    evaluateAthleteIntelligence({
      db: getRequiredDb(ctx),
      profileId: ctx.session.user.id,
      goalId: input.goalId,
      includeScheduleContext: input.includeScheduleContext,
    }),
  ),
});
