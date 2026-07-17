import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActivitySubmissionQueueJobs,
  incompleteQueueJobReferencesLocalFiles,
  loadActivitySubmissionQueueJobByArtifactId,
  loadActivitySubmissionQueueJobs,
  removeActivitySubmissionQueueJob,
  saveActivitySubmissionQueueJobs,
  upsertActivitySubmissionQueueJob,
} from "./storage";
import type { ActivitySubmissionQueueJob } from "./types";

const storage = new Map<string, string>();
const executionManifest = {
  version: 1 as const,
  compilerVersion: 1,
  planHash: "0".repeat(64),
  occurrences: [],
};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
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

describe("activity submission queue storage", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it("persists and loads queue jobs", async () => {
    await saveActivitySubmissionQueueJobs([baseJob]);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([baseJob]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "activity-submission-queue:v3:jobs",
      JSON.stringify([baseJob]),
    );
  });

  it("upserts jobs by local id", async () => {
    await saveActivitySubmissionQueueJobs([baseJob]);

    const updated = { ...baseJob, status: "uploading" as const, attempts: 1 };
    await upsertActivitySubmissionQueueJob(updated);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([updated]);
  });

  it("serializes concurrent updates without dropping jobs", async () => {
    const secondJob = { ...baseJob, id: "job-2", artifactId: "artifact-2" };

    await Promise.all([
      upsertActivitySubmissionQueueJob(baseJob),
      upsertActivitySubmissionQueueJob(secondJob),
    ]);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([baseJob, secondJob]);
  });

  it("loads an existing job by artifact or session identity", async () => {
    await saveActivitySubmissionQueueJobs([baseJob]);

    await expect(loadActivitySubmissionQueueJobByArtifactId("artifact-1")).resolves.toEqual(
      baseJob,
    );
    await expect(loadActivitySubmissionQueueJobByArtifactId("session-1")).resolves.toEqual(baseJob);
  });

  it("scopes startup and artifact lookups to the authenticated profile", async () => {
    const otherProfile = {
      ...baseJob,
      id: "job-2",
      artifactId: "artifact-2",
      sessionId: "session-2",
      draft: { ...baseJob.draft, profileId: "profile-2" },
    };
    await saveActivitySubmissionQueueJobs([baseJob, otherProfile]);

    await expect(loadActivitySubmissionQueueJobs("profile-1")).resolves.toEqual([baseJob]);
    await expect(
      loadActivitySubmissionQueueJobByArtifactId("artifact-2", "profile-1"),
    ).resolves.toBeNull();
  });

  it("only treats incomplete jobs with local references as recoverable", () => {
    expect(incompleteQueueJobReferencesLocalFiles(baseJob)).toBe(true);
    expect(incompleteQueueJobReferencesLocalFiles({ ...baseJob, status: "complete" })).toBe(false);
    expect(
      incompleteQueueJobReferencesLocalFiles({
        ...baseJob,
        localActivityFilePath: "",
        streamArtifactPaths: [],
      }),
    ).toBe(false);
  });

  it("removes and clears queue jobs", async () => {
    await saveActivitySubmissionQueueJobs([
      baseJob,
      { ...baseJob, id: "job-2", artifactId: "artifact-2" },
    ]);

    await removeActivitySubmissionQueueJob("job-1");
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([
      { ...baseJob, id: "job-2", artifactId: "artifact-2" },
    ]);

    await clearActivitySubmissionQueueJobs();
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([]);
  });
});
