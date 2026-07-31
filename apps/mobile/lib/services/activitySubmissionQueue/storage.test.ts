import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDueActivitySubmissionQueueJob,
  clearActivitySubmissionQueueJobs,
  incompleteQueueJobReferencesLocalFiles,
  loadActivitySubmissionQueueJobByArtifactId,
  loadActivitySubmissionQueueJobs,
  removeActivitySubmissionQueueJob,
  renewClaimedActivitySubmissionQueueJob,
  setActivitySubmissionQueueJobsForTests,
  transitionClaimedActivitySubmissionQueueJob,
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
  schemaVersion: 3,
  id: "job-1",
  artifactId: "artifact-1",
  sessionId: "session-1",
  localActivityFilePath: "file:///activity.fit",
  streamArtifactPaths: ["file:///streams"],
  executionManifest,
  draft: {
    recordingSessionId: "session-1",
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

describe("activity submission queue storage", () => {
  beforeEach(() => {
    storage.clear();
    setActivitySubmissionQueueJobsForTests(new Map());
    vi.clearAllMocks();
  });

  it("persists and loads queue jobs", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);

    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([baseJob]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("upserts jobs by local id", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);

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
    await upsertActivitySubmissionQueueJob(baseJob);

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
    await upsertActivitySubmissionQueueJob(baseJob);
    await upsertActivitySubmissionQueueJob(otherProfile);

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

  it("fences duplicate drain claims until the lease expires", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);
    const first = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner-a",
      "token-a",
      1_000,
      10,
    );
    const competing = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner-b",
      "token-b",
      1_000,
      11,
    );
    const recovered = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner-b",
      "token-b",
      1_000,
      1_011,
    );
    expect(first?.leaseToken).toBe("token-a");
    expect(competing).toBeNull();
    expect(recovered?.leaseToken).toBe("token-b");
  });

  it("renews only a live owner fence and rejects an expired owner before an effect", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);
    await claimDueActivitySubmissionQueueJob("job-1", "runner-a", "token-a", 1_000, 10);
    await expect(
      renewClaimedActivitySubmissionQueueJob("job-1", "runner-a", "token-a", 1_000, 900),
    ).resolves.toMatchObject({
      leaseExpiresAt: new Date(1_900).toISOString(),
    });
    await expect(
      renewClaimedActivitySubmissionQueueJob("job-1", "runner-b", "token-b", 1_000, 901),
    ).resolves.toBeNull();
    await expect(
      renewClaimedActivitySubmissionQueueJob("job-1", "runner-a", "token-a", 1_000, 1_900),
    ).resolves.toBeNull();
  });

  it("only exposes transient failed jobs once their persisted due time arrives", async () => {
    await upsertActivitySubmissionQueueJob({
      ...baseJob,
      status: "failed",
      retryClass: "transient",
      nextAttemptAt: "2026-01-01T11:10:00.000Z",
    });
    const early = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner",
      "token",
      1000,
      Date.parse("2026-01-01T11:09:00.000Z"),
    );
    const due = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner",
      "token",
      1000,
      Date.parse("2026-01-01T11:10:00.000Z"),
    );
    expect(early).toBeNull();
    expect(due).not.toBeNull();
  });

  it("rejects a stale worker completion after an expired lease is reclaimed", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);
    const first = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner-a",
      "token-a",
      1_000,
      10,
    );
    const second = await claimDueActivitySubmissionQueueJob(
      "job-1",
      "runner-b",
      "token-b",
      1_000,
      1_011,
    );
    if (!first || !second) throw new Error("test setup failed");

    await expect(
      transitionClaimedActivitySubmissionQueueJob(
        { ...first, status: "complete", leaseOwner: null, leaseToken: null, leaseExpiresAt: null },
        "runner-a",
        "token-a",
        1_011,
      ),
    ).resolves.toBe(false);
    await expect(
      transitionClaimedActivitySubmissionQueueJob(
        { ...second, status: "complete", leaseOwner: null, leaseToken: null, leaseExpiresAt: null },
        "runner-b",
        "token-b",
        1_011,
      ),
    ).resolves.toBe(true);
  });

  it("does not schedule permanent failures", async () => {
    await upsertActivitySubmissionQueueJob({
      ...baseJob,
      status: "failed",
      retryClass: "permanent",
      nextAttemptAt: null,
    });
    await expect(
      claimDueActivitySubmissionQueueJob("job-1", "runner", "token", 1000, Date.now()),
    ).resolves.toBeNull();
  });

  it("removes and clears queue jobs", async () => {
    await upsertActivitySubmissionQueueJob(baseJob);
    await upsertActivitySubmissionQueueJob({ ...baseJob, id: "job-2", artifactId: "artifact-2" });

    await removeActivitySubmissionQueueJob("job-1");
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([
      { ...baseJob, id: "job-2", artifactId: "artifact-2" },
    ]);

    await clearActivitySubmissionQueueJobs();
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([]);
  });
});
