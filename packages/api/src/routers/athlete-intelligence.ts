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
import { readPublishedAthleteStateSnapshot } from "../application/athlete-intelligence/published-athlete-state";
import { PublishedAthleteLoadUnavailableError } from "../application/athlete-intelligence/read-published-athlete-load";
import {
  readUserVisibleAthleteLoadRange,
  readUserVisibleThresholdEvidence,
  readUserVisibleTrainingEffects,
  toAthleteCurrentStateDto,
} from "../application/athlete-intelligence/read-user-visible-athlete-state";
import {
  AthleteRecalculationRepairUnavailableError,
  requestExplicitAthleteRecalculationRepair,
} from "../application/athlete-intelligence/request-athlete-recalculation";
import { getProfileGoalOwnerId } from "../application/goals/getProfileGoalById";
import {
  withAuthorizedAthleteReadAcrossOrganizations,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "../application/organizations/authorize-athlete-read";
import {
  athleteCurrentStateDtoSchema,
  athleteCurrentStateRequestSchema,
  athleteLoadRangeDtoSchema,
  athleteLoadRangeRequestSchema,
  athleteRecalculationRepairReceiptSchema,
  athleteRecalculationRepairRequestSchema,
} from "../contracts/athlete-load-range";
import { ATHLETE_STATE_CACHE_TAGS } from "../contracts/cache-receipts";
import {
  thresholdEvidencePageDtoSchema,
  thresholdEvidenceRequestSchema,
} from "../contracts/threshold-evidence";
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
  readCurrentState: typeof readPublishedAthleteStateSnapshot;
  readLoadRange: typeof readUserVisibleAthleteLoadRange;
  readTrainingEffects: typeof readUserVisibleTrainingEffects;
  readThresholdEvidence: typeof readUserVisibleThresholdEvidence;
  requestRepair: typeof requestExplicitAthleteRecalculationRepair;
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
) {
  const stateServices: AthleteStateTransportDependencies = {
    readCurrentState: transportDependencies.readCurrentState ?? readPublishedAthleteStateSnapshot,
    readLoadRange: transportDependencies.readLoadRange ?? readUserVisibleAthleteLoadRange,
    readTrainingEffects:
      transportDependencies.readTrainingEffects ?? readUserVisibleTrainingEffects,
    readThresholdEvidence:
      transportDependencies.readThresholdEvidence ?? readUserVisibleThresholdEvidence,
    requestRepair: transportDependencies.requestRepair ?? requestExplicitAthleteRecalculationRepair,
  };
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
        const profileId = input.profileId ?? ctx.session.user.id;
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
    getLoadRange: protectedProcedure
      .input(athleteLoadRangeRequestSchema)
      .output(athleteLoadRangeDtoSchema)
      .query(async ({ ctx, input }) => {
        assertOwnedAthleteProfile(ctx.session.user.id, input.profileId);
        const db = getRequiredDb(ctx);
        try {
          const currentState = await stateServices.readCurrentState({
            db,
            profileId: input.profileId,
            now: new Date(),
            advanceBaselineToReadTime: false,
          });
          return await stateServices.readLoadRange({
            repository: createDrizzleAthleteDerivedStateRepository(db),
            profileId: input.profileId,
            startDate: input.range.startDate,
            endDate: input.range.endDate,
            currentState,
          });
        } catch (error) {
          return mapAthleteStateTransportError(error);
        }
      }),
    getCurrentState: protectedProcedure
      .input(athleteCurrentStateRequestSchema)
      .output(athleteCurrentStateDtoSchema)
      .query(async ({ ctx, input }) => {
        assertOwnedAthleteProfile(ctx.session.user.id, input.profileId);
        try {
          const state = await stateServices.readCurrentState({
            db: getRequiredDb(ctx),
            profileId: input.profileId,
            now: new Date(),
          });
          return toAthleteCurrentStateDto(input.profileId, state);
        } catch (error) {
          return mapAthleteStateTransportError(error);
        }
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
