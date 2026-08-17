import type { ActivityTrainingEffect } from "@repo/core/athlete-derived-state";
import {
  athleteCurrentStateDtoSchema,
  athleteLoadRangeDtoSchema,
} from "../../contracts/athlete-load-range";
import { thresholdEvidencePageDtoSchema } from "../../contracts/threshold-evidence";
import { trainingEffectsPageDtoSchema } from "../../contracts/training-effects";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import type { PublishedAthleteStateSnapshot } from "./published-athlete-state";
import { readActiveThresholdEvidence } from "./read-active-threshold-evidence";
import { readPublishedAthleteLoad } from "./read-published-athlete-load";

function toTrainingEffectDto(effect: ActivityTrainingEffect) {
  return {
    activityId: effect.activityId,
    activityAnalysisRevision: effect.activityAnalysisRevision,
    effectiveAt: effect.effectiveAt,
    planningDate: effect.planningDate,
    calculationVersion: effect.calculationVersion,
    activityCategory: effect.stimulus.activityCategory,
    commonLoad: effect.stimulus.commonLoad,
    evidenceConfidence: effect.stimulus.evidenceConfidence,
    capabilityObservation: effect.stimulus.capabilityObservation,
  };
}

export async function readUserVisibleAthleteLoadRange(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  startDate: string;
  endDate: string;
  currentState: PublishedAthleteStateSnapshot;
}) {
  const published = await readPublishedAthleteLoad(input);
  return athleteLoadRangeDtoSchema.parse({
    profileId: input.profileId,
    range: { startDate: input.startDate, endDate: input.endDate },
    publishedRevision: published.publishedRevision,
    freshness: input.currentState.freshness,
    coverage: input.currentState.coverage,
    days: published.days.map((day) => ({
      planningDate: day.planningDate,
      commonLoad: day.commonLoad,
      fitness: day.fitness,
      fatigue: day.fatigue,
      form: day.form,
      readiness: day.readiness,
      coverage: day.coverage,
      calculationVersion: day.calculationVersion,
    })),
  });
}

export function toAthleteCurrentStateDto(profileId: string, state: PublishedAthleteStateSnapshot) {
  return athleteCurrentStateDtoSchema.parse({
    profileId,
    planningTimezone: state.planningTimezone,
    currentPlanningDate: state.currentPlanningDate,
    freshness: state.freshness,
    rebuildStatus: state.rebuildStatus,
    importStatus: state.importStatus,
    revisions: state.revisions,
    coverage: state.coverage,
    computedAt: state.computedAt,
    algorithmVersion: state.algorithmVersion,
    baseline: state.baseline,
  });
}

export async function readUserVisibleTrainingEffects(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  fromEffectiveAt: string;
  publishedRevision: number;
  limit: number;
  after?: { effectiveAt: string; activityId: string; activityAnalysisRevision: number };
}) {
  const page = await input.repository.listActivityTrainingEffects({
    profileId: input.profileId,
    fromEffectiveAt: input.fromEffectiveAt,
    throughSourceRevision: input.publishedRevision,
    limit: input.limit,
    ...(input.after === undefined ? {} : { after: input.after }),
  });
  if (page.items.some((effect) => effect.profileId !== input.profileId)) {
    throw new Error("Training-effect read crossed its profile boundary");
  }
  return trainingEffectsPageDtoSchema.parse({
    items: page.items.map(toTrainingEffectDto),
    hasMore: page.hasMore,
  });
}

export async function readUserVisibleThresholdEvidence(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  fromObservedAt: string;
  limit: number;
  after?: { observedAt: string; evidenceId: string };
}) {
  const page = await readActiveThresholdEvidence(input);
  return thresholdEvidencePageDtoSchema.parse({
    items: page.items.map((record) => ({
      evidenceId: record.evidence.evidenceId,
      activityId: record.evidence.activityId,
      activityCategory: record.evidence.activityCategory,
      metric: record.evidence.metric,
      unit: record.evidence.unit,
      method: record.evidence.method,
      value: record.evidence.value,
      observedAt: record.evidence.observedAt,
      confidence: record.confidence,
      calculationVersion: record.calculationVersion,
      policyVersion: record.evidence.policyVersion,
    })),
    hasMore: page.hasMore,
  });
}
