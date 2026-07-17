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
    if (!job.remoteFilePath) {
      job = await persistJobProgress(job, "uploading", now, deps);
      const artifactMetadata = await deps.getLocalArtifactMetadata(job.localActivityFilePath);
      const signedUrl = await deps.getSignedUploadUrl({
        fileName: getFileName(job.localActivityFilePath),
        fileSize: artifactMetadata.byteSize,
      });
      const uploadResult = await deps.uploadToSignedUrl(
        job.localActivityFilePath,
        signedUrl.signedUrl,
      );

      if (uploadResult && !uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload activity file");
      }

      job = await persistJobProgress(job, "uploading", now, deps, {
        remoteFilePath: signedUrl.filePath,
        localActivityFileSize: artifactMetadata.byteSize,
        artifactSha256: artifactMetadata.sha256,
      });
    }

    if (job.remoteFilePath && (!job.artifactSha256 || !job.localActivityFileSize)) {
      const artifactMetadata = await deps.getLocalArtifactMetadata(job.localActivityFilePath);
      job = await persistJobProgress(job, "uploading", now, deps, {
        artifactSha256: artifactMetadata.sha256,
        localActivityFileSize: artifactMetadata.byteSize,
      });
    }

    if (!job.activityId || !job.ingestionId) {
      if (!job.remoteFilePath || !job.artifactSha256 || !job.localActivityFileSize) {
        throw new Error("Uploaded activity artifact metadata is incomplete");
      }
      const acceptedArtifact = {
        path: job.remoteFilePath,
        sha256: job.artifactSha256,
        byteSize: job.localActivityFileSize,
      };
      job = await persistJobProgress(job, "creating_activity", now, deps);
      const fileType = getFileType(job.localActivityFilePath);
      const created = await deps.createFromRecordingSummary({
        profileId: job.draft.profileId,
        recordingSessionId: job.draft.recordingSessionId,
        name: job.draft.name,
        notes: job.draft.notes,
        is_private: job.draft.is_private,
        content_visibility: job.draft.content_visibility,
        startedAt: job.draft.startedAt,
        finishedAt: job.draft.finishedAt,
        activityPlanId: job.draft.activityPlanId,
        executionManifest: job.executionManifest,
        acceptedArtifact: {
          sha256: acceptedArtifact.sha256,
          byteSize: acceptedArtifact.byteSize,
          bucket: "activity-files",
          path: acceptedArtifact.path,
          mediaType:
            fileType === "fit"
              ? "application/vnd.ant.fit"
              : fileType === "gpx"
                ? "application/gpx+xml"
                : "application/vnd.garmin.tcx+xml",
          format: fileType,
          originalName: getFileName(job.localActivityFilePath),
        },
        summary: {
          distanceMeters: Math.round(job.draft.distanceMeters),
          calories: job.draft.calories ?? null,
        },
        source: "mobile_recording",
      });

      if (!created.ingestion?.id) {
        throw new Error("Activity file ingestion was not returned");
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
