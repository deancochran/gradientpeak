import { upsertActivitySubmissionQueueJob } from "./storage";
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

  await upsertActivitySubmissionQueueJob(nextJob);
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

async function runActivitySubmissionQueueJobOnce(
  initialJob: ActivitySubmissionQueueJob,
  deps: ActivitySubmissionQueueRunnerDeps,
): Promise<ActivitySubmissionQueueJob> {
  const now = deps.now ?? defaultNow;
  let job: ActivitySubmissionQueueJob = activitySubmissionQueueJobSchema.parse({
    ...initialJob,
    lastError: null,
  });

  if (job.status === "complete") return job;

  try {
    const recordingSessionId = job.draft.recordingSessionId ?? job.sessionId ?? job.artifactId;
    job = activitySubmissionQueueJobSchema.parse({
      ...job,
      draft: { ...job.draft, recordingSessionId },
    });

    if (!job.artifactSha256 || !job.localActivityFileSize) {
      job = await persistJobProgress(job, "uploading", now, deps);
      const artifactMetadata = await deps.getLocalArtifactMetadata(job.localActivityFilePath);
      job = await persistJobProgress(job, "uploading", now, deps, {
        localActivityFileSize: artifactMetadata.byteSize,
        artifactSha256: artifactMetadata.sha256,
      });
    }

    if (
      job.remoteFilePath &&
      job.artifactSha256 &&
      job.localActivityFileSize &&
      !job.uploadCompletedAt &&
      !job.activityId
    ) {
      try {
        const legacyClaim = await deps.claimLegacyMobileRecordingUpload({
          recordingSessionId,
          stagingPath: job.remoteFilePath,
          byteSize: job.localActivityFileSize,
          sha256: job.artifactSha256,
          format: getFileType(job.localActivityFilePath),
        });
        if (job.ingestionId && job.ingestionId !== legacyClaim.ingestionId) {
          throw new Error("Legacy recording upload claim changed during retry");
        }
        if (legacyClaim.status === "ready") {
          job = await persistJobProgress(job, "creating_activity", now, deps, {
            activityId: legacyClaim.activityId,
            ingestionId: legacyClaim.ingestionId,
            uploadCompletedAt: now(),
          });
          return persistJobProgress(job, "complete", now, deps);
        }
        job = await persistJobProgress(job, "uploading", now, deps, {
          ingestionId: legacyClaim.ingestionId,
          uploadCompletedAt: now(),
        });
      } catch {
        // The legacy object may have expired or predate strict ownership metadata.
        // Fall back to re-uploading the retained local artifact through a new URL.
      }
    }

    if (!job.uploadCompletedAt && !job.activityId) {
      if (!job.artifactSha256 || !job.localActivityFileSize) {
        throw new Error("Recording artifact metadata is incomplete");
      }
      const fileType = getFileType(job.localActivityFilePath);
      const uploadClaim = await deps.beginMobileRecordingUpload({
        recordingSessionId,
        byteSize: job.localActivityFileSize,
        sha256: job.artifactSha256,
        format: fileType,
      });
      if (job.ingestionId && job.ingestionId !== uploadClaim.ingestionId) {
        throw new Error("Recording upload claim changed during retry");
      }
      if (uploadClaim.status === "ready") {
        job = await persistJobProgress(job, "creating_activity", now, deps, {
          activityId: uploadClaim.activityId,
          ingestionId: uploadClaim.ingestionId,
          uploadCompletedAt: now(),
        });
        return persistJobProgress(job, "complete", now, deps);
      }

      job = await persistJobProgress(job, "uploading", now, deps, {
        ingestionId: uploadClaim.ingestionId,
      });
      const uploadResult = await deps.uploadToSignedUrl(
        job.localActivityFilePath,
        uploadClaim.signedUrl,
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
      const created = await deps.createFromRecordingSummary({
        profileId: job.draft.profileId,
        recordingSessionId,
        name: job.draft.name,
        notes: job.draft.notes,
        is_private: job.draft.is_private,
        content_visibility: job.draft.content_visibility,
        startedAt: job.draft.startedAt,
        finishedAt: job.draft.finishedAt,
        activityPlanId: job.draft.activityPlanId,
        executionManifest: job.executionManifest,
        artifactSource: "uploadedArtifact",
        uploadedArtifact: { ingestionId },
        summary: {
          distanceMeters: Math.round(job.draft.distanceMeters),
          calories: job.draft.calories ?? null,
        },
        source: "mobile_recording",
      });

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

    return persistJobProgress(job, "complete", now, deps);
  } catch (error) {
    return persistJobProgress(job, "failed", now, deps, {
      attempts: job.attempts + 1,
      lastError: getErrorMessage(error),
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
