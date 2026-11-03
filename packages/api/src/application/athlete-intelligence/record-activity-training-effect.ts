import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  advanceObservedAthleteState,
  athleteStateBaselineSchema,
  formatDateOnlyInTimeZone,
} from "@repo/core";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  type AthleteRecalculationReason,
  activityTrainingEffectSchema,
  dailyTrainingLoadSchema,
} from "@repo/core/athlete-derived-state";
import type { RecordActivityTrainingEffectRequest } from "../../contracts/athlete-derived-state";
import type {
  AthleteDerivedStateRepositoryPort,
  AthletePublicationState,
} from "../../repositories/athlete-derived-state-repository-port";
import { publishAthleteDailyLoad } from "./publish-athlete-daily-load";
import {
  buildAthleteRecalculationRequest,
  requestAthleteRecalculation,
} from "./request-athlete-recalculation";

function baselineFor(state: AthletePublicationState, effectiveAt: string) {
  return athleteStateBaselineSchema.parse({
    contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    athleteId: state.profileId,
    stateRevision: state.publishedRevision,
    asOf: state.computedAt ?? effectiveAt,
    longTermLoad: state.fitness,
    recentLoad: state.fatigue,
    loadBalance: state.fitness - state.fatigue,
    evidenceConfidence: state.evidenceConfidence,
    capabilities: [],
    athleteAgeYears: null,
  });
}

async function queueRebuild(input: {
  repository: AthleteDerivedStateRepositoryPort;
  state: AthletePublicationState;
  request: RecordActivityTrainingEffectRequest;
  reason: AthleteRecalculationReason;
  requestedAt: string;
}) {
  const effect = input.request.effect;
  const request = buildAthleteRecalculationRequest({
    profileId: input.request.profileId,
    earliestAffectedAt: effect.effectiveAt,
    earliestAffectedPlanningDate: effect.planningDate,
    sourceRevision: Math.max(effect.sourceRevision, input.state.sourceRevision),
    reasons: [input.reason],
    requestedAt: input.requestedAt,
  });
  return {
    status: "rebuild_requested" as const,
    request: await requestAthleteRecalculation({
      repository: input.repository,
      profileId: input.request.profileId,
      request,
    }),
  };
}

export async function recordActivityTrainingEffect(input: {
  repository: AthleteDerivedStateRepositoryPort;
  request: RecordActivityTrainingEffectRequest;
  reason?: AthleteRecalculationReason;
  requestedAt?: string;
}) {
  const effect = activityTrainingEffectSchema.parse(input.request.effect);
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const reason =
    input.reason ??
    (effect.activityAnalysisRevision === 1 ? "activity_created" : "analysis_replaced");
  const state = await input.repository.lockPublicationState({ profileId: input.request.profileId });
  if (!state) throw new Error("Activity training effect profile is unavailable");
  const write = await input.repository.upsertActivityTrainingEffect({
    profileId: input.request.profileId,
    effect,
  });
  if (write.status === "identity_conflict") {
    throw new Error("Activity training effect identity conflict");
  }
  if (write.status === "unchanged") {
    if (state.publishedRevision === effect.sourceRevision) {
      const [dailyLoad] = await input.repository.readDailyTrainingLoadRange({
        profileId: input.request.profileId,
        startDate: effect.planningDate,
        endDate: effect.planningDate,
        publishedRevision: state.publishedRevision,
      });
      if (dailyLoad) {
        return {
          status: "applied" as const,
          publishedRevision: state.publishedRevision,
          dailyLoad,
        };
      }
    }
    return queueRebuild({
      repository: input.repository,
      state,
      request: input.request,
      reason,
      requestedAt,
    });
  }

  const coverageEndDate = state.coverageEndAt
    ? formatDateOnlyInTimeZone(new Date(state.coverageEndAt), state.planningTimezone)
    : null;
  const canApplyIncrementally =
    state.sourceRevision === input.request.expectedPublishedRevision &&
    state.publishedRevision === input.request.expectedPublishedRevision &&
    effect.sourceRevision === input.request.targetSourceRevision &&
    state.dirtyFromAt === null &&
    state.leaseToken === null &&
    (state.computedAt === null || Date.parse(effect.effectiveAt) >= Date.parse(state.computedAt)) &&
    (coverageEndDate === null || effect.planningDate > coverageEndDate);
  if (!canApplyIncrementally) {
    return queueRebuild({
      repository: input.repository,
      state,
      request: input.request,
      reason,
      requestedAt,
    });
  }

  const baseline = baselineFor(state, effect.effectiveAt);
  const advanced = advanceObservedAthleteState({
    baseline,
    planningDays: {
      fromDay: state.computedAt
        ? formatDateOnlyInTimeZone(new Date(state.computedAt), state.planningTimezone)
        : effect.planningDate,
      toDay: effect.planningDate,
    },
    stimulus: effect.stimulus,
  }).state;
  const dailyLoad = dailyTrainingLoadSchema.parse({
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId: effect.profileId,
    planningDate: effect.planningDate,
    sourceRevision: effect.sourceRevision,
    commonLoad: effect.stimulus.commonLoad,
    fitness: advanced.longTermLoad,
    fatigue: advanced.recentLoad,
    form: advanced.loadBalance,
    readiness: null,
    coverage: { status: "complete", contributingActivityCount: 1, omittedActivityCount: 0 },
    calculationVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  });
  const published = await publishAthleteDailyLoad({
    repository: input.repository,
    profileId: effect.profileId,
    fromPlanningDate: effect.planningDate,
    expectedPublishedRevision: input.request.expectedPublishedRevision,
    targetPublishedRevision: input.request.targetSourceRevision,
    days: [dailyLoad],
    state: {
      computedAt: effect.effectiveAt,
      fitness: advanced.longTermLoad,
      fatigue: advanced.recentLoad,
      evidenceConfidence: advanced.evidenceConfidence,
      coverageStartAt: state.coverageStartAt ?? effect.effectiveAt,
      coverageEndAt: effect.effectiveAt,
      lastActivityAt: effect.effectiveAt,
      calculationVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      capabilities: advanced.capabilities,
    },
  });
  if (published.status !== "published") {
    return queueRebuild({
      repository: input.repository,
      state,
      request: input.request,
      reason,
      requestedAt,
    });
  }
  return { status: "applied" as const, publishedRevision: published.publishedRevision, dailyLoad };
}
