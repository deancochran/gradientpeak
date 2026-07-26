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
import { isWahooStagingCleanupPayload, WAHOO_STAGING_CLEANUP_JOB } from "./wahoo-staging-cleanup";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_DISCONNECT_JOB = "wahoo.disconnect";

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

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

export class WahooSyncJobService {
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      /** Runtime composition may still supply this service; planned-workout jobs are not drained. */
      syncService?: WahooSyncService;
      wahooRepository: WahooRepository;
      removeWahooStagingObject?: (path: string, signal: AbortSignal) => Promise<void>;
      wahooClientFactory?: (input: { accessToken: string }) => Pick<WahooClient, "disconnect">;
    },
  ) {}

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
            jobTypes: [...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : [])],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: "lifecycle",
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
          throw new Error(`Unsupported Wahoo job type: ${job.jobType}`);
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
