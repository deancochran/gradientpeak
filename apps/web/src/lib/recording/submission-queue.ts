import {
  PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingSubmissionJob,
  portableWebRecordingSubmissionJobSchema,
} from "@repo/core";

export interface WebRecordingSubmissionQueueStorage {
  listDueSubmissionJobs(now: string): Promise<PortableWebRecordingSubmissionJob[]>;
  markSubmissionJobSubmitting(id: string, now: string): Promise<PortableWebRecordingSubmissionJob>;
  markSubmissionJobRetry(
    id: string,
    now: string,
    nextAttemptAt: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob>;
  markSubmissionJobSubmitted(
    id: string,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob>;
}

export type SubmitWebRecording = (
  artifact: PortableWebRecordingArtifact,
) => Promise<{ activityId: string }>;

export function createQueuedSubmissionJob(
  artifact: PortableWebRecordingArtifact,
  now: string,
): PortableWebRecordingSubmissionJob {
  return portableWebRecordingSubmissionJobSchema.parse({
    schemaVersion: PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
    id: artifact.recordingSessionId,
    artifact,
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    activityId: null,
    updatedAt: now,
  });
}

export function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

export async function drainWebRecordingSubmissionQueue(
  storage: WebRecordingSubmissionQueueStorage,
  submit: SubmitWebRecording,
  now: Date = new Date(),
): Promise<PortableWebRecordingSubmissionJob[]> {
  const nowIso = now.toISOString();
  const jobs = await storage.listDueSubmissionJobs(nowIso);
  const updated: PortableWebRecordingSubmissionJob[] = [];

  for (const job of jobs) {
    if (job.status === "submitted") continue;
    if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now.getTime()) continue;

    const submitting = await storage.markSubmissionJobSubmitting(job.id, nowIso);
    try {
      const result = await submit(submitting.artifact);
      updated.push(await storage.markSubmissionJobSubmitted(job.id, nowIso, result.activityId));
    } catch (error) {
      const attempt = submitting.attempts + 1;
      const nextAttemptAt = new Date(now.getTime() + retryDelayMs(attempt)).toISOString();
      updated.push(
        await storage.markSubmissionJobRetry(
          job.id,
          nowIso,
          nextAttemptAt,
          classifySubmissionFailure(error),
        ),
      );
    }
  }

  return updated;
}

function classifySubmissionFailure(error: unknown): string {
  if (error instanceof TypeError) return "network_unavailable";
  if (typeof error === "object" && error && "data" in error) {
    const code = (error as { data?: { code?: unknown } }).data?.code;
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return "authorization_required";
    if (code === "BAD_REQUEST") return "submission_rejected";
  }
  return "temporary_server_failure";
}
