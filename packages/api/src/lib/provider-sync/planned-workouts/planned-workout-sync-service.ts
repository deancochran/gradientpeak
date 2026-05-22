import { getProvidersWithCapability, type IntegrationProviderId } from "@repo/core";
import type { PlannedWorkoutProviderAdapter, PlannedWorkoutQueueResult } from "./types";

export class PlannedWorkoutSyncService {
  constructor(
    private readonly deps: {
      adapters: Partial<Record<IntegrationProviderId, PlannedWorkoutProviderAdapter>>;
    },
  ) {}

  async enqueue(input: {
    connectedProviders: readonly IntegrationProviderId[];
    eventIds: string[];
    operation: "publish" | "unsync";
    profileId: string;
  }): Promise<PlannedWorkoutQueueResult | null> {
    const eventIds = [...new Set(input.eventIds)];
    if (eventIds.length === 0) return null;

    const providers = getProvidersWithCapability(
      input.connectedProviders,
      "planned_activity_push",
    ).filter((provider) => Boolean(this.deps.adapters[provider]));

    if (providers.length === 0) return null;

    let firstJobId: string | null = null;
    let queued = false;
    let failedCount = 0;
    const errors: string[] = [];

    for (const provider of providers) {
      const adapter = this.deps.adapters[provider];
      if (!adapter) continue;

      for (const eventId of eventIds) {
        try {
          const result =
            input.operation === "publish"
              ? await adapter.enqueuePublishEvent({ eventId, profileId: input.profileId })
              : await adapter.enqueueUnsyncEvent({ eventId, profileId: input.profileId });

          firstJobId ??= result.jobId;
          queued = queued || result.queued;
        } catch (error) {
          failedCount += 1;
          errors.push(
            `${provider}:${eventId}: ${error instanceof Error ? error.message : "Unknown enqueue failure"}`,
          );
        }
      }
    }

    return {
      affectedCount: eventIds.length,
      ...(errors.length > 0 ? { error: errors.slice(0, 3).join("; "), failedCount } : {}),
      jobId: firstJobId,
      operation: input.operation,
      queued,
      success: failedCount === 0,
    };
  }
}
