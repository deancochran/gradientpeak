import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  athleteReadModelRequestSchema,
  athleteReadModelSchema,
  athleteReadModelSectionsSchema,
  readAthleteReadModel,
} from "../application/athlete-intelligence/athlete-read-model";
import {
  getGoalAssessment,
  getGoalAssessmentBatch,
  goalAssessmentResponseSchema,
} from "../application/athlete-intelligence/goal-assessment";
import { readPublishedAthleteStateSnapshot } from "../application/athlete-intelligence/published-athlete-state";
import { readCoachAthleteBikeZones } from "../application/athlete-intelligence/read-coach-athlete-zones";
import {
  GoalProgressNotFoundError,
  readGoalPortfolio,
  readGoalProgress,
} from "../application/athlete-intelligence/read-goal-progress";
import { PublishedAthleteLoadUnavailableError } from "../application/athlete-intelligence/read-published-athlete-load";
import { readThresholdOverview } from "../application/athlete-intelligence/read-threshold-overview";
import {
  readUserVisibleThresholdEvidence,
  readUserVisibleTrainingEffects,
} from "../application/athlete-intelligence/read-user-visible-athlete-state";
import {
  AthleteRecalculationRepairUnavailableError,
  requestExplicitAthleteRecalculationRepair,
} from "../application/athlete-intelligence/request-athlete-recalculation";
import { getProfileGoalOwnerId } from "../application/goals/getProfileGoalById";
import {
  withAuthorizedAthleteRead,
  withAuthorizedAthleteReadAcrossOrganizations,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "../application/organizations/authorize-athlete-read";
import {
  athleteRecalculationRepairReceiptSchema,
  athleteRecalculationRepairRequestSchema,
} from "../contracts/athlete-load-range";
import { ATHLETE_STATE_CACHE_TAGS } from "../contracts/cache-receipts";
import {
  coachAthleteZonesRequestSchema,
  coachAthleteZonesResponseSchema,
} from "../contracts/coach-athlete-zones";
import {
  goalAssessmentBatchRequestSchema,
  goalAssessmentBatchResponseSchema,
} from "../contracts/goal-assessment-batch";
import {
  goalPortfolioRequestSchema,
  goalPortfolioResponseSchema,
  goalProgressRequestSchema,
  goalProgressResponseSchema,
} from "../contracts/goal-progress";
import {
  thresholdEvidencePageDtoSchema,
  thresholdEvidenceRequestSchema,
} from "../contracts/threshold-evidence";
import {
  thresholdOverviewRequestSchema,
  thresholdOverviewResponseSchema,
} from "../contracts/threshold-overview";
import {
  trainingEffectsPageDtoSchema,
  trainingEffectsRequestSchema,
} from "../contracts/training-effects";
import type { DrizzleQueryExecutor } from "../db";
import { getRequiredDb } from "../db";
import { createDrizzleAthleteDerivedStateRepository } from "../infrastructure/repositories";
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

const organizationReadModelInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    athleteProfileId: z.string().uuid(),
    sections: athleteReadModelSectionsSchema,
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

type AthleteStateTransportDependencies = {
  getGoalAssessmentBatch: typeof getGoalAssessmentBatch;
  readGoalPortfolio: typeof readGoalPortfolio;
  readGoalProgress: typeof readGoalProgress;
  readCurrentState: typeof readPublishedAthleteStateSnapshot;
  readTrainingEffects: typeof readUserVisibleTrainingEffects;
  readThresholdEvidence: typeof readUserVisibleThresholdEvidence;
  requestRepair: typeof requestExplicitAthleteRecalculationRepair;
  readCoachAthleteBikeZones: typeof readCoachAthleteBikeZones;
};

function assertOwnedAthleteProfile(actorProfileId: string, profileId: string) {
  if (actorProfileId !== profileId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this profile" });
  }
}

function mapAthleteStateTransportError(error: unknown): never {
  if (
    error instanceof AthleteRecalculationRepairUnavailableError ||
    error instanceof PublishedAthleteLoadUnavailableError ||
    (error instanceof Error && error.message === "Profile not found")
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Athlete state not found", cause: error });
  }
  throw error;
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
  transportDependencies: Partial<AthleteStateTransportDependencies> = {},
  authorizeOrganizationRead: typeof withAuthorizedAthleteRead = withAuthorizedAthleteRead,
) {
  const stateServices: AthleteStateTransportDependencies = {
    getGoalAssessmentBatch: transportDependencies.getGoalAssessmentBatch ?? getGoalAssessmentBatch,
    readGoalPortfolio: transportDependencies.readGoalPortfolio ?? readGoalPortfolio,
    readGoalProgress: transportDependencies.readGoalProgress ?? readGoalProgress,
    readCurrentState: transportDependencies.readCurrentState ?? readPublishedAthleteStateSnapshot,
    readTrainingEffects:
      transportDependencies.readTrainingEffects ?? readUserVisibleTrainingEffects,
    readThresholdEvidence:
      transportDependencies.readThresholdEvidence ?? readUserVisibleThresholdEvidence,
    requestRepair: transportDependencies.requestRepair ?? requestExplicitAthleteRecalculationRepair,
    readCoachAthleteBikeZones:
      transportDependencies.readCoachAthleteBikeZones ?? readCoachAthleteBikeZones,
  };
  return createTRPCRouter({
    getGoalAssessmentBatch: protectedProcedure
      .input(goalAssessmentBatchRequestSchema)
      .output(goalAssessmentBatchResponseSchema)
      .query(({ ctx, input }) =>
        stateServices.getGoalAssessmentBatch({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          goalIds: input.goalIds,
        }),
      ),
    getGoalPortfolio: protectedProcedure
      .input(goalPortfolioRequestSchema)
      .output(goalPortfolioResponseSchema)
      .query(({ ctx }) =>
        stateServices.readGoalPortfolio({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        }),
      ),
    getGoalProgress: protectedProcedure
      .input(goalProgressRequestSchema)
      .output(goalProgressResponseSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await stateServices.readGoalProgress({
            db: getRequiredDb(ctx),
            profileId: ctx.session.user.id,
            goalId: input.goalId,
          });
        } catch (error) {
          if (error instanceof GoalProgressNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found", cause: error });
          }
          throw error;
        }
      }),
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
        const profileId = input.profileId ?? ctx.session.user.id;
        const requestsMetrics = Boolean(
          input.sections.publishedState ||
            input.sections.status ||
            input.sections.currentBaseline ||
            input.sections.profileObservations ||
            input.sections.trendInsights,
        );
        const requestsActivities = Boolean(
          input.sections.activityAnalytics ||
            input.sections.trendInsights ||
            input.sections.loadHistory,
        );
        if (ctx.session.user.id !== profileId && requestsMetrics && requestsActivities) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Delegated AthleteReadModel requests must use one consent scope",
          });
        }
        return readProfileWithAthleteConsent({
          ctx,
          profileId,
          scope: requestsActivities ? "activities" : "metrics",
          deniedCode: "FORBIDDEN",
          deniedMessage: "Not authorized",
          authorizeRead,
          read: (authorizedDb) =>
            readModel({
              db: authorizedDb,
              profileId,
              sections: input.sections,
              now: new Date(),
            }),
        });
      }),
    /**
     * A coaching workspace read is deliberately separate from the personal and
     * cross-organization read model. The selected organization is part of both
     * the authorization predicate and the transaction containing the data read.
     */
    getOrganizationReadModel: protectedProcedure
      .input(organizationReadModelInputSchema)
      .output(athleteReadModelSchema)
      .query(async ({ ctx, input }) => {
        const requestsMetrics = Boolean(
          input.sections.publishedState ||
            input.sections.status ||
            input.sections.currentBaseline ||
            input.sections.profileObservations ||
            input.sections.trendInsights,
        );
        const requestsActivities = Boolean(
          input.sections.activityAnalytics ||
            input.sections.trendInsights ||
            input.sections.loadHistory,
        );
        if (requestsMetrics && requestsActivities) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Coaching workspace requests must use one consent scope",
          });
        }
        const result = await authorizeOrganizationRead({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          organizationId: input.organizationId,
          athleteProfileId: input.athleteProfileId,
          scope: requestsActivities ? "activities" : "metrics",
          read: (authorizedDb) =>
            readModel({
              db: authorizedDb,
              profileId: input.athleteProfileId,
              sections: input.sections,
              now: new Date(),
            }),
        });
        if (!("value" in result)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        }
        return result.value;
      }),
    getCoachAthleteBikeZones: protectedProcedure
      .input(coachAthleteZonesRequestSchema)
      .output(coachAthleteZonesResponseSchema)
      .query(async ({ ctx, input }) => {
        const result = await authorizeOrganizationRead({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          organizationId: input.organizationId,
          athleteProfileId: input.athleteProfileId,
          scope: "metrics",
          read: (authorizedDb) =>
            stateServices.readCoachAthleteBikeZones({
              db: authorizedDb,
              profileId: input.athleteProfileId,
              now: new Date(),
            }),
        });
        if (!("value" in result)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        }
        return result.value;
      }),
    getTrainingEffects: protectedProcedure
      .input(trainingEffectsRequestSchema)
      .output(trainingEffectsPageDtoSchema)
      .query(async ({ ctx, input }) => {
        assertOwnedAthleteProfile(ctx.session.user.id, input.profileId);
        try {
          const db = getRequiredDb(ctx);
          const currentState = await stateServices.readCurrentState({
            db,
            profileId: input.profileId,
            now: new Date(),
            advanceBaselineToReadTime: false,
          });
          if (currentState.revisions.published === null) {
            return trainingEffectsPageDtoSchema.parse({ items: [], hasMore: false });
          }
          const { after, ...request } = input;
          return await stateServices.readTrainingEffects({
            repository: createDrizzleAthleteDerivedStateRepository(db),
            ...request,
            publishedRevision: currentState.revisions.published,
            ...(after === undefined ? {} : { after }),
          });
        } catch (error) {
          return mapAthleteStateTransportError(error);
        }
      }),
    getThresholdEvidence: protectedProcedure
      .input(thresholdEvidenceRequestSchema)
      .output(thresholdEvidencePageDtoSchema)
      .query(async ({ ctx, input }) => {
        assertOwnedAthleteProfile(ctx.session.user.id, input.profileId);
        const { after, ...request } = input;
        return stateServices.readThresholdEvidence({
          repository: createDrizzleAthleteDerivedStateRepository(getRequiredDb(ctx)),
          ...request,
          ...(after === undefined ? {} : { after }),
        });
      }),
    getThresholdOverview: protectedProcedure
      .input(thresholdOverviewRequestSchema)
      .output(thresholdOverviewResponseSchema)
      .query(async ({ ctx, input }) => {
        return readThresholdOverview({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          historyLimit: input.historyLimit,
          ...(input.historyCursor
            ? {
                historyCursor: {
                  effectiveAt: new Date(input.historyCursor.effectiveAt),
                  createdAt: new Date(input.historyCursor.createdAt),
                  thresholdId: input.historyCursor.thresholdId,
                },
              }
            : {}),
        });
      }),
    requestRecalculationRepair: protectedProcedure
      .input(athleteRecalculationRepairRequestSchema)
      .output(athleteRecalculationRepairReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        assertOwnedAthleteProfile(ctx.session.user.id, input.profileId);
        try {
          const result = await stateServices.requestRepair({
            db: getRequiredDb(ctx),
            profileId: input.profileId,
          });
          return athleteRecalculationRepairReceiptSchema.parse({
            ...result,
            cache_tags: ATHLETE_STATE_CACHE_TAGS,
          });
        } catch (error) {
          return mapAthleteStateTransportError(error);
        }
      }),
  });
}

export const athleteIntelligenceRouter = createAthleteIntelligenceRouter();
