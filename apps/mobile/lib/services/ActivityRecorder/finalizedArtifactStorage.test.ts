import { afterEach, describe, expect, it, vi } from "vitest";
import { setActivitySubmissionQueueJobsForTests } from "../activitySubmissionQueue/storage";
import type { ActivitySubmissionQueueJob } from "../activitySubmissionQueue/types";

const deleted: string[] = [];
let failDelete = false;
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      if (failDelete) throw new Error("disk busy");
      deleted.push(this.uri);
    }
  },
  Directory: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      if (failDelete) throw new Error("disk busy");
      deleted.push(this.uri);
    }
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
const journalMocks = vi.hoisted(() => ({
  tombstoneAcceptedRecordingEvidence: vi.fn(async () => true),
  completeAcceptedRecordingEvidenceCleanup: vi.fn(async () => undefined),
  retryAcceptedRecordingEvidenceCleanup: vi.fn(async () => undefined),
  loadDueAcceptedRecordingEvidenceCleanups: vi.fn(async () => []),
  completeDiscardedRecordingEvidenceCleanup: vi.fn(async () => undefined),
  retryDiscardedRecordingEvidenceCleanup: vi.fn(async () => undefined),
  loadDueDiscardedRecordingEvidenceCleanups: vi.fn(async () => []),
}));
vi.mock("./recordingEvidenceJournal", () => journalMocks);

import {
  garbageCollectAcceptedQueueEvidence,
  garbageCollectDueDiscardedRecordingEvidence,
} from "./finalizedArtifactStorage";

const job: ActivitySubmissionQueueJob = {
  schemaVersion: 2,
  id: "job",
  artifactId: "artifact",
  sessionId: "session",
  localActivityFilePath: "file:///documents/activity.fit",
  streamArtifactPaths: ["file:///documents/streams"],
  executionManifest: { version: 1, compilerVersion: 1, planHash: "0".repeat(64), occurrences: [] },
  draft: {
    recordingSessionId: "operation",
    profileId: "profile",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T01:00:00.000Z",
    name: "Ride",
    activityType: "bike",
    durationSeconds: 1,
    movingSeconds: 1,
    distanceMeters: 1,
  },
  status: "complete",
  activityId: "activity",
  attempts: 0,
  createdAt: "2026-01-01T01:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
};

describe("accepted queue evidence GC", () => {
  afterEach(() => {
    deleted.length = 0;
    failDelete = false;
    setActivitySubmissionQueueJobsForTests(undefined);
    vi.clearAllMocks();
  });

  it("collects only an exact durably accepted operation", async () => {
    setActivitySubmissionQueueJobsForTests(new Map([[job.id, job]]));
    journalMocks.tombstoneAcceptedRecordingEvidence
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(garbageCollectAcceptedQueueEvidence(job)).resolves.toBe(true);
    // Replay sees the persisted acceptance tombstone and never deletes twice.
    await expect(garbageCollectAcceptedQueueEvidence(job)).resolves.toBe(false);
    expect(deleted).toEqual(["file:///documents/activity.fit", "file:///documents/streams"]);
  });

  it.each([
    "queued",
    "failed",
  ] as const)("retains accepted evidence while a %s queue row references it", async (status) => {
    setActivitySubmissionQueueJobsForTests(
      new Map([
        [job.id, job],
        [
          "retry",
          {
            ...job,
            id: "retry",
            status,
            retryClass: status === "failed" ? "transient" : undefined,
            activityId: undefined,
          },
        ],
      ]),
    );
    journalMocks.tombstoneAcceptedRecordingEvidence.mockResolvedValueOnce(false);
    await expect(garbageCollectAcceptedQueueEvidence(job)).resolves.toBe(false);
    expect(deleted).toEqual([]);
    expect(journalMocks.completeAcceptedRecordingEvidenceCleanup).not.toHaveBeenCalled();
  });

  it("does not collect a wrong or non-terminal operation", async () => {
    await expect(
      garbageCollectAcceptedQueueEvidence({ ...job, activityId: undefined }),
    ).resolves.toBe(false);
    await expect(garbageCollectAcceptedQueueEvidence({ ...job, status: "failed" })).resolves.toBe(
      false,
    );
    expect(journalMocks.tombstoneAcceptedRecordingEvidence).not.toHaveBeenCalled();
  });

  it("retries only a due accepted cleanup after a bounded persisted failure", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(now);
    journalMocks.tombstoneAcceptedRecordingEvidence.mockResolvedValue(true);
    failDelete = true;

    await expect(garbageCollectAcceptedQueueEvidence(job)).resolves.toBe(true);
    expect(journalMocks.retryAcceptedRecordingEvidenceCleanup).toHaveBeenCalledWith(
      "session",
      "activity-file-delete-failed",
    );
    expect(journalMocks.completeAcceptedRecordingEvidenceCleanup).not.toHaveBeenCalled();

    journalMocks.loadDueAcceptedRecordingEvidenceCleanups.mockResolvedValueOnce([]);
    const { garbageCollectDueAcceptedQueueEvidence } = await import("./finalizedArtifactStorage");
    await expect(garbageCollectDueAcceptedQueueEvidence(now + 999)).resolves.toBe(0);
    expect(deleted).toEqual([]);

    failDelete = false;
    journalMocks.loadDueAcceptedRecordingEvidenceCleanups.mockResolvedValueOnce([
      {
        sessionId: "session",
        activityFilePath: job.localActivityFilePath,
        streamArtifactPaths: job.streamArtifactPaths,
      },
    ] as never);
    await expect(garbageCollectDueAcceptedQueueEvidence(now + 1_000)).resolves.toBe(1);
    expect(journalMocks.completeAcceptedRecordingEvidenceCleanup).toHaveBeenCalledWith("session");
    journalMocks.loadDueAcceptedRecordingEvidenceCleanups.mockResolvedValueOnce([]);
    await expect(garbageCollectDueAcceptedQueueEvidence(now + 2_000)).resolves.toBe(0);
    expect(deleted).toEqual(["file:///documents/activity.fit", "file:///documents/streams"]);
    vi.useRealTimers();
  });

  it("retries a process-interrupted discarded-artifact cleanup without reviving submission", async () => {
    journalMocks.loadDueDiscardedRecordingEvidenceCleanups.mockResolvedValueOnce([
      {
        sessionId: "discarded-session",
        activityFilePath: job.localActivityFilePath,
        streamArtifactPaths: job.streamArtifactPaths,
      },
    ] as never);
    failDelete = true;
    await expect(garbageCollectDueDiscardedRecordingEvidence()).resolves.toBe(0);
    expect(journalMocks.retryDiscardedRecordingEvidenceCleanup).toHaveBeenCalledWith(
      "discarded-session",
    );

    failDelete = false;
    journalMocks.loadDueDiscardedRecordingEvidenceCleanups.mockResolvedValueOnce([
      {
        sessionId: "discarded-session",
        activityFilePath: job.localActivityFilePath,
        streamArtifactPaths: job.streamArtifactPaths,
      },
    ] as never);
    await expect(garbageCollectDueDiscardedRecordingEvidence()).resolves.toBe(1);
    expect(journalMocks.completeDiscardedRecordingEvidenceCleanup).toHaveBeenCalledWith(
      "discarded-session",
    );
  });
});
