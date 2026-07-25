import {
  type RecordingEvidenceSqlExecutor,
  resetRecordingEvidenceJournalForTests,
  setRecordingEvidenceDatabaseForTests,
  withRecordingEvidenceTransaction,
} from "../ActivityRecorder/recordingEvidenceJournal";
import { type ActivitySubmissionQueueJob, activitySubmissionQueueJobSchema } from "./types";

/** Legacy import source only. SQLite is the runtime authority. */
export const ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:v3:jobs";
const ACTIVE_STATUSES = [
  "draft",
  "queued",
  "uploading",
  "creating_activity",
  "processing",
  "failed",
];
const MAX_ERROR_CATEGORY_LENGTH = 80;
let testJobs: Map<string, ActivitySubmissionQueueJob> | undefined;
/** Test seam only; production has no non-SQLite authority. */
export function setActivitySubmissionQueueJobsForTests(
  jobs?: Map<string, ActivitySubmissionQueueJob>,
): void {
  testJobs = jobs;
}

/** Test-only SQL adapter seam. Production always opens the recorder SQLite authority. */
export function setActivitySubmissionQueueSqlExecutorForTests(
  executor?: RecordingEvidenceSqlExecutor,
): void {
  if (executor) setRecordingEvidenceDatabaseForTests(executor);
  else resetRecordingEvidenceJournalForTests();
}

type QueueRow = {
  id: string;
  profile_id: string;
  status: string;
  job_json: string;
  retry_class: string;
  next_attempt_at: number | null;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: number | null;
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function asJob(row: QueueRow): ActivitySubmissionQueueJob {
  return activitySubmissionQueueJobSchema.parse(JSON.parse(row.job_json));
}

async function quarantine(id: string | null, reason: string): Promise<void> {
  await withRecordingEvidenceTransaction(async (tx) => {
    await tx.runAsync(
      "INSERT INTO activity_submission_queue_quarantine (job_id, reason, quarantined_at) VALUES (?, ?, ?)",
      id,
      reason.slice(0, MAX_ERROR_CATEGORY_LENGTH),
      Date.now(),
    );
    if (id) await tx.runAsync("DELETE FROM activity_submission_queue_jobs WHERE id = ?", id);
  });
}

function metadata(job: ActivitySubmissionQueueJob) {
  const retryClass = job.retryClass ?? (job.status === "failed" ? "transient" : "none");
  return {
    operationId: job.draft.recordingSessionId ?? job.sessionId ?? job.artifactId,
    retryClass,
    nextAttemptAt: timestamp(job.nextAttemptAt),
    leaseOwner: job.leaseOwner ?? null,
    leaseToken: job.leaseToken ?? null,
    leaseExpiresAt: timestamp(job.leaseExpiresAt),
    updatedAt: timestamp(job.updatedAt) ?? Date.now(),
    createdAt: timestamp(job.createdAt) ?? Date.now(),
  };
}

function isClaimable(job: ActivitySubmissionQueueJob, now: number): boolean {
  if (!ACTIVE_STATUSES.includes(job.status) || job.status === "complete") return false;
  // A failed permanent/auth/validation operation is retained as evidence, not retried.
  if (job.status === "failed" && job.retryClass && job.retryClass !== "transient") return false;
  return (timestamp(job.nextAttemptAt) ?? 0) <= now && (timestamp(job.leaseExpiresAt) ?? 0) <= now;
}

export async function loadActivitySubmissionQueueJobs(
  profileId?: string,
): Promise<ActivitySubmissionQueueJob[]> {
  if (testJobs)
    return [...testJobs.values()].filter((job) => !profileId || job.draft.profileId === profileId);
  const rows = await withRecordingEvidenceTransaction((tx) =>
    tx.getAllAsync<QueueRow>(
      `SELECT id, profile_id, status, job_json, retry_class, next_attempt_at, lease_owner, lease_token, lease_expires_at FROM activity_submission_queue_jobs ${profileId ? "WHERE profile_id = ?" : ""} ORDER BY created_at`,
      ...(profileId ? [profileId] : []),
    ),
  );
  const jobs: ActivitySubmissionQueueJob[] = [];
  for (const row of rows) {
    try {
      jobs.push(asJob(row));
    } catch {
      await quarantine(row.id, "invalid-row");
    }
  }
  return jobs;
}

export async function loadActivitySubmissionQueueJobByArtifactId(
  artifactId: string,
  profileId?: string,
): Promise<ActivitySubmissionQueueJob | null> {
  const jobs = await loadActivitySubmissionQueueJobs(profileId);
  return (
    jobs.find(
      (job) =>
        job.id === artifactId || job.artifactId === artifactId || job.sessionId === artifactId,
    ) ?? null
  );
}

export function incompleteQueueJobReferencesLocalFiles(job: ActivitySubmissionQueueJob): boolean {
  return (
    job.status !== "complete" &&
    Boolean(job.localActivityFilePath || job.streamArtifactPaths.length)
  );
}

/** Compatibility bulk writer; each item remains an independent SQLite row. */
export async function saveActivitySubmissionQueueJobs(
  jobs: ActivitySubmissionQueueJob[],
): Promise<void> {
  await Promise.all(jobs.map(upsertActivitySubmissionQueueJob));
}

export async function upsertActivitySubmissionQueueJob(
  input: ActivitySubmissionQueueJob,
): Promise<void> {
  const job = activitySubmissionQueueJobSchema.parse(input);
  if (testJobs) {
    testJobs.set(job.id, job);
    return;
  }
  const meta = metadata(job);
  await withRecordingEvidenceTransaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO activity_submission_queue_jobs (id, operation_id, profile_id, session_id, artifact_id, status, attempts, retry_class, next_attempt_at, error_category, lease_owner, lease_token, lease_expires_at, created_at, updated_at, job_json, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, attempts=excluded.attempts, retry_class=excluded.retry_class, next_attempt_at=excluded.next_attempt_at, error_category=excluded.error_category, lease_owner=excluded.lease_owner, lease_token=excluded.lease_token, lease_expires_at=excluded.lease_expires_at, updated_at=excluded.updated_at, job_json=excluded.job_json, schema_version=excluded.schema_version`,
      job.id,
      meta.operationId,
      job.draft.profileId,
      job.sessionId ?? job.artifactId,
      job.artifactId,
      job.status,
      job.attempts,
      meta.retryClass,
      meta.nextAttemptAt,
      job.errorCategory?.slice(0, MAX_ERROR_CATEGORY_LENGTH) ?? null,
      meta.leaseOwner,
      meta.leaseToken,
      meta.leaseExpiresAt,
      meta.createdAt,
      meta.updatedAt,
      JSON.stringify(job),
      job.schemaVersion,
    );
  });
}

/** A fenced claim makes concurrent drains mutually exclusive across process restarts. */
export async function claimDueActivitySubmissionQueueJob(
  id: string,
  owner: string,
  token: string,
  leaseMs: number,
  now = Date.now(),
): Promise<ActivitySubmissionQueueJob | null> {
  if (testJobs) {
    const job = testJobs.get(id);
    if (!job || !isClaimable(job, now)) return null;
    const claimed = {
      ...job,
      leaseOwner: owner,
      leaseToken: token,
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    testJobs.set(id, claimed);
    return claimed;
  }
  let claimed: ActivitySubmissionQueueJob | null = null;
  await withRecordingEvidenceTransaction(async (tx) => {
    const rows = await tx.getAllAsync<QueueRow>(
      "SELECT id, profile_id, status, job_json, retry_class, next_attempt_at, lease_owner, lease_token, lease_expires_at FROM activity_submission_queue_jobs WHERE id = ?",
      id,
    );
    const row = rows[0];
    if (!row) return;
    let job: ActivitySubmissionQueueJob;
    try {
      job = asJob(row);
    } catch {
      await tx.runAsync(
        "INSERT INTO activity_submission_queue_quarantine (job_id, reason, quarantined_at) VALUES (?, ?, ?)",
        id,
        "invalid-row",
        now,
      );
      await tx.runAsync("DELETE FROM activity_submission_queue_jobs WHERE id = ?", id);
      return;
    }
    if (!isClaimable(job, now)) return;
    const leaseExpiresAt = new Date(now + leaseMs).toISOString();
    const next = activitySubmissionQueueJobSchema.parse({
      ...job,
      leaseOwner: owner,
      leaseToken: token,
      leaseExpiresAt,
      updatedAt: new Date(now).toISOString(),
    });
    const result = await tx.runAsync(
      "UPDATE activity_submission_queue_jobs SET lease_owner = ?, lease_token = ?, lease_expires_at = ?, updated_at = ?, job_json = ? WHERE id = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)",
      owner,
      token,
      now + leaseMs,
      now,
      JSON.stringify(next),
      id,
      now,
    );
    if ((result.changes ?? 0) === 1) claimed = next;
  });
  return claimed;
}

/**
 * Extends a live fence without changing its owner.  Effects must call this
 * immediately before crossing a process boundary; a row that was reclaimed or
 * whose clock has elapsed is deliberately not resurrected.
 */
export async function renewClaimedActivitySubmissionQueueJob(
  id: string,
  owner: string,
  token: string,
  leaseMs: number,
  now = Date.now(),
): Promise<ActivitySubmissionQueueJob | null> {
  if (testJobs) {
    const current = testJobs.get(id);
    if (
      !current ||
      current.leaseOwner !== owner ||
      current.leaseToken !== token ||
      (timestamp(current.leaseExpiresAt) ?? 0) <= now
    )
      return null;
    const renewed = {
      ...current,
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    testJobs.set(id, renewed);
    return renewed;
  }
  let renewed: ActivitySubmissionQueueJob | null = null;
  await withRecordingEvidenceTransaction(async (tx) => {
    const rows = await tx.getAllAsync<QueueRow>(
      "SELECT id, profile_id, status, job_json, retry_class, next_attempt_at, lease_owner, lease_token, lease_expires_at FROM activity_submission_queue_jobs WHERE id = ?",
      id,
    );
    const row = rows[0];
    if (!row) return;
    let current: ActivitySubmissionQueueJob;
    try {
      current = asJob(row);
    } catch {
      await tx.runAsync(
        "INSERT INTO activity_submission_queue_quarantine (job_id, reason, quarantined_at) VALUES (?, ?, ?)",
        id,
        "invalid-row",
        now,
      );
      await tx.runAsync("DELETE FROM activity_submission_queue_jobs WHERE id = ?", id);
      return;
    }
    if (
      current.leaseOwner !== owner ||
      current.leaseToken !== token ||
      (timestamp(current.leaseExpiresAt) ?? 0) <= now
    )
      return;
    const next = activitySubmissionQueueJobSchema.parse({
      ...current,
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    const result = await tx.runAsync(
      "UPDATE activity_submission_queue_jobs SET lease_expires_at=?, updated_at=?, job_json=? WHERE id=? AND lease_owner=? AND lease_token=? AND lease_expires_at > ?",
      now + leaseMs,
      now,
      JSON.stringify(next),
      id,
      owner,
      token,
      now,
    );
    if ((result.changes ?? 0) === 1) renewed = next;
  });
  return renewed;
}

export async function loadDueActivitySubmissionQueueJobs(
  profileId: string,
  now = Date.now(),
): Promise<ActivitySubmissionQueueJob[]> {
  const jobs = await loadActivitySubmissionQueueJobs(profileId);
  return jobs.filter((job) => isClaimable(job, now));
}

/** Fenced transition: stale workers cannot overwrite a successor's lease. */
export async function transitionClaimedActivitySubmissionQueueJob(
  job: ActivitySubmissionQueueJob,
  owner: string,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const parsed = activitySubmissionQueueJobSchema.parse(job);
  if (testJobs) {
    const current = testJobs.get(parsed.id);
    if (
      !current ||
      current.leaseOwner !== owner ||
      current.leaseToken !== token ||
      (timestamp(current.leaseExpiresAt) ?? 0) <= now
    )
      return false;
    testJobs.set(parsed.id, parsed);
    return true;
  }
  const meta = metadata(parsed);
  let changed = false;
  await withRecordingEvidenceTransaction(async (tx) => {
    const result = await tx.runAsync(
      "UPDATE activity_submission_queue_jobs SET status=?, attempts=?, retry_class=?, next_attempt_at=?, error_category=?, lease_owner=?, lease_token=?, lease_expires_at=?, updated_at=?, job_json=? WHERE id=? AND lease_owner=? AND lease_token=? AND lease_expires_at > ?",
      parsed.status,
      parsed.attempts,
      meta.retryClass,
      meta.nextAttemptAt,
      parsed.errorCategory ?? null,
      meta.leaseOwner,
      meta.leaseToken,
      meta.leaseExpiresAt,
      meta.updatedAt,
      JSON.stringify(parsed),
      parsed.id,
      owner,
      token,
      now,
    );
    changed = (result.changes ?? 0) === 1;
  });
  return changed;
}

export async function removeActivitySubmissionQueueJob(id: string): Promise<void> {
  if (testJobs) {
    testJobs.delete(id);
    return;
  }
  await withRecordingEvidenceTransaction((tx) =>
    tx
      .runAsync("DELETE FROM activity_submission_queue_jobs WHERE id = ?", id)
      .then(() => undefined),
  );
}
export async function clearActivitySubmissionQueueJobs(): Promise<void> {
  if (testJobs) {
    testJobs.clear();
    return;
  }
  await withRecordingEvidenceTransaction((tx) =>
    tx.runAsync("DELETE FROM activity_submission_queue_jobs").then(() => undefined),
  );
}
