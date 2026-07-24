import {
  type PortableWebRecordingSubmissionJob,
  portableWebRecordingArtifactSchema,
} from "@repo/core";
import { describe, expect, it, vi } from "vitest";

import {
  createQueuedSubmissionJob,
  drainWebRecordingSubmissionQueue,
  PostCreateSubmissionError,
  retryDelayMs,
  type SubmissionJobClaim,
  submitWebRecordingArtifact,
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
  rejectClaim = false;
  claim: SubmissionJobClaim | null = null;

  async listDueSubmissionJobs() {
    return [this.job];
  }
  async claimSubmissionJob(id: string, now: string) {
    if (this.rejectClaim) return null;
    this.claim = { owner: "tab-a", revision: (this.claim?.revision ?? 0) + 1 };
    this.job = { ...this.job, id, status: "submitting", updatedAt: now };
    return { ...this.job, claim: this.claim };
  }
  async markSubmissionJobRetry(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    nextAttemptAt: string,
    reason: string,
    activityId?: string | null,
  ) {
    if (claim !== this.claim) return null;
    this.job = {
      ...this.job,
      id,
      status: "retry_wait",
      attempts: this.job.attempts + 1,
      updatedAt: now,
      nextAttemptAt,
      lastError: reason,
      activityId: activityId ?? this.job.activityId,
    };
    return this.job;
  }
  async markSubmissionJobSubmitted(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
  ) {
    if (claim !== this.claim) return null;
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
  async markSubmissionJobReviewRequired(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
    reason: string,
  ) {
    if (claim !== this.claim) return null;
    this.job = {
      ...this.job,
      id,
      status: "review_required",
      attempts: this.job.attempts + 1,
      updatedAt: now,
      nextAttemptAt: null,
      lastError: reason,
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

  it("skips submission when another tab has already claimed the job", async () => {
    const storage = new MemoryQueue();
    storage.rejectClaim = true;
    const submit = vi.fn();

    await expect(
      drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z")),
    ).resolves.toEqual([]);

    expect(submit).not.toHaveBeenCalled();
  });

  it("retains the created activity and RPE operation for a truthful retry", async () => {
    const storage = new MemoryQueue();
    storage.job = {
      ...storage.job,
      artifact: {
        ...artifact,
        review: { ...artifact.review, perceivedEffort: 6 },
        sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      },
    };
    const submit = vi
      .fn()
      .mockRejectedValue(new PostCreateSubmissionError("activity-1", null, true));
    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z"));
    expect(storage.job).toMatchObject({
      status: "retry_wait",
      activityId: "activity-1",
      lastError: "session_rpe_pending",
    });
    expect(storage.job.artifact.sessionRpeOperationId).toBe("66666666-6666-4666-8666-666666666666");

    storage.job = { ...storage.job, status: "queued", nextAttemptAt: null };
    submit.mockResolvedValue({ activityId: "activity-1" });
    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:33:00.000Z"));
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      }),
    );
    expect(storage.job).toMatchObject({ status: "submitted", activityId: "activity-1" });
  });

  it("creates before appending RPE and reuses the operation after an ambiguous response loss", async () => {
    const rpe = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(undefined);
    const create = vi.fn().mockResolvedValue({ id: "activity-1" });
    const withRpe = {
      ...artifact,
      review: { ...artifact.review, perceivedEffort: 6 },
      sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
    };
    await expect(
      submitWebRecordingArtifact({
        artifact: withRpe,
        createActivity: create,
        recordSessionRpe: rpe,
      }),
    ).rejects.toMatchObject({ activityId: "activity-1", retryable: true });
    await expect(
      submitWebRecordingArtifact({
        artifact: withRpe,
        createActivity: create,
        recordSessionRpe: rpe,
      }),
    ).resolves.toEqual({ activityId: "activity-1" });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      rpe.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(rpe).toHaveBeenLastCalledWith({
      activityId: "activity-1",
      operationId: "66666666-6666-4666-8666-666666666666",
      rpe: 6,
    });
  });

  it("stops automatic retries after a terminal Session RPE conflict", async () => {
    const storage = new MemoryQueue();
    const submit = vi
      .fn()
      .mockRejectedValue(new PostCreateSubmissionError("activity-1", "CONFLICT", false));
    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z"));
    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:33:00.000Z"));
    expect(storage.job).toMatchObject({
      status: "review_required",
      activityId: "activity-1",
      lastError: "session_rpe_conflict",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("retries a crash-left submitting artifact without replacing its operation ID", async () => {
    const storage = new MemoryQueue();
    storage.job = {
      ...storage.job,
      status: "submitting",
      artifact: {
        ...artifact,
        review: { ...artifact.review, perceivedEffort: 6 },
        sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      },
    };
    const submit = vi.fn().mockResolvedValue({ activityId: "activity-1" });

    await drainWebRecordingSubmissionQueue(storage, submit, new Date("2026-07-20T10:32:00.000Z"));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      }),
    );
    expect(storage.job).toMatchObject({ status: "submitted", activityId: "activity-1" });
    expect(storage.job.artifact.sessionRpeOperationId).toBe("66666666-6666-4666-8666-666666666666");
  });
});
