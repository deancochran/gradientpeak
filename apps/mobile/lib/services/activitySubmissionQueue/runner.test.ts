import { beforeEach, describe, expect, it, vi } from "vitest";

import { runActivitySubmissionQueueJob } from "./runner";
import type { ActivitySubmissionQueueJob, ActivitySubmissionQueueRunnerDeps } from "./types";

const persistedJobs: ActivitySubmissionQueueJob[] = [];
const persistedHistory: ActivitySubmissionQueueJob[] = [];
const executionManifest = {
  version: 1 as const,
  compilerVersion: 1,
  planHash: "0".repeat(64),
  occurrences: [],
};

vi.mock("./storage", () => ({
  upsertActivitySubmissionQueueJob: vi.fn(async (job: ActivitySubmissionQueueJob) => {
    persistedHistory.push(job);
    const index = persistedJobs.findIndex((candidate) => candidate.id === job.id);
    if (index >= 0) {
      persistedJobs[index] = job;
      return;
    }

    persistedJobs.push(job);
  }),
}));

const baseJob: ActivitySubmissionQueueJob = {
  schemaVersion: 2,
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
    activityType: "bike",
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
    claimLegacyMobileRecordingUpload: vi.fn(async () => ({
      status: "claimed" as const,
      ingestionId: "ingestion-1",
      activityId: "activity-1",
      byteSize: 1024,
      sha256: "a".repeat(64),
      format: "fit" as const,
      mediaType: "application/vnd.ant.fit",
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
      is_private: undefined,
      content_visibility: undefined,
      startedAt: "2026-01-01T10:00:00.000Z",
      finishedAt: "2026-01-01T11:00:00.000Z",
      activityPlanId: undefined,
      executionManifest,
      artifactSource: "uploadedArtifact",
      uploadedArtifact: { ingestionId: "ingestion-1" },
      summary: { distanceMeters: 25000, calories: 500 },
      source: "mobile_recording",
    });
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
      lastError: "network down",
    });
    expect(persistedJobs.at(-1)).toMatchObject({ status: "failed", lastError: "network down" });
  });

  it("completes a retry with an existing accepted activity without duplicate create", async () => {
    const deps = createDeps();
    const retryJob: ActivitySubmissionQueueJob = {
      ...baseJob,
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      remoteFilePath: "activities/profile-1/uploads/existing.fit",
      status: "failed",
      attempts: 1,
      lastError: "previous failure",
    };

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
        acceptedArtifact: {
          sha256: "a".repeat(64),
          byteSize: 1024,
          bucket: "activity-files",
          path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
          mediaType: "application/vnd.ant.fit",
          format: "fit" as const,
          originalName: null,
        },
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

  it("adopts a legacy staged-path job through the actor-scoped compatibility claim", async () => {
    const deps = createDeps({
      getLocalArtifactMetadata: vi.fn(async () => {
        throw new Error("local file is unavailable");
      }),
      uploadToSignedUrl: vi.fn(async () => {
        throw new Error("local file is unavailable");
      }),
    });
    const legacyJob: ActivitySubmissionQueueJob = {
      ...baseJob,
      remoteFilePath: "activities/profile-1/uploads/legacy.fit",
      artifactSha256: "a".repeat(64),
      localActivityFileSize: 1024,
      status: "failed",
      attempts: 1,
    };

    const result = await runActivitySubmissionQueueJob(legacyJob, deps);
    expect(result.status).toBe("complete");
    expect(deps.claimLegacyMobileRecordingUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        stagingPath: "activities/profile-1/uploads/legacy.fit",
        recordingSessionId: "recording-session-1",
      }),
    );
    expect(deps.beginMobileRecordingUpload).not.toHaveBeenCalled();
    expect(deps.getLocalArtifactMetadata).not.toHaveBeenCalled();
    expect(deps.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(deps.createFromRecordingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedArtifact: { ingestionId: "ingestion-1" } }),
    );
  });

  it("re-uploads retained local evidence after server acceptance fails", async () => {
    const createFromRecordingSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error("server acceptance failed"))
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
