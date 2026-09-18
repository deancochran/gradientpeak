import { assertRecordingPlanExecutionStructureHashes } from "@/lib/recording/structureHash";
import {
  claimDueActivitySubmissionQueueJob,
  renewClaimedActivitySubmissionQueueJob,
  transitionClaimedActivitySubmissionQueueJob,
} from "./storage";
import type {
  ActivitySubmissionQueueJob,
  ActivitySubmissionQueueJobStatus,
  ActivitySubmissionQueueRunnerDeps,
} from "./types";
import { activitySubmissionQueueJobSchema } from "./types";

function defaultNow(): string {
  return new Date().toISOString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || "Unknown error");
}

function classifyFailure(error: unknown): "transient" | "permanent" | "auth" | "validation" {
  const message = getErrorMessage(error).toLowerCase();
  if (/unauthori[sz]ed|forbidden|auth|token/.test(message)) return "auth";
  if (/invalid|validation|metadata|owner|different upload claim/.test(message)) return "validation";
  if (/network|timeout|temporar|unavailable|5\d\d/.test(message)) return "transient";
  return "permanent";
}

function retryAt(attempts: number, now: () => string): string {
  const base = 1_000;
  const cap = 5 * 60_000;
  // Deterministic bounded jitter avoids synchronized retries while remaining testable.
  const jitter = (attempts * 137) % 500;
  return new Date(
    Date.parse(now()) + Math.min(cap, base * 2 ** Math.min(attempts, 8)) + jitter,
  ).toISOString();
}

const MAX_TRANSIENT_ATTEMPTS = 8;
const LEASE_DURATION_MS = 60_000;
let leaseSequence = 0;

function leaseValue(prefix: string): string {
  leaseSequence += 1;
  return `${prefix}:${Date.now().toString(36)}:${leaseSequence.toString(36)}`;
}

class LeaseLostError extends Error {
  constructor() {
    super("Activity submission queue lease was lost");
  }
}

function getFileName(filePath: string): string {
  const withoutQuery = filePath.split("?")[0] ?? filePath;
  return withoutQuery.split("/").filter(Boolean).at(-1) ?? "activity.fit";
}

function getFileType(filePath: string): "fit" | "gpx" | "tcx" {
  const extension = getFileName(filePath).split(".").at(-1)?.toLowerCase();

  if (extension === "gpx" || extension === "tcx") {
    return extension;
  }

  return "fit";
}

async function persistJob(
  job: ActivitySubmissionQueueJob,
  status: ActivitySubmissionQueueJobStatus,
  now: () => string,
  updates: Partial<ActivitySubmissionQueueJob> = {},
): Promise<ActivitySubmissionQueueJob> {
  const nextJob = activitySubmissionQueueJobSchema.parse({
    ...job,
    ...updates,
    status,
    updatedAt: now(),
  });

  if (!job.leaseOwner || !job.leaseToken) throw new LeaseLostError();
  if (
    !(await transitionClaimedActivitySubmissionQueueJob(
      nextJob,
      job.leaseOwner,
      job.leaseToken,
      Date.parse(now()),
    ))
  ) {
    throw new LeaseLostError();
  }
  return nextJob;
}

async function persistJobProgress(
  job: ActivitySubmissionQueueJob,
  status: ActivitySubmissionQueueJobStatus,
  now: () => string,
  deps: ActivitySubmissionQueueRunnerDeps,
  updates: Partial<ActivitySubmissionQueueJob> = {},
): Promise<ActivitySubmissionQueueJob> {
  const nextJob = await persistJob(job, status, now, updates);
  await deps.onJobUpdated?.(nextJob);
  return nextJob;
}

const activeJobs = new Map<string, Promise<ActivitySubmissionQueueJob>>();

async function renewLease(
  job: ActivitySubmissionQueueJob,
  now: () => string,
): Promise<ActivitySubmissionQueueJob> {
  if (!job.leaseOwner || !job.leaseToken) throw new LeaseLostError();
  const renewed = await renewClaimedActivitySubmissionQueueJob(
    job.id,
    job.leaseOwner,
    job.leaseToken,
    LEASE_DURATION_MS,
    Date.parse(now()),
  );
  if (!renewed) throw new LeaseLostError();
  return renewed;
}

/** Keep the durable fence live while an uninterruptible native/network upload is in flight. */
async function withLeaseHeartbeat<T>(
  job: ActivitySubmissionQueueJob,
  now: () => string,
  onRenewed: (job: ActivitySubmissionQueueJob) => void,
  effect: () => Promise<T>,
): Promise<T> {
  let lost = false;
  const renew = async () => {
    try {
      onRenewed(await renewLease(job, now));
    } catch {
      lost = true;
    }
  };
  await renew();
  if (lost) throw new LeaseLostError();
  const timer = setInterval(
    () => {
      void renew();
    },
    Math.max(250, Math.floor(LEASE_DURATION_MS / 3)),
  );
  try {
    const result = await effect();
    if (lost) throw new LeaseLostError();
    return result;
  } finally {
    clearInterval(timer);
  }
}

async function completeJob(
  job: ActivitySubmissionQueueJob,
  now: () => string,
  deps: ActivitySubmissionQueueRunnerDeps,
): Promise<ActivitySubmissionQueueJob> {
  const complete = await persistJobProgress(job, "complete", now, deps, {
    retryClass: "none",
    nextAttemptAt: null,
    errorCategory: null,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
  });
  // Best-effort cleanup only happens after the durable complete transition; retention failures keep evidence.
  try {
    const { garbageCollectAcceptedQueueEvidence } = await import(
      "../ActivityRecorder/finalizedArtifactStorage"
    );
    await garbageCollectAcceptedQueueEvidence(complete);
    const { garbageCollectExpiredRecordingEvidence } = await import(
      "../ActivityRecorder/recordingEvidenceJournal"
    );
    await garbageCollectExpiredRecordingEvidence();
  } catch {}
  return complete;
}

async function runActivitySubmissionQueueJobOnce(
  initialJob: ActivitySubmissionQueueJob,
  deps: ActivitySubmissionQueueRunnerDeps,
): Promise<ActivitySubmissionQueueJob> {
  const now = deps.now ?? defaultNow;
  const parsedInitial = activitySubmissionQueueJobSchema.safeParse(initialJob);
  if (!parsedInitial.success) {
    // A malformed immutable execution snapshot cannot be retried or submitted.
    return activitySubmissionQueueJobSchema.parse({
      ...initialJob,
      planExecution: null,
      status: "failed",
      attempts: initialJob.attempts + 1,
      lastError: "validation",
      errorCategory: "validation",
      retryClass: "validation",
      nextAttemptAt: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    });
  }
  const initial = parsedInitial.data;
  const nowMs = Date.parse(now());
  const owner = leaseValue("mobile-runner");
  const token = leaseValue("lease");
  const claimed = await claimDueActivitySubmissionQueueJob(
    initial.id,
    owner,
    token,
    LEASE_DURATION_MS,
    Number.isFinite(nowMs) ? nowMs : Date.now(),
  );
  // Another drain owns this operation (or it is not due). Do not invoke any effect.
  if (!claimed) return initial;
  let job: ActivitySubmissionQueueJob = activitySubmissionQueueJobSchema.parse({
    ...claimed,
    lastError: null,
  });

  if (job.status === "complete") return job;
  if (job.status === "failed" && job.retryClass && job.retryClass !== "transient") return job;

  try {
    await assertRecordingPlanExecutionStructureHashes(job.planExecution);
    const recordingSessionId = job.draft.recordingSessionId;

    if (!job.artifactSha256 || !job.localActivityFileSize) {
      job = await persistJobProgress(job, "uploading", now, deps);
      const artifactMetadata = await withLeaseHeartbeat(
        job,
        now,
        (renewed) => {
          job = renewed;
        },
        () => deps.getLocalArtifactMetadata(job.localActivityFilePath),
      );
      job = await persistJobProgress(job, "uploading", now, deps, {
        localActivityFileSize: artifactMetadata.byteSize,
        artifactSha256: artifactMetadata.sha256,
      });
    }

    if (!job.uploadCompletedAt && !job.activityId) {
      if (!job.artifactSha256 || !job.localActivityFileSize) {
        throw new Error("Recording artifact metadata is incomplete");
      }
      const fileType = getFileType(job.localActivityFilePath);
      const { localActivityFileSize, artifactSha256 } = job;
      const uploadClaim = await withLeaseHeartbeat(
        job,
        now,
        (renewed) => {
          job = renewed;
        },
        () =>
          deps.beginMobileRecordingUpload({
            recordingSessionId,
            byteSize: localActivityFileSize,
            sha256: artifactSha256,
            format: fileType,
          }),
      );
      if (job.ingestionId && job.ingestionId !== uploadClaim.ingestionId) {
        throw new Error("Recording upload claim changed during retry");
      }
      if (uploadClaim.status === "ready") {
        job = await persistJobProgress(job, "creating_activity", now, deps, {
          activityId: uploadClaim.activityId,
          ingestionId: uploadClaim.ingestionId,
          uploadCompletedAt: now(),
        });
        return completeJob(job, now, deps);
      }

      job = await persistJobProgress(job, "uploading", now, deps, {
        ingestionId: uploadClaim.ingestionId,
      });
      const uploadResult = await withLeaseHeartbeat(
        job,
        now,
        (renewed) => {
          job = renewed;
        },
        () => deps.uploadToSignedUrl(job.localActivityFilePath, uploadClaim.signedUrl),
      );
      if (uploadResult && !uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload activity file");
      }
      job = await persistJobProgress(job, "uploading", now, deps, {
        uploadCompletedAt: now(),
      });
    }

    if (!job.activityId) {
      if (!job.ingestionId || !job.artifactSha256 || !job.localActivityFileSize) {
        throw new Error("Uploaded activity artifact metadata is incomplete");
      }
      const ingestionId = job.ingestionId;
      job = await persistJobProgress(job, "creating_activity", now, deps);
      const created = await withLeaseHeartbeat(
        job,
        now,
        (renewed) => {
          job = renewed;
        },
        () =>
          deps.createFromRecordingSummary({
            profileId: job.draft.profileId,
            recordingSessionId,
            name: job.draft.name,
            notes: job.draft.notes,
            content_visibility: job.draft.content_visibility,
            startedAt: job.draft.startedAt,
            finishedAt: job.draft.finishedAt,
            activityPlanId: job.draft.activityPlanId,
            ...(job.planExecution ? { planExecution: job.planExecution } : {}),
            executionManifest: job.executionManifest,
            uploadedArtifact: { ingestionId },
            summary: {
              distanceMeters: Math.round(job.draft.distanceMeters),
              calories: job.draft.calories ?? null,
            },
            source: "mobile_recording",
          }),
      );

      if (!created.ingestion?.id) {
        throw new Error("Activity file ingestion was not returned");
      }
      if (created.ingestion.id !== ingestionId) {
        throw new Error("Accepted activity returned a different upload claim");
      }

      job = await persistJobProgress(job, "creating_activity", now, deps, {
        activityId: created.id,
        ingestionId: created.ingestion.id,
      });
    }

    return completeJob(job, now, deps);
  } catch (error) {
    if (error instanceof LeaseLostError) throw error;
    const retryClass = classifyFailure(error);
    const attempts = job.attempts + 1;
    const exhausted = retryClass === "transient" && attempts >= MAX_TRANSIENT_ATTEMPTS;
    const persistedRetryClass = exhausted ? "permanent" : retryClass;
    return persistJobProgress(job, "failed", now, deps, {
      attempts,
      // Do not retain server messages, paths, or payloads in the durable queue.
      lastError: persistedRetryClass,
      errorCategory: persistedRetryClass,
      retryClass: persistedRetryClass,
      nextAttemptAt: persistedRetryClass === "transient" ? retryAt(attempts, now) : null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      ...(job.activityId ? {} : { uploadCompletedAt: undefined }),
    });
  }
}

export function runActivitySubmissionQueueJob(
  initialJob: ActivitySubmissionQueueJob,
  deps: ActivitySubmissionQueueRunnerDeps,
): Promise<ActivitySubmissionQueueJob> {
  const activeJob = activeJobs.get(initialJob.id);
  if (activeJob) return activeJob;

  const execution = runActivitySubmissionQueueJobOnce(initialJob, deps).finally(() => {
    if (activeJobs.get(initialJob.id) === execution) activeJobs.delete(initialJob.id);
  });
  activeJobs.set(initialJob.id, execution);
  return execution;
}
