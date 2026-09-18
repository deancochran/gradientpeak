import { providerHasCapability } from "@repo/core";
import type { WahooPlannedActivityAdapter, WahooPlannedActivityQueueResult } from "./wahoo-types";

/** Sole operational planned-activity queue admission service. */
export class WahooPlannedActivitySyncService {
  constructor(private readonly adapter: WahooPlannedActivityAdapter) {}

  async enqueue(input: {
    connectedProviders: readonly string[];
    plannedSessionIds: string[];
    operation: "publish" | "unsync";
    profileId: string;
    unsyncTargets?: ReadonlyMap<string, { externalId: string; resourceLinkId: string }>;
  }): Promise<WahooPlannedActivityQueueResult | null> {
    const plannedSessionIds = [...new Set(input.plannedSessionIds)];
    if (
      plannedSessionIds.length === 0 ||
      !input.connectedProviders.includes("wahoo") ||
      !providerHasCapability("wahoo", "planned_activity_push")
    )
      return null;

    let firstJobId: string | null = null;
    let queued = false;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    for (const plannedSessionId of plannedSessionIds) {
      try {
        const unsyncTarget = input.unsyncTargets?.get(plannedSessionId);
        const result =
          input.operation === "publish"
            ? await this.adapter.enqueuePublishPlannedSession({
                plannedSessionId,
                profileId: input.profileId,
              })
            : await this.adapter.enqueueUnsyncPlannedSession({
                plannedSessionId,
                profileId: input.profileId,
                ...(unsyncTarget === undefined ? {} : { unsyncTarget }),
              });
        firstJobId ??= result.jobId;
        queued = queued || result.queued;
        if (result.skipped) skippedCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push(
          `${plannedSessionId}: ${error instanceof Error ? error.message : "Unknown enqueue failure"}`,
        );
      }
    }
    return {
      affectedCount: plannedSessionIds.length,
      ...(errors.length > 0 ? { error: errors.slice(0, 3).join("; "), failedCount } : {}),
      jobId: firstJobId,
      operation: input.operation,
      queued,
      ...(skippedCount > 0 ? { skippedCount } : {}),
      success: failedCount === 0,
    };
  }
}
