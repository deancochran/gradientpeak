import {
  type ActivityPlanRefreshQueueInsert,
  activityPlanRefreshQueue,
  activityPlans,
  type DrizzleDbClient,
} from "@repo/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  type ActivityPlanWithDerivedMetrics,
  getActivityPlansDerivedMetrics,
} from "./activity-plan-derived-metrics";
import type { EstimationReadStore } from "./estimation-helpers";

function buildQueueRows(
  profileId: string,
  planIds: string[],
  now: Date,
): ActivityPlanRefreshQueueInsert[] {
  return planIds.map((activityPlanId) => ({
    profile_id: profileId,
    activity_plan_id: activityPlanId,
    queued_at: now,
    updated_at: now,
  }));
}

export async function enqueueActivityPlanRefreshes(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    planIds: string[];
    now?: Date;
  },
) {
  const uniquePlanIds = [...new Set(input.planIds)].filter((planId) => planId.length > 0);
  if (uniquePlanIds.length === 0) return { queuedCount: 0, planIds: [] as string[] };

  const now = input.now ?? new Date();

  await db
    .insert(activityPlanRefreshQueue)
    .values(buildQueueRows(input.profileId, uniquePlanIds, now))
    .onConflictDoUpdate({
      target: [activityPlanRefreshQueue.profile_id, activityPlanRefreshQueue.activity_plan_id],
      set: {
        queued_at: now,
        updated_at: now,
      },
    });

  return { queuedCount: uniquePlanIds.length, planIds: uniquePlanIds };
}

export async function enqueueActivityPlanRefreshesForProfile(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    now?: Date;
  },
) {
  const rows = await db
    .select({ id: activityPlans.id })
    .from(activityPlans)
    .where(eq(activityPlans.profile_id, input.profileId));

  return enqueueActivityPlanRefreshes(db, {
    profileId: input.profileId,
    planIds: rows.map((row) => row.id),
    now: input.now,
  });
}

export async function enqueueActivityPlanRefreshesForRoute(
  db: DrizzleDbClient,
  input: {
    routeId: string;
    now?: Date;
  },
) {
  const rows = await db
    .select({ id: activityPlans.id, profile_id: activityPlans.profile_id })
    .from(activityPlans)
    .where(eq(activityPlans.route_id, input.routeId));

  const byProfile = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.profile_id) continue;
    byProfile.set(row.profile_id, [...(byProfile.get(row.profile_id) ?? []), row.id]);
  }

  const queued = await Promise.all(
    [...byProfile.entries()].map(([profileId, planIds]) =>
      enqueueActivityPlanRefreshes(db, { profileId, planIds, now: input.now }),
    ),
  );

  return {
    queuedCount: queued.reduce((sum, item) => sum + item.queuedCount, 0),
    profileIds: [...byProfile.keys()],
  };
}

export async function listQueuedActivityPlansForProfile(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    limit?: number;
  },
) {
  const rows = await db
    .select({ plan: activityPlans, queue: activityPlanRefreshQueue })
    .from(activityPlanRefreshQueue)
    .innerJoin(activityPlans, eq(activityPlans.id, activityPlanRefreshQueue.activity_plan_id))
    .where(eq(activityPlanRefreshQueue.profile_id, input.profileId))
    .orderBy(asc(activityPlanRefreshQueue.queued_at))
    .limit(input.limit ?? 50);

  return rows;
}

export async function drainQueuedActivityPlanRefreshesForProfile(
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  input: {
    profileId: string;
    limit?: number;
    now?: Date;
  },
): Promise<{
  refreshedCount: number;
  planIds: string[];
  results: ActivityPlanWithDerivedMetrics<any>[];
}> {
  const queued = await listQueuedActivityPlansForProfile(db, input);
  if (queued.length === 0) {
    return { refreshedCount: 0, planIds: [], results: [] };
  }

  const plans = queued.map((row) => row.plan);
  const planIds = plans.map((plan) => plan.id);
  const results = await getActivityPlansDerivedMetrics(
    plans,
    db,
    estimationStore,
    input.profileId,
    {
      forceRefreshPlanIds: planIds,
      now: input.now,
    },
  );

  await db
    .delete(activityPlanRefreshQueue)
    .where(
      and(
        eq(activityPlanRefreshQueue.profile_id, input.profileId),
        inArray(activityPlanRefreshQueue.activity_plan_id, planIds),
      ),
    );

  return {
    refreshedCount: planIds.length,
    planIds,
    results,
  };
}

export async function touchQueuedActivityPlanRefresh(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    planId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  await db
    .insert(activityPlanRefreshQueue)
    .values({
      profile_id: input.profileId,
      activity_plan_id: input.planId,
      queued_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [activityPlanRefreshQueue.profile_id, activityPlanRefreshQueue.activity_plan_id],
      set: {
        queued_at: now,
        updated_at: now,
      },
    });
}
