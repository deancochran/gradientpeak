import { createHash } from "node:crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RecordingCheckpoint } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRecorderCheckpoint } from "./checkpointStorage";
import {
  ACTIVE_RECORDING_CHECKPOINT_KEY,
  hashRecordingPlan,
  loadAndClaimRecordingCheckpoint,
  persistRecordingCheckpoint,
  QUARANTINED_RECORDING_CHECKPOINT_KEY,
  releaseRecordingCheckpointClaim,
} from "./checkpointStorage";

const storage = new Map<string, string>();
const journalMocks = vi.hoisted(() => ({
  persist: vi.fn(async () => undefined),
  load: vi.fn(async (): Promise<string | null> => null),
  quarantineSession: vi.fn(async () => false),
  quarantineOrphans: vi.fn(async () => 0),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn(async (key: string) => storage.delete(key)),
  },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
  ),
}));
vi.mock("./recordingEvidenceJournal", () => ({
  persistRecordingEvidenceCheckpoint: journalMocks.persist,
  loadRecordingEvidenceCheckpoint: journalMocks.load,
  quarantineRecordingEvidenceSession: journalMocks.quarantineSession,
  quarantineOrphanedActiveRecordingEvidenceSessions: journalMocks.quarantineOrphans,
}));

const ids = {
  segment: "00000000-0000-4000-8000-000000000001",
  interval: "00000000-0000-4000-8000-000000000002",
  step1: "00000000-0000-4000-8000-000000000003",
  step2: "00000000-0000-4000-8000-000000000004",
};
const plan = {
  version: 3 as const,
  segments: [
    {
      id: ids.segment,
      role: "activity" as const,
      name: "Run",
      activity_category: "run" as const,
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
  return {
    schemaVersion: 2,
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
    streamArtifactPaths: ["file:///streams"],
    revision: 2,
  };
}

describe("recording checkpoint recovery", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    journalMocks.load.mockResolvedValue(null);
  });

  it("recovers a process death after the completed boundary was durably committed", async () => {
    const value = await checkpoint();
    await persistRecordingCheckpoint(value);
    const result = await loadAndClaimRecordingCheckpoint("profile-1");
    expect(result).toEqual({ status: "recovered", checkpoint: value });
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
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(beforeBoundary));
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("recovered");
    releaseRecordingCheckpointClaim("session-1");

    storage.set(
      ACTIVE_RECORDING_CHECKPOINT_KEY,
      JSON.stringify({
        ...value,
        currentOccurrenceId: `activity:${ids.segment}:${ids.interval}:0:${ids.step1}`,
      }),
    );
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("quarantined");
  });

  it("rejects stale checkpoint revisions", async () => {
    const value = await checkpoint();
    await persistRecordingCheckpoint(value);
    await expect(persistRecordingCheckpoint(value)).rejects.toThrow("revision must increase");
  });

  it("quarantines a hash mismatch without deleting the evidence payload", async () => {
    const value = await checkpoint();
    storage.set(
      ACTIVE_RECORDING_CHECKPOINT_KEY,
      JSON.stringify({ ...value, planHash: "f".repeat(64) }),
    );
    const result = await loadAndClaimRecordingCheckpoint("profile-1");
    expect(result.status).toBe("quarantined");
    expect(storage.has(ACTIVE_RECORDING_CHECKPOINT_KEY)).toBe(false);
    expect(storage.get(QUARANTINED_RECORDING_CHECKPOINT_KEY)).toContain("streamArtifactPaths");
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: value.sessionId,
        profileId: "profile-1",
      }),
    );
  });

  it("quarantines a cross-profile checkpoint", async () => {
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(await checkpoint()));
    expect((await loadAndClaimRecordingCheckpoint("profile-2")).status).toBe("quarantined");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ACTIVE_RECORDING_CHECKPOINT_KEY);
  });

  it("quarantines corrupt serialized checkpoint data", async () => {
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, "{not-json");
    expect((await loadAndClaimRecordingCheckpoint("profile-1")).status).toBe("quarantined");
    expect(storage.get(QUARANTINED_RECORDING_CHECKPOINT_KEY)).toContain("{not-json");
    expect(journalMocks.quarantineOrphans).toHaveBeenCalledWith("profile-1", expect.any(Function));
  });

  it("clears compatibility storage when authoritative checkpoint digest validation fails", async () => {
    const value = await checkpoint();
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(value));
    journalMocks.load.mockRejectedValueOnce(new Error("sqlite-checkpoint-digest-invalid"));

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
      reason: "sqlite-checkpoint-digest-invalid",
    });
    expect(storage.has(ACTIVE_RECORDING_CHECKPOINT_KEY)).toBe(false);
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: value.sessionId,
        profileId: "profile-1",
      }),
    );
  });

  it("falls back to orphan inspection when stale compatibility IDs do not quarantine an active row", async () => {
    const stale = { sessionId: "stale-session", profileId: "profile-1" };
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(stale));
    journalMocks.load.mockResolvedValue(JSON.stringify(stale));
    journalMocks.quarantineSession.mockResolvedValueOnce(false);

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(expect.objectContaining(stale));
    expect(journalMocks.quarantineOrphans).toHaveBeenCalledWith("profile-1", expect.any(Function));
  });

  it("restores an exact unplanned allocation without inventing a plan", async () => {
    const unplanned = {
      schemaVersion: 4 as const,
      variant: "unplanned" as const,
      sessionId: "session-unplanned",
      profileId: "profile-1",
      lifecycle: "recording" as const,
      revision: 1,
      start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
      draft: { activity_category: "run" as const, gpsMode: "off" as const },
      summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
      executionState: { timerEvents: [] },
      streamArtifactPaths: ["file:///streams/unplanned"],
    };
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(unplanned));

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toEqual({
      status: "recovered",
      checkpoint: unplanned,
    });
    releaseRecordingCheckpointClaim(unplanned.sessionId);
  });

  it("uses the SQLite-selected active checkpoint when the AsyncStorage mirror is absent", async () => {
    const value = await checkpoint();
    journalMocks.load.mockResolvedValue(JSON.stringify(value));

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toEqual({
      status: "recovered",
      checkpoint: value,
    });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
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
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(malformed));
    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
  });

  it("quarantines the pre-cutover unplanned checkpoint shape", async () => {
    const legacy = {
      schemaVersion: 3,
      variant: "unplanned",
      sessionId: "legacy-session",
      profileId: "profile-1",
      lifecycle: "recording",
      revision: 1,
      start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
      draft: { activityCategory: "run", gpsMode: "off" },
      summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
      executionState: { timerEvents: [] },
      streamArtifactPaths: ["file:///streams/legacy"],
    };
    storage.set(ACTIVE_RECORDING_CHECKPOINT_KEY, JSON.stringify(legacy));

    await expect(loadAndClaimRecordingCheckpoint("profile-1")).resolves.toMatchObject({
      status: "quarantined",
    });
    expect(journalMocks.quarantineSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "legacy-session", profileId: "profile-1" }),
    );
  });
});
