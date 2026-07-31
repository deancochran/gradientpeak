import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-sqlite", () => ({ openDatabaseAsync: vi.fn() }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
  ),
}));

import { loadDueActivitySubmissionQueueJobs } from "../activitySubmissionQueue/storage";
import { activitySubmissionQueueJobSchema } from "../activitySubmissionQueue/types";
import { validateStoredRecordingEvidenceCheckpoint } from "./checkpointStorage";
import {
  allocateRecordingEvidenceSession,
  claimRecordingEvidenceCheckpoint,
  clearRecordingEvidenceCheckpoint,
  completeAcceptedRecordingEvidenceCleanup,
  completeDiscardedRecordingEvidenceCleanup,
  createFinalizedArtifactQueueHandoff,
  createRecordingStreamJournalAdapter,
  discardFinalizedRecordingEvidence,
  garbageCollectExpiredRecordingEvidence,
  hasQuarantinedRecordingEvidence,
  initializeRecordingEvidenceDatabase,
  loadDueAcceptedRecordingEvidenceCleanups,
  loadDueDiscardedRecordingEvidenceCleanups,
  loadFinalizedArtifactHandoffs,
  loadRecordingEvidenceCheckpoint,
  MAX_QUARANTINE_ROWS_PER_PROFILE,
  MAX_QUARANTINE_ROWS_PER_SESSION,
  persistRecordingEvidenceCheckpoint,
  QUARANTINED_EVIDENCE_RETENTION_MS,
  quarantineOrphanedActiveRecordingEvidenceSessions,
  quarantineRecordingEvidenceSession,
  type RecordingEvidenceSqlExecutor,
  readRecordingEvidenceCheckpoint,
  releaseRecordingEvidenceCheckpointClaim,
  resetRecordingEvidenceJournalForTests,
  retryAcceptedRecordingEvidenceCleanup,
  rollbackRecordingEvidenceSession,
  setRecordingEvidenceDatabaseForTests,
} from "./recordingEvidenceJournal";

function unplannedCheckpoint(sessionId: string, profileId: string) {
  return {
    schemaVersion: 4,
    variant: "unplanned",
    sessionId,
    profileId,
    lifecycle: "recording",
    revision: 1,
    start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
    draft: { activity_category: "run", gpsMode: "off" },
    summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
    executionState: { timerEvents: [] },
    streamArtifactPaths: ["file:///streams/checkpoint"],
  };
}

/**
 * This is intentionally not the in-memory SQL emulator used by unit tests.
 * It executes the production schema strings with Node's SQLite engine so
 * SQLite CHECK/FK/DDL and transaction syntax are actually exercised in CI.
 */
async function nativeExecutor(): Promise<{
  close(): void;
  executor: RecordingEvidenceSqlExecutor;
}> {
  // The mobile TS config intentionally targets Node typings which may predate
  // node:sqlite. `require` keeps the optional runtime module out of TS module
  // resolution while still running the real engine when Node provides it.
  const sqlite = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (
      path: string,
    ) => {
      exec(source: string): void;
      prepare(source: string): {
        all(...params: unknown[]): unknown[];
        run(...params: unknown[]): { changes: number };
      };
      close(): void;
    };
  };
  const db = new sqlite.DatabaseSync(":memory:");
  const executor: RecordingEvidenceSqlExecutor = {
    async execAsync(source: string) {
      db.exec(source);
    },
    async runAsync(source: string, ...params: unknown[]) {
      return db.prepare(source).run(...params);
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      return db.prepare(source).all(...params) as T[];
    },
    async withExclusiveTransactionAsync(task) {
      db.exec("BEGIN EXCLUSIVE");
      try {
        await task(executor);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { close: () => db.close(), executor };
}

describe("recording evidence native SQLite schema", () => {
  let close: (() => void) | undefined;
  afterEach(() => {
    resetRecordingEvidenceJournalForTests();
    close?.();
    close = undefined;
  });

  it("creates the current schema from version zero and reopens it with constraints and foreign keys", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);

    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 5 }]);
    await initializeRecordingEvidenceDatabase(native.executor);
    expect(
      await native.executor.getAllAsync<{ foreign_keys: number }>("PRAGMA foreign_keys"),
    ).toEqual([{ foreign_keys: 1 }]);
    expect(
      await native.executor.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity_submission_migration_items'",
      ),
    ).toEqual([]);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
      "session-a",
      "profile-a",
      1,
    );
    await expect(
      native.executor.runAsync(
        "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
        "session-b",
        "profile-a",
        2,
      ),
    ).rejects.toThrow();
    await expect(
      native.executor.runAsync(
        "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, 0, 1, '{}', 2, 'x', 'committed-v1')",
        "missing-session",
      ),
    ).rejects.toThrow();

    await expect(
      native.executor.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'fenced', ?)",
          "rolled-back",
          "profile-b",
          3,
        );
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        "rolled-back",
      ),
    ).toEqual([]);
  });

  it("selects the sole active checkpoint over historical finalized state", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, checkpoint_json, checkpoint_digest) VALUES (?, ?, 'finalized', ?, ?, ?)",
      "historical",
      "profile",
      1,
      '{"session":"historical"}',
      createHash("sha256").update('{"session":"historical"}').digest("hex"),
    );
    await allocateRecordingEvidenceSession({ sessionId: "active", profileId: "profile" });
    await persistRecordingEvidenceCheckpoint({
      sessionId: "active",
      profileId: "profile",
      checkpoint: { session: "active" },
    });

    await expect(loadRecordingEvidenceCheckpoint("profile")).resolves.toBe('{"session":"active"}');
    expect(
      await native.executor.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        "historical",
      ),
    ).toEqual([{ state: "finalized" }]);
  });

  it("claims, clears, and reports quarantine state through SQLite", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await allocateRecordingEvidenceSession({ sessionId: "checkpoint", profileId: "profile" });
    await persistRecordingEvidenceCheckpoint({
      sessionId: "checkpoint",
      profileId: "profile",
      checkpoint: unplannedCheckpoint("checkpoint", "profile"),
    });

    await expect(claimRecordingEvidenceCheckpoint("profile")).resolves.toMatchObject({
      sessionId: "checkpoint",
    });
    await expect(claimRecordingEvidenceCheckpoint("profile")).resolves.toBeNull();
    releaseRecordingEvidenceCheckpointClaim("checkpoint");
    await clearRecordingEvidenceCheckpoint("checkpoint");
    await expect(readRecordingEvidenceCheckpoint("profile")).resolves.toBeNull();
    expect(await hasQuarantinedRecordingEvidence()).toBe(false);

    await persistRecordingEvidenceCheckpoint({
      sessionId: "checkpoint",
      profileId: "profile",
      checkpoint: unplannedCheckpoint("checkpoint", "profile"),
    });
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_digest = ? WHERE session_id = ?",
      "invalid",
      "checkpoint",
    );
    await expect(readRecordingEvidenceCheckpoint("profile")).rejects.toThrow(
      "sqlite-checkpoint-digest-invalid",
    );
    expect(
      await native.executor.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        "checkpoint",
      ),
    ).toEqual([{ state: "quarantined" }]);
    expect(await hasQuarantinedRecordingEvidence()).toBe(true);
  });

  it("durably discards a finalized session before restart handoff, with owner validation and idempotency", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path) VALUES (?, ?, 'finalized', ?, ?)",
      "discarded-session",
      "profile",
      1,
      "file:///discarded.fit",
    );

    await expect(
      discardFinalizedRecordingEvidence({
        sessionId: "discarded-session",
        profileId: "other-profile",
        activityFilePath: "file:///discarded.fit",
        streamArtifactPaths: [],
      }),
    ).rejects.toThrow("owner does not match");
    await discardFinalizedRecordingEvidence({
      sessionId: "discarded-session",
      profileId: "profile",
      activityFilePath: "file:///discarded.fit",
      streamArtifactPaths: [],
    });
    await discardFinalizedRecordingEvidence({
      sessionId: "discarded-session",
      profileId: "profile",
      activityFilePath: "file:///discarded.fit",
      streamArtifactPaths: [],
    });

    expect(
      await native.executor.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        "discarded-session",
      ),
    ).toEqual([{ state: "quarantined" }]);
    await expect(loadFinalizedArtifactHandoffs("profile")).resolves.toEqual([]);
    expect(
      await native.executor.getAllAsync<{ reason: string }>(
        "SELECT reason FROM recording_evidence_quarantine WHERE session_id = ?",
        "discarded-session",
      ),
    ).toEqual([{ reason: "user-discarded-finalized-recording" }]);
  });

  it("atomically fences stale handoff and eventually collects discarded queue evidence", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = "retained-discard";
    const profileId = "profile";
    const now = Date.now();
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path) VALUES (?, ?, 'finalized', ?, ?)",
      sessionId,
      profileId,
      now - 31 * 24 * 60 * 60 * 1000,
      "file:///discard.fit",
    );
    await native.executor.runAsync(
      "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, 0, 1, '{}', 2, 'digest', 'committed-v1')",
      sessionId,
    );
    const job = activitySubmissionQueueJobSchema.parse({
      schemaVersion: 3,
      id: sessionId,
      artifactId: sessionId,
      sessionId,
      localActivityFilePath: "file:///discard.fit",
      streamArtifactPaths: [],
      executionManifest: {
        version: 1,
        compilerVersion: 1,
        planHash: "0".repeat(64),
        occurrences: [],
      },
      draft: {
        recordingSessionId: sessionId,
        profileId,
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T01:00:00.000Z",
        name: "Ride",
        activity_category: "bike",
        durationSeconds: 1,
        movingSeconds: 1,
        distanceMeters: 1,
      },
      status: "queued",
      attempts: 0,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    expect(await createFinalizedArtifactQueueHandoff(job)).toBe("created");
    expect(await createFinalizedArtifactQueueHandoff(job)).toBe("existing");
    expect(
      await createFinalizedArtifactQueueHandoff({ ...job, id: "absent", sessionId: "absent" }),
    ).toBe("absent");
    await expect(
      createFinalizedArtifactQueueHandoff({
        ...job,
        id: "wrong-profile",
        draft: { ...job.draft, profileId: "other-profile" },
      }),
    ).rejects.toThrow("different profile");
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path) VALUES (?, ?, 'fenced', ?, ?)",
      "fenced-session",
      profileId,
      now,
      "file:///fenced.fit",
    );
    expect(
      await createFinalizedArtifactQueueHandoff({
        ...job,
        id: "fenced-session",
        artifactId: "fenced-session",
        sessionId: "fenced-session",
        localActivityFilePath: "file:///fenced.fit",
        draft: { ...job.draft, recordingSessionId: "fenced-session" },
      }),
    ).toBe("rejected");
    await discardFinalizedRecordingEvidence({
      sessionId,
      profileId,
      activityFilePath: "file:///discard.fit",
      streamArtifactPaths: [],
    });
    expect(await createFinalizedArtifactQueueHandoff(job)).toBe("discarded");
    expect(await loadDueActivitySubmissionQueueJobs(profileId, now)).toEqual([]);
    await completeDiscardedRecordingEvidenceCleanup(sessionId);
    expect(await garbageCollectExpiredRecordingEvidence(now)).toBe(1);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_gps_envelopes WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([]);
  });

  it.each([
    { label: "queued", status: "queued" as const },
    {
      label: "uploaded but not created",
      status: "creating_activity" as const,
      uploadCompletedAt: "2026-01-01T01:00:00.000Z",
      ingestionId: "ingestion-1",
    },
    {
      label: "transient failed",
      status: "failed" as const,
      retryClass: "transient" as const,
      nextAttemptAt: "2026-01-02T00:00:00.000Z",
      errorCategory: "transient",
    },
  ])("collects discard-fenced $label queue evidence after retention", async (state) => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = `discard-${state.label}`;
    const { label: _label, ...queueState } = state;
    const profileId = "profile";
    const now = Date.now();
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path) VALUES (?, ?, 'finalized', ?, ?)",
      sessionId,
      profileId,
      now - 31 * 24 * 60 * 60 * 1000,
      `file:///${sessionId}.fit`,
    );
    await native.executor.runAsync(
      "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, 0, 1, '{}', 2, 'digest', 'committed-v1')",
      sessionId,
    );
    await native.executor.runAsync(
      "INSERT INTO recording_stream_envelopes (session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version) VALUES (?, 'power', 0, 0, 1, '{}', 2, 'digest', 'stream-committed-v1', 1)",
      sessionId,
    );
    const job = activitySubmissionQueueJobSchema.parse({
      schemaVersion: 3,
      id: sessionId,
      artifactId: sessionId,
      sessionId,
      localActivityFilePath: `file:///${sessionId}.fit`,
      streamArtifactPaths: [],
      executionManifest: {
        version: 1,
        compilerVersion: 1,
        planHash: "0".repeat(64),
        occurrences: [],
      },
      draft: {
        recordingSessionId: sessionId,
        profileId,
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T01:00:00.000Z",
        name: "Ride",
        activity_category: "bike",
        durationSeconds: 1,
        movingSeconds: 1,
        distanceMeters: 1,
      },
      attempts: 1,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      ...queueState,
    });
    expect(await createFinalizedArtifactQueueHandoff(job)).toBe("created");
    await discardFinalizedRecordingEvidence({
      sessionId,
      profileId,
      activityFilePath: `file:///${sessionId}.fit`,
      streamArtifactPaths: [],
    });
    expect(
      await native.executor.getAllAsync<{
        status: string;
        retry_class: string;
        error_category: string;
        lease_owner: string | null;
      }>(
        "SELECT status, retry_class, error_category, lease_owner FROM activity_submission_queue_jobs WHERE id = ?",
        sessionId,
      ),
    ).toEqual([
      {
        status: "failed",
        retry_class: "permanent",
        error_category: "discarded",
        lease_owner: null,
      },
    ]);
    expect(await loadDueActivitySubmissionQueueJobs(profileId, now)).toEqual([]);
    await completeDiscardedRecordingEvidenceCleanup(sessionId);
    expect(await garbageCollectExpiredRecordingEvidence(now)).toBe(1);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_gps_envelopes WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_stream_envelopes WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([]);
  });

  it("never ages or caps a pending discard cleanup before it is completed", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = "pending-discard-cleanup";
    const profileId = "profile";
    const now = Date.now();
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path) VALUES (?, ?, 'finalized', ?, ?)",
      sessionId,
      profileId,
      now - QUARANTINED_EVIDENCE_RETENTION_MS - 1,
      "file:///pending.fit",
    );
    await discardFinalizedRecordingEvidence({
      sessionId,
      profileId,
      activityFilePath: "file:///pending.fit",
      streamArtifactPaths: [],
      now,
    });
    await native.executor.runAsync(
      "UPDATE recording_evidence_quarantine SET quarantined_at = ? WHERE session_id = ?",
      now - QUARANTINED_EVIDENCE_RETENTION_MS - 1,
      sessionId,
    );
    for (let index = 0; index <= MAX_QUARANTINE_ROWS_PER_PROFILE; index += 1) {
      await native.executor.runAsync(
        "INSERT INTO recording_evidence_quarantine (session_id, reason, quarantined_at) VALUES (?, 'newer-test-row', ?)",
        sessionId,
        now + index,
      );
    }
    expect(MAX_QUARANTINE_ROWS_PER_PROFILE).toBeGreaterThan(MAX_QUARANTINE_ROWS_PER_SESSION);
    await garbageCollectExpiredRecordingEvidence(now);
    expect(await loadDueDiscardedRecordingEvidenceCleanups(now)).toEqual([
      { sessionId, activityFilePath: "file:///pending.fit", streamArtifactPaths: [] },
    ]);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([{ session_id: sessionId }]);
    await completeDiscardedRecordingEvidenceCleanup(sessionId);
    expect(await garbageCollectExpiredRecordingEvidence(now)).toBe(1);
  });

  it("persists bounded accepted-cleanup retry timing and clears it exactly once on success", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path, cleanup_pending, cleanup_attempts, next_cleanup_at) VALUES (?, ?, 'accepted', ?, ?, 1, 0, ?)",
      "accepted",
      "profile",
      1,
      "file:///accepted.fit",
      10_000,
    );
    await retryAcceptedRecordingEvidenceCleanup("accepted", "disk-busy", 10_000);
    expect(await loadDueAcceptedRecordingEvidenceCleanups(11_999)).toEqual([]);
    expect(await loadDueAcceptedRecordingEvidenceCleanups(12_000)).toEqual([
      { sessionId: "accepted", activityFilePath: "file:///accepted.fit", streamArtifactPaths: [] },
    ]);
    expect(
      await native.executor.getAllAsync<{
        cleanup_attempts: number;
        cleanup_error: string;
        next_cleanup_at: number;
      }>(
        "SELECT cleanup_attempts, cleanup_error, next_cleanup_at FROM recording_evidence_sessions WHERE session_id = ?",
        "accepted",
      ),
    ).toEqual([{ cleanup_attempts: 1, cleanup_error: "disk-busy", next_cleanup_at: 12_000 }]);
    await completeAcceptedRecordingEvidenceCleanup("accepted");
    expect(await loadDueAcceptedRecordingEvidenceCleanups(12_000)).toEqual([]);
    expect(
      await native.executor.getAllAsync<{ cleanup_pending: number; finalized_path: string | null }>(
        "SELECT cleanup_pending, finalized_path FROM recording_evidence_sessions WHERE session_id = ?",
        "accepted",
      ),
    ).toEqual([{ cleanup_pending: 0, finalized_path: null }]);
  });

  it("retains a committed stream after start rollback but releases the active slot for retry", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await allocateRecordingEvidenceSession({ sessionId: "failed-start", profileId: "profile" });
    const stream = createRecordingStreamJournalAdapter({
      sessionId: "failed-start",
      profileId: "profile",
    });
    await stream.append([{ streamKind: "power", timestamp: 1, payload: '{"watts":200}' }]);

    await rollbackRecordingEvidenceSession("failed-start", "producer-failed");
    expect(await stream.recover()).toEqual([
      expect.objectContaining({ streamKind: "power", payload: '{"watts":200}' }),
    ]);
    expect(
      await native.executor.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        "failed-start",
      ),
    ).toEqual([{ state: "quarantined" }]);
    await expect(
      allocateRecordingEvidenceSession({ sessionId: "retry", profileId: "profile" }),
    ).resolves.toBeUndefined();
  });

  it("rolls back an interrupted fresh create, then retries the current schema", async () => {
    const native = await nativeExecutor();
    close = native.close;
    let fail = true;
    const failing: RecordingEvidenceSqlExecutor = {
      ...native.executor,
      async execAsync(source) {
        if (fail && source.includes("PRAGMA user_version = 5")) {
          fail = false;
          throw new Error("injected-create-failure");
        }
        await native.executor.execAsync(source);
      },
      async withExclusiveTransactionAsync(task) {
        await native.executor.withExclusiveTransactionAsync(async () => task(failing));
      },
    };
    await expect(initializeRecordingEvidenceDatabase(failing)).rejects.toThrow(
      "injected-create-failure",
    );
    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 0 }]);
    expect(
      await native.executor.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_evidence_sessions'",
      ),
    ).toEqual([]);
    await initializeRecordingEvidenceDatabase(native.executor);
    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 5 }]);
  });

  it.each([1, 6])("rejects schema version %i without mutating its database", async (version) => {
    const native = await nativeExecutor();
    close = native.close;
    await native.executor.execAsync(
      `CREATE TABLE preserved_rows (value TEXT); PRAGMA user_version = ${version};`,
    );
    await native.executor.runAsync("INSERT INTO preserved_rows VALUES ('preserved')");

    await expect(initializeRecordingEvidenceDatabase(native.executor)).rejects.toThrow(
      "unsupported-recording-evidence-schema",
    );
    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: version }]);
    expect(await native.executor.getAllAsync("SELECT value FROM preserved_rows")).toEqual([
      { value: "preserved" },
    ]);
    expect(
      await native.executor.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_evidence_sessions'",
      ),
    ).toEqual([]);
  });

  it("quarantines only the matching active owner and retains committed bytes", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await allocateRecordingEvidenceSession({ sessionId: "target", profileId: "profile" });
    const stream = createRecordingStreamJournalAdapter({
      sessionId: "target",
      profileId: "profile",
    });
    await stream.append([{ streamKind: "power", timestamp: 1, payload: '{"watts":200}' }]);
    await expect(
      quarantineRecordingEvidenceSession({
        sessionId: "target",
        profileId: "other",
        reason: "wrong-owner",
      }),
    ).resolves.toBe(false);
    await expect(
      quarantineRecordingEvidenceSession({
        sessionId: "target",
        profileId: "profile",
        reason: "discarded",
      }),
    ).resolves.toBe(true);
    expect(await stream.recover()).toHaveLength(1);
    await expect(
      allocateRecordingEvidenceSession({ sessionId: "replacement", profileId: "profile" }),
    ).resolves.toBeUndefined();
  });

  it("quarantines digest-valid schema-invalid and owner-mismatched orphan checkpoints", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    for (const [sessionId, checkpoint] of [
      ["schema-invalid", JSON.stringify({ schemaVersion: 4, variant: "unplanned" })],
      ["owner-mismatch", JSON.stringify(unplannedCheckpoint("other-session", "other-profile"))],
    ] as const) {
      await allocateRecordingEvidenceSession({ sessionId, profileId: "profile" });
      await native.executor.runAsync(
        "UPDATE recording_evidence_sessions SET checkpoint_json = ?, checkpoint_digest = ? WHERE session_id = ?",
        checkpoint,
        createHash("sha256").update(checkpoint).digest("hex"),
        sessionId,
      );
      expect(
        await quarantineOrphanedActiveRecordingEvidenceSessions(
          "profile",
          validateStoredRecordingEvidenceCheckpoint,
        ),
      ).toBe(1);
    }
    await expect(
      allocateRecordingEvidenceSession({ sessionId: "replacement", profileId: "profile" }),
    ).resolves.toBeUndefined();
  });

  it("quarantines invalid SQLite checkpoint rows without affecting a valid peer", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await allocateRecordingEvidenceSession({ sessionId: "orphan", profileId: "profile" });
    const malformed = JSON.stringify({ schemaVersion: 4, variant: "unplanned" });
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_json = ?, checkpoint_digest = ? WHERE session_id = ?",
      malformed,
      createHash("sha256").update(malformed).digest("hex"),
      "orphan",
    );
    await allocateRecordingEvidenceSession({ sessionId: "valid-peer", profileId: "peer-profile" });
    const peer = JSON.stringify(unplannedCheckpoint("valid-peer", "peer-profile"));
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_json = ?, checkpoint_digest = ? WHERE session_id = ?",
      peer,
      createHash("sha256").update(peer).digest("hex"),
      "valid-peer",
    );

    expect(
      await quarantineRecordingEvidenceSession({
        sessionId: "missing-session",
        profileId: "profile",
        reason: "checkpoint-invalid",
      }),
    ).toBe(false);
    expect(
      await quarantineOrphanedActiveRecordingEvidenceSessions(
        "profile",
        validateStoredRecordingEvidenceCheckpoint,
      ),
    ).toBe(1);
    expect(
      await native.executor.getAllAsync<{ state: string; checkpoint_json: string }>(
        "SELECT state, checkpoint_json FROM recording_evidence_sessions WHERE session_id = ?",
        "orphan",
      ),
    ).toEqual([{ state: "quarantined", checkpoint_json: malformed }]);
    expect(
      await native.executor.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        "valid-peer",
      ),
    ).toEqual([{ state: "active" }]);
    await expect(
      allocateRecordingEvidenceSession({ sessionId: "replacement", profileId: "profile" }),
    ).resolves.toBeUndefined();
  });
});
