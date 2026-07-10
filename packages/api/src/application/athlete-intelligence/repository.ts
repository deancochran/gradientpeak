import type { AthleteStateSnapshot, PredictionEnvelope } from "@repo/core";
import type {
  AthleteIntelligencePredictionRow,
  AthleteIntelligenceRecomputeJobRow,
  AthleteIntelligenceSnapshotRow,
} from "@repo/db";

export type RecomputeJobStatus = "queued" | "running" | "completed" | "failed";

export type AthleteIntelligenceStore = {
  getOrCreatePrediction(input: {
    modelVersion: string;
    payload: PredictionEnvelope;
    predictionKind: string;
    profileId: string;
    scenarioKey: string;
    schemaVersion: string;
    snapshotId: string;
  }): Promise<AthleteIntelligencePredictionRow>;
  getOrCreateSnapshot(input: {
    inputFingerprint: string;
    payload: AthleteStateSnapshot;
    profileId: string;
    schemaVersion: string;
  }): Promise<AthleteIntelligenceSnapshotRow>;
  coalesceRecomputeJob(input: {
    inputFingerprint: string;
    now: Date;
    profileId: string;
    reasonCodes: string[];
  }): Promise<AthleteIntelligenceRecomputeJobRow>;
  claimNextRecomputeJob(input: {
    leaseExpiresAt: Date;
    now: Date;
    workerId: string;
  }): Promise<AthleteIntelligenceRecomputeJobRow | null>;
  completeRecomputeJob(input: {
    expectedInputFingerprint: string;
    expectedLeaseExpiresAt: Date;
    jobId: string;
    now: Date;
    profileId: string;
    workerId: string;
  }): Promise<"completed" | "not_owned" | "superseded">;
  failRecomputeJob(input: {
    error: string;
    expectedInputFingerprint: string;
    expectedLeaseExpiresAt: Date;
    jobId: string;
    now: Date;
    profileId: string;
    retryAt: Date;
    workerId: string;
  }): Promise<"failed" | "not_owned" | "requeued" | "superseded">;
};

export function isRecomputeJobStatus(value: string): value is RecomputeJobStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed";
}
