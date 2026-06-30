import { beforeEach, describe, expect, it, vi } from "vitest";

import { runActivitySubmissionQueueJob } from "./runner";
import type { ActivitySubmissionQueueJob, ActivitySubmissionQueueRunnerDeps } from "./types";

const persistedJobs: ActivitySubmissionQueueJob[] = [];
const persistedHistory: ActivitySubmissionQueueJob[] = [];

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
  id: "job-1",
  artifactId: "artifact-1",
  sessionId: "session-1",
  localActivityFilePath: "file:///activity.fit",
  streamArtifactPaths: ["file:///streams"],
  draft: {
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
    getSignedUploadUrl: vi.fn(async () => ({
      signedUrl: "https://storage.example/upload",
      filePath: "activities/profile-1/uploads/activity.fit",
    })),
    uploadToSignedUrl: vi.fn(async () => ({ success: true })),
    markUploadedAndProcess: vi.fn(async () => ({ success: true })),
    now: vi.fn(() => "2026-01-01T11:01:00.000Z"),
    ...overrides,
  } satisfies ActivitySubmissionQueueRunnerDeps;
}

describe("activity submission queue runner", () => {
  beforeEach(() => {
    persistedJobs.length = 0;
    persistedHistory.length = 0;
    vi.clearAllMocks();
  });

  it("creates, uploads, processes, and persists progress after each step", async () => {
    const deps = createDeps();

    const result = await runActivitySubmissionQueueJob(baseJob, deps);

    expect(result.status).toBe("complete");
    expect(result.activityId).toBe("activity-1");
    expect(result.ingestionId).toBe("ingestion-1");
    expect(result.remoteFilePath).toBe("activities/profile-1/uploads/activity.fit");
    expect(deps.createFromRecordingSummary).toHaveBeenCalledWith({
      ...baseJob.draft,
      localFileMetadata: {
        filePath: baseJob.localActivityFilePath,
        fileType: "fit",
      },
      source: "mobile_recording",
    });
    expect(deps.getSignedUploadUrl).toHaveBeenCalledWith({
      fileName: "activity.fit",
    });
    expect(deps.uploadToSignedUrl).toHaveBeenCalledWith(
      "file:///activity.fit",
      "https://storage.example/upload",
    );
    expect(deps.markUploadedAndProcess).toHaveBeenCalledWith({
      activityId: "activity-1",
      ingestionId: "ingestion-1",
      activityFilePath: "activities/profile-1/uploads/activity.fit",
      fileType: "fit",
    });
    expect(persistedHistory.map((job) => job.status)).toEqual([
      "creating_activity",
      "uploading",
      "processing",
      "complete",
    ]);
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
      activityId: "activity-1",
      ingestionId: "ingestion-1",
    });
    expect(persistedJobs.at(-1)).toMatchObject({ status: "failed", lastError: "network down" });
  });

  it("resumes retry from existing activity and ingestion without duplicate create", async () => {
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
    expect(deps.createFromRecordingSummary).not.toHaveBeenCalled();
    expect(deps.getSignedUploadUrl).not.toHaveBeenCalled();
    expect(deps.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(deps.markUploadedAndProcess).toHaveBeenCalledWith({
      activityId: "activity-existing",
      ingestionId: "ingestion-existing",
      activityFilePath: "activities/profile-1/uploads/existing.fit",
      fileType: "fit",
    });
  });
});
