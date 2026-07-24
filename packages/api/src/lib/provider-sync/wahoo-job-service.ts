import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";
import { WahooPlannedWorkoutProvider } from "./planned-workouts/wahoo-planned-workout-provider";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_RESOURCE = "planned_workouts";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
  projectionHash?: string;
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

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
    },
  ) {}

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<{ queued: boolean; jobId: string }> {
    return new WahooPlannedWorkoutProvider({
      providerSyncRepository: this.deps.providerSyncRepository,
      wahooRepository: this.deps.wahooRepository,
    }).enqueuePublishEvent(input);
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<{ queued: boolean; jobId: string }> {
    return new WahooPlannedWorkoutProvider({
      providerSyncRepository: this.deps.providerSyncRepository,
      wahooRepository: this.deps.wahooRepository,
    }).enqueueUnsyncEvent(input);
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
        jobTypes: [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB],
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
            jobTypes: [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB],
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
        processJob: async (job) => {
          if (!isWahooJobPayload(job.payload)) {
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
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
                { expectedProjectionHash: job.payload.projectionHash },
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
              id: job.id,
              lastError,
              nextRunAt,
              status: shouldDeadLetter ? "dead_lettered" : "failed",
              workerId,
            });
            if (finalized === false) return "failed";
            await this.deps.providerSyncRepository.updateSyncStateAfterFailure({
              integrationId: job.integrationId,
              lastError,
              nextSyncAt: nextRunAt,
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
