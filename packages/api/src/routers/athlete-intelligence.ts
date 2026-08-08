import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  athleteReadModelRequestSchema,
  athleteReadModelSchema,
  readAthleteReadModel,
} from "../application/athlete-intelligence/athlete-read-model";
import {
  getGoalAssessment,
  goalAssessmentResponseSchema,
} from "../application/athlete-intelligence/goal-assessment";
import { getProfileGoalOwnerId } from "../application/goals/getProfileGoalById";
import {
  withAuthorizedAthleteReadAcrossOrganizations,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "../application/organizations/authorize-athlete-read";
import type { DrizzleQueryExecutor } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  type ConsentAwareAthleteReadAuthorizer,
  type ConsentAwareResolvedAthleteReadAuthorizer,
  readProfileWithAthleteConsent,
  readResolvedProfileWithAthleteConsent,
} from "./account/athlete-read-access";

const goalAssessmentInputSchema = z
  .object({
    goalId: z.string().uuid(),
  })
  .strict();

export async function resolveGoalProfile(input: {
  db: DrizzleQueryExecutor;
  goalId: string;
  getGoalOwnerId?: typeof getProfileGoalOwnerId;
}): Promise<string> {
  const getGoalOwnerId = input.getGoalOwnerId ?? getProfileGoalOwnerId;
  const profileId = await getGoalOwnerId(input.db, input.goalId);
  if (!profileId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }
  return profileId;
}

export function createAthleteIntelligenceRouter(
  assessGoal: typeof getGoalAssessment = getGoalAssessment,
  resolveGoalProfileForRequest: (input: {
    db: DrizzleQueryExecutor;
    goalId: string;
  }) => Promise<string> = resolveGoalProfile,
  readModel: typeof readAthleteReadModel = readAthleteReadModel,
  authorizeRead: ConsentAwareAthleteReadAuthorizer = withAuthorizedAthleteReadAcrossOrganizations,
  authorizeResolvedRead: ConsentAwareResolvedAthleteReadAuthorizer = withResolvedAuthorizedAthleteReadAcrossOrganizations,
) {
  return createTRPCRouter({
    getGoalAssessment: protectedProcedure
      .input(goalAssessmentInputSchema)
      .output(goalAssessmentResponseSchema)
      .query(async ({ ctx, input }) => {
        return readResolvedProfileWithAthleteConsent({
          ctx,
          scope: "goals",
          deniedCode: "NOT_FOUND",
          deniedMessage: "Goal not found",
          authorizeRead: authorizeResolvedRead,
          resolveProfileId: (authorizedDb) =>
            resolveGoalProfileForRequest({ db: authorizedDb, goalId: input.goalId }),
          read: (authorizedDb, profileId) =>
            assessGoal({
              db: authorizedDb,
              profileId,
              goalId: input.goalId,
            }),
        });
      }),
    getReadModel: protectedProcedure
      .input(athleteReadModelRequestSchema)
      .output(athleteReadModelSchema)
      .query(async ({ ctx, input }) => {
        const requestsMetrics = Boolean(
          input.sections.publishedState ||
            input.sections.status ||
            input.sections.currentBaseline ||
            input.sections.loadHistory ||
            input.sections.profileObservations ||
            input.sections.trendInsights,
        );
        const requestsActivities = Boolean(
          input.sections.activityAnalytics || input.sections.trendInsights,
        );
        if (ctx.session.user.id !== input.profileId && requestsMetrics && requestsActivities) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Delegated AthleteReadModel requests must use one consent scope",
          });
        }
        return readProfileWithAthleteConsent({
          ctx,
          profileId: input.profileId,
          scope: requestsActivities ? "activities" : "metrics",
          deniedCode: "FORBIDDEN",
          deniedMessage: "Not authorized",
          authorizeRead,
          read: (authorizedDb) =>
            readModel({
              db: authorizedDb,
              profileId: input.profileId,
              sections: input.sections,
              now: new Date(),
            }),
        });
      }),
  });
}

export const athleteIntelligenceRouter = createAthleteIntelligenceRouter();
