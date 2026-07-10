import type { AthleteStateSnapshot, PredictionEnvelope } from "@repo/core";
import type {
  AthleteIntelligencePredictionRow,
  AthleteIntelligenceRecomputeJobRow,
  AthleteIntelligenceSnapshotRow,
} from "@repo/db";
import { describe, expect, it } from "vitest";
import type { AthleteIntelligenceStore } from "../repository";
import { createAthleteIntelligenceService } from "../service";

const now = new Date("2026-07-09T12:00:00.000Z");

const confidence: AthleteStateSnapshot["confidence"] = { level: "high", reasons: [], score: 1 };
const provenance: AthleteStateSnapshot["provenance"] = {
  asOf: now.toISOString(),
  inputFingerprint: "fingerprint-1",
  notes: [],
  source: "athlete_input",
};
const capabilities: AthleteStateSnapshot["capabilities"] = {
  durability: { confidence, provenance, value: 0.8 },
  endurance: { confidence, provenance, value: 0.8 },
  high_intensity: { confidence, provenance, value: 0.8 },
  specificity: { confidence, provenance, value: 0.8 },
  technical: { confidence, provenance, value: 0.8 },
  threshold: { confidence, provenance, value: 0.8 },
};
const gapDimensions: PredictionEnvelope["goalGapAssessment"]["dimensions"] = {
  durability: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
  endurance: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
  high_intensity: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
  specificity: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
  technical: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
  threshold: { capability: 0.8, confidence, gap: 0, requirement: 0.5, status: "met" },
};

function snapshot(profileId = "profile-1"): AthleteStateSnapshot {
  return {
    asOf: now.toISOString(),
    athleteId: profileId,
    capabilities,
    confidence,
    provenance,
    version: "1",
  };
}

function prediction(profileId = "profile-1"): PredictionEnvelope {
  return {
    athleteState: snapshot(profileId),
    capabilityAssessment: {
      assessedAt: now.toISOString(),
      athleteId: profileId,
      capabilities,
      confidence,
      provenance,
      version: "1",
    },
    confidence,
    generatedAt: now.toISOString(),
    goalGapAssessment: {
      confidence,
      dimensions: gapDimensions,
      goalId: "00000000-0000-4000-8000-000000000001",
      provenance,
      version: "1",
    },
    goalRequirements: {
      activityCategory: "bike",
      confidence,
      goalId: "00000000-0000-4000-8000-000000000001",
      provenance,
      requirements: {
        durability: 0.5,
        endurance: 0.5,
        high_intensity: 0.5,
        specificity: 0.5,
        technical: 0.5,
        threshold: 0.5,
      },
      version: "1",
    },
    inputFingerprint: "fingerprint-1",
    provenance,
    version: "1",
  };
}

function createStore(): AthleteIntelligenceStore & { jobs: AthleteIntelligenceRecomputeJobRow[] } {
  const snapshots = new Map<string, AthleteIntelligenceSnapshotRow>();
  const predictions = new Map<string, AthleteIntelligencePredictionRow>();
  const jobs: AthleteIntelligenceRecomputeJobRow[] = [];

  return {
    jobs,
    async getOrCreateSnapshot(input) {
      const key = `${input.profileId}:${input.inputFingerprint}`;
      const existing = snapshots.get(key);
      if (existing) return existing;
      const row = {
        created_at: now,
        id: `snapshot-${snapshots.size + 1}`,
        idx: snapshots.size + 1,
        input_fingerprint: input.inputFingerprint,
        payload: input.payload,
        profile_id: input.profileId,
        schema_version: input.schemaVersion,
      } as AthleteIntelligenceSnapshotRow;
      snapshots.set(key, row);
      return row;
    },
    async getOrCreatePrediction(input) {
      const key = [
        input.profileId,
        input.snapshotId,
        input.modelVersion,
        input.predictionKind,
        input.scenarioKey,
      ].join(":");
      const existing = predictions.get(key);
      if (existing) return existing;
      const row = {
        created_at: now,
        id: `prediction-${predictions.size + 1}`,
        idx: predictions.size + 1,
        model_version: input.modelVersion,
        payload: input.payload,
        prediction_kind: input.predictionKind,
        profile_id: input.profileId,
        scenario_key: input.scenarioKey,
        schema_version: input.schemaVersion,
        snapshot_id: input.snapshotId,
      } as AthleteIntelligencePredictionRow;
      predictions.set(key, row);
      return row;
    },
    async coalesceRecomputeJob(input) {
      const active = jobs.find(
        (job) =>
          job.profile_id === input.profileId &&
          (job.status === "queued" || job.status === "running"),
      );
      if (active) {
        active.target_input_fingerprint = input.inputFingerprint;
        active.reason_codes = [
          ...new Set([...(active.reason_codes as string[]), ...input.reasonCodes]),
        ].sort();
        return active;
      }
      const row = {
        attempt_count: 0,
        created_at: input.now,
        id: `job-${jobs.length + 1}`,
        idx: jobs.length + 1,
        last_error: null,
        lock_expires_at: null,
        locked_at: null,
        locked_by: null,
        max_attempts: 8,
        profile_id: input.profileId,
        reason_codes: input.reasonCodes,
        run_at: input.now,
        status: "queued",
        target_input_fingerprint: input.inputFingerprint,
        updated_at: input.now,
      } as AthleteIntelligenceRecomputeJobRow;
      jobs.push(row);
      return row;
    },
    async claimNextRecomputeJob(input) {
      const row = jobs.find(
        (job) =>
          job.attempt_count < job.max_attempts &&
          ((job.status === "queued" && job.run_at <= input.now) ||
            (job.status === "running" && job.lock_expires_at && job.lock_expires_at < input.now)),
      );
      if (!row) return null;
      row.attempt_count += 1;
      row.locked_at = input.now;
      row.lock_expires_at = input.leaseExpiresAt;
      row.locked_by = input.workerId;
      row.status = "running";
      return row;
    },
    async completeRecomputeJob(input) {
      const row = jobs.find((job) => job.id === input.jobId && job.profile_id === input.profileId);
      if (
        !row ||
        row.status !== "running" ||
        row.locked_by !== input.workerId ||
        row.lock_expires_at?.getTime() !== input.expectedLeaseExpiresAt.getTime() ||
        row.lock_expires_at <= input.now
      ) {
        return "not_owned";
      }
      if (row.target_input_fingerprint !== input.expectedInputFingerprint) {
        row.status = "queued";
        row.locked_by = null;
        return "superseded";
      }
      row.status = "completed";
      row.locked_by = null;
      return "completed";
    },
    async failRecomputeJob() {
      return "not_owned";
    },
  };
}

describe("athlete intelligence service", () => {
  it("validates core payloads and preserves snapshot/prediction idempotency", async () => {
    const service = createAthleteIntelligenceService(createStore());
    const first = await service.persistSnapshot({
      inputFingerprint: "fingerprint-1",
      payload: snapshot(),
      profileId: "profile-1",
    });
    const second = await service.persistSnapshot({
      inputFingerprint: "fingerprint-1",
      payload: snapshot(),
      profileId: "profile-1",
    });
    const firstPrediction = await service.persistPrediction({
      modelVersion: "model-1",
      payload: prediction(),
      predictionKind: "goal_gap",
      profileId: "profile-1",
      snapshotId: first.id,
    });
    const secondPrediction = await service.persistPrediction({
      modelVersion: "model-1",
      payload: prediction(),
      predictionKind: "goal_gap",
      profileId: "profile-1",
      snapshotId: first.id,
    });

    expect(second.id).toBe(first.id);
    expect(secondPrediction.id).toBe(firstPrediction.id);
    await expect(
      service.persistSnapshot({
        inputFingerprint: "fingerprint-2",
        payload: snapshot("profile-2"),
        profileId: "profile-1",
      }),
    ).rejects.toThrow("must match profileId");
    await expect(
      service.persistSnapshot({
        inputFingerprint: "fingerprint-2",
        payload: snapshot(),
        profileId: "profile-1",
      }),
    ).rejects.toThrow("provenance inputFingerprint must match persistence inputFingerprint");
  });

  it("coalesces active work, reclaims stale leases, and keeps completion profile-scoped", async () => {
    const store = createStore();
    const service = createAthleteIntelligenceService(store);
    const queued = await service.requestRecompute({
      inputFingerprint: "fingerprint-1",
      now,
      profileId: "profile-1",
      reasonCodes: ["metrics_changed"],
    });
    const coalesced = await service.requestRecompute({
      inputFingerprint: "fingerprint-2",
      now,
      profileId: "profile-1",
      reasonCodes: ["activity_imported"],
    });
    const claimed = await service.claimRecompute({
      leaseExpiresAt: new Date("2026-07-09T12:01:00.000Z"),
      now,
      workerId: "worker-a",
    });
    const initialWorker = claimed?.locked_by;
    const initialLeaseExpiresAt = claimed?.lock_expires_at;
    const reclaimed = await service.claimRecompute({
      leaseExpiresAt: new Date("2026-07-09T12:03:00.000Z"),
      now: new Date("2026-07-09T12:02:00.000Z"),
      workerId: "worker-a",
    });

    expect(coalesced.id).toBe(queued.id);
    expect(coalesced.reason_codes).toEqual(["activity_imported", "metrics_changed"]);
    expect(initialWorker).toBe("worker-a");
    expect(reclaimed?.locked_by).toBe("worker-a");
    await expect(
      service.completeRecompute({
        expectedInputFingerprint: "fingerprint-2",
        expectedLeaseExpiresAt: initialLeaseExpiresAt as Date,
        jobId: queued.id,
        now: new Date("2026-07-09T12:02:00.000Z"),
        profileId: "profile-1",
        workerId: "worker-a",
      }),
    ).resolves.toBe("not_owned");
    await expect(
      service.completeRecompute({
        expectedInputFingerprint: "fingerprint-2",
        expectedLeaseExpiresAt: reclaimed?.lock_expires_at as Date,
        jobId: queued.id,
        now: new Date("2026-07-09T12:02:00.000Z"),
        profileId: "profile-2",
        workerId: "worker-a",
      }),
    ).resolves.toBe("not_owned");
  });

  it("rejects expired or invalid leases before claiming work", async () => {
    const store = createStore();
    const service = createAthleteIntelligenceService(store);

    expect(() =>
      service.claimRecompute({
        leaseExpiresAt: now,
        now,
        workerId: "worker-a",
      }),
    ).toThrow("leaseExpiresAt must be a valid future date");
    expect(() =>
      service.claimRecompute({
        leaseExpiresAt: new Date("invalid"),
        now,
        workerId: "worker-a",
      }),
    ).toThrow("leaseExpiresAt must be a valid future date");
    expect(store.jobs).toHaveLength(0);
  });
});
