import { type RecordingSessionArtifact, recordingSessionArtifactSchema } from "@repo/core";
import type * as Location from "expo-location";
import type { ActivitySubmissionQueueJob } from "../activitySubmissionQueue/types";
import { activitySubmissionQueueJobSchema } from "../activitySubmissionQueue/types";

const DATABASE_NAME = "gradientpeak-recording-evidence.db";
const COMMIT_MARKER = "committed-v1";
const MAX_HEADLESS_ENVELOPES = 100;
const MAX_INVALID_HEADLESS_ENVELOPES = 20;
const MAX_ENVELOPE_BYTES = 8_192;
const SCHEMA_VERSION = 5;
const STREAM_COMMIT_MARKER = "stream-committed-v1";
const STREAM_VERSION = 1;
const MAX_STREAM_ENVELOPE_BYTES = 1_048_576;
/** Retention is deliberately finite and applies only to terminal evidence. */
export const QUARANTINED_EVIDENCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const RAW_TERMINAL_EVIDENCE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const ACCEPTANCE_TOMBSTONE_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;
export const MAX_QUARANTINE_ROWS_PER_SESSION = 20;
export const MAX_QUARANTINE_ROWS_PER_PROFILE = 200;
export const EVIDENCE_GC_BATCH_SIZE = 100;

/** A producer attempted to append after the irreversible finalization fence. */
export class RecordingEvidenceClosedError extends Error {
  readonly code = "recording-evidence-closed";

  constructor() {
    super("Recording evidence session is closed for finalization");
    this.name = "RecordingEvidenceClosedError";
  }
}

export type RecordingStreamEnvelope = {
  streamKind: string;
  sequence: number;
  order: number;
  timestamp: number;
  payload: string;
};

export interface RecordingStreamJournalAdapter {
  /** SQLite allocates the global order; callers cannot reserve or reuse it. */
  append(envelopes: readonly Omit<RecordingStreamEnvelope, "sequence" | "order">[]): Promise<void>;
  recover(): Promise<RecordingStreamEnvelope[]>;
}

export type RecordingEvidenceSqlExecutor = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<{ changes?: number }>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withExclusiveTransactionAsync(
    task: (transaction: RecordingEvidenceSqlExecutor) => Promise<void>,
  ): Promise<void>;
};

/**
 * Checkpoint shape and recovery invariants belong to the recorder, not this
 * SQLite adapter. Callers inject that strict validation so this module never
 * imports checkpointStorage and creates a circular runtime dependency.
 */
export type RecordingEvidenceCheckpointValidator = (input: {
  checkpointJson: string;
  sessionId: string;
  profileId: string;
}) => Promise<boolean>;

let databasePromise: Promise<RecordingEvidenceSqlExecutor> | undefined;

async function sha256(value: string): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function getRecordingEvidenceDatabase(): Promise<RecordingEvidenceSqlExecutor> {
  databasePromise ??= (async () => {
    const SQLite = await import("expo-sqlite");
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await initializeRecordingEvidenceDatabase(db);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    return db;
  })();
  return databasePromise;
}

/**
 * SQLite's user_version is the schema authority.  This deliberately does not
 * overwrite a marker: each version is committed only after its idempotent DDL
 * completed, so a killed upgrade retries the same step on the next open.
 */
async function hasColumn(
  tx: RecordingEvidenceSqlExecutor,
  table: string,
  column: string,
): Promise<boolean> {
  const columns = await tx.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
}

async function migrateV1(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  // Every statement is idempotent: this also resumes a v0 install killed mid-step.
  await tx.execAsync(`CREATE TABLE IF NOT EXISTS recording_evidence_sessions (session_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'accepted', 'quarantined')), next_sequence INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, finalized_path TEXT, finalized_size INTEGER, finalized_sha256 TEXT);
    CREATE TABLE IF NOT EXISTS recording_gps_envelopes (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), sequence INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, PRIMARY KEY (session_id, sequence));
    CREATE INDEX IF NOT EXISTS recording_gps_envelopes_session_sequence ON recording_gps_envelopes(session_id, sequence);
    CREATE TABLE IF NOT EXISTS recording_evidence_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recording_evidence_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, reason TEXT NOT NULL, payload TEXT, quarantined_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_recording_evidence_per_profile ON recording_evidence_sessions(profile_id) WHERE state = 'active';`);
}

async function migrateV2(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  // SQLite has no ADD COLUMN IF NOT EXISTS. Inspect first instead of swallowing a
  // malformed-schema error; a partial v2 therefore resumes safely.
  if (!(await hasColumn(tx, "recording_evidence_sessions", "finalized_artifact_json")))
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN finalized_artifact_json TEXT",
    );
  if (!(await hasColumn(tx, "recording_evidence_sessions", "finalized_artifact_digest")))
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN finalized_artifact_digest TEXT",
    );
  await tx.execAsync(`CREATE TABLE IF NOT EXISTS recording_stream_envelopes (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), stream_kind TEXT NOT NULL, sequence INTEGER NOT NULL, stream_order INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (session_id, stream_kind, sequence), UNIQUE (session_id, stream_kind, stream_order));
    CREATE INDEX IF NOT EXISTS recording_stream_envelopes_recovery ON recording_stream_envelopes(session_id, stream_kind, sequence);
    CREATE TABLE IF NOT EXISTS recording_finalization_recovery (session_id TEXT PRIMARY KEY NOT NULL REFERENCES recording_evidence_sessions(session_id), status TEXT NOT NULL CHECK(status IN ('pending', 'blocked')), reason TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity_submission_queue_jobs (id TEXT PRIMARY KEY NOT NULL, operation_id TEXT NOT NULL UNIQUE, profile_id TEXT NOT NULL, session_id TEXT NOT NULL, artifact_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, retry_class TEXT NOT NULL, next_attempt_at INTEGER, error_category TEXT, lease_owner TEXT, lease_token TEXT, lease_expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, job_json TEXT NOT NULL, schema_version INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS activity_submission_queue_due ON activity_submission_queue_jobs(profile_id, status, next_attempt_at, lease_expires_at);
    CREATE TABLE IF NOT EXISTS activity_submission_queue_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, reason TEXT NOT NULL, quarantined_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity_submission_migration_items (legacy_key TEXT NOT NULL, item_id TEXT NOT NULL, phase TEXT NOT NULL, disposition TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (legacy_key, item_id));
    CREATE TABLE IF NOT EXISTS recording_evidence_acceptance_tombstones (operation_id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL, accepted_at INTEGER NOT NULL);`);
}

async function migrateV3(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  if (!(await hasColumn(tx, "recording_evidence_sessions", "next_stream_order"))) {
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN next_stream_order INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!(await hasColumn(tx, "recording_evidence_sessions", "checkpoint_json"))) {
    await tx.execAsync("ALTER TABLE recording_evidence_sessions ADD COLUMN checkpoint_json TEXT");
    await tx.execAsync("ALTER TABLE recording_evidence_sessions ADD COLUMN checkpoint_digest TEXT");
  }
  // Remove the accidentally deployed global uniqueness constraint before the
  // backfill. Rebuilding this child table is safe: nothing has an FK to it.
  await tx.execAsync(`CREATE TABLE IF NOT EXISTS recording_stream_envelopes_v3 (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), stream_kind TEXT NOT NULL, sequence INTEGER NOT NULL, stream_order INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (session_id, stream_kind, sequence), UNIQUE (session_id, stream_kind, stream_order));
    INSERT OR IGNORE INTO recording_stream_envelopes_v3 SELECT session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version FROM recording_stream_envelopes;
    DROP TABLE recording_stream_envelopes;
    ALTER TABLE recording_stream_envelopes_v3 RENAME TO recording_stream_envelopes;
    CREATE INDEX IF NOT EXISTS recording_stream_envelopes_recovery ON recording_stream_envelopes(session_id, stream_kind, sequence);`);
  // v2 used (session, kind, order) as a uniqueness key, so old multi-kind flushes
  // can contain duplicate orders. Re-number only a fully deterministic sequence;
  // malformed legacy rows are quarantined rather than making database open fail.
  const sessions = await tx.getAllAsync<{ session_id: string }>(
    "SELECT session_id FROM recording_evidence_sessions",
  );
  for (const { session_id } of sessions) {
    const rows = await tx.getAllAsync<{
      stream_kind: string;
      sequence: number;
      stream_order: number;
      timestamp: number;
    }>(
      "SELECT stream_kind, sequence, stream_order, timestamp FROM recording_stream_envelopes WHERE session_id = ? ORDER BY stream_order, timestamp, stream_kind, sequence",
      session_id,
    );
    let valid = true;
    const sequenceByKind = new Map<string, number>();
    let previousTimestamp = -Infinity;
    for (const row of rows) {
      const expected = sequenceByKind.get(row.stream_kind) ?? 0;
      if (
        !row.stream_kind ||
        row.sequence !== expected ||
        !Number.isFinite(row.timestamp) ||
        row.timestamp < previousTimestamp
      ) {
        valid = false;
        break;
      }
      sequenceByKind.set(row.stream_kind, expected + 1);
      previousTimestamp = row.timestamp;
    }
    if (!valid) {
      await quarantineEvidence(tx, session_id, "legacy-stream-order-ambiguous");
      await tx.runAsync("DELETE FROM recording_stream_envelopes WHERE session_id = ?", session_id);
      continue;
    }
    // Use a temporary negative range so the existing unique index never sees a collision.
    for (const [index, row] of rows.entries())
      await tx.runAsync(
        "UPDATE recording_stream_envelopes SET stream_order = ? WHERE session_id = ? AND stream_kind = ? AND sequence = ?",
        -(index + 1),
        session_id,
        row.stream_kind,
        row.sequence,
      );
    for (const [index, row] of rows.entries())
      await tx.runAsync(
        "UPDATE recording_stream_envelopes SET stream_order = ? WHERE session_id = ? AND stream_kind = ? AND sequence = ?",
        index,
        session_id,
        row.stream_kind,
        row.sequence,
      );
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET next_stream_order = ? WHERE session_id = ?",
      rows.length,
      session_id,
    );
  }
  await tx.execAsync(
    "CREATE UNIQUE INDEX IF NOT EXISTS recording_stream_envelopes_global_order ON recording_stream_envelopes(session_id, stream_order)",
  );
}

/**
 * Some v1 installations were shipped before `accepted` became a terminal
 * state. SQLite cannot widen a CHECK, so this is deliberately a table rebuild
 * rather than an ALTER TABLE. It runs after the additive migrations, meaning
 * every copied row has the complete current column set.
 */
async function migrateV4(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  const definition = await tx.getAllAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recording_evidence_sessions'",
  );
  // A missing definition is only possible in a malformed hand-built database;
  // v1 creates the authoritative table and its constraint below.
  if (definition[0]?.sql?.includes("'accepted'")) return;
  await tx.execAsync(`CREATE TABLE recording_evidence_sessions_v4 (
      session_id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'accepted', 'quarantined')),
      next_sequence INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      finalized_path TEXT,
      finalized_size INTEGER,
      finalized_sha256 TEXT,
      finalized_artifact_json TEXT,
      finalized_artifact_digest TEXT,
      next_stream_order INTEGER NOT NULL DEFAULT 0,
      checkpoint_json TEXT,
      checkpoint_digest TEXT
    );
    INSERT INTO recording_evidence_sessions_v4
      (session_id, profile_id, state, next_sequence, created_at, finalized_path, finalized_size, finalized_sha256, finalized_artifact_json, finalized_artifact_digest, next_stream_order, checkpoint_json, checkpoint_digest)
      SELECT session_id, profile_id, state, next_sequence, created_at, finalized_path, finalized_size, finalized_sha256, finalized_artifact_json, finalized_artifact_digest, next_stream_order, checkpoint_json, checkpoint_digest
      FROM recording_evidence_sessions
      WHERE state IN ('active', 'fenced', 'finalized', 'accepted', 'quarantined');
    INSERT INTO recording_evidence_quarantine (session_id, reason, payload, quarantined_at)
      SELECT session_id, 'legacy-session-state-invalid', state, ${Date.now()}
      FROM recording_evidence_sessions
      WHERE state NOT IN ('active', 'fenced', 'finalized', 'accepted', 'quarantined');
    DROP TABLE recording_evidence_sessions;
    ALTER TABLE recording_evidence_sessions_v4 RENAME TO recording_evidence_sessions;
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_recording_evidence_per_profile ON recording_evidence_sessions(profile_id) WHERE state = 'active';`);
}

/** Accepted uploads retain their file reference until the independently retryable
 * OS cleanup succeeds.  Acceptance itself is never rolled back by that effect. */
async function migrateV5(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  if (!(await hasColumn(tx, "recording_evidence_sessions", "cleanup_pending"))) {
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN cleanup_pending INTEGER NOT NULL DEFAULT 0",
    );
    await tx.execAsync("ALTER TABLE recording_evidence_sessions ADD COLUMN cleanup_error TEXT");
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0",
    );
    await tx.execAsync(
      "ALTER TABLE recording_evidence_sessions ADD COLUMN next_cleanup_at INTEGER",
    );
  }
  await tx.execAsync(
    "CREATE INDEX IF NOT EXISTS recording_evidence_accepted_cleanup_due ON recording_evidence_sessions(state, cleanup_pending, next_cleanup_at)",
  );
}

/** Public initializer so adapter-level tests exercise the production protocol. */
export async function initializeRecordingEvidenceDatabase(
  db: RecordingEvidenceSqlExecutor,
): Promise<void> {
  try {
    // Read before *any* schema DDL. A newer database is not safe for this binary to touch.
    const pragma = await db.getAllAsync<{ user_version?: number }>("PRAGMA user_version");
    const version = pragma[0]?.user_version ?? 0;
    if (version > SCHEMA_VERSION) throw new Error("unsupported-recording-evidence-schema");
    // Dropping the referenced parent during the v4 CHECK rebuild is only safe
    // when SQLite FK enforcement was disabled before the exclusive transaction.
    // It is restored after the version marker commits; no application writes can
    // interleave with this initializer.
    const mayRebuildSessions = version < SCHEMA_VERSION;
    if (mayRebuildSessions) await db.execAsync("PRAGMA foreign_keys = OFF");
    const steps: Array<() => Promise<void>> = [
      async () =>
        db.withExclusiveTransactionAsync(async (tx) => {
          await migrateV1(tx);
          await tx.execAsync("PRAGMA user_version = 1");
        }),
      async () =>
        db.withExclusiveTransactionAsync(async (tx) => {
          await migrateV2(tx);
          await tx.execAsync("PRAGMA user_version = 2");
        }),
      async () =>
        db.withExclusiveTransactionAsync(async (tx) => {
          await migrateV3(tx);
          await tx.execAsync("PRAGMA user_version = 3");
        }),
      async () =>
        db.withExclusiveTransactionAsync(async (tx) => {
          await migrateV4(tx);
          await tx.execAsync("PRAGMA user_version = 4");
        }),
      async () =>
        db.withExclusiveTransactionAsync(async (tx) => {
          await migrateV5(tx);
          await tx.execAsync("PRAGMA user_version = 5");
        }),
    ];
    for (let current = version; current < SCHEMA_VERSION; current += 1) {
      const step = steps[current];
      if (!step) throw new Error("unsupported-recording-evidence-schema");
      await step();
    }
  } finally {
    // Foreign-key enforcement is scoped to this connection. Re-enable it after
    // a rebuild and on every current-schema reopen before callers can operate.
    await db.execAsync("PRAGMA foreign_keys = ON");
  }
}

/** Queue/migration storage shares the recorder's SQLite durability boundary. */
export async function withRecordingEvidenceTransaction<T>(
  task: (transaction: RecordingEvidenceSqlExecutor) => Promise<T>,
): Promise<T> {
  const db = await getRecordingEvidenceDatabase();
  let result!: T;
  await db.withExclusiveTransactionAsync(async (tx) => {
    result = await task(tx);
  });
  return result;
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertStreamEnvelope(input: Omit<RecordingStreamEnvelope, "sequence" | "order">): void {
  if (
    !input.streamKind ||
    !Number.isFinite(input.timestamp) ||
    !input.payload ||
    byteSize(input.payload) > MAX_STREAM_ENVELOPE_BYTES
  ) {
    throw new Error("invalid-stream-envelope");
  }
}

async function activeStreamSession(
  tx: RecordingEvidenceSqlExecutor,
): Promise<{ session_id: string }> {
  const active = await tx.getAllAsync<{ session_id: string }>(
    "SELECT session_id FROM recording_evidence_sessions WHERE state = 'active' ORDER BY created_at",
  );
  if (active.length !== 1 || !active[0]) {
    for (const session of active)
      await quarantineEvidence(tx, session.session_id, "ambiguous-active-session");
    throw new Error("Recording evidence has no unambiguous active session");
  }
  return active[0];
}

async function appendStreamEnvelopes(
  sessionId: string,
  profileId: string | undefined,
  envelopes: readonly Omit<RecordingStreamEnvelope, "sequence" | "order">[],
): Promise<void> {
  if (!envelopes.length) return;
  envelopes.forEach(assertStreamEnvelope);
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      profile_id: string;
      state: string;
      next_stream_order: number;
    }>(
      "SELECT profile_id, state, next_stream_order FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    );
    const session = sessions[0];
    if (!session) throw new Error("Recording evidence session is unavailable");
    if (session.state !== "active") throw new RecordingEvidenceClosedError();
    if (profileId && session.profile_id !== profileId)
      throw new Error("Recording evidence session owner does not match");
    const nextByKind = new Map<string, number>();
    const existingOrder = await tx.getAllAsync<{ timestamp: number | null }>(
      "SELECT MAX(timestamp) AS timestamp FROM recording_stream_envelopes WHERE session_id = ?",
      sessionId,
    );
    let nextOrder = session.next_stream_order;
    let previousTimestamp = existingOrder[0]?.timestamp ?? -Infinity;
    for (const envelope of envelopes) {
      if (envelope.timestamp < previousTimestamp) throw new Error("stream-global-order-invalid");
      let sequence = nextByKind.get(envelope.streamKind);
      if (sequence === undefined) {
        const rows = await tx.getAllAsync<{ next_sequence: number }>(
          "SELECT COALESCE(MAX(sequence) + 1, 0) AS next_sequence FROM recording_stream_envelopes WHERE session_id = ? AND stream_kind = ?",
          sessionId,
          envelope.streamKind,
        );
        sequence = rows[0]?.next_sequence ?? 0;
      }
      await tx.runAsync(
        "INSERT INTO recording_stream_envelopes (session_id, stream_kind, sequence, stream_order, timestamp, payload, byte_size, sha256, commit_marker, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        sessionId,
        envelope.streamKind,
        sequence,
        nextOrder,
        envelope.timestamp,
        envelope.payload,
        byteSize(envelope.payload),
        await sha256(envelope.payload),
        STREAM_COMMIT_MARKER,
        STREAM_VERSION,
      );
      nextByKind.set(envelope.streamKind, sequence + 1);
      nextOrder += 1;
      previousTimestamp = envelope.timestamp;
    }
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET next_stream_order = ? WHERE session_id = ? AND state = 'active'",
      nextOrder,
      sessionId,
    );
  });
}

async function recoverStreamEnvelopes(
  sessionId: string,
  profileId?: string,
): Promise<RecordingStreamEnvelope[]> {
  const db = await getRecordingEvidenceDatabase();
  const recovered: RecordingStreamEnvelope[] = [];
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{ profile_id: string }>(
      "SELECT profile_id FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    );
    if (!sessions[0]) throw new Error("Recording evidence session is unavailable");
    if (profileId && sessions[0].profile_id !== profileId) {
      await quarantineEvidence(tx, sessionId, "profile-session-mismatch");
      throw new Error("profile-session-mismatch");
    }
    const rows = await tx.getAllAsync<{
      streamKind: string;
      sequence: number;
      streamOrder: number;
      timestamp: number;
      payload: string;
      byte_size: number;
      sha256: string;
      commit_marker: string;
      version: number;
    }>(
      "SELECT stream_kind AS streamKind, sequence, stream_order AS streamOrder, timestamp, payload, byte_size, sha256, commit_marker, version FROM recording_stream_envelopes WHERE session_id = ? ORDER BY stream_order",
      sessionId,
    );
    const expected = new Map<string, number>();
    let expectedOrder = 0;
    let previousTimestamp = -Infinity;
    try {
      for (const row of rows) {
        const order = row.streamOrder;
        const next = expected.get(row.streamKind) ?? 0;
        if (
          !row.streamKind ||
          row.sequence !== next ||
          order !== expectedOrder ||
          row.timestamp < previousTimestamp ||
          !Number.isInteger(order) ||
          order < 0 ||
          !Number.isFinite(row.timestamp) ||
          row.byte_size !== byteSize(row.payload) ||
          row.commit_marker !== STREAM_COMMIT_MARKER ||
          row.version !== STREAM_VERSION
        )
          throw new Error("stream-order-or-marker-invalid");
        if ((await sha256(row.payload)) !== row.sha256) throw new Error("stream-digest-invalid");
        JSON.parse(row.payload);
        expected.set(row.streamKind, next + 1);
        expectedOrder += 1;
        previousTimestamp = row.timestamp;
        recovered.push({
          streamKind: row.streamKind,
          sequence: row.sequence,
          order,
          timestamp: row.timestamp,
          payload: row.payload,
        });
      }
    } catch (error) {
      const reason =
        error instanceof Error &&
        /^stream-(?:order-or-marker-invalid|digest-invalid)$/.test(error.message)
          ? error.message
          : "stream-payload-invalid";
      await quarantineEvidence(tx, sessionId, reason);
      throw new Error(reason);
    }
  });
  return recovered;
}

/** SQLite-backed stream authority. No document or cache stream files participate in recovery. */
export function createRecordingStreamJournalAdapter(input: {
  sessionId: string;
  profileId: string;
}): RecordingStreamJournalAdapter {
  return {
    append: (envelopes) => appendStreamEnvelopes(input.sessionId, input.profileId, envelopes),
    recover: () => recoverStreamEnvelopes(input.sessionId, input.profileId),
  };
}

/** Compatibility adapter for foreground callers; it binds each operation to the sole active SQLite session. */
export function createActiveRecordingStreamJournalAdapter(): RecordingStreamJournalAdapter {
  return {
    async append(envelopes) {
      const db = await getRecordingEvidenceDatabase();
      let sessionId = "";
      await db.withExclusiveTransactionAsync(async (tx) => {
        sessionId = (await activeStreamSession(tx)).session_id;
      });
      await appendStreamEnvelopes(sessionId, undefined, envelopes);
    },
    async recover() {
      const db = await getRecordingEvidenceDatabase();
      let sessionId = "";
      await db.withExclusiveTransactionAsync(async (tx) => {
        sessionId = (await activeStreamSession(tx)).session_id;
      });
      return recoverStreamEnvelopes(sessionId);
    },
  };
}

export function resetRecordingEvidenceJournalForTests(): void {
  databasePromise = undefined;
}

/** Test-only adapter seam; production always opens the Expo SQLite authority. */
export function setRecordingEvidenceDatabaseForTests(database: RecordingEvidenceSqlExecutor): void {
  databasePromise = Promise.resolve(database);
}

async function quarantineEvidence(
  tx: RecordingEvidenceSqlExecutor,
  sessionId: string | null,
  reason: string,
  payload?: string,
): Promise<void> {
  await tx.runAsync(
    "INSERT INTO recording_evidence_quarantine (session_id, reason, payload, quarantined_at) VALUES (?, ?, ?, ?)",
    sessionId,
    reason,
    payload ?? null,
    Date.now(),
  );
  if (sessionId) {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND state != 'finalized'",
      sessionId,
    );
  }
}

/**
 * Releases only the identified active owner.  This deliberately retains stream
 * and GPS rows: a recovery decision is not permission to erase committed
 * evidence.  The profile predicate prevents a stale/cross-profile checkpoint
 * from changing another owner's session.
 */
export async function quarantineRecordingEvidenceSession(input: {
  sessionId: string;
  profileId: string;
  reason: string;
}): Promise<boolean> {
  const reason = input.reason.slice(0, 160) || "checkpoint-invalid";
  const db = await getRecordingEvidenceDatabase();
  let quarantined = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND profile_id = ? AND state = 'active'",
      input.sessionId,
      input.profileId,
    );
    quarantined = (result.changes ?? 0) === 1;
    if (quarantined) {
      await quarantineEvidence(
        tx,
        null,
        `checkpoint:${reason}`,
        JSON.stringify({ sessionId: input.sessionId }),
      );
    }
  });
  return quarantined;
}

/**
 * Corrupt compatibility storage has no reliable identity.  Never infer one
 * from it; instead release only this profile's active rows whose SQLite
 * checkpoint is absent, malformed, fails its authoritative digest, or fails
 * the recorder's strict schema, version, and owner/session invariants.
 */
export async function quarantineOrphanedActiveRecordingEvidenceSessions(
  profileId: string,
  validateCheckpoint: RecordingEvidenceCheckpointValidator,
): Promise<number> {
  const db = await getRecordingEvidenceDatabase();
  let count = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      session_id: string;
      checkpoint_json: string | null;
      checkpoint_digest: string | null;
    }>(
      "SELECT session_id, checkpoint_json, checkpoint_digest FROM recording_evidence_sessions WHERE profile_id = ? AND state = 'active'",
      profileId,
    );
    for (const session of sessions) {
      const checkpointJson = session.checkpoint_json;
      const checkpointDigest = session.checkpoint_digest;
      let valid = Boolean(checkpointJson && checkpointDigest);
      if (checkpointJson && checkpointDigest) {
        try {
          valid = (await sha256(checkpointJson)) === checkpointDigest;
          if (valid) {
            valid = await validateCheckpoint({
              checkpointJson,
              sessionId: session.session_id,
              profileId,
            });
          }
        } catch {
          valid = false;
        }
      }
      if (!valid) {
        const result = await tx.runAsync(
          "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND profile_id = ? AND state = 'active'",
          session.session_id,
          profileId,
        );
        if ((result.changes ?? 0) === 1) {
          count += 1;
          await quarantineEvidence(
            tx,
            null,
            "checkpoint:orphaned-unreadable-compatibility",
            JSON.stringify({ sessionId: session.session_id }),
          );
        }
      }
    }
  });
  return count;
}

function validLocation(location: Location.LocationObject): boolean {
  const { coords } = location;
  return Boolean(
    coords &&
      Number.isFinite(coords.latitude) &&
      Number.isFinite(coords.longitude) &&
      Number.isFinite(location.timestamp) &&
      coords.latitude >= -90 &&
      coords.latitude <= 90 &&
      coords.longitude >= -180 &&
      coords.longitude <= 180 &&
      coords.accuracy !== null &&
      coords.accuracy >= 0 &&
      coords.accuracy <= 50,
  );
}

function envelope(location: Location.LocationObject) {
  return {
    timestamp: location.timestamp,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    altitude: location.coords.altitude,
    speed: location.coords.speed,
  };
}

export async function allocateRecordingEvidenceSession(input: {
  sessionId: string;
  profileId: string;
}): Promise<void> {
  if (!input.sessionId || !input.profileId) throw new Error("Recording evidence owner is required");
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getAllAsync<{ profile_id: string; state: string }>(
      "SELECT profile_id, state FROM recording_evidence_sessions WHERE session_id = ?",
      input.sessionId,
    );
    const session = existing[0];
    if (session && session.profile_id !== input.profileId)
      throw new Error("Recording evidence session owner does not match");
    if (!session) {
      const active = await tx.getAllAsync<{ session_id: string }>(
        "SELECT session_id FROM recording_evidence_sessions WHERE profile_id = ? AND state = 'active'",
        input.profileId,
      );
      if (active.length > 0) {
        throw new Error("Recording evidence already has an active session for this profile");
      }
      await tx.runAsync(
        "INSERT INTO recording_evidence_sessions (session_id, profile_id, state, created_at) VALUES (?, ?, 'active', ?)",
        input.sessionId,
        input.profileId,
        Date.now(),
      );
    } else if (session.state !== "active")
      throw new Error("Recording evidence session is not writable");
  });
}

/** Checkpoints are SQLite-authoritative; AsyncStorage is only a compatibility mirror. */
export async function persistRecordingEvidenceCheckpoint(input: {
  sessionId: string;
  profileId: string;
  checkpoint: unknown;
}): Promise<void> {
  const payload = canonicalJson(input.checkpoint);
  const digest = await sha256(payload);
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = (
      await tx.getAllAsync<{ profile_id: string; state: string }>(
        "SELECT profile_id, state FROM recording_evidence_sessions WHERE session_id = ?",
        input.sessionId,
      )
    )[0];
    if (
      !session ||
      session.profile_id !== input.profileId ||
      !["active", "fenced", "finalized"].includes(session.state)
    )
      throw new Error("Recording checkpoint has no writable evidence session");
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_json = ?, checkpoint_digest = ? WHERE session_id = ?",
      payload,
      digest,
      input.sessionId,
    );
  });
}

/**
 * SQLite is the recovery authority.  A finalized session has already handed its
 * artifact to the queue and must never compete with a new active session for a
 * checkpoint; a fenced row is considered only when it has an explicit rebuild
 * marker.  This ordering deliberately does not depend on wall-clock ordering.
 */
export async function loadRecordingEvidenceCheckpoint(profileId: string): Promise<string | null> {
  const db = await getRecordingEvidenceDatabase();
  const rows = await db.getAllAsync<{
    session_id: string;
    checkpoint_json: string;
    checkpoint_digest: string;
  }>(
    `SELECT s.session_id, s.checkpoint_json, s.checkpoint_digest
       FROM recording_evidence_sessions s
       LEFT JOIN recording_finalization_recovery r ON r.session_id = s.session_id
      WHERE s.profile_id = ? AND s.checkpoint_json IS NOT NULL
        AND (s.state = 'active' OR (s.state = 'fenced' AND r.status = 'pending'))
      ORDER BY CASE s.state WHEN 'active' THEN 0 ELSE 1 END, s.created_at DESC`,
    profileId,
  );
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (!row) return null;
  if ((await sha256(row.checkpoint_json)) !== row.checkpoint_digest) {
    await quarantineRecordingEvidenceSession({
      sessionId: row.session_id,
      profileId,
      reason: "sqlite-checkpoint-digest-invalid",
    });
    throw new Error("sqlite-checkpoint-digest-invalid");
  }
  return row.checkpoint_json;
}

/** Removes an allocated-but-not-active session from the active pointer. */
export async function rollbackRecordingEvidenceSession(
  sessionId: string,
  reason: string,
): Promise<void> {
  const boundedReason = reason.slice(0, 160) || "recording-start-rollback";
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = (
      await tx.getAllAsync<{ state: string }>(
        "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
        sessionId,
      )
    )[0];
    if (!session || session.state !== "active") return;
    // Keep any evidence that crossed a producer boundary. Quarantine releases
    // the one-active-session constraint without deleting forensic data.
    await quarantineEvidence(tx, sessionId, `start-rollback:${boundedReason}`);
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_json = NULL, checkpoint_digest = NULL WHERE session_id = ?",
      sessionId,
    );
  });
}

/** Headless-safe: selects exactly one active session and never consults React callbacks. */
export async function appendHeadlessGpsLocations(
  locations: readonly Location.LocationObject[],
): Promise<number> {
  const valid = locations.filter(validLocation);
  if (!valid.length) return 0;
  const db = await getRecordingEvidenceDatabase();
  const invalidCount = Math.min(MAX_INVALID_HEADLESS_ENVELOPES, locations.length - valid.length);
  if (invalidCount)
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (let index = 0; index < invalidCount; index += 1)
        await quarantineEvidence(tx, null, "invalid-headless-location");
    });
  for (let offset = 0; offset < valid.length; offset += MAX_HEADLESS_ENVELOPES)
    await db.withExclusiveTransactionAsync(async (tx) => {
      const active = await tx.getAllAsync<{ session_id: string; next_sequence: number }>(
        "SELECT session_id, next_sequence FROM recording_evidence_sessions WHERE state = 'active' ORDER BY created_at",
      );
      if (active.length !== 1) {
        for (const candidate of active)
          await quarantineEvidence(tx, candidate.session_id, "ambiguous-active-session");
        if (active.length === 0) throw new RecordingEvidenceClosedError();
        throw new Error("Recording evidence active session is ambiguous");
      }
      const session = active[0];
      if (!session) throw new Error("Recording evidence has no active session");
      let sequence = session.next_sequence;
      for (const location of valid.slice(offset, offset + MAX_HEADLESS_ENVELOPES)) {
        const payload = canonicalJson(envelope(location));
        if (payload.length > MAX_ENVELOPE_BYTES)
          throw new Error("GPS evidence envelope exceeds bound");
        await tx.runAsync(
          "INSERT INTO recording_gps_envelopes (session_id, sequence, timestamp, payload, byte_size, sha256, commit_marker) VALUES (?, ?, ?, ?, ?, ?, ?)",
          session.session_id,
          sequence++,
          location.timestamp,
          payload,
          payload.length,
          await sha256(payload),
          COMMIT_MARKER,
        );
      }
      await tx.runAsync(
        "UPDATE recording_evidence_sessions SET next_sequence = ? WHERE session_id = ? AND state = 'active'",
        sequence,
        session.session_id,
      );
    });
  return valid.length;
}

/** Explicit fenced-session recovery path for headless GPS evidence. */
export async function recoverHeadlessGpsLocations(
  sessionId: string,
  profileId: string,
): Promise<
  Array<{
    timestamp: number;
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
  }>
> {
  const db = await getRecordingEvidenceDatabase();
  const session = (
    await db.getAllAsync<{ profile_id: string }>(
      "SELECT profile_id FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    )
  )[0];
  if (!session || session.profile_id !== profileId) throw new Error("profile-session-mismatch");
  const rows = await db.getAllAsync<{
    sequence: number;
    timestamp: number;
    payload: string;
    byte_size: number;
    sha256: string;
    commit_marker: string;
  }>(
    "SELECT sequence, timestamp, payload, byte_size, sha256, commit_marker FROM recording_gps_envelopes WHERE session_id = ? ORDER BY sequence",
    sessionId,
  );
  const result: Array<{
    timestamp: number;
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
  }> = [];
  let previous = -1;
  for (const [sequence, row] of rows.entries()) {
    if (
      row.sequence !== sequence ||
      row.commit_marker !== COMMIT_MARKER ||
      row.byte_size !== byteSize(row.payload) ||
      (await sha256(row.payload)) !== row.sha256
    )
      throw new Error("headless-gps-evidence-invalid");
    const value = JSON.parse(row.payload) as {
      timestamp: number;
      latitude: number;
      longitude: number;
      altitude?: number | null;
      accuracy?: number;
    };
    if (
      !Number.isFinite(value.timestamp) ||
      value.timestamp < previous ||
      !Number.isFinite(value.latitude) ||
      !Number.isFinite(value.longitude)
    ) {
      throw new Error("headless-gps-evidence-invalid");
    }
    previous = value.timestamp;
    result.push({
      timestamp: value.timestamp,
      latitude: value.latitude,
      longitude: value.longitude,
      ...(typeof value.altitude === "number" ? { altitude: value.altitude } : {}),
      ...(typeof value.accuracy === "number" ? { accuracy: value.accuracy } : {}),
    });
  }
  return result;
}

export type RecordingEvidenceRecovery =
  | { status: "none" }
  | { status: "recovered"; sessionId: string; profileId: string; envelopeCount: number }
  | { status: "quarantined"; reason: string };

async function finalizedArtifactMatches(session: {
  finalized_path: string | null;
  finalized_size: number | null;
  finalized_sha256: string | null;
}): Promise<boolean> {
  if (!session.finalized_path || !session.finalized_size || !session.finalized_sha256) return false;
  const [{ CryptoDigestAlgorithm, digest }, { File }] = await Promise.all([
    import("expo-crypto"),
    import("expo-file-system"),
  ]);
  const file = new File(session.finalized_path);
  if (!file.exists || file.size !== session.finalized_size || file.size <= 0) return false;
  const value = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
  const sha256 = Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== session.finalized_sha256) return false;
  try {
    const { validateFinalizedFitFile } = await import("../fit/GarminFitEncoder");
    await validateFinalizedFitFile(session.finalized_path);
    return true;
  } catch {
    return false;
  }
}

export type FinalizedArtifactReferenceRecovery =
  | { status: "healthy"; sessionId: string }
  | { status: "rebuild-pending"; sessionId: string; reason: string }
  | { status: "blocked"; sessionId: string; reason: string };

/**
 * Revalidates SQLite's derived FIT reference. A bad derived file never taints
 * the committed stream/GPS evidence: its reference is removed and the already
 * fenced session becomes a durable rebuild candidate.
 */
export async function inspectFinalizedArtifactReferences(
  profileId: string,
): Promise<FinalizedArtifactReferenceRecovery[]> {
  const db = await getRecordingEvidenceDatabase();
  const recovered: FinalizedArtifactReferenceRecovery[] = [];
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      session_id: string;
      state: string;
      finalized_path: string | null;
      finalized_size: number | null;
      finalized_sha256: string | null;
      finalized_artifact_json: string | null;
      finalized_artifact_digest: string | null;
      checkpoint_json: string | null;
      checkpoint_digest: string | null;
      recovery_status: "pending" | "blocked" | null;
      recovery_reason: string | null;
    }>(
      `SELECT s.session_id, s.state, s.finalized_path, s.finalized_size, s.finalized_sha256, s.finalized_artifact_json, s.finalized_artifact_digest, s.checkpoint_json, s.checkpoint_digest,
          r.status AS recovery_status, r.reason AS recovery_reason
        FROM recording_evidence_sessions s
        LEFT JOIN recording_finalization_recovery r ON r.session_id = s.session_id
        WHERE s.profile_id = ? AND (s.finalized_path IS NOT NULL OR r.status IS NOT NULL)`,
      profileId,
    );
    for (const session of sessions) {
      if (session.recovery_status === "blocked") {
        recovered.push({
          status: "blocked",
          sessionId: session.session_id,
          reason: session.recovery_reason ?? "finalization-rebuild-blocked",
        });
        continue;
      }
      if (session.recovery_status === "pending") {
        recovered.push({
          status: "rebuild-pending",
          sessionId: session.session_id,
          reason: session.recovery_reason ?? "finalized-artifact-mismatch",
        });
        continue;
      }
      if (await finalizedArtifactMatches(session)) {
        // A pre-atomic-finalization row can have validated bytes but no durable
        // handoff. Never submit that file based on its path alone. A complete
        // handoff payload is re-enqueued by startup; otherwise only a bounded,
        // digest-verified checkpoint may rebuild it.
        if (!session.finalized_artifact_json) {
          const checkpointUsable = Boolean(
            session.checkpoint_json &&
              session.checkpoint_digest &&
              (await sha256(session.checkpoint_json)) === session.checkpoint_digest,
          );
          const reason = checkpointUsable
            ? "legacy-finalized-handoff-missing"
            : "legacy-finalized-recovery-manifest-missing";
          await tx.runAsync(
            "UPDATE recording_evidence_sessions SET state = 'fenced' WHERE session_id = ? AND state = 'finalized'",
            session.session_id,
          );
          await tx.runAsync(
            "INSERT OR REPLACE INTO recording_finalization_recovery (session_id, status, reason, updated_at) VALUES (?, ?, ?, ?)",
            session.session_id,
            checkpointUsable ? "pending" : "blocked",
            reason,
            Date.now(),
          );
          recovered.push({
            status: checkpointUsable ? "rebuild-pending" : "blocked",
            sessionId: session.session_id,
            reason,
          });
          continue;
        }
        recovered.push({ status: "healthy", sessionId: session.session_id });
        continue;
      }
      const reference = session.finalized_path;
      await tx.runAsync(
        "UPDATE recording_evidence_sessions SET state = 'fenced', finalized_path = NULL, finalized_size = NULL, finalized_sha256 = NULL WHERE session_id = ? AND state = 'finalized'",
        session.session_id,
      );
      await tx.runAsync(
        "INSERT OR REPLACE INTO recording_finalization_recovery (session_id, status, reason, updated_at) VALUES (?, 'pending', 'finalized-artifact-mismatch', ?)",
        session.session_id,
        Date.now(),
      );
      await quarantineEvidence(
        tx,
        null,
        "finalized-artifact-mismatch",
        JSON.stringify({ sessionId: session.session_id, path: reference }),
      );
      // This is the derived FIT path recorded above, never a stream/GPS evidence path.
      if (reference) {
        try {
          const { File } = await import("expo-file-system");
          const file = new File(reference);
          if (file.exists) file.delete();
        } catch {}
      }
      recovered.push({
        status: "rebuild-pending",
        sessionId: session.session_id,
        reason: "finalized-artifact-mismatch",
      });
    }
  });
  return recovered;
}

export async function blockFinalizedArtifactRebuild(
  sessionId: string,
  reason: string,
): Promise<void> {
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "UPDATE recording_finalization_recovery SET status = 'blocked', reason = ?, updated_at = ? WHERE session_id = ?",
      reason,
      Date.now(),
      sessionId,
    );
  });
}

/** Validates every persisted byte; corrupt evidence is isolated without blocking other sessions. */
export async function inspectRecordingEvidenceSession(
  sessionId: string,
  profileId: string,
): Promise<RecordingEvidenceRecovery> {
  const db = await getRecordingEvidenceDatabase();
  let recovery: RecordingEvidenceRecovery = { status: "none" };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      profile_id: string;
      state: string;
      next_sequence: number;
      finalized_path: string | null;
      finalized_size: number | null;
      finalized_sha256: string | null;
    }>(
      "SELECT profile_id, state, next_sequence, finalized_path, finalized_size, finalized_sha256 FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    );
    const session = sessions[0];
    if (!session) return;
    if (session.profile_id !== profileId) {
      await quarantineEvidence(tx, sessionId, "profile-session-mismatch");
      recovery = { status: "quarantined", reason: "profile-session-mismatch" };
      return;
    }
    if (session.state === "finalized" && !(await finalizedArtifactMatches(session))) {
      await tx.runAsync(
        "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ?",
        sessionId,
      );
      await quarantineEvidence(tx, null, "finalized-artifact-mismatch");
      recovery = { status: "quarantined", reason: "finalized-artifact-mismatch" };
      return;
    }
    const rows = await tx.getAllAsync<{
      sequence: number;
      timestamp: number;
      payload: string;
      byte_size: number;
      sha256: string;
      commit_marker: string;
    }>(
      "SELECT sequence, timestamp, payload, byte_size, sha256, commit_marker FROM recording_gps_envelopes WHERE session_id = ? ORDER BY sequence",
      sessionId,
    );
    try {
      let previousTimestamp = -1;
      for (const [expectedSequence, row] of rows.entries()) {
        if (
          row.sequence !== expectedSequence ||
          row.commit_marker !== COMMIT_MARKER ||
          row.byte_size !== row.payload.length
        ) {
          throw new Error("sequence-or-commit-marker-invalid");
        }
        if ((await sha256(row.payload)) !== row.sha256) throw new Error("digest-invalid");
        const parsed = JSON.parse(row.payload) as { timestamp?: number };
        const timestamp = parsed.timestamp;
        if (
          !Number.isFinite(timestamp) ||
          timestamp === undefined ||
          timestamp < previousTimestamp ||
          timestamp !== row.timestamp
        )
          throw new Error("timestamp-order-invalid");
        previousTimestamp = timestamp;
      }
      if (session.next_sequence !== rows.length) throw new Error("sequence-cursor-invalid");
      recovery = { status: "recovered", sessionId, profileId, envelopeCount: rows.length };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unreadable-evidence";
      await quarantineEvidence(tx, sessionId, reason);
      recovery = { status: "quarantined", reason };
    }
  });
  return recovery;
}

/** The finalization fence makes all later headless/foreground writes fail. */
export async function fenceRecordingEvidenceSession(sessionId: string): Promise<void> {
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'fenced' WHERE session_id = ? AND state = 'active'",
      sessionId,
    );
    const state = await tx.getAllAsync<{ state: string }>(
      "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    );
    if (state[0]?.state !== "fenced")
      throw new Error("Recording evidence session cannot be fenced");
  });
}

export async function recordValidatedFinalizedArtifact(input: {
  sessionId: string;
  path: string;
  byteSize: number;
  sha256: string;
}): Promise<void> {
  if (!input.path || input.byteSize <= 0 || !/^[0-9a-f]{64}$/.test(input.sha256))
    throw new Error("Finalized recording artifact validation is incomplete");
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_size = ?, finalized_sha256 = ? WHERE session_id = ? AND state = 'fenced'",
      input.path,
      input.byteSize,
      input.sha256,
      input.sessionId,
    );
    const state = await tx.getAllAsync<{ state: string }>(
      "SELECT state FROM recording_evidence_sessions WHERE session_id = ?",
      input.sessionId,
    );
    if (state[0]?.state !== "finalized")
      throw new Error("Recording evidence artifact cannot be committed");
    await tx.runAsync(
      "DELETE FROM recording_finalization_recovery WHERE session_id = ?",
      input.sessionId,
    );
  });
}

/** The only finalized transition: validated FIT reference and handoff are indivisible. */
export async function commitFinalizedArtifactAndHandoff(input: {
  sessionId: string;
  path: string;
  byteSize: number;
  sha256: string;
  artifact: RecordingSessionArtifact;
}): Promise<void> {
  if (!input.path || input.byteSize <= 0 || !/^[0-9a-f]{64}$/.test(input.sha256))
    throw new Error("Finalized recording artifact validation is incomplete");
  const artifact = recordingSessionArtifactSchema.parse(input.artifact);
  if (artifact.sessionId !== input.sessionId)
    throw new Error("Finalized recording handoff session does not match");
  const payload = canonicalJson(artifact);
  const digest = await sha256(payload);
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = (
      await tx.getAllAsync<{ profile_id: string; state: string }>(
        "SELECT profile_id, state FROM recording_evidence_sessions WHERE session_id = ?",
        input.sessionId,
      )
    )[0];
    if (!session || session.profile_id !== artifact.profileId || session.state !== "fenced")
      throw new Error("Recording evidence artifact cannot be committed");
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'finalized', finalized_path = ?, finalized_size = ?, finalized_sha256 = ?, finalized_artifact_json = ?, finalized_artifact_digest = ?, checkpoint_json = NULL, checkpoint_digest = NULL WHERE session_id = ? AND state = 'fenced'",
      input.path,
      input.byteSize,
      input.sha256,
      payload,
      digest,
      input.sessionId,
    );
    await tx.runAsync(
      "DELETE FROM recording_finalization_recovery WHERE session_id = ?",
      input.sessionId,
    );
  });
}

/** SQLite owns the complete validated handoff until the exact queue operation exists. */
export async function persistFinalizedArtifactHandoff(
  artifact: RecordingSessionArtifact,
): Promise<void> {
  const parsed = recordingSessionArtifactSchema.parse(artifact);
  const payload = canonicalJson(parsed);
  const digest = await sha256(payload);
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = (
      await tx.getAllAsync<{ profile_id: string; state: string }>(
        "SELECT profile_id, state FROM recording_evidence_sessions WHERE session_id = ?",
        parsed.sessionId,
      )
    )[0];
    if (!session || session.profile_id !== parsed.profileId || session.state !== "finalized") {
      throw new Error("Finalized recording handoff has no matching finalized evidence session");
    }
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET finalized_artifact_json = ?, finalized_artifact_digest = ? WHERE session_id = ?",
      payload,
      digest,
      parsed.sessionId,
    );
  });
}

export async function loadFinalizedArtifactHandoffs(
  profileId: string,
): Promise<RecordingSessionArtifact[]> {
  const db = await getRecordingEvidenceDatabase();
  const rows = await db.getAllAsync<{
    session_id: string;
    finalized_artifact_json: string;
    finalized_artifact_digest: string;
  }>(
    "SELECT session_id, finalized_artifact_json, finalized_artifact_digest FROM recording_evidence_sessions WHERE profile_id = ? AND state = 'finalized' AND finalized_artifact_json IS NOT NULL",
    profileId,
  );
  const artifacts: RecordingSessionArtifact[] = [];
  for (const row of rows) {
    try {
      if ((await sha256(row.finalized_artifact_json)) !== row.finalized_artifact_digest) {
        throw new Error("handoff-digest-invalid");
      }
      const artifact = recordingSessionArtifactSchema.parse(
        JSON.parse(row.finalized_artifact_json),
      );
      if (artifact.profileId !== profileId || artifact.sessionId !== row.session_id) {
        throw new Error("handoff-owner-invalid");
      }
      artifacts.push(artifact);
    } catch (error) {
      await db.withExclusiveTransactionAsync((tx) =>
        quarantineEvidence(
          tx,
          row.session_id,
          error instanceof Error ? error.message : "handoff-invalid",
        ),
      );
    }
  }
  return artifacts;
}

/**
 * Records the remotely accepted operation before deleting only its SQLite
 * derivations.  The tiny tombstone preserves idempotency/replay identity while
 * raw route and stream payloads disappear.  Any rebuilding or non-terminal
 * peer reference fences collection.
 */
export async function tombstoneAcceptedRecordingEvidence(
  job: ActivitySubmissionQueueJob,
): Promise<boolean> {
  if (job.status !== "complete" || !job.activityId) return false;
  const operationId = job.draft.recordingSessionId ?? job.sessionId ?? job.artifactId;
  const sessionId = job.sessionId ?? job.draft.recordingSessionId ?? job.artifactId;
  let collected = false;
  await withRecordingEvidenceTransaction(async (tx) => {
    const exact = await tx.getAllAsync<{ job_json: string }>(
      "SELECT job_json FROM activity_submission_queue_jobs WHERE id = ? AND operation_id = ? AND status = 'complete'",
      job.id,
      operationId,
    );
    if (exact.length !== 1) return;
    let persisted: ActivitySubmissionQueueJob;
    const exactJob = exact[0];
    if (!exactJob) return;
    try {
      persisted = activitySubmissionQueueJobSchema.parse(JSON.parse(exactJob.job_json));
    } catch {
      return;
    }
    if (persisted.activityId !== job.activityId) return;
    const peers = await tx.getAllAsync<{ id: string }>(
      "SELECT id FROM activity_submission_queue_jobs WHERE id != ? AND status != 'complete' AND (session_id = ? OR artifact_id = ?)",
      job.id,
      sessionId,
      job.artifactId,
    );
    const rebuilding = await tx.getAllAsync<{ session_id: string }>(
      "SELECT session_id FROM recording_finalization_recovery WHERE session_id = ?",
      sessionId,
    );
    if (peers.length || rebuilding.length) return;
    await tx.runAsync(
      "INSERT OR IGNORE INTO recording_evidence_acceptance_tombstones (operation_id, activity_id, accepted_at) VALUES (?, ?, ?)",
      operationId,
      job.activityId,
      Date.now(),
    );
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'accepted', cleanup_pending = 1, cleanup_error = NULL, cleanup_attempts = 0, next_cleanup_at = ? WHERE session_id = ?",
      Date.now(),
      sessionId,
    );
    collected = true;
  });
  return collected;
}

export type AcceptedRecordingEvidenceCleanup = {
  sessionId: string;
  activityFilePath: string | null;
  streamArtifactPaths: string[];
};

export async function loadDueAcceptedRecordingEvidenceCleanups(
  now = Date.now(),
  batchSize = EVIDENCE_GC_BATCH_SIZE,
): Promise<AcceptedRecordingEvidenceCleanup[]> {
  const limit = Math.max(1, Math.min(batchSize, EVIDENCE_GC_BATCH_SIZE));
  return withRecordingEvidenceTransaction((tx) =>
    tx
      .getAllAsync<{
        session_id: string;
        finalized_path: string | null;
        finalized_artifact_json: string | null;
      }>(
        "SELECT session_id, finalized_path, finalized_artifact_json FROM recording_evidence_sessions WHERE state = 'accepted' AND cleanup_pending = 1 AND COALESCE(next_cleanup_at, 0) <= ? ORDER BY next_cleanup_at, created_at LIMIT ?",
        now,
        limit,
      )
      .then((rows) =>
        rows.map((row) => {
          let streamArtifactPaths: string[] = [];
          try {
            streamArtifactPaths = recordingSessionArtifactSchema.parse(
              JSON.parse(row.finalized_artifact_json ?? "{}"),
            ).streamArtifactPaths;
          } catch {}
          return {
            sessionId: row.session_id,
            activityFilePath: row.finalized_path,
            streamArtifactPaths,
          };
        }),
      ),
  );
}

export async function completeAcceptedRecordingEvidenceCleanup(sessionId: string): Promise<void> {
  await withRecordingEvidenceTransaction(async (tx) => {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET cleanup_pending = 0, cleanup_error = NULL, next_cleanup_at = NULL, finalized_path = NULL, finalized_size = NULL, finalized_sha256 = NULL, finalized_artifact_json = NULL, finalized_artifact_digest = NULL WHERE session_id = ? AND state = 'accepted'",
      sessionId,
    );
    await tx.runAsync("DELETE FROM recording_gps_envelopes WHERE session_id = ?", sessionId);
    await tx.runAsync("DELETE FROM recording_stream_envelopes WHERE session_id = ?", sessionId);
  });
}

export async function retryAcceptedRecordingEvidenceCleanup(
  sessionId: string,
  category: string,
  now = Date.now(),
): Promise<void> {
  await withRecordingEvidenceTransaction(async (tx) => {
    const row = (
      await tx.getAllAsync<{ cleanup_attempts: number }>(
        "SELECT cleanup_attempts FROM recording_evidence_sessions WHERE session_id = ? AND state = 'accepted' AND cleanup_pending = 1",
        sessionId,
      )
    )[0];
    if (!row) return;
    const attempts = row.cleanup_attempts + 1;
    const delay = Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts, 8));
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET cleanup_attempts = ?, cleanup_error = ?, next_cleanup_at = ? WHERE session_id = ?",
      attempts,
      category.slice(0, 80),
      now + delay,
      sessionId,
    );
  });
}

/**
 * Bounded, retry-safe retention sweep. It never ages pending/retryable rows:
 * only already quarantined terminal sessions and old acceptance tombstones are
 * eligible. The exact accepted-operation path above remains the only raw-data
 * deletion path for a successful submission.
 */
export async function garbageCollectExpiredRecordingEvidence(
  now = Date.now(),
  batchSize = EVIDENCE_GC_BATCH_SIZE,
): Promise<number> {
  const limit = Math.max(1, Math.min(batchSize, EVIDENCE_GC_BATCH_SIZE));
  let deleted = 0;
  await withRecordingEvidenceTransaction(async (tx) => {
    const terminal = await tx.getAllAsync<{ session_id: string }>(
      `SELECT s.session_id FROM recording_evidence_sessions s
       WHERE s.state = 'quarantined' AND s.created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM activity_submission_queue_jobs q WHERE q.status != 'complete' AND (q.session_id = s.session_id OR q.artifact_id = s.session_id))
       AND NOT EXISTS (SELECT 1 FROM recording_finalization_recovery r WHERE r.session_id = s.session_id)
       ORDER BY s.created_at LIMIT ?`,
      now - RAW_TERMINAL_EVIDENCE_RETENTION_MS,
      limit,
    );
    for (const row of terminal) {
      await tx.runAsync("DELETE FROM recording_gps_envelopes WHERE session_id = ?", row.session_id);
      await tx.runAsync(
        "DELETE FROM recording_stream_envelopes WHERE session_id = ?",
        row.session_id,
      );
      await tx.runAsync(
        "DELETE FROM recording_evidence_sessions WHERE session_id = ? AND state = 'quarantined'",
        row.session_id,
      );
      deleted += 1;
    }
    const remaining = limit - deleted;
    if (remaining > 0) {
      const result = await tx.runAsync(
        "DELETE FROM recording_evidence_acceptance_tombstones WHERE operation_id IN (SELECT operation_id FROM recording_evidence_acceptance_tombstones WHERE accepted_at <= ? ORDER BY accepted_at LIMIT ?)",
        now - ACCEPTANCE_TOMBSTONE_RETENTION_MS,
        remaining,
      );
      deleted += Math.min(result.changes ?? 0, remaining);
    }
    // Bound terminal quarantine metadata separately from raw evidence. These
    // predicates preserve the newest evidence for each session/profile.
    await tx.runAsync(
      `DELETE FROM recording_evidence_quarantine WHERE id IN (
      SELECT id FROM recording_evidence_quarantine WHERE quarantined_at <= ? ORDER BY quarantined_at LIMIT ?
    )`,
      now - QUARANTINED_EVIDENCE_RETENTION_MS,
      limit,
    );
    await tx.runAsync(
      `DELETE FROM recording_evidence_quarantine AS old WHERE old.session_id IS NOT NULL AND (
      SELECT COUNT(*) FROM recording_evidence_quarantine AS newer WHERE newer.session_id = old.session_id AND newer.id > old.id
    ) >= ?`,
      MAX_QUARANTINE_ROWS_PER_SESSION,
    );
    await tx.runAsync(
      `DELETE FROM recording_evidence_quarantine AS old WHERE old.session_id IN (
      SELECT s.session_id FROM recording_evidence_sessions s WHERE s.profile_id = (
        SELECT profile_id FROM recording_evidence_sessions WHERE session_id = old.session_id
      )
    ) AND (
      SELECT COUNT(*) FROM recording_evidence_quarantine AS newer JOIN recording_evidence_sessions s ON s.session_id = newer.session_id
      WHERE s.profile_id = (SELECT profile_id FROM recording_evidence_sessions WHERE session_id = old.session_id) AND newer.id > old.id
    ) >= ?`,
      MAX_QUARANTINE_ROWS_PER_PROFILE,
    );
  });
  return deleted;
}
