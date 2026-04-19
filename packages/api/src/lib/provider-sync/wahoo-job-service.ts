import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_RESOURCE = "planned_workouts";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
};

function subtractDays(isoString: string, days: number): string {
  const date = new Date(isoString);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
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

  async enqueuePublishEvent(input: { eventId: string; profileId: string }): Promise<{ queued: boolean; jobId: string }> {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(input.profileId);
    if (!integration) {
      throw new Error("Wahoo integration not found");
    }

    const planned = await this.deps.wahooRepository.getPlannedEventForSync({
      eventId: input.eventId,
      profileId: input.profileId,
    });

    if (!planned) {
      throw new Error("Planned activity event not found");
    }

    const now = new Date().toISOString();
    const earliestPublishAt = subtractDays(planned.startsAt, WAHOO_PUBLISH_HORIZON_DAYS);
    const runAt = earliestPublishAt > now ? earliestPublishAt : now;

    await this.deps.providerSyncRepository.touchSyncState({
      integrationId: integration.id,
      metadata: { last_enqueued_event_id: input.eventId },
      nextSyncAt: runAt,
      provider: "wahoo",
      publishHorizonDays: WAHOO_PUBLISH_HORIZON_DAYS,
      resource: WAHOO_RESOURCE,
      syncMode: "push_windowed",
    });

    const queued = await this.deps.providerSyncRepository.enqueueJob({
      dedupeKey: `wahoo:publish:event:${input.eventId}`,
      integrationId: integration.id,
      internalResourceId: input.eventId,
      jobType: WAHOO_PUBLISH_EVENT_JOB,
      payload: { eventId: input.eventId, operation: "publish" satisfies WahooJobPayload["operation"] },
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt,
    });

    return { jobId: queued.id, queued: queued.status === "queued" };
  }

  async enqueueUnsyncEvent(input: { eventId: string; profileId: string }): Promise<{ queued: boolean; jobId: string }> {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(input.profileId);
    if (!integration) {
      throw new Error("Wahoo integration not found");
    }

    const queued = await this.deps.providerSyncRepository.enqueueJob({
      dedupeKey: `wahoo:unsync:event:${input.eventId}`,
      integrationId: integration.id,
      internalResourceId: input.eventId,
      jobType: WAHOO_UNSYNC_EVENT_JOB,
      payload: { eventId: input.eventId, operation: "unsync" satisfies WahooJobPayload["operation"] },
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt: new Date().toISOString(),
    });

    return { jobId: queued.id, queued: queued.status === "queued" };
  }

  async processDueJobs(input: { limit?: number; workerId?: string }): Promise<{
    completed: number;
    failed: number;
    processed: number;
  }> {
    const now = new Date().toISOString();
    const jobs = await this.deps.providerSyncRepository.claimDueJobs({
      jobTypes: [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB],
      limit: input.limit ?? 10,
      lockExpiresAt: addMinutes(now, 5),
      now,
      provider: "wahoo",
      workerId: input.workerId ?? "wahoo-sync-worker",
    });

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      if (!isWahooJobPayload(job.payload)) {
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError: "Invalid Wahoo job payload",
          status: "dead_lettered",
        });
        failed += 1;
        continue;
      }

      try {
        if (job.jobType === WAHOO_PUBLISH_EVENT_JOB) {
          const result = await this.deps.syncService.syncEvent(job.payload.eventId, job.profileId);
          if (!result.success) {
            throw new Error(result.error ?? "Wahoo publish job failed");
          }
        } else if (job.jobType === WAHOO_UNSYNC_EVENT_JOB) {
          const result = await this.deps.syncService.unsyncEvent(job.payload.eventId, job.profileId);
          if (!result.success) {
            throw new Error(result.error ?? "Wahoo unsync job failed");
          }
        } else {
          throw new Error(`Unsupported Wahoo job type: ${job.jobType}`);
        }

        await this.deps.providerSyncRepository.markJobSucceeded(job.id);
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
