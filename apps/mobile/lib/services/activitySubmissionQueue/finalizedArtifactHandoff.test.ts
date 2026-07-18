import type { RecordingSessionArtifact } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storedJob: null as unknown,
  upsert: vi.fn(async (job: unknown) => {
    mocks.storedJob = job;
  }),
  clearArtifact: vi.fn(async () => undefined),
  clearCheckpoint: vi.fn(async () => undefined),
}));

vi.mock("./storage", () => ({
  loadActivitySubmissionQueueJobByArtifactId: vi.fn(async () => mocks.storedJob),
  upsertActivitySubmissionQueueJob: mocks.upsert,
}));
vi.mock("../ActivityRecorder/finalizedArtifactStorage", () => ({
  clearPendingFinalizedArtifact: mocks.clearArtifact,
}));
vi.mock("../ActivityRecorder/checkpointStorage", () => ({
  clearRecordingCheckpoint: mocks.clearCheckpoint,
}));

import { ensureFinalizedArtifactQueueHandoff } from "./finalizedArtifactHandoff";

const artifact = {
  sessionId: "profile-1:session-1",
  profileId: "profile-1",
  snapshot: {
    identity: { sessionId: "profile-1:session-1", startedAt: "2026-01-01T10:00:00.000Z" },
    activity: { category: "run", activityPlanId: null },
  },
  finalStats: { durationSeconds: 60, movingSeconds: 55, distanceMeters: 200 },
  activityFilePath: "file:///activity.fit",
  streamArtifactPaths: ["file:///streams"],
  completedAt: "2026-01-01T10:01:00.000Z",
  executionManifest: {
    version: 1,
    compilerVersion: 1,
    planHash: "0".repeat(64),
    occurrences: [
      {
        occurrenceId: "activity:one",
        globalOrdinal: 0,
        segmentId: "00000000-0000-4000-8000-000000000001",
        role: "activity",
        category: "run",
        startedAt: "2026-01-01T10:00:00.000Z",
        completedAt: "2026-01-01T10:01:00.000Z",
        activeSeconds: 55,
        movingSeconds: 55,
        distanceMeters: 200,
        timerEvents: [],
        laps: [],
      },
    ],
  },
} as unknown as RecordingSessionArtifact;

describe("finalized artifact queue handoff", () => {
  beforeEach(() => {
    mocks.storedJob = null;
    vi.clearAllMocks();
  });

  it("coalesces duplicate handoffs and clears artifact/checkpoint only after queue persistence", async () => {
    const [first, second] = await Promise.all([
      ensureFinalizedArtifactQueueHandoff(artifact),
      ensureFinalizedArtifactQueueHandoff(artifact),
    ]);
    expect(first).toEqual(second);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ schemaVersion: 2, id: artifact.sessionId, status: "queued" });
    expect(mocks.clearArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith(artifact.sessionId);
    const upsertOrder = mocks.upsert.mock.invocationCallOrder[0];
    const clearOrder = mocks.clearArtifact.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeDefined();
    expect(clearOrder).toBeDefined();
    if (upsertOrder === undefined || clearOrder === undefined) {
      throw new Error("Expected both queue persistence and artifact cleanup calls");
    }
    expect(upsertOrder).toBeLessThan(clearOrder);
  });

  it("reuses a persisted job after process death without creating a duplicate", async () => {
    const first = await ensureFinalizedArtifactQueueHandoff(artifact);
    vi.clearAllMocks();
    mocks.storedJob = first;
    const resumed = await ensureFinalizedArtifactQueueHandoff(artifact);
    expect(resumed.id).toBe(first.id);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.clearArtifact).toHaveBeenCalledTimes(1);
  });

  it("refuses to hand off an artifact for a different authenticated profile", async () => {
    await expect(ensureFinalizedArtifactQueueHandoff(artifact, "profile-2")).rejects.toThrow(
      "different profile",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.clearArtifact).not.toHaveBeenCalled();
  });
});
