import type { RecordingSessionArtifact } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  result: "created" as "created" | "existing" | "discarded" | "absent" | "rejected",
  handoff: vi.fn(async () => mocks.result),
  clearCheckpoint: vi.fn(async () => undefined),
}));

vi.mock("../ActivityRecorder/recordingEvidenceJournal", () => ({
  createFinalizedArtifactQueueHandoff: mocks.handoff,
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
    activity: { activity_category: "run", activityPlanId: null },
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
        activity_category: "run",
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
    vi.clearAllMocks();
    mocks.result = "created";
  });

  it("coalesces duplicate handoffs and clears the checkpoint only after queue persistence", async () => {
    const [first, second] = await Promise.all([
      ensureFinalizedArtifactQueueHandoff(artifact),
      ensureFinalizedArtifactQueueHandoff(artifact),
    ]);
    expect(first).toEqual(second);
    expect(mocks.handoff).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      schemaVersion: 3,
      id: artifact.sessionId,
      status: "queued",
      draft: { activity_category: "run" },
    });
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith(artifact.sessionId);
    const upsertOrder = mocks.handoff.mock.invocationCallOrder[0];
    const clearOrder = mocks.clearCheckpoint.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeDefined();
    expect(clearOrder).toBeDefined();
    if (upsertOrder === undefined || clearOrder === undefined) {
      throw new Error("Expected both queue persistence and artifact cleanup calls");
    }
    expect(upsertOrder).toBeLessThan(clearOrder);
  });

  it("reuses a persisted job after process death without creating a duplicate", async () => {
    const first = await ensureFinalizedArtifactQueueHandoff(artifact);
    if (!first) throw new Error("handoff setup failed");
    vi.clearAllMocks();
    const resumed = await ensureFinalizedArtifactQueueHandoff(artifact);
    if (!resumed) throw new Error("handoff resume failed");
    expect(resumed.id).toBe(first.id);
    expect(mocks.handoff).toHaveBeenCalledTimes(1);
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith(artifact.sessionId);
  });

  it.each([
    "created",
    "existing",
  ] as const)("returns a queue job and clears the checkpoint for %s", async (result) => {
    mocks.result = result;
    const handoff = await ensureFinalizedArtifactQueueHandoff(artifact);
    expect(handoff).toMatchObject({ id: artifact.sessionId, status: "queued" });
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith(artifact.sessionId);
  });

  it("returns a terminal non-claimable shape and clears the checkpoint for explicit discard", async () => {
    mocks.result = "discarded";
    const handoff = await ensureFinalizedArtifactQueueHandoff(artifact);
    expect(handoff).toMatchObject({
      id: artifact.sessionId,
      status: "failed",
      retryClass: "permanent",
      errorCategory: "discarded",
    });
    expect(mocks.clearCheckpoint).toHaveBeenCalledWith(artifact.sessionId);
  });

  it.each([
    "absent",
    "rejected",
  ] as const)("returns null and retains the checkpoint for %s", async (result) => {
    mocks.result = result;
    await expect(ensureFinalizedArtifactQueueHandoff(artifact)).resolves.toBeNull();
    expect(mocks.clearCheckpoint).not.toHaveBeenCalled();
  });

  it("refuses to hand off an artifact for a different authenticated profile", async () => {
    await expect(ensureFinalizedArtifactQueueHandoff(artifact, "profile-2")).rejects.toThrow(
      "different profile",
    );
    expect(mocks.handoff).not.toHaveBeenCalled();
    expect(mocks.clearCheckpoint).not.toHaveBeenCalled();
  });
});
