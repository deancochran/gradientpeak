import { createHash } from "node:crypto";
import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import type { ActivityArtifactStorage } from "../../application/activity-file-ingestion/artifact-storage";
import type { getRequiredDb } from "../../db";
import type {
  StravaCompletedActivityUploadPayload,
  StravaRepository,
  StravaSyncJobRecord,
} from "../../repositories/strava-repository";
import { isStravaIntegrationEnabled } from "../integrations/oauth-config";
import { StravaClient, StravaClientError } from "../integrations/strava/client";
import {
  resolveStravaAccessToken,
  StravaAuthorizationRequiredError,
} from "../integrations/strava/credentials";

export const STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB = "strava.completed_activity_upload";
export const STRAVA_UPLOAD_MINIMUM_POLL_INTERVAL_MS = 1_000;

type UploadClient = Pick<StravaClient, "getUploadStatus" | "uploadActivity">;

function isArtifact(value: unknown): value is StravaCompletedActivityUploadPayload["artifact"] {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Record<string, unknown>;
  return (
    typeof artifact.artifactId === "string" &&
    typeof artifact.bucket === "string" &&
    typeof artifact.byteSize === "number" &&
    Number.isSafeInteger(artifact.byteSize) &&
    artifact.byteSize > 0 &&
    typeof artifact.digest === "string" &&
    /^[0-9a-f]{64}$/.test(artifact.digest) &&
    (artifact.format === "fit" || artifact.format === "tcx" || artifact.format === "gpx") &&
    typeof artifact.mediaType === "string" &&
    typeof artifact.path === "string" &&
    typeof artifact.segmentsRevision === "number" &&
    Number.isSafeInteger(artifact.segmentsRevision) &&
    artifact.segmentsRevision > 0
  );
}

function parsePayload(value: unknown): StravaCompletedActivityUploadPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.activityId !== "string" ||
    typeof payload.externalId !== "string" ||
    !isArtifact(payload.artifact) ||
    (payload.phase !== "pre_dispatch" &&
      payload.phase !== "dispatching" &&
      payload.phase !== "polling")
  ) {
    return null;
  }
  if (payload.phase === "polling") {
    return typeof payload.uploadId === "string" && /^\d{1,20}$/.test(payload.uploadId)
      ? (payload as StravaCompletedActivityUploadPayload)
      : null;
  }
  return "uploadId" in payload ? null : (payload as StravaCompletedActivityUploadPayload);
}

function hasWriteScope(scope: string | null | undefined): boolean {
  return new Set((scope ?? "").split(/[\s,]+/).filter(Boolean)).has("activity:write");
}

function nextAttemptAt(now: Date, attempt: number, minimumMs = 5_000): string {
  const delay = Math.max(
    STRAVA_UPLOAD_MINIMUM_POLL_INTERVAL_MS,
    Math.min(30 * 60_000, minimumMs * 2 ** Math.min(Math.max(0, attempt - 1), 8)),
  );
  return new Date(now.getTime() + delay).toISOString();
}

function uploadId(value: string | number): string {
  return String(value);
}

export class StravaCompletedActivityUploadJobService {
  constructor(
    private readonly deps: {
      artifactStorage: ActivityArtifactStorage;
      clientFactory?: (accessToken: string) => UploadClient;
      db: ReturnType<typeof getRequiredDb>;
      now?: () => Date;
      repository: StravaRepository;
    },
  ) {}

  async processDueJobs(
    input: { leaseMs?: number; limit?: number; workerId?: string } = {},
  ): Promise<{ completed: number; failed: number; processed: number }> {
    if (!isStravaIntegrationEnabled()) return { completed: 0, failed: 0, processed: 0 };
    const now = (this.deps.now ?? (() => new Date()))();
    const leaseMs = Math.min(30 * 60_000, Math.max(60_000, input.leaseMs ?? 10 * 60_000));
    const workerId = `${input.workerId ?? "strava-upload-worker"}:${crypto.randomUUID()}`;
    const jobs = await this.deps.repository.claimDueJobs({
      jobTypes: [STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB],
      limit: Math.min(5, Math.max(1, Math.floor(input.limit ?? 2))),
      lockExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      now: now.toISOString(),
      workerId,
    });
    let completed = 0;
    let failed = 0;
    for (const job of jobs) {
      if (await this.processJob(job, workerId, leaseMs)) completed += 1;
      else failed += 1;
    }
    return { completed, failed, processed: jobs.length };
  }

  private async processJob(
    job: StravaSyncJobRecord,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const payload = parsePayload(job.payload);
    if (!payload) {
      return this.deps.repository.failJob({
        id: job.id,
        lastError: "strava_invalid_upload_payload",
        status: "dead_lettered",
        workerId,
      });
    }
    if (payload.phase === "dispatching") {
      return this.deps.repository.failJob({
        expectedIntegrationGeneration: job.integrationGeneration,
        id: job.id,
        lastError: "dispatch_uncertain",
        status: "dead_lettered",
        workerId,
      });
    }
    if (
      !(await (this.deps.repository.isIntegrationGenerationActive?.({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        profileId: job.profileId,
      }) ?? false))
    ) {
      return this.deps.repository.markJobSucceeded({ id: job.id, workerId });
    }
    const integration = await this.deps.repository.findIntegrationByProfileId(job.profileId);
    if (
      !integration ||
      integration.id !== job.integrationId ||
      integration.integrationGeneration !== job.integrationGeneration ||
      !hasWriteScope(integration.scope)
    ) {
      return this.deps.repository.failJob({
        expectedIntegrationGeneration: job.integrationGeneration,
        id: job.id,
        lastError: "strava_upload_reconnect_required",
        status: "dead_lettered",
        workerId,
      });
    }

    if (payload.phase === "polling") {
      return this.poll(job, payload, integration, workerId);
    }
    return this.dispatch(job, payload, integration, workerId, leaseMs);
  }

  private async dispatch(
    job: StravaSyncJobRecord,
    payload: Extract<StravaCompletedActivityUploadPayload, { phase: "pre_dispatch" }>,
    integration: Awaited<ReturnType<StravaRepository["findIntegrationByProfileId"]>> & {},
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = (this.deps.now ?? (() => new Date()))();
    try {
      const target = await this.deps.repository.readCompletedActivityUploadTarget({
        activityId: payload.activityId,
        profileId: job.profileId,
      });
      if (
        target.status !== "ready" ||
        target.integrationId !== job.integrationId ||
        target.integrationGeneration !== job.integrationGeneration ||
        target.artifact.artifactId !== payload.artifact.artifactId ||
        target.artifact.digest !== payload.artifact.digest
      ) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: "strava_upload_unsupported_evidence",
          status: "dead_lettered",
          workerId,
        });
      }
      const stored = await this.deps.artifactStorage.readObjectBounded({
        bucket: payload.artifact.bucket,
        path: payload.artifact.path,
        maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
      });
      const digest = createHash("sha256").update(stored.data).digest("hex");
      if (
        stored.data.byteLength !== payload.artifact.byteSize ||
        digest !== payload.artifact.digest
      ) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: "strava_upload_artifact_integrity_failed",
          status: "dead_lettered",
          workerId,
        });
      }
      const accessToken = await resolveStravaAccessToken({
        integration,
        repository: this.deps.repository,
      });
      const renewed = await this.deps.repository.renewJobLease({
        id: job.id,
        lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        workerId,
      });
      if (!renewed) return false;
      const client = (
        this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
      )(accessToken);
      const outcome = await this.deps.repository.runCompletedActivityUploadDispatch({
        dispatch: async () => {
          try {
            return {
              response: await client.uploadActivity({
                bytes: stored.data,
                externalId: payload.externalId,
                format: payload.artifact.format,
              }),
            };
          } catch (error) {
            return { error };
          }
        },
        expectedIntegrationGeneration: job.integrationGeneration,
        integrationId: job.integrationId,
        jobId: job.id,
        payload: { ...payload, phase: "dispatching" },
        profileId: job.profileId,
        workerId,
      });
      if (!outcome) return false;
      if ("error" in outcome) {
        const error = outcome.error;
        const rateLimited = error instanceof StravaClientError && error.kind === "rate_limited";
        if (rateLimited && job.attempt < job.maxAttempts) {
          return this.deps.repository.rescheduleActivityUpload({
            expectedIntegrationGeneration: job.integrationGeneration,
            jobId: job.id,
            lastError: "strava_upload_dispatch_retry",
            nextRunAt: nextAttemptAt(
              now,
              job.attempt,
              (error.details.retryAfterSeconds ?? 60) * 1_000,
            ),
            payload,
            workerId,
          });
        }
        const knownRejection =
          error instanceof StravaClientError &&
          error.details.status !== undefined &&
          error.details.status < 500 &&
          error.kind !== "invalid_response";
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: knownRejection ? "strava_upload_dispatch_rejected" : "dispatch_uncertain",
          status: "dead_lettered",
          workerId,
        });
      }
      const response = outcome.response;
      const knownUploadId = uploadId(response.data.id);
      if (response.data.error) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: "strava_upload_processing_rejected",
          status: "dead_lettered",
          workerId,
        });
      }
      return this.deps.repository.rescheduleActivityUpload({
        expectedIntegrationGeneration: job.integrationGeneration,
        jobId: job.id,
        nextRunAt: new Date(now.getTime() + STRAVA_UPLOAD_MINIMUM_POLL_INTERVAL_MS).toISOString(),
        payload: { ...payload, phase: "polling", uploadId: knownUploadId },
        workerId,
      });
    } catch (error) {
      const authorization =
        error instanceof StravaAuthorizationRequiredError ||
        (error instanceof StravaClientError && error.kind === "authorization");
      if (authorization) {
        await this.deps.repository.markReconnectRequired({
          expectedCredentialGeneration: integration.credentialGeneration,
          expectedIntegrationGeneration: integration.integrationGeneration,
          id: integration.id,
        });
      }
      return this.deps.repository.failJob({
        expectedIntegrationGeneration: job.integrationGeneration,
        id: job.id,
        lastError: authorization
          ? "strava_upload_reconnect_required"
          : "strava_upload_pre_dispatch_failed",
        nextRunAt: nextAttemptAt(now, job.attempt),
        status: authorization || job.attempt >= job.maxAttempts ? "dead_lettered" : "failed",
        workerId,
      });
    }
  }

  private async poll(
    job: StravaSyncJobRecord,
    payload: Extract<StravaCompletedActivityUploadPayload, { phase: "polling" }>,
    integration: Awaited<ReturnType<StravaRepository["findIntegrationByProfileId"]>> & {},
    workerId: string,
  ): Promise<boolean> {
    const now = (this.deps.now ?? (() => new Date()))();
    try {
      const accessToken = await resolveStravaAccessToken({
        integration,
        repository: this.deps.repository,
      });
      const client = (
        this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
      )(accessToken);
      const response = await client.getUploadStatus(payload.uploadId);
      if (uploadId(response.data.id) !== payload.uploadId) {
        throw new StravaClientError("invalid_response", { status: 200 });
      }
      if (response.data.error) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: "strava_upload_processing_rejected",
          status: "dead_lettered",
          workerId,
        });
      }
      if (response.data.activity_id !== null && response.data.activity_id !== undefined) {
        return this.deps.repository.completeActivityUpload({
          activityId: payload.activityId,
          expectedIntegrationGeneration: job.integrationGeneration,
          jobId: job.id,
          providerExternalId: uploadId(response.data.activity_id),
          workerId,
        });
      }
      if (job.attempt >= job.maxAttempts) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: "strava_upload_poll_exhausted",
          status: "dead_lettered",
          workerId,
        });
      }
      return this.deps.repository.rescheduleActivityUpload({
        expectedIntegrationGeneration: job.integrationGeneration,
        jobId: job.id,
        nextRunAt: new Date(now.getTime() + STRAVA_UPLOAD_MINIMUM_POLL_INTERVAL_MS).toISOString(),
        payload,
        workerId,
      });
    } catch (error) {
      const authorization =
        error instanceof StravaAuthorizationRequiredError ||
        (error instanceof StravaClientError && error.kind === "authorization");
      if (authorization) {
        await this.deps.repository.markReconnectRequired({
          expectedCredentialGeneration: integration.credentialGeneration,
          expectedIntegrationGeneration: integration.integrationGeneration,
          id: integration.id,
        });
      }
      const retryable =
        !authorization &&
        job.attempt < job.maxAttempts &&
        (error instanceof StravaClientError
          ? [
              "network_unavailable",
              "provider_unavailable",
              "rate_limited",
              "request_timeout",
            ].includes(error.kind)
          : false);
      if (!retryable) {
        return this.deps.repository.failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: authorization
            ? "strava_upload_reconnect_required"
            : "strava_upload_poll_failed",
          status: "dead_lettered",
          workerId,
        });
      }
      const minimumMs =
        error instanceof StravaClientError && error.kind === "rate_limited"
          ? (error.details.retryAfterSeconds ?? 60) * 1_000
          : STRAVA_UPLOAD_MINIMUM_POLL_INTERVAL_MS;
      return this.deps.repository.rescheduleActivityUpload({
        expectedIntegrationGeneration: job.integrationGeneration,
        jobId: job.id,
        lastError: "strava_upload_poll_retry",
        nextRunAt: nextAttemptAt(now, job.attempt, minimumMs),
        payload,
        workerId,
      });
    }
  }
}
