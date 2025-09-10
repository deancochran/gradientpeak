import { db } from "@/lib/drizzle";
import { activities, activityResults } from "@repo/drizzle/schemas";
import { and, desc, eq, gte, lte } from "drizzle-orm";

export async function createActivity(
  activityData: Omit<
    typeof activities.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [activity] = await db
    .insert(activities)
    .values(activityData)
    .returning();
  return activity;
}

export async function getActivityById(activityId: string) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId));
  return activity;
}

export async function getActivitiesByProfile(
  profileId: string,
  limit = 50,
  offset = 0,
) {
  return await db
    .select()
    .from(activities)
    .where(eq(activities.profileId, profileId))
    .orderBy(desc(activities.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getActivitiesInDateRange(
  profileId: string,
  startDate: Date,
  endDate: Date,
) {
  return await db
    .select()
    .from(activities)
    .innerJoin(activityResults, eq(activities.id, activityResults.activityId))
    .where(
      and(
        eq(activities.profileId, profileId),
        gte(activityResults.startedAt, startDate),
        lte(activityResults.startedAt, endDate),
      ),
    )
    .orderBy(desc(activityResults.startedAt));
}

export async function updateActivitySync(
  activityId: string,
  syncStatus: "syncing" | "synced" | "sync_failed",
  cloudPath?: string,
) {
  const updateData: any = {
    syncStatus,
    updatedAt: new Date(),
  };

  if (cloudPath) {
    updateData.cloudStoragePath = cloudPath;
  }

  const [updatedActivity] = await db
    .update(activities)
    .set(updateData)
    .where(eq(activities.id, activityId))
    .returning();
  return updatedActivity;
}

export async function getPendingSyncActivities(profileId: string) {
  return await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profileId, profileId),
        eq(activities.syncStatus, "local_only"),
      ),
    );
}

export async function deleteActivity(activityId: string) {
  const [deletedActivity] = await db
    .delete(activities)
    .where(eq(activities.id, activityId))
    .returning();
  return deletedActivity;
}

export async function getActivityCount(profileId: string) {
  const result = await db
    .select({ count: activities.id })
    .from(activities)
    .where(eq(activities.profileId, profileId));
  return result.length;
}

export async function getActivitiesWithResults(profileId: string, limit = 10) {
  return await db
    .select()
    .from(activities)
    .innerJoin(activityResults, eq(activities.id, activityResults.activityId))
    .where(eq(activities.profileId, profileId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export async function updateActivityLocalPath(
  activityId: string,
  localPath: string,
) {
  const [updatedActivity] = await db
    .update(activities)
    .set({
      localStoragePath: localPath,
      updatedAt: new Date(),
    })
    .where(eq(activities.id, activityId))
    .returning();
  return updatedActivity;
}

export async function getFailedSyncActivities(profileId: string) {
  return await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profileId, profileId),
        eq(activities.syncStatus, "sync_failed"),
      ),
    );
}
