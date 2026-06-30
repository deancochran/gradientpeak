import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActivitySubmissionQueueJobs,
  loadActivitySubmissionQueueJobs,
  removeActivitySubmissionQueueJob,
  saveActivitySubmissionQueueJobs,
  upsertActivitySubmissionQueueJob,
} from "./storage";
import type { ActivitySubmissionQueueJob } from "./types";

const storage = new Map<string, string>();

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

describe("activity submission queue storage", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it("persists and loads queue jobs", async () => {
    await saveActivitySubmissionQueueJobs([baseJob]);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([baseJob]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "activity-submission-queue:jobs",
      JSON.stringify([baseJob]),
    );
  });

  it("upserts jobs by local id", async () => {
    await saveActivitySubmissionQueueJobs([baseJob]);

    const updated = { ...baseJob, status: "uploading" as const, attempts: 1 };
    await upsertActivitySubmissionQueueJob(updated);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([updated]);
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
