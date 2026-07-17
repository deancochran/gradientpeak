import { upsertActivitySubmissionQueueJob } from "./storage";
import type {
  ActivitySubmissionQueueJob,
  ActivitySubmissionQueueJobStatus,
  ActivitySubmissionQueueRunnerDeps,
  MarkUploadedAndProcessInput,
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

function getFileType(filePath: string): MarkUploadedAndProcessInput["fileType"] {
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
    if (!job.activityId || !job.ingestionId) {
      job = await persistJobProgress(job, "creating_activity", now, deps);
      const created = await deps.createFromRecordingSummary({
        ...job.draft,
        localFileMetadata: {
          filePath: job.localActivityFilePath,
          fileSize: job.localActivityFileSize ?? undefined,
          fileType: getFileType(job.localActivityFilePath),
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

    if (!job.remoteFilePath) {
      job = await persistJobProgress(job, "uploading", now, deps);
      const signedUrl = await deps.getSignedUploadUrl({
        fileName: getFileName(job.localActivityFilePath),
        ...(job.localActivityFileSize ? { fileSize: job.localActivityFileSize } : {}),
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
      });
    }

    const activityId = job.activityId;
    const ingestionId = job.ingestionId;
    const remoteFilePath = job.remoteFilePath;

    if (!activityId || !ingestionId || !remoteFilePath) {
      throw new Error("Activity submission job is missing required remote identifiers");
    }

    job = await persistJobProgress(job, "processing", now, deps);
    const processResult = await deps.markUploadedAndProcess({
      activityId,
      ingestionId,
      activityFilePath: remoteFilePath,
      ...(job.localActivityFileSize ? { fileSize: job.localActivityFileSize } : {}),
      fileType: getFileType(job.localActivityFilePath),
    });

    if (processResult && !processResult.success) {
      throw new Error("Activity file processing failed");
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
