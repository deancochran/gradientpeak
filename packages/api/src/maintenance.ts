import type { DrizzleDbClient } from "@repo/db";
import { createEventReadRepository } from "./infrastructure/repositories";
import { drainQueuedActivityPlanRefreshesForProfile } from "./utils/activity-plan-refresh-queue";

export async function drainQueuedActivityPlanDerivedMetricsMaintenance(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    limit?: number;
    now?: Date;
  },
) {
  const result = await drainQueuedActivityPlanRefreshesForProfile(
    db,
    createEventReadRepository(db),
    {
      profileId: input.profileId,
      limit: input.limit,
      now: input.now,
    },
  );

  return {
    refreshedCount: result.refreshedCount,
    planIds: result.planIds,
  };
}
