import {
  type PortableWebRecordingSubmissionJob,
  portableWebRecordingArtifactSchema,
} from "@repo/core";
import { describe, expect, it, vi } from "vitest";

import {
  createQueuedSubmissionJob,
  drainWebRecordingSubmissionQueue,
  retryDelayMs,
  type WebRecordingSubmissionQueueStorage,
} from "./submission-queue";

const artifact = portableWebRecordingArtifactSchema.parse({
  schemaVersion: 1,
  ownerId: "profile-1",
  recordingSessionId: "session-1",
  segmentId: "55555555-5555-4555-8555-555555555555",
  snapshot: {
    identity: {
      sessionId: "session-1",
      revision: 0,
      startedAt: "2026-07-20T10:00:00.000Z",
    },
    activity: {
      category: "run",
      mode: "free",
      gpsMode: "off",
      eventId: null,
      activityPlanId: null,
      routeId: null,
    },
    profileSnapshot: { defaultsApplied: [] },
    devices: { connected: [], controllableTrainer: null, selectedSources: [] },
    capabilities: {
      canTrackLocation: false,
      canTrackPower: false,
      canTrackHeartRate: false,
      canTrackCadence: false,
      shouldShowMap: false,
      shouldShowSteps: false,
      shouldShowRouteOverlay: false,
      shouldShowTurnByTurn: false,
      shouldShowFollowAlong: false,
      shouldShowTrainerControl: false,
      canAutoAdvanceSteps: false,
      shouldAutoFollowTargets: false,
      autoFollowPriority: "none",
      autoFollowConflict: false,
      autoFollowConflictReason: null,
      primaryMetric: "time",
      isValid: true,
      errors: [],
      warnings: [],
    },
    policies: {
      sourcePolicy: {
        preferUserSelection: true,
        allowDerivedSpeed: false,
        allowDerivedDistance: false,
      },
      controlPolicy: { trainerMode: "manual", autoAdvanceSteps: false },
      degradedModePolicy: {
        allowWithoutGps: true,
        allowWithoutSensors: true,
        exposeSourceWarnings: true,
      },
    },
  },
  startedAt: "2026-07-20T10:00:00.000Z",
  finishedAt: "2026-07-20T10:30:00.000Z",
  elapsedMs: 1_800_000,
  movingMs: 1_500_000,
  fileName: "recording.tcx",
  fileText: "<TrainingCenterDatabase />",
  sha256: "a".repeat(64),
  review: {
    name: "Run",
    notes: null,
    perceivedEffort: null,
    distanceMeters: 0,
    calories: null,
  },
});

class MemoryQueue implements WebRecordingSubmissionQueueStorage {
  job: PortableWebRecordingSubmissionJob = createQueuedSubmissionJob(
    artifact,
    "2026-07-20T10:31:00.000Z",
  );

  async listDueSubmissionJobs() {
    return [this.job];
  }
  async markSubmissionJobSubmitting(id: string, now: string) {
    this.job = { ...this.job, id, status: "submitting", updatedAt: now };
    return this.job;
  }
  async markSubmissionJobRetry(id: string, now: string, nextAttemptAt: string, reason: string) {
    this.job = {
      ...this.job,
      id,
      status: "retry_wait",
      attempts: this.job.attempts + 1,
      updatedAt: now,
      nextAttemptAt,
      lastError: reason,
    };
    return this.job;
  }
  async markSubmissionJobSubmitted(id: string, now: string, activityId: string) {
    this.job = {
      ...this.job,
      id,
      status: "submitted",
      attempts: this.job.attempts + 1,
      updatedAt: now,
      nextAttemptAt: null,
      lastError: null,
      activityId,
    };
    return this.job;
  }
}

describe("web recording submission queue", () => {
  it("uses bounded exponential retry delays", () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(4)).toBe(40_000);
    expect(retryDelayMs(99)).toBe(15 * 60_000);
  });

  it("marks durable acceptance and does not resubmit an accepted job", async () => {
    const storage = new MemoryQueue();
    const submit = vi.fn().mockResolvedValue({ activityId: "activity-1" });

    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z"));
    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:33:00.000Z"));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(storage.job).toMatchObject({ status: "submitted", activityId: "activity-1" });
  });

  it("persists retry classification and next attempt after failure", async () => {
    const storage = new MemoryQueue();
    const submit = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z"));

    expect(storage.job).toMatchObject({
      status: "retry_wait",
      attempts: 1,
      lastError: "network_unavailable",
      nextAttemptAt: "2026-07-20T10:32:05.000Z",
    });
  });
});
