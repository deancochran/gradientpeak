import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { athleteIntelligenceRuntimeProjectionSchema } from "../application/athlete-intelligence/projection-orchestrator";
import { evaluateAthleteIntelligence } from "../application/athlete-intelligence/read-model";
import { getProfileGoalById } from "../application/goals/getProfileGoalById";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess } from "./account/profile-access";

const evaluateInputSchema = z
  .object({
    goalId: z.string().uuid(),
  })
  .strict();

export async function resolveAccessibleGoalProfile(input: {
  ctx: Context;
  db: ReturnType<typeof getRequiredDb>;
  goalId: string;
  getGoal?: typeof getProfileGoalById;
  assertAccess?: typeof assertProfileAccess;
}): Promise<string> {
  const getGoal = input.getGoal ?? getProfileGoalById;
  const assertAccess = input.assertAccess ?? assertProfileAccess;
  const goal = await getGoal(input.db, input.goalId);
  if (!goal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }
  try {
    await assertAccess({ ctx: input.ctx, profileId: goal.profile_id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
    }
    throw error;
  }
  return goal.profile_id;
}

export function createAthleteIntelligenceRouter(
  evaluateProjection: typeof evaluateAthleteIntelligence = evaluateAthleteIntelligence,
  resolveGoalProfile: (input: {
    ctx: Context;
    db: ReturnType<typeof getRequiredDb>;
    goalId: string;
  }) => Promise<string> = resolveAccessibleGoalProfile,
) {
  return createTRPCRouter({
    evaluate: protectedProcedure
      .input(evaluateInputSchema)
      .output(athleteIntelligenceRuntimeProjectionSchema)
      .query(async ({ ctx, input }) => {
        const db = getRequiredDb(ctx);
        const profileId = await resolveGoalProfile({ ctx, db, goalId: input.goalId });
        return evaluateProjection({
          db,
          profileId,
          goalId: input.goalId,
        });
      }),
  });
}

export const athleteIntelligenceRouter = createAthleteIntelligenceRouter();
