import { createHash } from "node:crypto";
import {
  createUnavailableAthletePerformanceTargetFacts,
  type RecordingCheckpoint,
} from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRecorderCheckpoint } from "./checkpointStorage";
import {
  hashRecordingPlan,
  inspectRecordingCheckpoint,
  loadAndClaimRecordingCheckpoint,
  persistRecordingCheckpoint,
  releaseRecordingCheckpointClaim,
} from "./checkpointStorage";

const journalMocks = vi.hoisted(() => ({
  row: null as { sessionId: string; checkpointJson: string } | null,
  persist: vi.fn<(input: { sessionId: string; checkpoint: unknown }) => Promise<void>>(),
  read: vi.fn(async () => journalMocks.row),
  claim: vi.fn(async () => journalMocks.row),
  quarantineSession: vi.fn(async () => false),
  quarantineOrphans: vi.fn(async () => 0),
  clear: vi.fn(async () => undefined),
  release: vi.fn(),
  hasQuarantine: vi.fn(async () => false),
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
  ),
}));
vi.mock("./recordingEvidenceJournal", () => ({
  persistRecordingEvidenceCheckpoint: journalMocks.persist,
  readRecordingEvidenceCheckpoint: journalMocks.read,
  claimRecordingEvidenceCheckpoint: journalMocks.claim,
  quarantineRecordingEvidenceSession: journalMocks.quarantineSession,
  quarantineOrphanedActiveRecordingEvidenceSessions: journalMocks.quarantineOrphans,
  clearRecordingEvidenceCheckpoint: journalMocks.clear,
  releaseRecordingEvidenceCheckpointClaim: journalMocks.release,
  hasQuarantinedRecordingEvidence: journalMocks.hasQuarantine,
}));

const ids = {
  segment: "00000000-0000-4000-8000-000000000001",
  interval: "00000000-0000-4000-8000-000000000002",
  step1: "00000000-0000-4000-8000-000000000003",
  step2: "00000000-0000-4000-8000-000000000004",
};
const plan = {
  version: 3 as const,
  activity_category: "run" as const,
  segments: [
    {
      id: ids.segment,
      role: "activity" as const,
      name: "Run",
      intervals: [
        {
          id: ids.interval,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: ids.step1,
              name: "One",
              duration: { type: "time" as const, seconds: 30 },
              targets: [{ type: "RPE" as const, intensity: 4 }],
            },
            {
              id: ids.step2,
              name: "Two",
              duration: { type: "time" as const, seconds: 30 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};

async function checkpoint(): Promise<ActivityRecorderCheckpoint> {
  const planHash = await hashRecordingPlan(plan);
  const performanceTargets = buildPerformanceTargetFactsFixture({
    asOf: "2026-01-01T10:00:00.000Z",
    thresholdEffectiveAt: "2025-01-01T10:00:00.000Z",
    runThresholdMetersPerSecond: 4,
    heartRateObservedAt: "2025-12-20T10:00:00.000Z",
    lthrBpm: { run: 170 },
  });
  return {
    schemaVersion: 5,
    variant: "planned",
    compilerVersion: 1,
    sessionId: "session-1",
    profileId: "profile-1",
    lifecycle: "recording",
    planSnapshot: plan as RecordingCheckpoint["planSnapshot"],
    planHash,
    currentOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step2}`,
    occurrenceProgress: {
      startedAt: "2026-01-01T10:00:30.000Z",
      startMovingSeconds: 30,
      startDistanceMeters: 100,
    },
    completedOccurrences: [
      {
        occurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step1}`,
        globalOrdinal: 0,
        segmentId: ids.segment,
        role: "activity",
        activity_category: "run",
        startedAt: "2026-01-01T10:00:00.000Z",
        completedAt: "2026-01-01T10:00:30.000Z",
        activeSeconds: 30,
        movingSeconds: 30,
        distanceMeters: 100,
      },
    ],
    manualLapsMs: [],
    boundaryJournal: [
      {
        revision: 2,
        completedOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step1}`,
        nextOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step2}`,
        committedAt: "2026-01-01T10:00:30.000Z",
      },
    ],
    eventJournal: [],
    timing: {
      startedAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:30.000Z",
      elapsedSeconds: 30,
      movingSeconds: 30,
      pausedAt: null,
      accumulatedPauseSeconds: 0,
    },
    policy: {
      activity_category: "run",
      gpsMode: "on",
      activityGpsMode: "on",
      selectedSources: [],
      trainerMode: "auto",
    },
    performanceTargets,
    streamArtifactPaths: ["file:///streams"],
    revision: 2,
  };
}

describe("recording checkpoint recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journalMocks.row = null;
    journalMocks.read.mockImplementation(async () => journalMocks.row);
    journalMocks.claim.mockImplementation(async () => journalMocks.row);
    journalMocks.persist.mockImplementation(async (input) => {
      journalMocks.row = {
        sessionId: input.sessionId,
        checkpointJson: JSON.stringify(input.checkpoint),
      };
    });
    journalMocks.quarantineSession.mockResolvedValue(true);
  });

  it("recovers a process death after the completed boundary was durably committed", async () => {
    const value = await checkpoint();
    await persistRecordingCheckpoint(value);
    const result = await loadAndClaimRecordingCheckpoint("profile-1");
    expect(result).toEqual({ status: "recovered", checkpoint: value });
    expect(
      result.status === "recovered" && result.checkpoint.performanceTargets.heartRate.run.lthr,
    ).toMatchObject({
      valueBpm: 170,
      sourceEvidenceId: "run-lthr-evidence",
    });
    expect(
      result.status === "recovered" && result.checkpoint.performanceTargets.thresholds.run,
    ).toMatchObject({
      freshness: "stale",
      unit: "meters_per_second",
      value: 4,
      thresholdId: "run-threshold-test-fixture",
      sourceEvaluationIds: ["run-evaluation-test-fixture"],
      sourceEffortIds: ["run-effort-test-fixture"],
      sourceActivityIds: ["run-activity-test-fixture"],
    });
    releaseRecordingCheckpointClaim("session-1");
  });

  it("recovers before a boundary and quarantines an impossible mid-boundary cursor", async () => {
    const value = await checkpoint();
    const beforeBoundary = {
      ...value,
      currentOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step1}`,
      completedOccurrences: [],
      boundaryJournal: [],
      revision: 1,
    };
    journalMocks.row = {
      sessionId: beforeBoundary.sessionId,
      checkpointJson: JSON.stringify(beforeBoundary),
    };
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("recovered");
    releaseRecordingCheckpointClaim("session-1");

    journalMocks.row = {
      sessionId: value.sessionId,
      checkpointJson: JSON.stringify({
        ...value,
        currentOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step1}`,
      }),
    };
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("quarantined");
  });

  it("rejects stale checkpoint revisions", async () => {
    const value = await checkpoint();
    await persistRecordingCheckpoint(value);
    await expect(persistRecordingCheckpoint(value)).rejects.toThrow("revision must increase");
  });

  it("quarantines a hash mismatch without deleting the evidence payload", async () => {
    const value = await checkpoint();
    journalMocks.row = {
      sessionId: value.sessionId,
      checkpointJson: JSON.stringify({ ...value, planHash: "f".repeat(64) }),
    };
    const result = await loadAndClaimRecordingCheckpoint("profile-1");
    expect(result.status).toBe("quarantined");
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: value.sessionId,
        profileId: "profile-1",
      }),
    );
  });

  it("quarantines a cross-profile checkpoint", async () => {
    const value = await checkpoint();
    journalMocks.row = { sessionId: value.sessionId, checkpointJson: JSON.stringify(value) };
    expect((await loadAndClaimRecordingCheckpoint("profile-2")).status).toBe("quarantined");
  });

  it("quarantines corrupt serialized checkpoint data", async () => {
    journalMocks.row = { sessionId: "session-1", checkpointJson: "{not-json" };
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("quarantined");
    expect(journalMocks.release).toHaveBeenCalledWith("session-1");
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", profileId: "profile-1" }),
    );
  });

  it.each([
    2, 4,
  ])("quarantines complete checkpoints from pre-hard-cut schema version %s", async (schemaVersion) => {
    const value = await checkpoint();
    journalMocks.row = {
      sessionId: value.sessionId,
      checkpointJson: JSON.stringify({ ...value, schemaVersion }),
    };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: value.sessionId, profileId: "profile-1" }),
    );
  });

  it("quarantines a current-version checkpoint carrying pre-hard-cut target facts", async () => {
    const value = await checkpoint();
    const { thresholds: _thresholds, ...noncanonicalTargets } = value.performanceTargets;
    journalMocks.row = {
      sessionId: value.sessionId,
      checkpointJson: JSON.stringify({
        ...value,
        performanceTargets: {
          ...noncanonicalTargets,
          contractVersion: "athlete-performance-target-facts-v2",
        },
      }),
    };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
  });

  it("fails closed when SQLite checkpoint digest validation fails", async () => {
    journalMocks.claim.mockRejectedValueOnce(new Error("sqlite-checkpoint-digest-invalid"));

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
      reason: "sqlite-checkpoint-digest-invalid",
    });
    expect(journalMocks.quarantineOrphans).toHaveBeenCalledWith("profile-1", expect.any(Function));
  });

  it("quarantines the exact SQLite row when a checkpoint session is mismatched", async () => {
    const value = await checkpoint();
    journalMocks.row = {
      sessionId: "sqlite-session",
      checkpointJson: JSON.stringify(value),
    };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sqlite-session", profileId: "profile-1" }),
    );
  });

  it("restores an exact unplanned allocation without inventing a plan", async () => {
    const unplanned = {
      schemaVersion: 5 as const,
      variant: "unplanned" as const,
      sessionId: "session-unplanned",
      profileId: "profile-1",
      lifecycle: "recording" as const,
      revision: 1,
      start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
      draft: { activity_category: "run" as const, gpsMode: "off" as const },
      summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
      executionState: { timerEvents: [], manualLapsMs: [] },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-01-01T10:00:00.000Z",
      ),
      streamArtifactPaths: ["file:///streams/unplanned"],
    };
    journalMocks.row = {
      sessionId: unplanned.sessionId,
      checkpointJson: JSON.stringify(unplanned),
    };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toEqual({
      status: "recovered",
      checkpoint: unplanned,
    });
    releaseRecordingCheckpointClaim(unplanned.sessionId);
  });

  it("uses the selected SQLite checkpoint", async () => {
    const value = await checkpoint();
    journalMocks.row = { sessionId: value.sessionId, checkpointJson: JSON.stringify(value) };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toEqual({
      status: "recovered",
      checkpoint: value,
    });
    releaseRecordingCheckpointClaim(value.sessionId);
  });

  it.each([
    [
      "planned without its plan fields",
      { schemaVersion: 2, variant: "planned", sessionId: "session", profileId: "profile-1" },
    ],
    [
      "unplanned with planned plan fields",
      {
        schemaVersion: 4,
        variant: "unplanned",
        sessionId: "session",
        profileId: "profile-1",
        lifecycle: "recording",
        revision: 1,
        planSnapshot: plan,
      },
    ],
  ])("quarantines malformed %s cross-fields", async (_label, malformed) => {
    journalMocks.row = { sessionId: "session", checkpointJson: JSON.stringify(malformed) };
    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
  });

  it("inspects current SQLite checkpoint without claiming it", async () => {
    const value = await checkpoint();
    journalMocks.row = { sessionId: value.sessionId, checkpointJson: JSON.stringify(value) };
    await expect(inspectRecordingCheckpoint("profile-1")).resolves.toEqual({
      status: "recovered",
      checkpoint: value,
    });
    expect(journalMocks.claim).not.toHaveBeenCalled();
  });

  it.each([
    "planned",
    "unplanned",
  ] as const)("quarantines an otherwise-current %s checkpoint missing targets", async (variant) => {
    const value =
      variant === "planned"
        ? await checkpoint()
        : {
            schemaVersion: 5 as const,
            variant: "unplanned" as const,
            sessionId: "session-unplanned",
            profileId: "profile-1",
            lifecycle: "recording" as const,
            revision: 1,
            start: {
              startedAt: "2026-01-01T10:00:00.000Z",
              updatedAt: "2026-01-01T10:00:01.000Z",
            },
            draft: { activity_category: "run" as const, gpsMode: "off" as const },
            summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
            executionState: { timerEvents: [], manualLapsMs: [] },
            performanceTargets: createUnavailableAthletePerformanceTargetFacts(
              "2026-01-01T10:00:00.000Z",
            ),
            streamArtifactPaths: ["file:///streams/unplanned"],
          };
    const { performanceTargets: _performanceTargets, ...legacy } = value;
    journalMocks.row = { sessionId: value.sessionId, checkpointJson: JSON.stringify(legacy) };

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
  });
});
