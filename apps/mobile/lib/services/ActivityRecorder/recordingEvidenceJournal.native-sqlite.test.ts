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

import { validateStoredRecordingEvidenceCheckpoint } from "./checkpointStorage";
import {
  allocateRecordingEvidenceSession,
  completeAcceptedRecordingEvidenceCleanup,
  createRecordingStreamJournalAdapter,
  initializeRecordingEvidenceDatabase,
  loadDueAcceptedRecordingEvidenceCleanups,
  loadRecordingEvidenceCheckpoint,
  persistRecordingEvidenceCheckpoint,
  quarantineOrphanedActiveRecordingEvidenceSessions,
  quarantineRecordingEvidenceSession,
  type RecordingEvidenceSqlExecutor,
  resetRecordingEvidenceJournalForTests,
  retryAcceptedRecordingEvidenceCleanup,
  rollbackRecordingEvidenceSession,
  setRecordingEvidenceDatabaseForTests,
} from "./recordingEvidenceJournal";

function unplannedCheckpoint(sessionId: string, profileId: string) {
  return {
    schemaVersion: 3,
    variant: "unplanned",
    sessionId,
    profileId,
    lifecycle: "recording",
    revision: 1,
    start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
    draft: { activityCategory: "run", gpsMode: "off" },
    summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
    executionState: { timerEvents: [] },
    streamArtifactPaths: ["file:///streams/checkpoint"],
  };
}

/**
 * This is intentionally not the in-memory SQL emulator used by unit tests.
 * It executes the production migration strings with Node's SQLite engine so
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

describe("recording evidence native SQLite migrations", () => {
  let close: (() => void) | undefined;
  afterEach(() => {
    resetRecordingEvidenceJournalForTests();
    close?.();
    close = undefined;
  });

  it("executes v0-to-current DDL, table rebuild, constraints, and a failed transaction rollback", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);

    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 5 }]);
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

  it("selects the sole new active checkpoint over historical finalized state without AsyncStorage", async () => {
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

  it("migrates an actual v2 duplicate per-kind stream order deterministically", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await native.executor.execAsync(`
      CREATE TABLE recording_evidence_sessions (session_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'quarantined')), next_sequence INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finalized_path TEXT, finalized_size INTEGER, finalized_sha256 TEXT, finalized_artifact_json TEXT, finalized_artifact_digest TEXT);
      CREATE TABLE recording_stream_envelopes (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), stream_kind TEXT NOT NULL, sequence INTEGER NOT NULL, stream_order INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (session_id, stream_kind, sequence), UNIQUE (session_id, stream_kind, stream_order));
      CREATE TABLE recording_evidence_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, reason TEXT NOT NULL, payload TEXT, quarantined_at INTEGER NOT NULL);
      PRAGMA user_version = 2;`);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
      "legacy",
      "profile",
      1,
    );
    for (const [kind, timestamp, payload] of [
      ["power", 2, '{"watts":200}'],
      ["gps", 1, '{"lat":1}'],
    ] as const) {
      await native.executor.runAsync(
        "INSERT INTO recording_stream_envelopes VALUES (?, ?, 0, 0, ?, ?, ?, ?, 'stream-committed-v1', 1)",
        "legacy",
        kind,
        timestamp,
        payload,
        payload.length,
        createHash("sha256").update(payload).digest("hex"),
      );
    }

    await initializeRecordingEvidenceDatabase(native.executor);
    expect(
      await native.executor.getAllAsync<{ stream_kind: string; stream_order: number }>(
        "SELECT stream_kind, stream_order FROM recording_stream_envelopes WHERE session_id = ? ORDER BY stream_order",
        "legacy",
      ),
    ).toEqual([
      { stream_kind: "gps", stream_order: 0 },
      { stream_kind: "power", stream_order: 1 },
    ]);
    expect(
      await native.executor.getAllAsync<{ next_stream_order: number }>(
        "SELECT next_stream_order FROM recording_evidence_sessions WHERE session_id = ?",
        "legacy",
      ),
    ).toEqual([{ next_stream_order: 2 }]);
  });

  it("rebuilds an actual v3 sessions CHECK for accepted while preserving FKs, indexes, and data", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await native.executor.execAsync(`
      CREATE TABLE recording_evidence_sessions (session_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'quarantined')), next_sequence INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finalized_path TEXT, finalized_size INTEGER, finalized_sha256 TEXT, finalized_artifact_json TEXT, finalized_artifact_digest TEXT, next_stream_order INTEGER NOT NULL DEFAULT 0, checkpoint_json TEXT, checkpoint_digest TEXT);
      CREATE TABLE recording_gps_envelopes (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), sequence INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, PRIMARY KEY (session_id, sequence));
      CREATE TABLE recording_evidence_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, reason TEXT NOT NULL, payload TEXT, quarantined_at INTEGER NOT NULL);
      PRAGMA user_version = 3;`);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, checkpoint_json) VALUES (?, ?, 'finalized', ?, ?)",
      "legacy-v3",
      "profile",
      1,
      '{"kept":true}',
    );
    await native.executor.runAsync(
      "INSERT INTO recording_gps_envelopes VALUES (?, 0, 1, '{}', 2, 'x', 'committed-v1')",
      "legacy-v3",
    );

    await initializeRecordingEvidenceDatabase(native.executor);
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'accepted' WHERE session_id = ?",
      "legacy-v3",
    );
    expect(
      await native.executor.getAllAsync<{ state: string; checkpoint_json: string }>(
        "SELECT state, checkpoint_json FROM recording_evidence_sessions WHERE session_id = ?",
        "legacy-v3",
      ),
    ).toEqual([{ state: "accepted", checkpoint_json: '{"kept":true}' }]);
    expect(
      await native.executor.getAllAsync<{ name: string }>(
        "PRAGMA index_list(recording_evidence_sessions)",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "one_active_recording_evidence_per_profile" }),
      ]),
    );
    await expect(
      native.executor.runAsync(
        "INSERT INTO recording_gps_envelopes VALUES (?, 0, 1, '{}', 2, 'x', 'committed-v1')",
        "missing",
      ),
    ).rejects.toThrow();
  });

  it("rolls back an injected v4 rebuild failure without advancing user_version, then retries", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await native.executor.execAsync(`
      CREATE TABLE recording_evidence_sessions (session_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'quarantined')), next_sequence INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finalized_path TEXT, finalized_size INTEGER, finalized_sha256 TEXT, finalized_artifact_json TEXT, finalized_artifact_digest TEXT, next_stream_order INTEGER NOT NULL DEFAULT 0, checkpoint_json TEXT, checkpoint_digest TEXT);
      CREATE TABLE recording_evidence_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, reason TEXT NOT NULL, payload TEXT, quarantined_at INTEGER NOT NULL);
      PRAGMA user_version = 3;`);
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
      "retry-v4",
      "profile",
      1,
    );
    let fail = true;
    const failing: RecordingEvidenceSqlExecutor = {
      ...native.executor,
      async execAsync(source) {
        await native.executor.execAsync(source);
        if (fail && source.includes("ALTER TABLE recording_evidence_sessions_v4 RENAME")) {
          fail = false;
          throw new Error("injected-v4-rebuild-failure");
        }
      },
      async withExclusiveTransactionAsync(task) {
        await native.executor.withExclusiveTransactionAsync(async () => task(failing));
      },
    };
    await expect(initializeRecordingEvidenceDatabase(failing)).rejects.toThrow(
      "injected-v4-rebuild-failure",
    );
    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 3 }]);
    expect(
      await native.executor.getAllAsync<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recording_evidence_sessions'",
      ),
    ).toEqual([expect.objectContaining({ sql: expect.stringContaining("'quarantined'") })]);
    await initializeRecordingEvidenceDatabase(native.executor);
    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 5 }]);
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
      ["schema-invalid", JSON.stringify({ schemaVersion: 3, variant: "unplanned" })],
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

  it("falls back from stale compatibility IDs to orphan inspection without quarantining a valid peer", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    await allocateRecordingEvidenceSession({ sessionId: "orphan", profileId: "profile" });
    const malformed = JSON.stringify({ schemaVersion: 3, variant: "unplanned" });
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
        sessionId: "stale-compatibility-id",
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
