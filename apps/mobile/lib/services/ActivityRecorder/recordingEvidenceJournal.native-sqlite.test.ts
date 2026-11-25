import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";
import { createUnavailableAthletePerformanceTargetFacts } from "@repo/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const sqliteMocks = vi.hoisted(() => ({
  deleteDatabaseAsync: vi.fn(),
  openDatabaseAsync: vi.fn(),
}));

vi.mock("expo-sqlite", () => sqliteMocks);
vi.mock("expo-file-system", () => ({
  Paths: {
    document: { uri: "file:///documents/" },
    cache: { uri: "file:///cache/" },
  },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
  ),
}));

import { createContractEpochInitializer } from "../../contract-epoch/contractEpochMigration";
import {
  claimDueActivitySubmissionQueueJob,
  loadDueActivitySubmissionQueueJobs,
  upsertActivitySubmissionQueueJob,
} from "../activitySubmissionQueue/storage";
import { activitySubmissionQueueJobSchema } from "../activitySubmissionQueue/types";
import {
  inspectRecordingCheckpoint,
  persistRecordingCheckpoint,
  type UnplannedRecordingCheckpoint,
  validateStoredRecordingEvidenceCheckpoint,
} from "./checkpointStorage";
import {
  allocateRecordingEvidenceSession,
  claimRecordingEvidenceCheckpoint,
  clearRecordingEvidenceCheckpoint,
  completeAcceptedRecordingEvidenceCleanup,
  completeDiscardedRecordingEvidenceCleanup,
  completeExactRecordingEvidenceCleanup,
  createFinalizedArtifactQueueHandoff,
  createRecordingStreamJournalAdapter,
  discardFinalizedRecordingEvidence,
  fenceRecordingEvidenceSession,
  garbageCollectExpiredRecordingEvidence,
  hasQuarantinedRecordingEvidence,
  initializeRecordingEvidenceDatabase,
  loadDueAcceptedRecordingEvidenceCleanups,
  loadDueDiscardedRecordingEvidenceCleanups,
  loadFinalizedArtifactHandoffs,
  loadRecordingEvidenceCheckpoint,
  MAX_QUARANTINE_ROWS_PER_PROFILE,
  MAX_QUARANTINE_ROWS_PER_SESSION,
  migrateRecordingEvidenceForContractEpoch,
  persistRecordingEvidenceCheckpoint,
  prepareExactRecordingEvidenceCleanup,
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
import { canonicalRecordingEvidenceUris } from "./recordingEvidencePaths";

function unplannedCheckpoint(sessionId: string, profileId: string): UnplannedRecordingCheckpoint {
  return {
    schemaVersion: 5,
    variant: "unplanned",
    sessionId,
    profileId,
    lifecycle: "recording",
    revision: 1,
    start: { startedAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:01.000Z" },
    draft: { activity_category: "run", gpsMode: "off" },
    summary: { elapsedSeconds: 1, movingSeconds: 1, distanceMeters: 0 },
    executionState: { timerEvents: [], manualLapsMs: [] },
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(
      "2026-01-01T10:00:00.000Z",
      profileId,
    ),
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
    sqliteMocks.deleteDatabaseAsync.mockReset();
    sqliteMocks.openDatabaseAsync.mockReset();
  });

  it("resumes an interrupted epoch migration without deleting evidence, files, or queue rows", async () => {
    expect(CURRENT_CONTRACT_EPOCH).toBe(3);
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const plannedCheckpoint = JSON.stringify({
      schemaVersion: 5,
      variant: "planned",
      sessionId: "planned-active",
      profileId: "profile-epoch-upgrade",
    });
    const compatibleCheckpoint = JSON.stringify(
      unplannedCheckpoint("unplanned-active", "profile-compatible"),
    );
    for (const [sessionId, profileId, checkpoint] of [
      ["planned-active", "profile-epoch-upgrade", plannedCheckpoint],
      ["unplanned-active", "profile-compatible", compatibleCheckpoint],
    ] as const) {
      await native.executor.runAsync(
        "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, checkpoint_json, checkpoint_digest) VALUES (?, ?, 'active', ?, ?, ?)",
        sessionId,
        profileId,
        1,
        checkpoint,
        createHash("sha256").update(checkpoint).digest("hex"),
      );
    }
    await native.executor.runAsync(
      "INSERT INTO recording_stream_envelopes (session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version) VALUES (?, 'power', 0, 0, 1, ?, ?, ?, 'stream-committed-v1', 1)",
      "planned-active",
      '{"watts":200}',
      13,
      createHash("sha256").update('{"watts":200}').digest("hex"),
    );
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, finalized_path, finalized_artifact_json) VALUES (?, ?, 'finalized', ?, ?, ?)",
      "invalid-finalized",
      "profile-epoch-upgrade",
      2,
      "file:///documents/recording_evidence_invalid-finalized/fit/activity.fit",
      '{"schemaVersion":1}',
    );
    const compatibleJob = activitySubmissionQueueJobSchema.parse({
      schemaVersion: 3,
      id: "compatible-job",
      artifactId: "compatible-artifact",
      sessionId: "compatible-session",
      localActivityFilePath: "file:///documents/compatible.fit",
      streamArtifactPaths: ["file:///documents/compatible-streams/"],
      executionManifest: {
        version: 1,
        compilerVersion: 3,
        planHash: "0".repeat(64),
        occurrences: [],
      },
      draft: {
        recordingSessionId: "compatible-session",
        profileId: "profile-epoch-upgrade",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T01:00:00.000Z",
        name: "Unsent recording",
        activity_category: "bike",
        durationSeconds: 1,
        movingSeconds: 1,
        distanceMeters: 1,
      },
      status: "queued",
      attempts: 0,
      createdAt: "2026-01-01T01:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
    });
    for (const [id, sessionId, jobJson] of [
      ["compatible-job", "compatible-session", JSON.stringify(compatibleJob)],
      ["invalid-job", "invalid-finalized", '{"schemaVersion":1}'],
    ] as const) {
      await native.executor.runAsync(
        "INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, created_at, updated_at, job_json, schema_version) VALUES (?, ?, ?, ?, ?, 'queued', 0, 'none', ?, ?, ?, ?)",
        id,
        `operation-${id}`,
        "profile-epoch-upgrade",
        sessionId,
        `artifact-${id}`,
        1,
        1,
        jobJson,
        id === "compatible-job" ? 3 : 1,
      );
    }

    let marker = "2";
    let journal: string | null = null;
    let interruptAfterSqliteCommit = true;
    const initializeEpoch = createContractEpochInitializer({
      getMarker: async () => marker,
      setMarker: async (value) => {
        marker = value;
      },
      getMigrationJournal: async () => journal,
      setMigrationJournal: async (value) => {
        if (
          interruptAfterSqliteCommit &&
          (JSON.parse(value) as { phase: string }).phase === "recording-evidence-migrated"
        ) {
          interruptAfterSqliteCommit = false;
          throw new Error("simulated process death");
        }
        journal = value;
      },
      migrateRecordingEvidence: ({ sourceEpoch, targetEpoch }) =>
        migrateRecordingEvidenceForContractEpoch({
          sourceEpoch,
          targetEpoch,
          isCheckpointCompatible: (value) =>
            (JSON.parse(value) as { variant?: unknown }).variant === "unplanned",
          now: 1_789_041_600_000,
        }),
      now: () => "2026-09-10T12:00:00.000Z",
    });

    await expect(initializeEpoch()).rejects.toThrow("simulated process death");
    expect(marker).toBe("2");
    expect(
      await native.executor.getAllAsync<{ session_id: string; state: string }>(
        "SELECT session_id, state FROM recording_evidence_sessions ORDER BY session_id",
      ),
    ).toEqual([
      { session_id: "invalid-finalized", state: "quarantined" },
      { session_id: "planned-active", state: "quarantined" },
      { session_id: "unplanned-active", state: "active" },
    ]);
    expect(
      await native.executor.getAllAsync<{ checkpoint_json: string }>(
        "SELECT checkpoint_json FROM recording_evidence_sessions WHERE session_id = 'planned-active'",
      ),
    ).toEqual([{ checkpoint_json: plannedCheckpoint }]);
    expect(
      await native.executor.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM recording_stream_envelopes WHERE session_id = 'planned-active'",
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await native.executor.getAllAsync<{
        finalized_path: string;
        finalized_artifact_json: string;
      }>(
        "SELECT finalized_path, finalized_artifact_json FROM recording_evidence_sessions WHERE session_id = 'invalid-finalized'",
      ),
    ).toEqual([
      {
        finalized_path: "file:///documents/recording_evidence_invalid-finalized/fit/activity.fit",
        finalized_artifact_json: '{"schemaVersion":1}',
      },
    ]);
    expect(
      await native.executor.getAllAsync<{ id: string; job_json: string; error_category: string }>(
        "SELECT id, job_json, error_category FROM activity_submission_queue_jobs WHERE id = 'invalid-job'",
      ),
    ).toEqual([
      {
        id: "invalid-job",
        job_json: '{"schemaVersion":1}',
        error_category: "contract-epoch-quarantined",
      },
    ]);
    await expect(loadDueActivitySubmissionQueueJobs("profile-epoch-upgrade", 1)).resolves.toEqual([
      compatibleJob,
    ]);
    await expect(
      claimDueActivitySubmissionQueueJob("invalid-job", "worker", "token", 1_000, 1),
    ).resolves.toBeNull();
    await upsertActivitySubmissionQueueJob({
      ...compatibleJob,
      id: "invalid-job",
      artifactId: "artifact-invalid-job",
      sessionId: "invalid-finalized",
      draft: { ...compatibleJob.draft, recordingSessionId: "invalid-finalized" },
    });
    expect(
      await native.executor.getAllAsync<{ job_json: string; error_category: string }>(
        "SELECT job_json, error_category FROM activity_submission_queue_jobs WHERE id = 'invalid-job'",
      ),
    ).toEqual([
      {
        job_json: '{"schemaVersion":1}',
        error_category: "contract-epoch-quarantined",
      },
    ]);

    await expect(initializeEpoch()).resolves.toBe("migrated");
    expect(marker).toBe("3");
    expect(JSON.parse(journal ?? "null")).toMatchObject({
      phase: "complete",
      summary: { quarantinedRecordingIntents: 2, quarantinedQueueJobs: 1 },
    });
    await expect(garbageCollectExpiredRecordingEvidence(4_102_444_800_000)).resolves.toBe(0);
    expect(
      await native.executor.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM recording_evidence_quarantine WHERE reason LIKE 'contract-epoch:%'",
      ),
    ).toEqual([{ count: 4 }]);
    expect(sqliteMocks.deleteDatabaseAsync).not.toHaveBeenCalled();
  });

  it("durably blocks orphan cleanup for an upgraded store with only unindexed artifacts", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);

    const migrate = () =>
      migrateRecordingEvidenceForContractEpoch({
        sourceEpoch: "2",
        targetEpoch: CURRENT_CONTRACT_EPOCH,
        isCheckpointCompatible: () => false,
        now: 1_789_041_600_000,
      });

    await expect(migrate()).resolves.toEqual({
      quarantinedRecordingIntents: 0,
      quarantinedQueueJobs: 0,
    });
    await expect(migrate()).resolves.toEqual({
      quarantinedRecordingIntents: 0,
      quarantinedQueueJobs: 0,
    });
    expect(await hasQuarantinedRecordingEvidence()).toBe(true);
    expect(
      await native.executor.getAllAsync<{ reason: string; payload: string }>(
        "SELECT reason, payload FROM recording_evidence_quarantine",
      ),
    ).toEqual([
      {
        reason: "contract-epoch:2-to-3:migration-manifest",
        payload: JSON.stringify({
          version: 1,
          sourceEpoch: "2",
          targetEpoch: 3,
          preCutUnindexedArtifactsPreserved: true,
          allowedResolution: ["recovery", "export", "explicit-discard"],
        }),
      },
    ]);
    await expect(garbageCollectExpiredRecordingEvidence(4_102_444_800_000)).resolves.toBe(0);
    expect(sqliteMocks.deleteDatabaseAsync).not.toHaveBeenCalled();
  });

  it("creates the current schema from version zero and reopens it with constraints and foreign keys", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);

    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 6 }]);
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
    expect(
      await native.executor.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_gps_envelopes'",
      ),
    ).toEqual([]);

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

  it("migrates v5 coordinate evidence into quarantine before recovery or submission", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    await native.executor.execAsync(`CREATE TABLE recording_gps_envelopes (
      session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id),
      sequence INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      payload TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      commit_marker TEXT NOT NULL,
      PRIMARY KEY (session_id, sequence)
    );
    CREATE INDEX recording_gps_envelopes_session_sequence
      ON recording_gps_envelopes(session_id, sequence);
    PRAGMA user_version = 5;`);
    for (const [sessionId, profileId] of [
      ["legacy-gps", "profile-gps"],
      ["legacy-latlng", "profile-latlng"],
    ] as const) {
      await native.executor.runAsync(
        "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at, checkpoint_json, checkpoint_digest) VALUES (?, ?, 'active', 1, '{}', ?)",
        sessionId,
        profileId,
        createHash("sha256").update("{}").digest("hex"),
      );
      await native.executor.runAsync(
        "INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, next_attempt_at, created_at, updated_at, job_json, schema_version) VALUES (?, ?, ?, ?, ?, 'queued', 0, 'transient', 1, 1, 1, '{}', 3)",
        sessionId,
        `operation-${sessionId}`,
        profileId,
        sessionId,
        sessionId,
      );
    }
    await native.executor.runAsync(
      "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES ('legacy-gps', 0, 1, ?, ?, ?, 'committed-v1')",
      '{"latitude":40,"longitude":-75}',
      31,
      "digest",
    );
    const coordinatePayload = '{"metric":"latlng","values":[[40,-75]]}';
    await native.executor.runAsync(
      "INSERT INTO recording_stream_envelopes (session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version) VALUES ('legacy-latlng', 'latlng', 0, 0, 1, ?, ?, ?, 'stream-committed-v1', 1)",
      coordinatePayload,
      Buffer.byteLength(coordinatePayload),
      createHash("sha256").update(coordinatePayload).digest("hex"),
    );

    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);

    expect(
      await native.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 6 }]);
    expect(
      await native.executor.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_gps_envelopes'",
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync(
        "SELECT session_id FROM recording_stream_envelopes WHERE stream_kind = 'latlng'",
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync<{
        session_id: string;
        state: string;
        checkpoint_json: string | null;
      }>(
        "SELECT session_id, state, checkpoint_json FROM recording_evidence_sessions ORDER BY session_id",
      ),
    ).toEqual([
      { session_id: "legacy-gps", state: "quarantined", checkpoint_json: null },
      { session_id: "legacy-latlng", state: "quarantined", checkpoint_json: null },
    ]);
    expect(
      await native.executor.getAllAsync<{
        session_id: string;
        status: string;
        retry_class: string;
        error_category: string;
      }>(
        "SELECT session_id, status, retry_class, error_category FROM activity_submission_queue_jobs ORDER BY session_id",
      ),
    ).toEqual([
      {
        session_id: "legacy-gps",
        status: "failed",
        retry_class: "permanent",
        error_category: "gps-policy-coordinate-evidence-rejected",
      },
      {
        session_id: "legacy-latlng",
        status: "failed",
        retry_class: "permanent",
        error_category: "gps-policy-coordinate-evidence-rejected",
      },
    ]);
    await expect(loadRecordingEvidenceCheckpoint("profile-gps")).resolves.toBeNull();
    await expect(loadRecordingEvidenceCheckpoint("profile-latlng")).resolves.toBeNull();
    await expect(loadDueActivitySubmissionQueueJobs("profile-gps", Date.now())).resolves.toEqual(
      [],
    );
    await expect(loadDueActivitySubmissionQueueJobs("profile-latlng", Date.now())).resolves.toEqual(
      [],
    );
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

  it("keeps an interrupted finish discoverable after its evidence is fenced", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const checkpoint = {
      ...unplannedCheckpoint("finishing", "profile"),
      lifecycle: "finishing" as const,
      start: {
        startedAt: "2026-01-01T10:00:00.000Z",
        updatedAt: "2026-01-01T10:00:10.000Z",
      },
    };
    await allocateRecordingEvidenceSession({
      sessionId: checkpoint.sessionId,
      profileId: "profile",
    });
    await persistRecordingCheckpoint(checkpoint);

    await expect(inspectRecordingCheckpoint("profile")).resolves.toEqual({
      status: "recovered",
      checkpoint,
    });
    await fenceRecordingEvidenceSession(checkpoint.sessionId);
    await expect(inspectRecordingCheckpoint("profile")).resolves.toEqual({
      status: "recovered",
      checkpoint,
    });
    await expect(claimRecordingEvidenceCheckpoint("profile")).resolves.toMatchObject({
      sessionId: checkpoint.sessionId,
    });
    releaseRecordingEvidenceCheckpointClaim(checkpoint.sessionId);
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

  it("fingerprints and deletes only one terminal lease-owned recording evidence graph", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = "25ecaafc-4933-5c89-95c3-627fe44ed3ba";
    const profileId = "profile";
    const canonical = canonicalRecordingEvidenceUris(sessionId);
    await allocateRecordingEvidenceSession({ sessionId, profileId });
    const stream = createRecordingStreamJournalAdapter({ sessionId, profileId });
    await stream.append([{ streamKind: "power", timestamp: 1, payload: '{"watts":200}' }]);
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_sha256 = ? WHERE session_id = ?",
      canonical.activityFileUri,
      "a".repeat(64),
      sessionId,
    );
    await discardFinalizedRecordingEvidence({
      sessionId,
      profileId,
      activityFilePath: canonical.activityFileUri,
      streamArtifactPaths: [canonical.streamDirectoryUri],
    });

    const plan = await prepareExactRecordingEvidenceCleanup({ sessionId, profileId });
    expect(plan).toMatchObject({
      schemaVersion: 1,
      sessionId,
      profileId,
      priorState: "quarantined",
      activityFilePath: canonical.activityFileUri,
      streamArtifactPaths: [canonical.streamDirectoryUri],
      finalizedArtifactSha256: "a".repeat(64),
      sqliteReferences: { session: 1, streams: 1, quarantines: 1 },
    });
    expect(plan.evidenceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(completeExactRecordingEvidenceCleanup(plan)).resolves.toBe(3);
    await expect(
      prepareExactRecordingEvidenceCleanup({ sessionId, profileId }),
    ).resolves.toMatchObject({ priorState: "absent" });
  });

  it("refuses active ownership and fingerprint drift without deleting evidence", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = "f71f49ac-4fe8-5f62-b98d-3957c6b89879";
    const profileId = "profile";
    const canonical = canonicalRecordingEvidenceUris(sessionId);
    await allocateRecordingEvidenceSession({ sessionId, profileId });
    await expect(prepareExactRecordingEvidenceCleanup({ sessionId, profileId })).rejects.toThrow(
      /terminal local session/,
    );
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_sha256 = ? WHERE session_id = ?",
      canonical.activityFileUri,
      "b".repeat(64),
      sessionId,
    );
    await discardFinalizedRecordingEvidence({
      sessionId,
      profileId,
      activityFilePath: canonical.activityFileUri,
      streamArtifactPaths: [],
    });
    const plan = await prepareExactRecordingEvidenceCleanup({ sessionId, profileId });
    await native.executor.runAsync(
      "INSERT INTO recording_evidence_quarantine (session_id, reason, payload, quarantined_at) VALUES (?, 'foreign-drift', NULL, ?)",
      sessionId,
      Date.now(),
    );
    await expect(completeExactRecordingEvidenceCleanup(plan)).rejects.toThrow(/evidence changed/);
    expect(
      await native.executor.getAllAsync<{ session_id: string }>(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([{ session_id: sessionId }]);
  });

  it("rejects DB-controlled and cross-session file paths before exact cleanup", async () => {
    const native = await nativeExecutor();
    close = native.close;
    await initializeRecordingEvidenceDatabase(native.executor);
    setRecordingEvidenceDatabaseForTests(native.executor);
    const sessionId = "64df749b-f21e-53c8-a894-577cfb2c2c91";
    const profileId = "profile";
    await allocateRecordingEvidenceSession({ sessionId, profileId });
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_sha256 = ? WHERE session_id = ?",
      "file:///data/user/0/com.deancochran.gradientpeak.preview/files/unrelated.fit",
      "a".repeat(64),
      sessionId,
    );

    await expect(prepareExactRecordingEvidenceCleanup({ sessionId, profileId })).rejects.toThrow(
      /canonical session path/,
    );
    expect(
      await native.executor.getAllAsync<{ session_id: string }>(
        "SELECT session_id FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      ),
    ).toEqual([{ session_id: sessionId }]);

    const secondSessionId = "85516566-9222-5764-bdaf-fd85fab242ec";
    const secondCanonical = canonicalRecordingEvidenceUris(secondSessionId);
    const foreignCanonical = canonicalRecordingEvidenceUris("0de75c2b-e351-5541-a61f-115b477d4396");
    await allocateRecordingEvidenceSession({ sessionId: secondSessionId, profileId });
    await native.executor.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_sha256 = ? WHERE session_id = ?",
      secondCanonical.activityFileUri,
      "b".repeat(64),
      secondSessionId,
    );
    await discardFinalizedRecordingEvidence({
      sessionId: secondSessionId,
      profileId,
      activityFilePath: secondCanonical.activityFileUri,
      streamArtifactPaths: [foreignCanonical.streamDirectoryUri],
    });
    await expect(
      prepareExactRecordingEvidenceCleanup({ sessionId: secondSessionId, profileId }),
    ).rejects.toThrow(/canonical session path/);
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
    const job = activitySubmissionQueueJobSchema.parse({
      schemaVersion: 3,
      id: sessionId,
      artifactId: sessionId,
      sessionId,
      localActivityFilePath: "file:///discard.fit",
      streamArtifactPaths: [],
      executionManifest: {
        version: 1,
        compilerVersion: 3,
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
        compilerVersion: 3,
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
        if (fail && source.includes("PRAGMA user_version = 6")) {
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
    ).toEqual([{ user_version: 6 }]);
  });

  it.each([1, 7])("rejects schema version %i without mutating its database", async (version) => {
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
