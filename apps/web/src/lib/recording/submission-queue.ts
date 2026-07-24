import {
  PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingSubmissionJob,
  portableWebRecordingSubmissionJobSchema,
} from "@repo/core";

export interface WebRecordingSubmissionQueueStorage {
  listDueSubmissionJobs(now: string): Promise<PortableWebRecordingSubmissionJob[]>;
  claimSubmissionJob(id: string, now: string): Promise<ClaimedWebRecordingSubmissionJob | null>;
  markSubmissionJobRetry(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    nextAttemptAt: string,
    reason: string,
    activityId?: string | null,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  markSubmissionJobReviewRequired(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  markSubmissionJobSubmitted(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
}

export type SubmissionJobClaim = Readonly<{ owner: string; revision: number }>;
export type ClaimedWebRecordingSubmissionJob = PortableWebRecordingSubmissionJob & {
  claim: SubmissionJobClaim;
};

export type SubmitWebRecording = (
  artifact: PortableWebRecordingArtifact,
) => Promise<{ activityId: string }>;

export class PostCreateSubmissionError extends Error {
  constructor(
    readonly activityId: string,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(code ?? "session_rpe_pending");
    this.name = "PostCreateSubmissionError";
  }
}

export async function submitWebRecordingArtifact({
  artifact,
  createActivity,
  recordSessionRpe,
}: {
  artifact: PortableWebRecordingArtifact;
  createActivity: () => Promise<{ id: string }>;
  recordSessionRpe: (input: {
    activityId: string;
    operationId: string;
    rpe: number;
  }) => Promise<unknown>;
}): Promise<{ activityId: string }> {
  const created = await createActivity();
  if (artifact.review.perceivedEffort === null || !artifact.sessionRpeOperationId) {
    return { activityId: created.id };
  }
  try {
    await recordSessionRpe({
      activityId: created.id,
      operationId: artifact.sessionRpeOperationId,
      rpe: artifact.review.perceivedEffort,
    });
  } catch (error) {
    const code = getSubmissionErrorCode(error);
    throw new PostCreateSubmissionError(created.id, code, !isTerminalSessionRpeCode(code));
  }
  return { activityId: created.id };
}

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
    if (job.status === "submitted" || job.status === "review_required") continue;
    if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now.getTime()) continue;

    const submitting = await storage.claimSubmissionJob(job.id, nowIso);
    if (!submitting) continue;
    try {
      const result = await submit(submitting.artifact);
      const terminal = await storage.markSubmissionJobSubmitted(
        job.id,
        submitting.claim,
        nowIso,
        result.activityId,
      );
      if (terminal) updated.push(terminal);
    } catch (error) {
      if (error instanceof PostCreateSubmissionError && !error.retryable) {
        const terminal = await storage.markSubmissionJobReviewRequired(
          job.id,
          submitting.claim,
          nowIso,
          error.activityId,
          classifySubmissionFailure(error),
        );
        if (terminal) updated.push(terminal);
        continue;
      }
      const attempt = submitting.attempts + 1;
      const nextAttemptAt = new Date(now.getTime() + retryDelayMs(attempt)).toISOString();
      const terminal = await storage.markSubmissionJobRetry(
        job.id,
        submitting.claim,
        nowIso,
        nextAttemptAt,
        classifySubmissionFailure(error),
        error instanceof PostCreateSubmissionError ? error.activityId : null,
      );
      if (terminal) updated.push(terminal);
    }
  }

  return updated;
}

export function classifySubmissionFailure(error: unknown): string {
  if (error instanceof PostCreateSubmissionError) {
    if (error.retryable) return "session_rpe_pending";
    if (error.code === "CONFLICT") return "session_rpe_conflict";
    if (error.code === "NOT_FOUND") return "session_rpe_not_found";
    if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
      return "session_rpe_authorization_required";
    }
    return "session_rpe_rejected";
  }
  if (error instanceof TypeError) return "network_unavailable";
  if (typeof error === "object" && error && "data" in error) {
    const code = (error as { data?: { code?: unknown } }).data?.code;
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return "authorization_required";
    if (code === "BAD_REQUEST") return "submission_rejected";
  }
  return "temporary_server_failure";
}

function getSubmissionErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || !error || !("data" in error)) return null;
  const code = (error as { data?: { code?: unknown } }).data?.code;
  return typeof code === "string" ? code : null;
}

function isTerminalSessionRpeCode(code: string | null): boolean {
  return ["CONFLICT", "UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST", "NOT_FOUND"].includes(code ?? "");
}
