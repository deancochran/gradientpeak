import { importStravaActivity } from "../../application/activities/import-strava-activity";
import {
  deleteImportedActivitySource,
  ImportedSourceGenerationInactiveError,
} from "../../application/activities/imported-source-management";
import type { getRequiredDb } from "../../db";
import { ActivitySourceInactiveError } from "../../repositories/activity-source-reference-repository";
import type {
  StravaIntegrationRecord,
  StravaRepository,
  StravaSyncJobRecord,
  StravaWebhookReceiptRecord,
} from "../../repositories/strava-repository";
import { isStravaIntegrationEnabled } from "../integrations/oauth-config";
import { StravaClient, StravaClientError } from "../integrations/strava/client";
import {
  resolveStravaAccessToken,
  StravaAuthorizationRequiredError,
} from "../integrations/strava/credentials";
import {
  createStravaWebhookDeliveryIdentity,
  parseStravaWebhookPayload,
  type StravaWebhookPayload,
} from "./strava-webhook-contract";

export const STRAVA_WEBHOOK_RECEIPT_JOB = "strava.process_webhook_receipt";

type StravaWebhookClient = Pick<
  StravaClient,
  "getActivity" | "getActivityStreams" | "getAuthenticatedAthlete"
>;

function isReceiptJobPayload(value: unknown): value is { receiptId: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "receiptId" in value &&
      typeof value.receiptId === "string" &&
      Object.keys(value).length === 1,
  );
}

function eventRevision(payload: StravaWebhookPayload): string {
  return new Date(payload.event_time * 1_000).toISOString();
}

function isOlderThanPersistedRevision(revision: string, persisted: string | null): boolean {
  if (!persisted) return false;
  const persistedTime = Date.parse(persisted);
  const incomingTime = Date.parse(revision);
  return (
    Number.isFinite(persistedTime) && Number.isFinite(incomingTime) && incomingTime < persistedTime
  );
}

function retryAt(error: unknown, attempt: number): string | undefined {
  if (error instanceof StravaClientError && error.kind === "rate_limited") {
    return new Date(
      Date.now() + (error.details.retryAfterSeconds ?? 15 * 60) * 1_000,
    ).toISOString();
  }
  if (
    error instanceof StravaClientError &&
    ["activity_missing", "network_unavailable", "provider_unavailable", "request_timeout"].includes(
      error.kind,
    )
  ) {
    return new Date(
      Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempt, 6)),
    ).toISOString();
  }
  return undefined;
}

function failureCode(error: unknown): string {
  if (error instanceof StravaAuthorizationRequiredError) return "strava_authorization_required";
  if (error instanceof StravaClientError) return `strava_${error.kind}`;
  if (error instanceof ActivitySourceInactiveError) return "strava_source_inactive";
  if (error instanceof Error && error.message === "strava_activity_owner_mismatch") {
    return "strava_activity_owner_mismatch";
  }
  return "strava_webhook_processing_failed";
}

function isAuthorizationFailure(error: unknown): boolean {
  return (
    error instanceof StravaAuthorizationRequiredError ||
    (error instanceof StravaClientError && error.kind === "authorization")
  );
}

function isAuthenticatedAthleteUnauthorized(error: unknown): boolean {
  return (
    error instanceof StravaClientError &&
    error.kind === "authorization" &&
    error.details.status === 401
  );
}

export class StravaWebhookJobService {
  constructor(
    private readonly deps: {
      clientFactory?: (accessToken: string) => StravaWebhookClient;
      db: ReturnType<typeof getRequiredDb>;
      deleteActivitySource?: typeof deleteImportedActivitySource;
      importActivity?: typeof importStravaActivity;
      now?: () => Date;
      repository: StravaRepository;
    },
  ) {}

  storeAndEnqueueReceipt(payload: StravaWebhookPayload, deliveryId: string) {
    const eventType = `${payload.object_type}.${payload.aspect_type}`;
    return this.deps.repository.storeAndEnqueueWebhookReceipt({
      deliveryId,
      eventType,
      objectId: String(payload.object_id),
      objectType: payload.object_type,
      ownerExternalId: String(payload.owner_id),
      payload,
      priority: payload.object_type === "athlete" ? 0 : payload.aspect_type === "delete" ? 20 : 50,
    });
  }

  async processDueJobs(
    input: { leaseMs?: number; limit?: number; workerId?: string } = {},
  ): Promise<{ completed: number; failed: number; processed: number }> {
    if (!isStravaIntegrationEnabled()) return { completed: 0, failed: 0, processed: 0 };
    const now = (this.deps.now ?? (() => new Date()))();
    const leaseMs = Math.min(30 * 60_000, Math.max(60_000, input.leaseMs ?? 10 * 60_000));
    const workerId = `${input.workerId ?? "strava-webhook-worker"}:${crypto.randomUUID()}`;
    const jobs = await this.deps.repository.claimDueJobs({
      jobTypes: [STRAVA_WEBHOOK_RECEIPT_JOB],
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

  private finalize(
    job: StravaSyncJobRecord,
    receipt: StravaWebhookReceiptRecord,
    workerId: string,
    input: {
      error?: string;
      nextRunAt?: string;
      status: "completed" | "failed" | "dead_lettered";
    },
  ) {
    return this.deps.repository.finalizeWebhookReceiptJob({
      expectedIntegrationGeneration: job.integrationGeneration,
      jobId: job.id,
      jobStatus: input.status,
      ...(input.error ? { lastError: input.error } : {}),
      ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
      receiptId: receipt.id,
      receiptStatus: input.status === "completed" ? "processed" : "failed",
      workerId,
    });
  }

  private async processJob(
    job: StravaSyncJobRecord,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    if (!isReceiptJobPayload(job.payload)) {
      return this.deps.repository.failJob({
        id: job.id,
        lastError: "strava_invalid_webhook_job_payload",
        status: "dead_lettered",
        workerId,
      });
    }
    const receipt = await this.deps.repository.getWebhookReceipt(job.payload.receiptId);
    if (!receipt || receipt.jobId !== job.id) {
      return this.deps.repository.failJob({
        id: job.id,
        lastError: "strava_webhook_receipt_missing",
        status: "dead_lettered",
        workerId,
      });
    }
    const inactive = async () =>
      this.finalize(job, receipt, workerId, {
        error: "integration_generation_inactive",
        status: "completed",
      });
    if (
      !(await (this.deps.repository.isIntegrationGenerationActive?.({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        profileId: job.profileId,
      }) ?? false))
    ) {
      return inactive();
    }
    const payload = parseStravaWebhookPayload(receipt.payload);
    if (
      !payload ||
      receipt.providerEventId !== createStravaWebhookDeliveryIdentity(payload) ||
      receipt.providerAccountId !== String(payload.owner_id)
    ) {
      return this.finalize(job, receipt, workerId, {
        error: "strava_invalid_webhook_receipt",
        status: "dead_lettered",
      });
    }

    const integration = await this.deps.repository.findIntegrationByExternalId(
      String(payload.owner_id),
    );
    if (!integration) return inactive();
    if (
      integration.id !== job.integrationId ||
      integration.profileId !== job.profileId ||
      integration.integrationGeneration !== job.integrationGeneration
    ) {
      return this.finalize(job, receipt, workerId, {
        error: "strava_owner_integration_mismatch",
        status: "dead_lettered",
      });
    }

    if (payload.object_type === "athlete") {
      return this.processAthleteDeauthorization(
        job,
        receipt,
        integration,
        String(payload.owner_id),
        workerId,
        leaseMs,
      );
    }

    const revision = eventRevision(payload);
    try {
      const source = await this.deps.repository.findDirectActivitySource({
        profileId: job.profileId,
        providerExternalId: String(payload.object_id),
      });
      if (isOlderThanPersistedRevision(revision, source?.providerRevision ?? null)) {
        return this.finalize(job, receipt, workerId, { status: "completed" });
      }
      if (payload.aspect_type === "delete") {
        const renewed = await this.deps.repository.renewJobLease({
          id: job.id,
          lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          workerId,
        });
        if (!renewed) return false;
        const accessToken = await resolveStravaAccessToken({
          integration,
          repository: this.deps.repository,
        });
        const client = (
          this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
        )(accessToken);
        const detail = await client.getActivity(String(payload.object_id));
        if (
          String(detail.data.id) !== String(payload.object_id) ||
          String(detail.data.athlete.id) !== String(payload.owner_id)
        ) {
          return this.finalize(job, receipt, workerId, {
            error: "strava_activity_owner_mismatch",
            status: "dead_lettered",
          });
        }
        return this.finalize(job, receipt, workerId, {
          error: "strava_delete_not_corroborated",
          status: "completed",
        });
      }
      if (source && source.resolutionStatus !== "confirmed") {
        return this.finalize(job, receipt, workerId, { status: "completed" });
      }
      const renewed = await this.deps.repository.renewJobLease({
        id: job.id,
        lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        workerId,
      });
      if (!renewed) return false;
      const accessToken = await resolveStravaAccessToken({
        integration,
        repository: this.deps.repository,
      });
      const client = (
        this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
      )(accessToken);
      const detail = await client.getActivity(String(payload.object_id));
      if (
        String(detail.data.id) !== String(payload.object_id) ||
        String(detail.data.athlete.id) !== String(payload.owner_id)
      ) {
        throw new Error("strava_activity_owner_mismatch");
      }
      const streams = await client.getActivityStreams(String(payload.object_id));
      if (
        !(await (this.deps.repository.isIntegrationGenerationActive?.({
          generation: job.integrationGeneration,
          integrationId: job.integrationId,
          profileId: job.profileId,
        }) ?? false))
      ) {
        return inactive();
      }
      await (this.deps.importActivity ?? importStravaActivity)({
        activity: detail.data,
        db: this.deps.db,
        integrationGeneration: job.integrationGeneration,
        integrationId: job.integrationId,
        profileId: job.profileId,
        providerUpdatedAt: revision,
        streams: streams.data,
      });
      return this.finalize(job, receipt, workerId, { status: "completed" });
    } catch (error) {
      if (error instanceof ImportedSourceGenerationInactiveError) return inactive();
      if (error instanceof ActivitySourceInactiveError) {
        return this.finalize(job, receipt, workerId, { status: "completed" });
      }
      if (
        payload.aspect_type === "delete" &&
        error instanceof StravaClientError &&
        error.kind === "activity_missing"
      ) {
        await (this.deps.deleteActivitySource ?? deleteImportedActivitySource)({
          db: this.deps.db,
          integrationId: job.integrationId,
          integrationGeneration: job.integrationGeneration,
          now: (this.deps.now ?? (() => new Date()))(),
          profileId: job.profileId,
          provider: "strava",
          providerExternalId: String(payload.object_id),
          providerRevision: revision,
        });
        return this.finalize(job, receipt, workerId, { status: "completed" });
      }
      const authorization = isAuthorizationFailure(error);
      if (authorization) {
        await this.deps.repository.markReconnectRequired({
          expectedCredentialGeneration: integration.credentialGeneration,
          expectedIntegrationGeneration: integration.integrationGeneration,
          id: integration.id,
        });
      }
      const nextRunAt = retryAt(error, job.attempt);
      const retryable = Boolean(nextRunAt) && job.attempt < job.maxAttempts;
      return this.finalize(job, receipt, workerId, {
        error: failureCode(error),
        ...(retryable && nextRunAt ? { nextRunAt } : {}),
        status: retryable ? "failed" : "dead_lettered",
      }).then(() => false);
    }
  }

  private async processAthleteDeauthorization(
    job: StravaSyncJobRecord,
    receipt: StravaWebhookReceiptRecord,
    integration: StravaIntegrationRecord,
    ownerExternalId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    try {
      const renewed = await this.deps.repository.renewJobLease({
        id: job.id,
        lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        workerId,
      });
      if (!renewed) return false;
      const accessToken = await resolveStravaAccessToken({
        integration,
        repository: this.deps.repository,
      });
      const client = (
        this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
      )(accessToken);
      const athlete = await client.getAuthenticatedAthlete();
      if (String(athlete.data.id) !== ownerExternalId) {
        return this.finalize(job, receipt, workerId, {
          error: "strava_athlete_owner_mismatch",
          status: "dead_lettered",
        });
      }
      return this.finalize(job, receipt, workerId, {
        error: "strava_deauthorization_not_corroborated",
        status: "completed",
      });
    } catch (error) {
      if (isAuthenticatedAthleteUnauthorized(error)) {
        return this.deps.repository.applyProviderDeauthorization({
          expectedIntegrationGeneration: job.integrationGeneration,
          integrationId: job.integrationId,
          jobId: job.id,
          ownerExternalId,
          profileId: job.profileId,
          provider: "strava",
          receiptId: receipt.id,
          workerId,
        });
      }
      if (isAuthorizationFailure(error)) {
        await this.deps.repository.markReconnectRequired({
          expectedCredentialGeneration: integration.credentialGeneration,
          expectedIntegrationGeneration: integration.integrationGeneration,
          id: integration.id,
        });
      }
      const nextRunAt = retryAt(error, job.attempt);
      const retryable = Boolean(nextRunAt) && job.attempt < job.maxAttempts;
      return this.finalize(job, receipt, workerId, {
        error: failureCode(error),
        ...(retryable && nextRunAt ? { nextRunAt } : {}),
        status: retryable ? "failed" : "dead_lettered",
      }).then(() => false);
    }
  }
}
