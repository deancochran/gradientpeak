import { type RecordingSessionArtifact, recordingSessionArtifactSchema } from "@repo/core";
import type { ActivitySubmissionQueueJob } from "../activitySubmissionQueue/types";
import { activitySubmissionQueueJobSchema } from "../activitySubmissionQueue/types";

const DATABASE_NAME = "gradientpeak-recording-evidence.db";
const CURRENT_SCHEMA_VERSION = 6;
const STREAM_COMMIT_MARKER = "stream-committed-v1";
const STREAM_VERSION = 1;
const MAX_STREAM_ENVELOPE_BYTES = 1_048_576;
const COORDINATE_EVIDENCE_QUARANTINE_REASON = "gps-policy-coordinate-evidence-rejected";
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

type RecordingEvidenceDatabaseHandle = RecordingEvidenceSqlExecutor & {
  closeAsync?: () => Promise<void>;
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

let databasePromise: Promise<RecordingEvidenceDatabaseHandle> | undefined;
let claimedCheckpointSessionId: string | null = null;

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

/** Creates the complete current authority for a brand-new recording database. */
async function createCurrentRecordingEvidenceSchema(
  tx: RecordingEvidenceSqlExecutor,
): Promise<void> {
  await tx.execAsync(`CREATE TABLE recording_evidence_sessions (session_id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active', 'fenced', 'finalized', 'accepted', 'quarantined')), created_at INTEGER NOT NULL, finalized_path TEXT, finalized_size INTEGER, finalized_sha256 TEXT, finalized_artifact_json TEXT, finalized_artifact_digest TEXT, next_stream_order INTEGER NOT NULL DEFAULT 0, checkpoint_json TEXT, checkpoint_digest TEXT, cleanup_pending INTEGER NOT NULL DEFAULT 0, cleanup_error TEXT, cleanup_attempts INTEGER NOT NULL DEFAULT 0, next_cleanup_at INTEGER);
    CREATE TABLE recording_evidence_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE recording_evidence_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, reason TEXT NOT NULL, payload TEXT, quarantined_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX one_active_recording_evidence_per_profile ON recording_evidence_sessions(profile_id) WHERE state = 'active';
    CREATE TABLE recording_stream_envelopes (session_id TEXT NOT NULL REFERENCES recording_evidence_sessions(session_id), stream_kind TEXT NOT NULL, sequence INTEGER NOT NULL, stream_order INTEGER NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, commit_marker TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (session_id, stream_kind, sequence), UNIQUE (session_id, stream_kind, stream_order));
    CREATE INDEX recording_stream_envelopes_recovery ON recording_stream_envelopes(session_id, stream_kind, sequence);
    CREATE UNIQUE INDEX recording_stream_envelopes_global_order ON recording_stream_envelopes(session_id, stream_order);
    CREATE TABLE activity_submission_queue_jobs (id TEXT PRIMARY KEY NOT NULL, operation_id TEXT NOT NULL UNIQUE, profile_id TEXT NOT NULL, session_id TEXT NOT NULL, artifact_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, retry_class TEXT NOT NULL, next_attempt_at INTEGER, error_category TEXT, lease_owner TEXT, lease_token TEXT, lease_expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, job_json TEXT NOT NULL, schema_version INTEGER NOT NULL);
    CREATE INDEX activity_submission_queue_due ON activity_submission_queue_jobs(profile_id, status, next_attempt_at, lease_expires_at);
    CREATE TABLE activity_submission_queue_quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, reason TEXT NOT NULL, quarantined_at INTEGER NOT NULL);
    CREATE TABLE recording_evidence_acceptance_tombstones (operation_id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL, accepted_at INTEGER NOT NULL);
    CREATE INDEX recording_evidence_accepted_cleanup_due ON recording_evidence_sessions(state, cleanup_pending, next_cleanup_at);`);
}

async function quarantineCoordinateEvidenceRows(
  tx: RecordingEvidenceSqlExecutor,
  options: { includeLegacyGpsTable: boolean; profileId?: string },
): Promise<number> {
  const profilePredicate = options.profileId ? "AND s.profile_id = ?" : "";
  const params = options.profileId ? [options.profileId] : [];
  const legacyGpsPredicate = options.includeLegacyGpsTable
    ? "OR EXISTS (SELECT 1 FROM recording_gps_envelopes gps WHERE gps.session_id = s.session_id)"
    : "";
  const sessions = await tx.getAllAsync<{ session_id: string }>(
    `SELECT DISTINCT s.session_id
       FROM recording_evidence_sessions s
      WHERE s.state IN ('active', 'fenced', 'finalized') ${profilePredicate}
        AND (EXISTS (SELECT 1 FROM recording_stream_envelopes stream WHERE stream.session_id = s.session_id AND stream.stream_kind = 'latlng') ${legacyGpsPredicate})`,
    ...params,
  );
  for (const session of sessions) {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET state = 'quarantined', checkpoint_json = NULL, checkpoint_digest = NULL WHERE session_id = ? AND state IN ('active', 'fenced', 'finalized')",
      session.session_id,
    );
    await tx.runAsync(
      "UPDATE activity_submission_queue_jobs SET status = 'failed', retry_class = 'permanent', next_attempt_at = NULL, error_category = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ? WHERE session_id = ? AND status != 'complete'",
      COORDINATE_EVIDENCE_QUARANTINE_REASON,
      Date.now(),
      session.session_id,
    );
    await tx.runAsync(
      "INSERT INTO recording_evidence_quarantine (session_id, reason, payload, quarantined_at) VALUES (?, ?, NULL, ?)",
      session.session_id,
      COORDINATE_EVIDENCE_QUARANTINE_REASON,
      Date.now(),
    );
    if (claimedCheckpointSessionId === session.session_id) claimedCheckpointSessionId = null;
  }
  await tx.runAsync("DELETE FROM recording_stream_envelopes WHERE stream_kind = 'latlng'");
  return sessions.length;
}

async function migrateSchemaVersionFive(tx: RecordingEvidenceSqlExecutor): Promise<void> {
  await quarantineCoordinateEvidenceRows(tx, { includeLegacyGpsTable: true });
  await tx.execAsync(`DROP INDEX IF EXISTS recording_gps_envelopes_session_sequence;
    DROP TABLE IF EXISTS recording_gps_envelopes;`);
}

/** Public initializer so adapter-level tests exercise the production protocol. */
export async function initializeRecordingEvidenceDatabase(
  db: RecordingEvidenceSqlExecutor,
): Promise<void> {
  const pragma = await db.getAllAsync<{ user_version?: number }>("PRAGMA user_version");
  const version = pragma[0]?.user_version ?? 0;
  if (version !== 0 && version !== 5 && version !== CURRENT_SCHEMA_VERSION)
    throw new Error("unsupported-recording-evidence-schema");
  if (version === 0) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await createCurrentRecordingEvidenceSchema(tx);
      await tx.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    });
  } else if (version === 5) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await migrateSchemaVersionFive(tx);
      await tx.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    });
  } else {
    await db.withExclusiveTransactionAsync((tx) =>
      quarantineCoordinateEvidenceRows(tx, { includeLegacyGpsTable: false }).then(() => undefined),
    );
  }
  await db.execAsync("PRAGMA foreign_keys = ON");
}

/** Queue storage shares the recorder's SQLite durability boundary. */
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

function isCoordinateStreamEnvelope(input: { streamKind: string; payload: string }): boolean {
  if (input.streamKind === "latlng") return true;
  try {
    const payload = JSON.parse(input.payload) as { dataType?: unknown; metric?: unknown };
    return payload.metric === "latlng" || payload.dataType === "latlng";
  } catch {
    return false;
  }
}

function assertStreamEnvelope(input: Omit<RecordingStreamEnvelope, "sequence" | "order">): void {
  if (isCoordinateStreamEnvelope(input)) throw new Error("coordinate-stream-ingestion-forbidden");
  if (
    !input.streamKind ||
    !Number.isFinite(input.timestamp) ||
    !input.payload ||
    byteSize(input.payload) > MAX_STREAM_ENVELOPE_BYTES
  ) {
    throw new Error("invalid-stream-envelope");
  }
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
        if (isCoordinateStreamEnvelope(row)) {
          throw new Error("stream-coordinate-evidence-forbidden");
        }
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
        /^stream-(?:order-or-marker-invalid|digest-invalid|coordinate-evidence-forbidden)$/.test(
          error.message,
        )
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

export function resetRecordingEvidenceJournalForTests(): void {
  databasePromise = undefined;
  claimedCheckpointSessionId = null;
}

/**
 * Removes all recorder evidence authority for a contract-epoch reset. The
 * cached handle is closed before deletion and is forgotten even when close or
 * deletion fails, allowing the next startup attempt to retry safely.
 */
export async function resetRecordingEvidenceJournal(): Promise<void> {
  const pendingDatabase = databasePromise;
  databasePromise = undefined;
  claimedCheckpointSessionId = null;
  const database = await pendingDatabase;
  if (database?.closeAsync) await database.closeAsync();
  const SQLite = await import("expo-sqlite");
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  await getRecordingEvidenceDatabase();
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
 * Releases only the identified recoverable owner. This deliberately retains numeric
 * stream rows: a recovery decision is not permission to erase committed evidence.
 * The profile predicate prevents a stale/cross-profile checkpoint
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
      "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND profile_id = ? AND state IN ('active', 'fenced')",
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
  if (quarantined && claimedCheckpointSessionId === input.sessionId) {
    claimedCheckpointSessionId = null;
  }
  return quarantined;
}

/** Quarantine recoverable SQLite rows whose stored checkpoint fails strict validation. */
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
      "SELECT session_id, checkpoint_json, checkpoint_digest FROM recording_evidence_sessions WHERE profile_id = ? AND state IN ('active', 'fenced')",
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
          "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND profile_id = ? AND state IN ('active', 'fenced')",
          session.session_id,
          profileId,
        );
        if ((result.changes ?? 0) === 1) {
          count += 1;
          await quarantineEvidence(
            tx,
            null,
            "checkpoint:orphaned-unreadable",
            JSON.stringify({ sessionId: session.session_id }),
          );
        }
      }
    }
  });
  return count;
}

/** Removes forbidden coordinate rows and makes every affected local session non-recoverable. */
export async function quarantineForbiddenCoordinateRecordingEvidence(
  profileId?: string,
): Promise<number> {
  const db = await getRecordingEvidenceDatabase();
  let count = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    count = await quarantineCoordinateEvidenceRows(tx, {
      includeLegacyGpsTable: false,
      ...(profileId ? { profileId } : {}),
    });
  });
  return count;
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
 * SQLite is the recovery authority. Active and fenced sessions remain recoverable:
 * fencing closes producers, but does not mean the final artifact was committed.
 * A finalized session has already handed its artifact to the queue and must never
 * compete with a new active session for a checkpoint.
 */
export type RecordingEvidenceCheckpointRow = {
  sessionId: string;
  checkpointJson: string;
};

/** Returns the only recoverable checkpoint row for a profile. */
export async function readRecordingEvidenceCheckpoint(
  profileId: string,
): Promise<RecordingEvidenceCheckpointRow | null> {
  await quarantineForbiddenCoordinateRecordingEvidence(profileId);
  const db = await getRecordingEvidenceDatabase();
  const rows = await db.getAllAsync<{
    session_id: string;
    checkpoint_json: string;
    checkpoint_digest: string;
  }>(
    `SELECT s.session_id, s.checkpoint_json, s.checkpoint_digest
       FROM recording_evidence_sessions s
       WHERE s.profile_id = ? AND s.checkpoint_json IS NOT NULL AND s.state IN ('active', 'fenced')
       ORDER BY s.created_at DESC`,
    profileId,
  );
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const row of rows)
        await quarantineEvidence(tx, row.session_id, "checkpoint:ambiguous-authority");
    });
    throw new Error("ambiguous-recording-evidence-checkpoint");
  }
  const row = rows[0];
  if (!row) return null;
  if ((await sha256(row.checkpoint_json)) !== row.checkpoint_digest) {
    await db.withExclusiveTransactionAsync((tx) =>
      quarantineEvidence(tx, row.session_id, "checkpoint:sqlite-checkpoint-digest-invalid"),
    );
    if (claimedCheckpointSessionId === row.session_id) {
      claimedCheckpointSessionId = null;
    }
    throw new Error("sqlite-checkpoint-digest-invalid");
  }
  return { sessionId: row.session_id, checkpointJson: row.checkpoint_json };
}

/** Retained for journal callers that only need the validated SQLite bytes. */
export async function loadRecordingEvidenceCheckpoint(profileId: string): Promise<string | null> {
  return (await readRecordingEvidenceCheckpoint(profileId))?.checkpointJson ?? null;
}

/** Claims the current SQLite checkpoint for one in-process recovery owner. */
export async function claimRecordingEvidenceCheckpoint(
  profileId: string,
): Promise<RecordingEvidenceCheckpointRow | null> {
  const row = await readRecordingEvidenceCheckpoint(profileId);
  if (!row || claimedCheckpointSessionId) return null;
  claimedCheckpointSessionId = row.sessionId;
  return row;
}

export function releaseRecordingEvidenceCheckpointClaim(sessionId: string): void {
  if (claimedCheckpointSessionId === sessionId) claimedCheckpointSessionId = null;
}

/** Clears only the exact SQLite checkpoint after its durable handoff. */
export async function clearRecordingEvidenceCheckpoint(sessionId: string): Promise<void> {
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "UPDATE recording_evidence_sessions SET checkpoint_json = NULL, checkpoint_digest = NULL WHERE session_id = ? AND state IN ('active', 'fenced', 'finalized')",
      sessionId,
    );
  });
  releaseRecordingEvidenceCheckpointClaim(sessionId);
}

/** Whether SQLite retains quarantine evidence from any recorder session. */
export async function hasQuarantinedRecordingEvidence(): Promise<boolean> {
  const db = await getRecordingEvidenceDatabase();
  return (
    (
      await db.getAllAsync<{ present: number }>(
        "SELECT 1 AS present FROM recording_evidence_quarantine LIMIT 1",
      )
    ).length > 0
  );
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
  | { status: "quarantined"; sessionId: string; reason: string };

async function validateCurrentFinalizedHandoff(session: {
  session_id: string;
  profile_id: string;
  finalized_path: string | null;
  finalized_size: number | null;
  finalized_sha256: string | null;
  finalized_artifact_json: string | null;
  finalized_artifact_digest: string | null;
}): Promise<void> {
  if (
    !session.finalized_path ||
    !session.finalized_size ||
    !/^[0-9a-f]{64}$/.test(session.finalized_sha256 ?? "") ||
    !session.finalized_artifact_json ||
    !/^[0-9a-f]{64}$/.test(session.finalized_artifact_digest ?? "")
  ) {
    throw new Error("finalized-current-fields-missing");
  }
  if ((await sha256(session.finalized_artifact_json)) !== session.finalized_artifact_digest) {
    throw new Error("finalized-handoff-digest-invalid");
  }
  const artifact = recordingSessionArtifactSchema.parse(
    JSON.parse(session.finalized_artifact_json),
  );
  if (
    artifact.sessionId !== session.session_id ||
    artifact.profileId !== session.profile_id ||
    artifact.activityFilePath !== session.finalized_path
  ) {
    throw new Error("finalized-handoff-owner-invalid");
  }
}

/**
 * Revalidates a current-epoch finalized handoff before startup can replay it.
 * Incomplete rows cannot establish current finalization authority, so they are
 * quarantined rather than being upgraded into rebuild or retry state.
 */
export async function inspectFinalizedArtifactReferences(
  profileId: string,
): Promise<FinalizedArtifactReferenceRecovery[]> {
  const db = await getRecordingEvidenceDatabase();
  const recovered: FinalizedArtifactReferenceRecovery[] = [];
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      session_id: string;
      profile_id: string;
      state: string;
      finalized_path: string | null;
      finalized_size: number | null;
      finalized_sha256: string | null;
      finalized_artifact_json: string | null;
      finalized_artifact_digest: string | null;
      checkpoint_json: string | null;
      checkpoint_digest: string | null;
    }>(
      `SELECT s.session_id, s.profile_id, s.state, s.finalized_path, s.finalized_size, s.finalized_sha256, s.finalized_artifact_json, s.finalized_artifact_digest
        FROM recording_evidence_sessions s
        WHERE s.profile_id = ? AND s.state = 'finalized'`,
      profileId,
    );
    for (const session of sessions) {
      try {
        await validateCurrentFinalizedHandoff(session);
        if (!(await finalizedArtifactMatches(session))) {
          throw new Error("finalized-artifact-mismatch");
        }
        recovered.push({ status: "healthy", sessionId: session.session_id });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "finalized-handoff-invalid";
        await tx.runAsync(
          "UPDATE recording_evidence_sessions SET state = 'quarantined' WHERE session_id = ? AND state = 'finalized'",
          session.session_id,
        );
        await quarantineEvidence(
          tx,
          null,
          reason,
          JSON.stringify({ sessionId: session.session_id }),
        );
        recovered.push({ status: "quarantined", sessionId: session.session_id, reason });
      }
    }
  });
  return recovered;
}

/** Validates every persisted byte; corrupt evidence is isolated without blocking other sessions. */
export async function inspectRecordingEvidenceSession(
  sessionId: string,
  profileId: string,
): Promise<RecordingEvidenceRecovery> {
  await quarantineForbiddenCoordinateRecordingEvidence(profileId);
  const db = await getRecordingEvidenceDatabase();
  let recovery: RecordingEvidenceRecovery = { status: "none" };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const sessions = await tx.getAllAsync<{
      profile_id: string;
      state: string;
      finalized_path: string | null;
      finalized_size: number | null;
      finalized_sha256: string | null;
    }>(
      "SELECT profile_id, state, finalized_path, finalized_size, finalized_sha256 FROM recording_evidence_sessions WHERE session_id = ?",
      sessionId,
    );
    const session = sessions[0];
    if (!session) return;
    if (session.profile_id !== profileId) {
      await quarantineEvidence(tx, sessionId, "profile-session-mismatch");
      recovery = { status: "quarantined", reason: "profile-session-mismatch" };
      return;
    }
    if (session.state === "quarantined") {
      recovery = { status: "quarantined", reason: COORDINATE_EVIDENCE_QUARANTINE_REASON };
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
    const rows = await tx.getAllAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM recording_stream_envelopes WHERE session_id = ?",
      sessionId,
    );
    recovery = { status: "recovered", sessionId, profileId, envelopeCount: rows[0]?.count ?? 0 };
  });
  return recovery;
}

/** The finalization fence makes all later sensor writes fail. */
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

/** Atomic evidence-state fence plus queue creation. A stale handoff can never
 * overwrite the terminal discard marker committed by the same SQLite authority. */
export async function createFinalizedArtifactQueueHandoff(
  input: ActivitySubmissionQueueJob,
): Promise<"created" | "existing" | "discarded" | "absent" | "rejected"> {
  const job = activitySubmissionQueueJobSchema.parse(input);
  let result: "created" | "existing" | "discarded" | "absent" | "rejected" = "absent";
  await withRecordingEvidenceTransaction(async (tx) => {
    const session = (
      await tx.getAllAsync<{ state: string; profile_id: string }>(
        "SELECT state, profile_id FROM recording_evidence_sessions WHERE session_id = ?",
        job.sessionId,
      )
    )[0];
    if (!session) return;
    if (session.profile_id !== job.draft.profileId)
      throw new Error("Finalized recording belongs to a different profile");
    if (session.state !== "finalized") {
      if (session.state === "quarantined") {
        const marker = await tx.getAllAsync<{ id: number }>(
          "SELECT id FROM recording_evidence_quarantine WHERE session_id = ? AND reason = 'user-discarded-finalized-recording' LIMIT 1",
          job.sessionId,
        );
        result = marker.length ? "discarded" : "rejected";
      } else result = "rejected";
      return;
    }
    const existing = (
      await tx.getAllAsync<{ error_category: string | null }>(
        "SELECT error_category FROM activity_submission_queue_jobs WHERE id = ?",
        job.id,
      )
    )[0];
    if (existing?.error_category === "discarded") return;
    if (existing) {
      result = "existing";
      return;
    }
    const operationId = job.draft.recordingSessionId ?? job.sessionId ?? job.artifactId;
    await tx.runAsync(
      "INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, next_attempt_at, error_category, lease_owner, lease_token, lease_expires_at, created_at, updated_at, job_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      job.id,
      operationId,
      job.draft.profileId,
      job.sessionId,
      job.artifactId,
      job.status,
      job.attempts,
      job.retryClass ?? "none",
      null,
      job.errorCategory ?? null,
      null,
      null,
      null,
      Date.parse(job.createdAt),
      Date.parse(job.updatedAt),
      JSON.stringify(job),
      job.schemaVersion,
    );
    result = "created";
  });
  return result;
}

/**
 * Records the user's terminal discard decision before any local artifact is
 * removed. Quarantine retains the raw evidence only under the existing bounded
 * terminal-retention policy, while excluding the session from finalized handoff
 * and rebuild discovery. Repeating the same discard is safe; an unrelated
 * quarantined session is never treated as a successful discard.
 */
export async function discardFinalizedRecordingEvidence(input: {
  sessionId: string;
  profileId: string;
  activityFilePath: string | null;
  streamArtifactPaths: string[];
  now?: number;
}): Promise<void> {
  if (!input.sessionId || !input.profileId) throw new Error("Recording evidence owner is required");
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("Recording evidence discard time is invalid");
  const db = await getRecordingEvidenceDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const session = (
      await tx.getAllAsync<{ profile_id: string; state: string; finalized_path: string | null }>(
        "SELECT profile_id, state, finalized_path FROM recording_evidence_sessions WHERE session_id = ?",
        input.sessionId,
      )
    )[0];
    if (!session || session.profile_id !== input.profileId) {
      throw new Error("Recording evidence discard owner does not match");
    }
    if (session.state === "finalized") {
      if (
        !session.finalized_path ||
        (input.activityFilePath && session.finalized_path !== input.activityFilePath)
      )
        throw new Error("Recording evidence discard artifact does not match");
      const result = await tx.runAsync(
        "UPDATE recording_evidence_sessions SET state = 'quarantined', checkpoint_json = NULL, checkpoint_digest = NULL WHERE session_id = ? AND profile_id = ? AND state = 'finalized'",
        input.sessionId,
        input.profileId,
      );
      if ((result.changes ?? 0) !== 1)
        throw new Error("Recording evidence discard cannot be committed");
      await quarantineEvidence(tx, input.sessionId, "user-discarded-finalized-recording");
      const cleanupPayload = JSON.stringify({
        version: 1,
        sessionId: input.sessionId,
        profileId: input.profileId,
        activityFilePath: session.finalized_path,
        streamArtifactPaths: input.streamArtifactPaths,
        cleanupPending: true,
        cleanupAttempts: 0,
        nextCleanupAt: now,
      });
      await tx.runAsync(
        "UPDATE recording_evidence_quarantine SET payload = ? WHERE id = (SELECT MAX(id) FROM recording_evidence_quarantine WHERE session_id = ? AND reason = 'user-discarded-finalized-recording')",
        cleanupPayload,
        input.sessionId,
      );
      const queueRows = await tx.getAllAsync<{ id: string; job_json: string }>(
        "SELECT id, job_json FROM activity_submission_queue_jobs WHERE profile_id = ? AND (session_id = ? OR artifact_id = ? OR operation_id = ?)",
        input.profileId,
        input.sessionId,
        input.sessionId,
        input.sessionId,
      );
      for (const row of queueRows) {
        const job = activitySubmissionQueueJobSchema.parse(JSON.parse(row.job_json));
        const discarded = activitySubmissionQueueJobSchema.parse({
          ...job,
          status: "failed",
          retryClass: "permanent",
          nextAttemptAt: null,
          errorCategory: "discarded",
          lastError: "discarded",
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(now).toISOString(),
        });
        await tx.runAsync(
          "UPDATE activity_submission_queue_jobs SET status = 'failed', retry_class = 'permanent', next_attempt_at = NULL, error_category = 'discarded', lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?, job_json = ? WHERE id = ?",
          now,
          JSON.stringify(discarded),
          row.id,
        );
      }
      return;
    }
    if (session.state === "quarantined") {
      const priorDiscard = await tx.getAllAsync<{ id: number }>(
        "SELECT id FROM recording_evidence_quarantine WHERE session_id = ? AND reason = 'user-discarded-finalized-recording' LIMIT 1",
        input.sessionId,
      );
      if (priorDiscard.length === 1) return;
    }
    throw new Error("Recording evidence is not a finalized discard candidate");
  });
}

export type DiscardedRecordingEvidenceCleanup = {
  sessionId: string;
  activityFilePath: string;
  streamArtifactPaths: string[];
};

type DiscardCleanupPayload = DiscardedRecordingEvidenceCleanup & {
  version: 1;
  profileId: string;
  cleanupPending: boolean;
  cleanupAttempts: number;
  nextCleanupAt: number;
};

function parseDiscardCleanupPayload(payload: string | null): DiscardCleanupPayload | null {
  try {
    const value = JSON.parse(payload ?? "") as Partial<DiscardCleanupPayload>;
    if (
      value.version !== 1 ||
      !value.sessionId ||
      !value.profileId ||
      !value.activityFilePath ||
      !Array.isArray(value.streamArtifactPaths) ||
      typeof value.cleanupPending !== "boolean" ||
      !Number.isInteger(value.cleanupAttempts) ||
      !Number.isFinite(value.nextCleanupAt)
    )
      return null;
    return value as DiscardCleanupPayload;
  } catch {
    return null;
  }
}

export async function loadDueDiscardedRecordingEvidenceCleanups(
  now = Date.now(),
): Promise<DiscardedRecordingEvidenceCleanup[]> {
  const rows = await withRecordingEvidenceTransaction((tx) =>
    tx.getAllAsync<{ id: number; session_id: string; payload: string | null }>(
      "SELECT id, session_id, payload FROM recording_evidence_quarantine WHERE reason = 'user-discarded-finalized-recording' ORDER BY id",
    ),
  );
  return rows.flatMap((row) => {
    const cleanup = parseDiscardCleanupPayload(row.payload);
    return cleanup?.sessionId === row.session_id &&
      cleanup.cleanupPending &&
      cleanup.nextCleanupAt <= now
      ? [
          {
            sessionId: cleanup.sessionId,
            activityFilePath: cleanup.activityFilePath,
            streamArtifactPaths: cleanup.streamArtifactPaths,
          },
        ]
      : [];
  });
}

export async function completeDiscardedRecordingEvidenceCleanup(sessionId: string): Promise<void> {
  await withRecordingEvidenceTransaction(async (tx) => {
    const rows = await tx.getAllAsync<{ id: number; payload: string | null }>(
      "SELECT id, payload FROM recording_evidence_quarantine WHERE session_id = ? AND reason = 'user-discarded-finalized-recording' ORDER BY id DESC LIMIT 1",
      sessionId,
    );
    const row = rows[0];
    const cleanup = row && parseDiscardCleanupPayload(row.payload);
    if (!row || !cleanup || !cleanup.cleanupPending) return;
    cleanup.cleanupPending = false;
    await tx.runAsync(
      "UPDATE recording_evidence_quarantine SET payload = ? WHERE id = ?",
      JSON.stringify(cleanup),
      row.id,
    );
  });
}

export async function retryDiscardedRecordingEvidenceCleanup(sessionId: string): Promise<void> {
  await withRecordingEvidenceTransaction(async (tx) => {
    const rows = await tx.getAllAsync<{ id: number; payload: string | null }>(
      "SELECT id, payload FROM recording_evidence_quarantine WHERE session_id = ? AND reason = 'user-discarded-finalized-recording' ORDER BY id DESC LIMIT 1",
      sessionId,
    );
    const row = rows[0];
    const cleanup = row && parseDiscardCleanupPayload(row.payload);
    if (!row || !cleanup || !cleanup.cleanupPending) return;
    cleanup.cleanupAttempts += 1;
    cleanup.nextCleanupAt =
      Date.now() + Math.min(5 * 60_000, 1_000 * 2 ** Math.min(cleanup.cleanupAttempts, 8));
    await tx.runAsync(
      "UPDATE recording_evidence_quarantine SET payload = ? WHERE id = ?",
      JSON.stringify(cleanup),
      row.id,
    );
  });
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
      "SELECT id FROM activity_submission_queue_jobs WHERE id != ? AND status != 'complete' AND COALESCE(error_category, '') != 'discarded' AND (session_id = ? OR artifact_id = ?)",
      job.id,
      sessionId,
      job.artifactId,
    );
    if (peers.length) return;
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
         AND NOT EXISTS (SELECT 1 FROM activity_submission_queue_jobs q WHERE q.status != 'complete' AND COALESCE(q.error_category, '') != 'discarded' AND (q.session_id = s.session_id OR q.artifact_id = s.session_id))
        AND NOT EXISTS (SELECT 1 FROM recording_evidence_quarantine dq WHERE dq.session_id = s.session_id AND dq.reason = 'user-discarded-finalized-recording' AND dq.payload LIKE '%"cleanupPending":true%')
        ORDER BY s.created_at LIMIT ?`,
      now - RAW_TERMINAL_EVIDENCE_RETENTION_MS,
      limit,
    );
    for (const row of terminal) {
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
      SELECT id FROM recording_evidence_quarantine WHERE quarantined_at <= ? AND NOT (reason = 'user-discarded-finalized-recording' AND payload LIKE '%"cleanupPending":true%') ORDER BY quarantined_at LIMIT ?
    )`,
      now - QUARANTINED_EVIDENCE_RETENTION_MS,
      limit,
    );
    await tx.runAsync(
      `DELETE FROM recording_evidence_quarantine AS old WHERE old.session_id IS NOT NULL AND NOT (old.reason = 'user-discarded-finalized-recording' AND old.payload LIKE '%"cleanupPending":true%') AND (
      SELECT COUNT(*) FROM recording_evidence_quarantine AS newer WHERE newer.session_id = old.session_id AND newer.id > old.id
    ) >= ?`,
      MAX_QUARANTINE_ROWS_PER_SESSION,
    );
    await tx.runAsync(
      `DELETE FROM recording_evidence_quarantine AS old WHERE old.session_id IN (
      SELECT s.session_id FROM recording_evidence_sessions s WHERE s.profile_id = (
        SELECT profile_id FROM recording_evidence_sessions WHERE session_id = old.session_id
      )
    ) AND NOT (old.reason = 'user-discarded-finalized-recording' AND old.payload LIKE '%"cleanupPending":true%') AND (
      SELECT COUNT(*) FROM recording_evidence_quarantine AS newer JOIN recording_evidence_sessions s ON s.session_id = newer.session_id
      WHERE s.profile_id = (SELECT profile_id FROM recording_evidence_sessions WHERE session_id = old.session_id) AND newer.id > old.id
    ) >= ?`,
      MAX_QUARANTINE_ROWS_PER_PROFILE,
    );
  });
  return deleted;
}
