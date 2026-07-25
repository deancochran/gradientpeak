import { getProviderCapabilityUnavailableReason } from "@repo/core";
import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import {
  createWahooClient,
  type WahooApiError,
  type WahooClient,
} from "../integrations/wahoo/client";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";
import { WahooPlannedWorkoutProvider } from "./planned-workouts/wahoo-planned-workout-provider";
import { isWahooStagingCleanupPayload, WAHOO_STAGING_CLEANUP_JOB } from "./wahoo-staging-cleanup";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_RESOURCE = "planned_workouts";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";
const WAHOO_DISCONNECT_JOB = "wahoo.disconnect";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
  projectionHash?: string;
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

type WahooDisconnectPayload = { expectedGeneration: number };

function isWahooDisconnectPayload(value: unknown): value is WahooDisconnectPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "expectedGeneration" in value &&
      typeof value.expectedGeneration === "number" &&
      Number.isInteger(value.expectedGeneration) &&
      value.expectedGeneration > 0,
  );
}

class WahooSyncResultError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WahooSyncResultError";
  }
}

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function isWahooJobPayload(value: unknown): value is WahooJobPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "eventId" in value &&
      typeof value.eventId === "string" &&
      "operation" in value &&
      (value.operation === "publish" || value.operation === "unsync") &&
      (!("projectionHash" in value) || typeof value.projectionHash === "string") &&
      (!("unsyncTarget" in value) ||
        (typeof value.unsyncTarget === "object" &&
          value.unsyncTarget !== null &&
          "externalId" in value.unsyncTarget &&
          typeof value.unsyncTarget.externalId === "string" &&
          "resourceLinkId" in value.unsyncTarget &&
          typeof value.unsyncTarget.resourceLinkId === "string")),
  );
}

export class WahooSyncJobService {
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      syncService: WahooSyncService;
      wahooRepository: WahooRepository;
      removeWahooStagingObject?: (path: string, signal: AbortSignal) => Promise<void>;
      wahooClientFactory?: (input: { accessToken: string }) => Pick<WahooClient, "disconnect">;
    },
  ) {}

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<{ queued: boolean; jobId: string }> {
    const result = await new WahooPlannedWorkoutProvider({
      providerSyncRepository: this.deps.providerSyncRepository,
      wahooRepository: this.deps.wahooRepository,
    }).enqueuePublishEvent(input);
    return { ...result, jobId: result.jobId ?? "" };
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<{ queued: boolean; jobId: string }> {
    const result = await new WahooPlannedWorkoutProvider({
      providerSyncRepository: this.deps.providerSyncRepository,
      wahooRepository: this.deps.wahooRepository,
    }).enqueueUnsyncEvent(input);
    return { ...result, jobId: result.jobId ?? "" };
  }

  async processDueJobs(input: {
    concurrency?: number;
    leaseMs?: number;
    limit?: number;
    workerId?: string;
  }): Promise<{ completed: number; failed: number; processed: number }> {
    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 4));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 10)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 5 * 60_000;
    const workerId = createProviderSyncWorkerId(input.workerId ?? "wahoo-sync-worker");

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [
          WAHOO_PUBLISH_EVENT_JOB,
          WAHOO_UNSYNC_EVENT_JOB,
          WAHOO_DISCONNECT_JOB,
          ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
        ],
        limit: capacity,
        lockExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
        now,
        provider: "wahoo",
        workerId,
      });

      return await executeProviderSyncJobs({
        concurrency: capacity,
        getEndingQueueTelemetry: () =>
          this.deps.providerSyncRepository.getQueueTelemetry?.({
            jobTypes: [
              WAHOO_PUBLISH_EVENT_JOB,
              WAHOO_UNSYNC_EVENT_JOB,
              ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
            ],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: "planned_workouts",
        jobs,
        leaseRenewIntervalMs: Math.max(1_000, Math.floor(leaseMs / 3)),
        provider: "wahoo",
        renewLease: (job) =>
          this.deps.providerSyncRepository.renewJobLease({
            id: job.id,
            lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            workerId,
          }),
        processJob: async (job, context) => {
          if (job.jobType === WAHOO_STAGING_CLEANUP_JOB) {
            if (
              !this.deps.removeWahooStagingObject ||
              !isWahooStagingCleanupPayload(job.payload, job)
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_staging_cleanup_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            try {
              await this.deps.removeWahooStagingObject(job.payload.path, context.signal);
              if (job.payload.uploadOutcome === "uncertain") {
                const shouldDeadLetter = job.attempt >= job.maxAttempts;
                const finalized = await this.deps.providerSyncRepository.markJobFailed({
                  id: job.id,
                  lastError: "wahoo_staging_cleanup_uncertain",
                  ...(shouldDeadLetter
                    ? {}
                    : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                  status: shouldDeadLetter ? "dead_lettered" : "failed",
                  workerId,
                });
                return finalized ? (shouldDeadLetter ? "dead_lettered" : "failed") : "failed";
              }
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            } catch {
              const shouldDeadLetter = job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError:
                  job.payload.uploadOutcome === "uncertain"
                    ? "wahoo_staging_cleanup_uncertain"
                    : "wahoo_staging_cleanup_failed",
                ...(shouldDeadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                status: shouldDeadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (shouldDeadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          // A job may have been claimed immediately before a disconnect/reconnect
          // fence. Re-check durable authority immediately before any credential or
          // provider work.
          if (
            job.jobType !== WAHOO_DISCONNECT_JOB &&
            !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
              generation: job.integrationGeneration ?? 1,
              integrationId: job.integrationId,
              profileId: job.profileId,
            }) ?? true))
          ) {
            await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
            return "completed";
          }
          if (job.jobType === WAHOO_DISCONNECT_JOB) {
            if (
              !isWahooDisconnectPayload(job.payload) ||
              job.payload.expectedGeneration !== job.integrationGeneration
            ) {
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration ?? 1,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const attempt = await this.deps.providerSyncRepository.beginWahooDisconnectAttempt({
              generation: job.integrationGeneration,
              integrationId: job.integrationId,
              jobId: job.id,
              workerId,
            });
            if (!attempt) return "failed";
            if (attempt.disposition === "superseded") {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            if (attempt.disposition === "invalid") {
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            try {
              await (this.deps.wahooClientFactory ?? createWahooClient)({
                accessToken: attempt.accessToken,
              }).disconnect();
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "confirmed",
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const status = (error as WahooApiError).status;
              const definitiveFailure =
                typeof status === "number" && status >= 400 && status < 500 && status !== 429;
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome:
                  definitiveFailure || job.attempt >= job.maxAttempts ? "dead_lettered" : "retry",
                workerId,
              });
              return finalized
                ? definitiveFailure || job.attempt >= job.maxAttempts
                  ? "dead_lettered"
                  : "failed"
                : "failed";
            }
          }
          // These legacy jobs predate the documented reconciliation boundary. They
          // must become terminal without looking up credentials or calling Wahoo.
          const disabledReason = getProviderCapabilityUnavailableReason(
            "wahoo",
            "planned_activity_push",
          );
          if (disabledReason) {
            const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
              job.id,
              workerId,
              job.integrationGeneration,
            );
            return finalized === false ? "failed" : "completed";
          }
          if (!isWahooJobPayload(job.payload)) {
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              ...(job.integrationGeneration === undefined
                ? {}
                : { expectedIntegrationGeneration: job.integrationGeneration }),
              id: job.id,
              lastError: "Invalid Wahoo job payload",
              status: "dead_lettered",
              workerId,
            });
            return finalized === false ? "failed" : "dead_lettered";
          }

          try {
            const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
              job.profileId,
            );
            if (!integration || integration.id !== job.integrationId) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized === false ? "failed" : "completed";
            }

            if (job.jobType === WAHOO_PUBLISH_EVENT_JOB) {
              const result = await this.deps.syncService.syncEvent(
                job.payload.eventId,
                job.profileId,
                job.payload.projectionHash === undefined
                  ? {}
                  : { expectedProjectionHash: job.payload.projectionHash },
              );
              if (!result.success) {
                if (result.failureCategory === "eligibility" && result.retryable === false) {
                  const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                    job.id,
                    workerId,
                  );
                  return finalized === false ? "failed" : "completed";
                }
                throw new WahooSyncResultError(
                  result.error ?? "Wahoo publish job failed",
                  result.retryable !== false,
                );
              }
            } else if (job.jobType === WAHOO_UNSYNC_EVENT_JOB) {
              const result = job.payload.unsyncTarget
                ? await this.deps.syncService.unsyncEvent(
                    job.payload.eventId,
                    job.profileId,
                    job.payload.unsyncTarget,
                  )
                : await this.deps.syncService.unsyncEvent(job.payload.eventId, job.profileId);
              if (
                !result.success &&
                result.action === "no_change" &&
                result.error === "Sync record not found"
              ) {
                const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                  job.id,
                  workerId,
                );
                return finalized === false ? "failed" : "completed";
              }
              if (!result.success) {
                throw new WahooSyncResultError(
                  result.error ?? "Wahoo unsync job failed",
                  result.retryable !== false,
                );
              }
            } else {
              throw new Error(`Unsupported Wahoo job type: ${job.jobType}`);
            }

            const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
              job.id,
              workerId,
              job.integrationGeneration,
            );
            if (finalized === false) return "failed";
            await this.deps.providerSyncRepository.updateSyncStateAfterRun({
              integrationId: job.integrationId,
              provider: "wahoo",
              resource: WAHOO_RESOURCE,
              succeeded: true,
            });
            return "completed";
          } catch (error) {
            const lastError = error instanceof Error ? error.message : "Unknown Wahoo job failure";
            const shouldDeadLetter =
              (error instanceof WahooSyncResultError && !error.retryable) ||
              job.attempt >= job.maxAttempts;
            const nextRunAt = shouldDeadLetter
              ? undefined
              : addMinutes(now, Math.min(job.attempt * 5, 60));
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              ...(job.integrationGeneration === undefined
                ? {}
                : { expectedIntegrationGeneration: job.integrationGeneration }),
              id: job.id,
              lastError,
              ...(nextRunAt === undefined ? {} : { nextRunAt }),
              status: shouldDeadLetter ? "dead_lettered" : "failed",
              workerId,
            });
            if (finalized === false) return "failed";
            await this.deps.providerSyncRepository.updateSyncStateAfterFailure({
              integrationId: job.integrationId,
              lastError,
              ...(nextRunAt === undefined ? {} : { nextSyncAt: nextRunAt }),
              provider: "wahoo",
              resource: WAHOO_RESOURCE,
            });
            return shouldDeadLetter ? "dead_lettered" : "failed";
          }
        },
      });
    } finally {
      this.deps.executionLimiter?.release(capacity);
    }
  }
}

export function getWahooPublishHorizonDays() {
  return WAHOO_PUBLISH_HORIZON_DAYS;
}
