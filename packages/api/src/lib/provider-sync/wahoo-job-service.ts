import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import { WahooPlannedWorkoutProvider } from "./planned-workouts/wahoo-planned-workout-provider";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_RESOURCE = "planned_workouts";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
};

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
      (value.operation === "publish" || value.operation === "unsync"),
  );
}

export class WahooSyncJobService {
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
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

  async processDueJobs(input: { limit?: number; workerId?: string }): Promise<{
    completed: number;
    failed: number;
    processed: number;
  }> {
    const now = new Date().toISOString();
    const workerId = input.workerId ?? "wahoo-sync-worker";
    const jobs = await this.deps.providerSyncRepository.claimDueJobs({
      jobTypes: [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB],
      limit: input.limit ?? 10,
      lockExpiresAt: addMinutes(now, 5),
      now,
      provider: "wahoo",
      workerId,
    });

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      if (!isWahooJobPayload(job.payload)) {
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError: "Invalid Wahoo job payload",
          status: "dead_lettered",
          workerId,
        });
        failed += 1;
        continue;
      }

      try {
        const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
          job.profileId,
        );
        if (!integration || integration.id !== job.integrationId) {
          await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
          completed += 1;
          continue;
        }

        if (job.jobType === WAHOO_PUBLISH_EVENT_JOB) {
          const result = await this.deps.syncService.syncEvent(job.payload.eventId, job.profileId);
          if (!result.success) {
            throw new Error(result.error ?? "Wahoo publish job failed");
          }
        } else if (job.jobType === WAHOO_UNSYNC_EVENT_JOB) {
          const result = await this.deps.syncService.unsyncEvent(
            job.payload.eventId,
            job.profileId,
          );
          if (
            !result.success &&
            result.action === "no_change" &&
            result.error === "Sync record not found"
          ) {
            await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
            completed += 1;
            continue;
          }
          if (!result.success) {
            throw new Error(result.error ?? "Wahoo unsync job failed");
          }
        } else {
          throw new Error(`Unsupported Wahoo job type: ${job.jobType}`);
        }

        await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
        await this.deps.providerSyncRepository.updateSyncStateAfterRun({
          integrationId: job.integrationId,
          provider: "wahoo",
          resource: WAHOO_RESOURCE,
          succeeded: true,
        });
        completed += 1;
      } catch (error) {
        const lastError = error instanceof Error ? error.message : "Unknown Wahoo job failure";
        const shouldDeadLetter = job.attempt >= job.maxAttempts;
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError,
          nextRunAt: shouldDeadLetter ? undefined : addMinutes(now, Math.min(job.attempt * 5, 60)),
          status: shouldDeadLetter ? "dead_lettered" : "failed",
          workerId,
        });
        await this.deps.providerSyncRepository.updateSyncStateAfterFailure({
          integrationId: job.integrationId,
          lastError,
          nextSyncAt: shouldDeadLetter ? undefined : addMinutes(now, Math.min(job.attempt * 5, 60)),
          provider: "wahoo",
          resource: WAHOO_RESOURCE,
        });
        failed += 1;
      }
    }

    return {
      completed,
      failed,
      processed: jobs.length,
    };
  }
}

export function getWahooPublishHorizonDays() {
  return WAHOO_PUBLISH_HORIZON_DAYS;
}
