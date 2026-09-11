import { createHash } from "node:crypto";
import {
  activityPlanStructureSchema,
  getCanonicalActivityPlanStructureHashInput,
  type RecordingSessionArtifact,
} from "@repo/core";
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
vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash("sha256").update(value).digest("hex"),
  };
});

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
  provisionalMetrics: {
    stage: "provisional",
    authority: "live_recording_only",
    commonLoad: { status: "partial", load: 12, intensity: 0.8 },
    normalizedIntensity: { status: "partial", value: 0.8 },
  },
} as unknown as RecordingSessionArtifact;

const plannedStructure = activityPlanStructureSchema.parse({
  version: 3 as const,
  activity_category: "run" as const,
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      role: "activity" as const,
      name: "Run",
      intervals: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "10000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time" as const, seconds: 60 },
              targets: [{ type: "RPE" as const, intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
});
const plannedStructureHash = `v1:sha256:${createHash("sha256")
  .update(getCanonicalActivityPlanStructureHashInput(plannedStructure))
  .digest("hex")}`;
const plannedExecution = {
  manifestVersion: 1 as const,
  compilerVersion: 1 as const,
  activityPlanId: "10000000-0000-4000-8000-000000000004",
  scheduledEventId: "10000000-0000-4000-8000-000000000005",
  name: "Hard",
  description: null,
  activityPlanRevision: 3,
  structureHash: plannedStructureHash,
  structure: plannedStructure,
  plannedSession: {
    id: "10000000-0000-4000-8000-000000000006",
    sessionRevision: 5,
    prescription: {
      activityPlanId: "10000000-0000-4000-8000-000000000004",
      activityPlanRevision: 3,
      variantId: "10000000-0000-4000-8000-000000000007",
      variantName: "Hard",
      structure: plannedStructure,
      structureHash: plannedStructureHash,
      prescriptionQuantification: null,
      capturedAt: "2026-01-01T09:00:00.000Z",
    },
  },
  personalizationEnabled: false,
  targetPresentations: [],
};

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

  it("persists only recording source facts and never promotes provisional live output", async () => {
    const handoff = await ensureFinalizedArtifactQueueHandoff(artifact);
    if (!handoff) throw new Error("Expected a durable queue handoff");

    expect(handoff.draft).toEqual({
      recordingSessionId: artifact.sessionId,
      profileId: artifact.profileId,
      startedAt: artifact.snapshot.identity.startedAt,
      finishedAt: artifact.completedAt,
      name: "run activity",
      activity_category: "run",
      durationSeconds: 60,
      movingSeconds: 55,
      distanceMeters: 200,
      calories: null,
      activityPlanId: null,
    });
    expect(handoff).not.toHaveProperty("provisionalMetrics");
    expect(handoff.draft).not.toHaveProperty("commonLoad");
    expect(handoff.draft).not.toHaveProperty("normalizedIntensity");
    expect(JSON.stringify(handoff)).not.toMatch(/trainingStressScore|intensityFactor|"tss"/i);
  });

  it("retains immutable planned-session provenance in the durable queue handoff", async () => {
    const plannedArtifact = {
      ...artifact,
      snapshot: {
        ...artifact.snapshot,
        activity: {
          ...artifact.snapshot.activity,
          activityPlanId: plannedExecution.activityPlanId,
          eventId: plannedExecution.scheduledEventId,
        },
        planExecution: plannedExecution,
      },
    } as unknown as RecordingSessionArtifact;

    const handoff = await ensureFinalizedArtifactQueueHandoff(plannedArtifact);

    expect(handoff).toMatchObject({
      planExecution: plannedExecution,
      draft: { activityPlanId: plannedExecution.activityPlanId },
    });
  });

  it("rejects corrupted planned-session provenance before durable queue handoff", async () => {
    const plannedArtifact = {
      ...artifact,
      sessionId: "profile-1:corrupt-planned-session",
      snapshot: {
        ...artifact.snapshot,
        identity: {
          ...artifact.snapshot.identity,
          sessionId: "profile-1:corrupt-planned-session",
        },
        activity: {
          ...artifact.snapshot.activity,
          activityPlanId: plannedExecution.activityPlanId,
        },
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
      },
    } as unknown as RecordingSessionArtifact;

    await expect(ensureFinalizedArtifactQueueHandoff(plannedArtifact)).rejects.toThrow(
      "Invalid recording prescription structure hash",
    );
    expect(mocks.handoff).not.toHaveBeenCalled();
    expect(mocks.clearCheckpoint).not.toHaveBeenCalled();
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
