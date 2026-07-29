import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  initializeRecordingEvidenceDatabase,
  type RecordingEvidenceSqlExecutor,
} from "../ActivityRecorder/recordingEvidenceJournal";
import {
  claimDueActivitySubmissionQueueJob,
  loadActivitySubmissionQueueJobs,
  loadDueActivitySubmissionQueueJobs,
  renewClaimedActivitySubmissionQueueJob,
  setActivitySubmissionQueueSqlExecutorForTests,
  transitionClaimedActivitySubmissionQueueJob,
  upsertActivitySubmissionQueueJob,
} from "./storage";
import type { ActivitySubmissionQueueJob } from "./types";

type NativeDatabase = {
  exec(source: string): void;
  prepare(source: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number };
  };
  close(): void;
};

type NativeAdapter = {
  close(): void;
  executor: RecordingEvidenceSqlExecutor;
};

function nativeAdapter(path: string): NativeAdapter {
  const sqlite = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (path: string) => NativeDatabase;
  };
  const db = new sqlite.DatabaseSync(path);
  let transactionTail = Promise.resolve();
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
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const previous = transactionTail;
      transactionTail = previous.then(() => gate);
      await previous;
      db.exec("BEGIN EXCLUSIVE");
      try {
        await task(executor);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      } finally {
        release();
      }
    },
  };
  return { close: () => db.close(), executor };
}

const baseTime = Date.parse("2026-01-01T11:00:00.000Z");
const executionManifest = {
  version: 1 as const,
  compilerVersion: 1,
  planHash: "0".repeat(64),
  occurrences: [],
};

function job(
  id: string,
  overrides: Partial<ActivitySubmissionQueueJob> = {},
): ActivitySubmissionQueueJob {
  return {
    schemaVersion: 3,
    id,
    artifactId: `artifact-${id}`,
    sessionId: `session-${id}`,
    localActivityFilePath: `file:///activity-${id}.fit`,
    streamArtifactPaths: [],
    executionManifest,
    draft: {
      recordingSessionId: `session-${id}`,
      profileId: "profile",
      startedAt: "2026-01-01T10:00:00.000Z",
      finishedAt: "2026-01-01T11:00:00.000Z",
      name: "Native queue job",
      activity_category: "bike",
      durationSeconds: 3600,
      movingSeconds: 3500,
      distanceMeters: 25_000,
      calories: 500,
    },
    status: "queued",
    attempts: 0,
    createdAt: new Date(baseTime).toISOString(),
    updatedAt: new Date(baseTime).toISOString(),
    ...overrides,
  };
}

describe("activity submission queue native SQLite storage", () => {
  let directory: string | undefined;
  let database: NativeAdapter | undefined;

  async function open(reopen = false): Promise<NativeAdapter> {
    if (!directory) directory = await mkdtemp(join(tmpdir(), "gradientpeak-queue-"));
    if (reopen) database?.close();
    database = nativeAdapter(join(directory, "queue.db"));
    await initializeRecordingEvidenceDatabase(database.executor);
    setActivitySubmissionQueueSqlExecutorForTests(database.executor);
    return database;
  }

  afterEach(async () => {
    setActivitySubmissionQueueSqlExecutorForTests();
    database?.close();
    database = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("runs the shared migrations, rolls back queue SQL transactions, and persists across restart", async () => {
    const first = await open();
    expect(
      await first.executor.getAllAsync<{ user_version: number }>("PRAGMA user_version"),
    ).toEqual([{ user_version: 5 }]);
    await expect(
      first.executor.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "INSERT INTO activity_submission_queue_quarantine (job_id, reason, quarantined_at) VALUES (?, ?, ?)",
          "rolled-back",
          "test",
          baseTime,
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await first.executor.getAllAsync(
        "SELECT job_id FROM activity_submission_queue_quarantine WHERE job_id = ?",
        "rolled-back",
      ),
    ).toEqual([]);

    await upsertActivitySubmissionQueueJob(job("persisted"));
    await open(true);
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([job("persisted")]);
  });

  it("restores foreign-key enforcement when reopening a current file-backed database", async () => {
    await open();
    const current = await open(true);

    expect(
      await current.executor.getAllAsync<{ foreign_keys: number }>("PRAGMA foreign_keys"),
    ).toEqual([{ foreign_keys: 1 }]);
    await expect(
      current.executor.runAsync(
        "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, 0, 1, '{}', 2, 'digest', 'committed-v1')",
        "orphan",
      ),
    ).rejects.toThrow();
    await expect(
      current.executor.runAsync(
        "INSERT INTO recording_stream_envelopes (session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version) VALUES (?, 'power', 0, 0, 1, '{}', 2, 'digest', 'stream-committed-v1', 1)",
        "orphan",
      ),
    ).rejects.toThrow();
    await expect(
      current.executor.runAsync(
        "INSERT INTO recording_finalization_recovery (session_id, status, reason, updated_at) VALUES (?, 'pending', 'test', ?)",
        "orphan",
        baseTime,
      ),
    ).rejects.toThrow();

    await current.executor.runAsync(
      "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
      "valid-session",
      "profile",
      baseTime,
    );
    await expect(
      current.executor.runAsync(
        "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, 0, 1, '{}', 2, 'digest', 'committed-v1')",
        "valid-session",
      ),
    ).resolves.toMatchObject({ changes: 1 });
    await expect(upsertActivitySubmissionQueueJob(job("valid"))).resolves.toBeUndefined();
    await expect(loadActivitySubmissionQueueJobs()).resolves.toEqual([job("valid")]);
  });

  it("allows exactly one concurrent claimant and fences an unexpired competitor", async () => {
    await open();
    await upsertActivitySubmissionQueueJob(job("claimed"));
    const [first, second] = await Promise.all([
      claimDueActivitySubmissionQueueJob("claimed", "runner-a", "token-a", 1_000, baseTime),
      claimDueActivitySubmissionQueueJob("claimed", "runner-b", "token-b", 1_000, baseTime),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const winner = first ?? second;
    expect(
      await claimDueActivitySubmissionQueueJob(
        "claimed",
        "runner-c",
        "token-c",
        1_000,
        baseTime + 1,
      ),
    ).toBeNull();
    expect(winner).toMatchObject({ leaseExpiresAt: new Date(baseTime + 1_000).toISOString() });
  });

  it("renews only a live matching fence and transitions only with owner, token, and an unexpired lease", async () => {
    const native = await open();
    await upsertActivitySubmissionQueueJob(job("fenced"));
    const claimed = await claimDueActivitySubmissionQueueJob(
      "fenced",
      "runner-a",
      "token-a",
      1_000,
      baseTime,
    );
    if (!claimed) throw new Error("claim setup failed");
    await expect(
      renewClaimedActivitySubmissionQueueJob("fenced", "runner-b", "token-a", 1_000, baseTime + 1),
    ).resolves.toBeNull();
    const renewed = await renewClaimedActivitySubmissionQueueJob(
      "fenced",
      "runner-a",
      "token-a",
      1_000,
      baseTime + 500,
    );
    if (!renewed) throw new Error("renewal setup failed");
    expect(renewed?.leaseExpiresAt).toBe(new Date(baseTime + 1_500).toISOString());
    const completed = {
      ...renewed,
      status: "complete" as const,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    await expect(
      transitionClaimedActivitySubmissionQueueJob(completed, "runner-b", "token-a", baseTime + 501),
    ).resolves.toBe(false);
    await expect(
      transitionClaimedActivitySubmissionQueueJob(completed, "runner-a", "token-b", baseTime + 501),
    ).resolves.toBe(false);
    await expect(
      transitionClaimedActivitySubmissionQueueJob(
        completed,
        "runner-a",
        "token-a",
        baseTime + 1_500,
      ),
    ).resolves.toBe(false);
    expect(
      await native.executor.getAllAsync<{
        status: string;
        lease_owner: string;
        lease_token: string;
      }>(
        "SELECT status, lease_owner, lease_token FROM activity_submission_queue_jobs WHERE id = ?",
        "fenced",
      ),
    ).toEqual([{ status: "queued", lease_owner: "runner-a", lease_token: "token-a" }]);
    await expect(
      transitionClaimedActivitySubmissionQueueJob(
        completed,
        "runner-a",
        "token-a",
        baseTime + 1_499,
      ),
    ).resolves.toBe(true);
  });

  it("selects only due rows and quarantines a corrupt row without blocking its peer", async () => {
    const native = await open();
    await upsertActivitySubmissionQueueJob(job("due"));
    await upsertActivitySubmissionQueueJob(
      job("later", { nextAttemptAt: new Date(baseTime + 1_000).toISOString() }),
    );
    await native.executor.runAsync(
      "INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, created_at, updated_at, job_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "corrupt",
      "operation-corrupt",
      "profile",
      "session-corrupt",
      "artifact-corrupt",
      "queued",
      0,
      "none",
      baseTime,
      baseTime,
      "{not json",
      3,
    );
    const legacyJob = job("legacy") as unknown as {
      schemaVersion: number;
      draft: Record<string, unknown>;
      [key: string]: unknown;
    };
    legacyJob.schemaVersion = 2;
    legacyJob.draft.activityCategory = legacyJob.draft.activity_category;
    delete legacyJob.draft.activity_category;
    await native.executor.runAsync(
      "INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, created_at, updated_at, job_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "legacy",
      "operation-legacy",
      "profile",
      "session-legacy",
      "artifact-legacy",
      "queued",
      0,
      "none",
      baseTime,
      baseTime,
      JSON.stringify(legacyJob),
      2,
    );
    await expect(loadDueActivitySubmissionQueueJobs("profile", baseTime)).resolves.toEqual([
      job("due"),
    ]);
    expect(
      await native.executor.getAllAsync<{ job_id: string; reason: string }>(
        "SELECT job_id, reason FROM activity_submission_queue_quarantine",
      ),
    ).toEqual([
      { job_id: "corrupt", reason: "invalid-row" },
      { job_id: "legacy", reason: "invalid-row" },
    ]);
    expect(
      await native.executor.getAllAsync<{ id: string }>(
        "SELECT id FROM activity_submission_queue_jobs WHERE id = ?",
        "corrupt",
      ),
    ).toEqual([]);
    expect(
      await native.executor.getAllAsync<{ id: string }>(
        "SELECT id FROM activity_submission_queue_jobs WHERE id = ?",
        "legacy",
      ),
    ).toEqual([]);
  });
});
