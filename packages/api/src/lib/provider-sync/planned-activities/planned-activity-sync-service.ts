import { getProvidersWithCapability, type IntegrationProviderId } from "@repo/core";
import type { PlannedActivityProviderAdapter, PlannedActivityQueueResult } from "./types";

export class PlannedActivitySyncService {
  constructor(
    private readonly deps: {
      adapters: Partial<Record<IntegrationProviderId, PlannedActivityProviderAdapter>>;
    },
  ) {}

  async enqueue(input: {
    connectedProviders: readonly IntegrationProviderId[];
    eventIds: string[];
    operation: "publish" | "unsync";
    profileId: string;
    unsyncTargets?: ReadonlyMap<string, { externalId: string; resourceLinkId: string }>;
  }): Promise<PlannedActivityQueueResult | null> {
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
    let skippedCount = 0;
    const errors: string[] = [];

    for (const provider of providers) {
      const adapter = this.deps.adapters[provider];
      if (!adapter) continue;

      for (const eventId of eventIds) {
        try {
          const unsyncTarget = input.unsyncTargets?.get(eventId);
          const result =
            input.operation === "publish"
              ? await adapter.enqueuePublishEvent({ eventId, profileId: input.profileId })
              : await adapter.enqueueUnsyncEvent({
                  eventId,
                  profileId: input.profileId,
                  ...(unsyncTarget === undefined ? {} : { unsyncTarget }),
                });

          firstJobId ??= result.jobId;
          queued = queued || result.queued;
          if (result.skipped) skippedCount += 1;
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
      ...(skippedCount > 0 ? { skippedCount } : {}),
      success: failedCount === 0,
    };
  }
}
