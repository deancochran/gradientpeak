import { createHash } from "node:crypto";
import {
  activityPlanStructureSchema,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runActivitySubmissionQueueJob } from "./runner";
import * as queueStorage from "./storage";
import type { ActivitySubmissionQueueJob, ActivitySubmissionQueueRunnerDeps } from "./types";

const persistedJobs: ActivitySubmissionQueueJob[] = [];
const persistedHistory: ActivitySubmissionQueueJob[] = [];
const leases = new Map<string, ActivitySubmissionQueueJob>();
const executionManifest = {
  version: 1 as const,
  compilerVersion: 1,
  planHash: "0".repeat(64),
  occurrences: [],
};
const prescribedStructure = activityPlanStructureSchema.parse({
  version: 3 as const,
  activity_category: "bike" as const,
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      role: "activity" as const,
      name: "Bike",
      intervals: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "10000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
});
const prescribedStructureHash = `v1:sha256:${createHash("sha256")
  .update(getCanonicalActivityPlanStructureHashInput(prescribedStructure))
  .digest("hex")}`;
const plannedExecution = {
  manifestVersion: 1 as const,
  compilerVersion: 1 as const,
  activityPlanId: "10000000-0000-4000-8000-000000000004",
  scheduledEventId: "10000000-0000-4000-8000-000000000005",
  name: "Hard",
  description: null,
  activityPlanRevision: 3,
  structureHash: prescribedStructureHash,
  structure: prescribedStructure,
  plannedSession: {
    id: "10000000-0000-4000-8000-000000000006",
    sessionRevision: 5,
    prescription: {
      activityPlanId: "10000000-0000-4000-8000-000000000004",
      activityPlanRevision: 3,
      variantId: "10000000-0000-4000-8000-000000000007",
      variantName: "Hard",
      structure: prescribedStructure,
      structureHash: prescribedStructureHash,
      prescriptionQuantification: null,
      capturedAt: "2026-01-01T09:00:00.000Z",
    },
  },
  personalizationEnabled: false,
  targetPresentations: [],
};

vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash("sha256").update(value).digest("hex"),
  };
});

vi.mock("./storage", () => ({
  claimDueActivitySubmissionQueueJob: vi.fn(
    async (id: string, owner: string, token: string, leaseMs: number, now: number) => {
      const current = leases.get(id) ?? { ...baseJob, id };
      if (current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now) return null;
      const claimed = {
        ...current,
        leaseOwner: owner,
        leaseToken: token,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      };
      leases.set(id, claimed);
      return claimed;
    },
  ),
  renewClaimedActivitySubmissionQueueJob: vi.fn(
    async (id: string, owner: string, token: string, leaseMs: number, now: number) => {
      const current = leases.get(id);
      if (
        !current ||
        current.leaseOwner !== owner ||
        current.leaseToken !== token ||
        Date.parse(current.leaseExpiresAt ?? "") <= now
      )
        return null;
      const renewed = { ...current, leaseExpiresAt: new Date(now + leaseMs).toISOString() };
      leases.set(id, renewed);
      return renewed;
    },
  ),
  transitionClaimedActivitySubmissionQueueJob: vi.fn(
    async (job: ActivitySubmissionQueueJob, owner: string, token: string, now: number) => {
      const current = leases.get(job.id);
      // Mirror the SQL fence: a matching token is insufficient after expiry.
      if (
        !current ||
        current.leaseOwner !== owner ||
        current.leaseToken !== token ||
        Date.parse(current.leaseExpiresAt ?? "") <= now
      )
        return false;
      persistedHistory.push(job);
      const index = persistedJobs.findIndex((candidate) => candidate.id === job.id);
      if (index >= 0) {
        persistedJobs[index] = job;
        leases.set(job.id, job);
        return true;
      }

      persistedJobs.push(job);
      leases.set(job.id, job);
      return true;
    },
  ),
}));

const baseJob: ActivitySubmissionQueueJob = {
  schemaVersion: 3,
  id: "job-1",
  artifactId: "artifact-1",
  sessionId: "session-1",
  localActivityFilePath: "file:///activity.fit",
  streamArtifactPaths: ["file:///streams"],
  executionManifest,
  draft: {
    recordingSessionId: "recording-session-1",
    profileId: "profile-1",
    startedAt: "2026-01-01T10:00:00.000Z",
    finishedAt: "2026-01-01T11:00:00.000Z",
    name: "Morning ride",
    activity_category: "bike",
    durationSeconds: 3600,
    movingSeconds: 3500,
    distanceMeters: 25_000,
    calories: 500,
  },
  status: "queued",
  attempts: 0,
  createdAt: "2026-01-01T11:00:00.000Z",
  updatedAt: "2026-01-01T11:00:00.000Z",
};

function createDeps(overrides: Partial<ActivitySubmissionQueueRunnerDeps> = {}) {
  return {
    createFromRecordingSummary: vi.fn(async () => ({
      id: "activity-1",
      ingestion: { id: "ingestion-1", status: "pending_upload", source: "mobile_recording" },
    })),
    beginMobileRecordingUpload: vi.fn(async () => ({
      status: "upload" as const,
      ingestionId: "ingestion-1",
      activityId: "activity-1",
      byteSize: 1024,
      sha256: "a".repeat(64),
      format: "fit" as const,
      mediaType: "application/vnd.ant.fit",
      signedUrl: "https://storage.example/upload",
      token: "signed-upload-token",
    })),
    uploadToSignedUrl: vi.fn(async () => ({ success: true })),
    now: vi.fn(() => "2026-01-01T11:01:00.000Z"),
    ...overrides,
    getLocalArtifactMetadata:
      overrides.getLocalArtifactMetadata ??
      vi.fn(async () => ({ sha256: "a".repeat(64), byteSize: 1024 })),
  } satisfies ActivitySubmissionQueueRunnerDeps;
}

describe("activity submission queue runner", () => {
  beforeEach(() => {
    persistedJobs.length = 0;
    persistedHistory.length = 0;
    leases.clear();
    vi.clearAllMocks();
  });

  it("coalesces concurrent execution for the same queue job", async () => {
    let releaseCreate!: () => void;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const createFromRecordingSummary = vi.fn(async () => {
      await createGate;
      return { id: "activity-1", ingestion: { id: "ingestion-1" } };
    });
    const deps = createDeps({ createFromRecordingSummary });

    const first = runActivitySubmissionQueueJob(baseJob, deps);
    const second = runActivitySubmissionQueueJob(baseJob, deps);
    releaseCreate();

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { status: "complete" },
      { status: "complete" },
    ]);
    expect(createFromRecordingSummary).toHaveBeenCalledTimes(1);
  });

  it("submits immutable planned-session provenance with a finalized recording", async () => {
    const job: ActivitySubmissionQueueJob = {
      ...baseJob,
      id: "job-planned",
      planExecution: plannedExecution,
      draft: { ...baseJob.draft, activityPlanId: plannedExecution.activityPlanId },
    };
    leases.set(job.id, job);
    const deps = createDeps();

    await runActivitySubmissionQueueJob(job, deps);

    expect(deps.createFromRecordingSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        activityPlanId: plannedExecution.activityPlanId,
        planExecution: plannedExecution,
      }),
    );
  });

  it("fails corrupted scheduled provenance without invoking upload or submission effects", async () => {
    const job: ActivitySubmissionQueueJob = {
      ...baseJob,
      id: "job-corrupt-planned",
      planExecution: {
        ...plannedExecution,
        structureHash: `v1:sha256:${"f".repeat(64)}`,
        plannedSession: {
          ...plannedExecution.plannedSession,
          prescription: {
            ...plannedExecution.plannedSession.prescription,
            structureHash: `v1:sha256:${"f".repeat(64)}`,
          },
        },
      },
      draft: { ...baseJob.draft, activityPlanId: plannedExecution.activityPlanId },
    };
    leases.set(job.id, job);
    const deps = createDeps();

    await expect(runActivitySubmissionQueueJob(job, deps)).resolves.toMatchObject({
      status: "failed",
      retryClass: "validation",
    });
    expect(deps.beginMobileRecordingUpload).not.toHaveBeenCalled();
    expect(deps.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(deps.createFromRecordingSummary).not.toHaveBeenCalled();
  });

  it("keeps a long-running effect fenced with repeated heartbeats and prevents a second runner effect", async () => {
    vi.useFakeTimers();
    try {
      let clock = Date.parse("2026-01-01T11:01:00.000Z");
      let releaseUpload!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      const uploadToSignedUrl = vi.fn(async () => {
        await uploadGate;
        return { success: true };
      });
      const deps = createDeps({
        now: () => new Date(clock).toISOString(),
        uploadToSignedUrl,
      });
      const first = runActivitySubmissionQueueJob(baseJob, deps);
      await vi.advanceTimersByTimeAsync(0);
      // Metadata and claim have settled; the upload is deliberately in flight.
      clock += 45_000;
      await vi.advanceTimersByTimeAsync(45_000);
      expect(
        vi.mocked(queueStorage.renewClaimedActivitySubmissionQueueJob).mock.calls.length,
      ).toBeGreaterThanOrEqual(3);
      const second = runActivitySubmissionQueueJob(baseJob, deps);
      expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
      releaseUpload();
      await expect(Promise.all([first, second])).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "complete" })]),
      );
      expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
      expect(persistedHistory.at(-1)).toMatchObject({ status: "complete" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects stale completion when heartbeat renewal is lost mid-effect without a fallback duplicate", async () => {
    vi.useFakeTimers();
    try {
      let clock = Date.parse("2026-01-01T11:01:00.000Z");
      let releaseUpload!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      let renewals = 0;
      vi.mocked(queueStorage.renewClaimedActivitySubmissionQueueJob).mockImplementation(
        async (id, owner, token, leaseMs, now) => {
          renewals += 1;
          if (renewals === 4) return null;
          const current = leases.get(id);
          if (!current) return null;
          const renewed = {
            ...current,
            leaseOwner: owner,
            leaseToken: token,
            leaseExpiresAt: new Date((now ?? Date.now()) + leaseMs).toISOString(),
          };
          leases.set(id, renewed);
          return renewed;
        },
      );
      const uploadToSignedUrl = vi.fn(async () => {
        await uploadGate;
        return { success: true };
      });
      const result = runActivitySubmissionQueueJob(
        baseJob,
        createDeps({ now: () => new Date(clock).toISOString(), uploadToSignedUrl }),
      );
      const rejected = expect(result).rejects.toThrow("lease was lost");
      await vi.advanceTimersByTimeAsync(0);
      clock += 20_000;
      await vi.advanceTimersByTimeAsync(20_000);
      releaseUpload();
      await rejected;
      expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
      expect(persistedHistory.at(-1)).not.toMatchObject({ status: "complete" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates, uploads, processes, and persists progress after each step", async () => {
    const deps = createDeps();

    const result = await runActivitySubmissionQueueJob(baseJob, deps);

    expect(result.status).toBe("complete");
    expect(result.activityId).toBe("activity-1");
    expect(result.ingestionId).toBe("ingestion-1");
    expect(result.uploadCompletedAt).toBe("2026-01-01T11:01:00.000Z");
    expect(deps.createFromRecordingSummary).toHaveBeenCalledWith({
      profileId: "profile-1",
      recordingSessionId: "recording-session-1",
      name: "Morning ride",
      notes: undefined,
      content_visibility: undefined,
      startedAt: "2026-01-01T10:00:00.000Z",
      finishedAt: "2026-01-01T11:00:00.000Z",
      activityPlanId: undefined,
      executionManifest,
      uploadedArtifact: { ingestionId: "ingestion-1" },
      summary: { distanceMeters: 25000, calories: 500 },
      source: "mobile_recording",
    });
    expect(
      JSON.stringify(vi.mocked(deps.createFromRecordingSummary).mock.calls[0]?.[0]),
    ).not.toMatch(/commonLoad|normalizedIntensity|trainingStressScore|intensityFactor|"tss"/i);
    expect(deps.beginMobileRecordingUpload).toHaveBeenCalledWith({
      recordingSessionId: "recording-session-1",
      byteSize: 1024,
      sha256: "a".repeat(64),
      format: "fit",
    });
    expect(deps.uploadToSignedUrl).toHaveBeenCalledWith(
      "file:///activity.fit",
      "https://storage.example/upload",
    );
    expect(persistedHistory.map((job) => job.status)).toEqual([
      "uploading",
      "uploading",
      "uploading",
      "uploading",
      "creating_activity",
      "creating_activity",
      "complete",
    ]);
    expect(persistedHistory[5]).toMatchObject({
      activityId: "activity-1",
      ingestionId: "ingestion-1",
    });
    expect(persistedHistory[2]).toMatchObject({
      ingestionId: "ingestion-1",
    });
    expect(persistedHistory[1]).toMatchObject({
      artifactSha256: "a".repeat(64),
    });
  });

  it("preserves a failed job and increments attempts on error", async () => {
    const deps = createDeps({
      uploadToSignedUrl: vi.fn(async () => ({ success: false, error: "network down" })),
    });

    const result = await runActivitySubmissionQueueJob(baseJob, deps);

    expect(result).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "transient",
    });
    expect(result.nextAttemptAt).toBe("2026-01-01T11:01:02.137Z");
    expect(persistedJobs.at(-1)).toMatchObject({ status: "failed", lastError: "transient" });
  });

  it("retains a permanent error without scheduling another attempt", async () => {
    const result = await runActivitySubmissionQueueJob(
      baseJob,
      createDeps({
        beginMobileRecordingUpload: vi.fn(async () => {
          throw new Error("invalid metadata");
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "failed",
      attempts: 1,
      retryClass: "validation",
      nextAttemptAt: null,
    });
  });

  it("completes a retry with an existing accepted activity without duplicate create", async () => {
    const deps = createDeps();
    const retryJob: ActivitySubmissionQueueJob = {
      ...baseJob,
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      status: "failed",
      attempts: 1,
      lastError: "previous failure",
    };
    leases.set(retryJob.id, retryJob);

    const result = await runActivitySubmissionQueueJob(retryJob, deps);

    expect(result.status).toBe("complete");
    expect(result.attempts).toBe(1);
    expect(deps.createFromRecordingSummary).not.toHaveBeenCalled();
    expect(deps.beginMobileRecordingUpload).not.toHaveBeenCalled();
    expect(deps.uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("converges a lost response when begin upload reports the claim already ready", async () => {
    const deps = createDeps({
      beginMobileRecordingUpload: vi.fn(async () => ({
        status: "ready" as const,
        ingestionId: "ingestion-ready",
        activityId: "activity-ready",
        byteSize: 1024,
        sha256: "a".repeat(64),
        format: "fit" as const,
        mediaType: "application/vnd.ant.fit",
      })),
    });

    const result = await runActivitySubmissionQueueJob(baseJob, deps);
    expect(result).toMatchObject({
      status: "complete",
      activityId: "activity-ready",
      ingestionId: "ingestion-ready",
    });
    expect(deps.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(deps.createFromRecordingSummary).not.toHaveBeenCalled();
  });

  it("re-uploads retained local evidence after server acceptance fails", async () => {
    const createFromRecordingSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        id: "activity-1",
        ingestion: { id: "ingestion-1", status: "ready", source: "mobile_recording" },
      });
    const deps = createDeps({ createFromRecordingSummary });

    const failed = await runActivitySubmissionQueueJob(baseJob, deps);
    expect(failed).toMatchObject({ status: "failed", uploadCompletedAt: undefined });
    expect(failed.activityId).toBeUndefined();

    const retried = await runActivitySubmissionQueueJob(failed, deps);
    expect(retried.status).toBe("complete");
    expect(deps.beginMobileRecordingUpload).toHaveBeenCalledTimes(2);
    expect(deps.uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(createFromRecordingSummary).toHaveBeenCalledTimes(2);
  });
});
