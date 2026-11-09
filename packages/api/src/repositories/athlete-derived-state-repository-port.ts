import type {
  ActivityTrainingEffect,
  AthleteRecalculationQueueItem,
  AthleteRecalculationQueueTransitionInput,
  AthleteRecalculationRequest,
  DailyTrainingLoad,
  PersistedThresholdEvidence,
} from "@repo/core/athlete-derived-state";
import type { TransitionAthleteRecalculationResult } from "../contracts/athlete-derived-state";

export type AthletePublicationState = {
  profileId: string;
  planningTimezone: string;
  sourceRevision: number;
  publishedRevision: number;
  dirtyFromAt: string | null;
  fitness: number;
  fatigue: number;
  evidenceConfidence: number;
  coverageStartAt: string | null;
  coverageEndAt: string | null;
  lastActivityAt: string | null;
  calculationVersion: string;
  computedAt: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
};

export type AthleteDailyPublicationState = {
  computedAt: string;
  fitness: number;
  fatigue: number;
  evidenceConfidence: number;
  coverageStartAt: string | null;
  coverageEndAt: string | null;
  lastActivityAt: string | null;
  calculationVersion: string;
  capabilities: Array<{
    activityCategory: "bike" | "other" | "run" | "strength" | "swim";
    longestDistanceMeters: number | null;
    longestDurationMinutes: number | null;
    observedAt: string;
    evidenceConfidence: number;
  }>;
};

export type ActivityTrainingEffectWriteResult =
  | { status: "created"; effect: ActivityTrainingEffect }
  | { status: "unchanged"; effect: ActivityTrainingEffect }
  | { status: "identity_conflict" };

export type RevisionFencedPublicationResult =
  | { status: "published"; publishedRevision: number }
  | { status: "stale_revision"; currentPublishedRevision: number }
  | { status: "lease_lost" };

/** Persistence port for the four planned athlete-derived-data tables. */
export interface AthleteDerivedStateRepositoryPort {
  lockPublicationState(input: { profileId: string }): Promise<AthletePublicationState | null>;
  upsertActivityTrainingEffect(input: {
    profileId: string;
    effect: ActivityTrainingEffect;
  }): Promise<ActivityTrainingEffectWriteResult>;
  deleteActivityTrainingEffects(input: { profileId: string; activityId: string }): Promise<number>;
  listActivityTrainingEffects(input: {
    profileId: string;
    fromEffectiveAt: string;
    throughSourceRevision: number;
    limit: number;
    after?: { effectiveAt: string; activityId: string; activityAnalysisRevision: number };
  }): Promise<{ items: ActivityTrainingEffect[]; hasMore: boolean }>;
  publishDailyTrainingLoad(input: {
    profileId: string;
    fromPlanningDate: string;
    expectedPublishedRevision: number;
    targetPublishedRevision: number;
    claimToken?: string;
    days: DailyTrainingLoad[];
    state: AthleteDailyPublicationState;
  }): Promise<RevisionFencedPublicationResult>;
  readDailyTrainingLoadRange(input: {
    profileId: string;
    startDate: string;
    endDate: string;
    publishedRevision: number;
  }): Promise<DailyTrainingLoad[]>;
  readPublishedDailyTrainingLoadRange(input: {
    profileId: string;
    startDate: string;
    endDate: string;
  }): Promise<{ publishedRevision: number; days: DailyTrainingLoad[] } | null>;
  coalesceRecalculationRequest(input: {
    profileId: string;
    request: AthleteRecalculationRequest;
  }): Promise<AthleteRecalculationRequest>;
  readPendingRecalculation(input: {
    profileId: string;
  }): Promise<AthleteRecalculationRequest | null>;
  claimNextRecalculation(input: {
    claimedAt: string;
    leaseExpiresAt: string;
    claimToken: string;
  }): Promise<AthleteRecalculationQueueItem | null>;
  transitionRecalculation(input: {
    profileId: string;
    transition: AthleteRecalculationQueueTransitionInput;
  }): Promise<TransitionAthleteRecalculationResult>;
  replaceThresholdEvidenceForActivity(input: {
    profileId: string;
    activityId: string;
    evidence: PersistedThresholdEvidence[];
  }): Promise<void>;
  deleteThresholdEvidenceForActivity(input: {
    profileId: string;
    activityId: string;
  }): Promise<number>;
  invalidateThresholdEvidenceForActivity(input: {
    profileId: string;
    activityId: string;
    status: "superseded";
    invalidatedAt: string;
  }): Promise<number>;
  listActiveThresholdEvidence(input: {
    profileId: string;
    fromObservedAt: string;
    limit: number;
    after?: { observedAt: string; evidenceId: string };
  }): Promise<{ items: PersistedThresholdEvidence[]; hasMore: boolean }>;
}
