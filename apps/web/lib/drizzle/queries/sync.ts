import { db } from "@/lib/drizzle";
import {
  activities,
  activityResults,
  activityStreams,
  profiles,
} from "@repo/drizzle/schemas";
import { and, eq, gt } from "drizzle-orm";

export interface CompleteActivityData {
  activity: Omit<
    typeof activities.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >;
  result: Omit<
    typeof activityResults.$inferInsert,
    "id" | "idx" | "activityId" | "createdAt" | "updatedAt"
  >;
  streams: Array<
    Omit<
      typeof activityStreams.$inferInsert,
      "id" | "idx" | "activityId" | "createdAt" | "updatedAt"
    >
  >;
}

export interface SyncQueue {
  type: "create" | "update" | "delete";
  entityType: "activity" | "profile";
  entityId: string;
  data: any;
  timestamp: Date;
  retryCount: number;
}

export async function createCompleteActivity(data: CompleteActivityData) {
  return await db.transaction(async (tx) => {
    // Create activity
    const [activity] = await tx
      .insert(activities)
      .values(data.activity)
      .returning();

    // Create activity result
    const [result] = await tx
      .insert(activityResults)
      .values({ ...data.result, activityId: activity.id })
      .returning();

    // Create activity streams
    const streamData = data.streams.map((stream) => ({
      ...stream,
      activityId: activity.id,
    }));

    const streams = await tx
      .insert(activityStreams)
      .values(streamData)
      .returning();

    return {
      activity,
      result,
      streams,
    };
  });
}

export async function bulkSyncActivities(
  activitiesData: CompleteActivityData[],
) {
  return await db.transaction(async (tx) => {
    const results = [];

    for (const activityData of activitiesData) {
      const [activity] = await tx
        .insert(activities)
        .values(activityData.activity)
        .returning();

      const [result] = await tx
        .insert(activityResults)
        .values({ ...activityData.result, activityId: activity.id })
        .returning();

      const streamData = activityData.streams.map((stream) => ({
        ...stream,
        activityId: activity.id,
      }));

      const streams = await tx
        .insert(activityStreams)
        .values(streamData)
        .returning();

      results.push({ activity, result, streams });
    }

    return results;
  });
}

export async function updateProfileWithActivity(
  profileId: string,
  profileUpdates: Partial<typeof profiles.$inferInsert>,
  activityData: CompleteActivityData,
) {
  return await db.transaction(async (tx) => {
    // Update profile
    const [profile] = await tx
      .update(profiles)
      .set({ ...profileUpdates, updatedAt: new Date() })
      .where(eq(profiles.id, profileId))
      .returning();

    // Create complete activity
    const [activity] = await tx
      .insert(activities)
      .values(activityData.activity)
      .returning();

    const [result] = await tx
      .insert(activityResults)
      .values({ ...activityData.result, activityId: activity.id })
      .returning();

    const streamData = activityData.streams.map((stream) => ({
      ...stream,
      activityId: activity.id,
    }));

    const streams = await tx
      .insert(activityStreams)
      .values(streamData)
      .returning();

    return {
      profile,
      activity,
      result,
      streams,
    };
  });
}

export async function getDeltaSync(profileId: string, lastSyncTime: Date) {
  // Get activities updated after last sync
  const updatedActivities = await db
    .select()
    .from(activities)
    .innerJoin(activityResults, eq(activities.id, activityResults.activityId))
    .where(
      and(
        eq(activities.profileId, profileId),
        gt(activities.updatedAt, lastSyncTime),
      ),
    );

  // Get profile updates
  const [profile] = await db
    .select()
    .from(profiles)
    .where(
      and(eq(profiles.id, profileId), gt(profiles.updatedAt, lastSyncTime)),
    );

  return {
    activities: updatedActivities,
    profile: profile || null,
  };
}

export async function resolveConflict(
  entityType: "activity" | "profile",
  entityId: string,
  localData: any,
  serverData: any,
) {
  // Simple conflict resolution: server wins for now
  // In a real implementation, you'd want more sophisticated rules

  if (entityType === "activity") {
    // Update local activity with server data
    const [resolvedActivity] = await db
      .update(activities)
      .set({
        ...serverData,
        syncStatus: "synced",
        updatedAt: new Date(),
      })
      .where(eq(activities.id, entityId))
      .returning();

    return resolvedActivity;
  }

  if (entityType === "profile") {
    const [resolvedProfile] = await db
      .update(profiles)
      .set({
        ...serverData,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, entityId))
      .returning();

    return resolvedProfile;
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

export async function markSyncFailed(activityId: string, errorMessage: string) {
  await db
    .update(activities)
    .set({
      syncStatus: "sync_failed",
      updatedAt: new Date(),
    })
    .where(eq(activities.id, activityId));
}

export async function resetFailedSyncs(profileId: string) {
  await db
    .update(activities)
    .set({
      syncStatus: "local_only",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(activities.profileId, profileId),
        eq(activities.syncStatus, "sync_failed"),
      ),
    );
}

export async function getSyncStats(profileId: string) {
  const totalActivities = await db
    .select()
    .from(activities)
    .where(eq(activities.profileId, profileId));

  const pendingActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profileId, profileId),
        eq(activities.syncStatus, "local_only"),
      ),
    );

  const failedActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profileId, profileId),
        eq(activities.syncStatus, "sync_failed"),
      ),
    );

  return {
    totalActivities: totalActivities.length,
    pendingActivities: pendingActivities.length,
    failedActivities: failedActivities.length,
    syncedActivities:
      totalActivities.length -
      pendingActivities.length -
      failedActivities.length,
  };
}

export async function queueSyncOperation(operation: SyncQueue) {
  // This would typically store sync operations in a queue table
  // For now, we'll just log the operation
  console.log("Queued sync operation:", operation);

  // In a real implementation, you'd insert into a sync_queue table
  return true;
}

export async function processSyncQueue(profileId: string) {
  // This would process queued sync operations
  // For now, we'll just return empty results
  console.log("Processing sync queue for profile:", profileId);

  return {
    processed: 0,
    failed: 0,
    remaining: 0,
  };
}
