import {
  type AthleteStateSnapshot,
  athleteStateSnapshotSchema,
  type PredictionEnvelope,
  predictionEnvelopeSchema,
} from "@repo/core";
import type { AthleteIntelligenceStore } from "./repository";

function requireNonEmpty(value: string, field: string) {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
  return value;
}

function requireFutureDate(value: Date, now: Date, field: string) {
  if (!Number.isFinite(value.getTime()) || value <= now) {
    throw new Error(`${field} must be a valid future date`);
  }
  return value;
}

function requireValidDate(value: Date, field: string) {
  if (!Number.isFinite(value.getTime())) throw new Error(`${field} must be a valid date`);
  return value;
}

export function createAthleteIntelligenceService(store: AthleteIntelligenceStore) {
  return {
    async persistSnapshot(input: {
      inputFingerprint: string;
      payload: AthleteStateSnapshot;
      profileId: string;
    }) {
      const payload = athleteStateSnapshotSchema.parse(input.payload);
      if (payload.athleteId !== input.profileId) {
        throw new Error("Snapshot athleteId must match profileId");
      }
      if (payload.provenance.inputFingerprint !== input.inputFingerprint) {
        throw new Error(
          "Snapshot provenance inputFingerprint must match persistence inputFingerprint",
        );
      }

      return store.getOrCreateSnapshot({
        inputFingerprint: requireNonEmpty(input.inputFingerprint, "inputFingerprint"),
        payload,
        profileId: input.profileId,
        schemaVersion: payload.version,
      });
    },

    async persistPrediction(input: {
      modelVersion: string;
      payload: PredictionEnvelope;
      predictionKind: string;
      profileId: string;
      scenarioKey?: string;
      snapshotId: string;
    }) {
      const payload = predictionEnvelopeSchema.parse(input.payload);
      if (payload.athleteState.athleteId !== input.profileId) {
        throw new Error("Prediction athlete state must match profileId");
      }

      return store.getOrCreatePrediction({
        modelVersion: requireNonEmpty(input.modelVersion, "modelVersion"),
        payload,
        predictionKind: requireNonEmpty(input.predictionKind, "predictionKind"),
        profileId: input.profileId,
        scenarioKey: input.scenarioKey ?? "",
        schemaVersion: payload.version,
        snapshotId: input.snapshotId,
      });
    },

    requestRecompute(input: {
      inputFingerprint: string;
      now?: Date;
      profileId: string;
      reasonCodes: string[];
    }) {
      const reasonCodes = [
        ...new Set(input.reasonCodes.map((code) => requireNonEmpty(code, "reasonCode"))),
      ].sort();
      if (reasonCodes.length === 0)
        throw new Error("At least one recompute reasonCode is required");

      return store.coalesceRecomputeJob({
        inputFingerprint: requireNonEmpty(input.inputFingerprint, "inputFingerprint"),
        now: input.now ?? new Date(),
        profileId: input.profileId,
        reasonCodes,
      });
    },

    claimRecompute(input: { leaseExpiresAt: Date; now?: Date; workerId: string }) {
      const now = input.now ?? new Date();
      return store.claimNextRecomputeJob({
        leaseExpiresAt: requireFutureDate(input.leaseExpiresAt, now, "leaseExpiresAt"),
        now,
        workerId: requireNonEmpty(input.workerId, "workerId"),
      });
    },

    completeRecompute(input: {
      expectedInputFingerprint: string;
      expectedLeaseExpiresAt: Date;
      jobId: string;
      now?: Date;
      profileId: string;
      workerId: string;
    }) {
      const now = input.now ?? new Date();
      return store.completeRecomputeJob({
        ...input,
        expectedLeaseExpiresAt: requireValidDate(
          input.expectedLeaseExpiresAt,
          "expectedLeaseExpiresAt",
        ),
        now,
      });
    },

    failRecompute(input: {
      error: string;
      expectedInputFingerprint: string;
      expectedLeaseExpiresAt: Date;
      jobId: string;
      now?: Date;
      profileId: string;
      retryAt: Date;
      workerId: string;
    }) {
      const now = input.now ?? new Date();
      return store.failRecomputeJob({
        ...input,
        expectedLeaseExpiresAt: requireValidDate(
          input.expectedLeaseExpiresAt,
          "expectedLeaseExpiresAt",
        ),
        now,
      });
    },
  };
}
