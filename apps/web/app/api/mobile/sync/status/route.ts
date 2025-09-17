import {
  getUserFromHeaders,
  handleApiError,
  successResponse,
} from "@/lib/api-utils";
import { db } from "@/lib/drizzle";
import { activities, activityResults } from "@repo/drizzle/schemas";
import { and, count, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);

    console.log("Fetching sync status for user:", user.id);

    // Get sync status counts
    const syncStatusCounts = await db
      .select({
        syncStatus: activities.syncStatus,
        count: count(),
      })
      .from(activities)
      .where(eq(activities.profileId, user.id))
      .groupBy(activities.syncStatus);

    // Get total activities count
    const [totalResult] = await db
      .select({ count: count() })
      .from(activities)
      .where(eq(activities.profileId, user.id));

    const totalActivities = totalResult?.count || 0;

    // Transform counts into a more usable format
    const statusMap = syncStatusCounts.reduce(
      (acc, item) => {
        acc[item.syncStatus] = item.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get activities that need syncing (failed or local_only) with activity results details
    const pendingActivities = await db
      .select({
        id: activities.id,
        syncStatus: activities.syncStatus,
        localStoragePath: activities.localStoragePath,
        createdAt: activities.createdAt,
        startedAt: activityResults.startedAt,
        totalTime: activityResults.totalTime,
        distance: activityResults.distance,
      })
      .from(activities)
      .leftJoin(activityResults, eq(activities.id, activityResults.activityId))
      .where(
        and(
          eq(activities.profileId, user.id),
          sql`${activities.syncStatus} IN ('local_only', 'sync_failed')`,
        ),
      )
      .orderBy(activities.createdAt)
      .limit(50); // Limit for performance

    // Calculate sync health metrics
    const syncedCount = statusMap.synced || 0;
    const localOnlyCount = statusMap.local_only || 0;
    const syncingCount = statusMap.syncing || 0;
    const failedCount = statusMap.sync_failed || 0;

    const syncHealth = {
      total: totalActivities,
      synced: syncedCount,
      pending: localOnlyCount,
      inProgress: syncingCount,
      failed: failedCount,
      syncPercentage:
        totalActivities > 0
          ? Math.round((syncedCount / totalActivities) * 100)
          : 100,
    };

    // Recommendations based on sync status
    const recommendations = [];

    if (failedCount > 0) {
      recommendations.push({
        type: "warning",
        message: `${failedCount} activities failed to sync. Consider retrying sync or checking network connection.`,
        action: "retry_failed",
      });
    }

    if (localOnlyCount > 10) {
      recommendations.push({
        type: "info",
        message: `${localOnlyCount} activities are stored locally only. Sync when you have a stable internet connection.`,
        action: "sync_all",
      });
    }

    if (syncedCount === totalActivities && totalActivities > 0) {
      recommendations.push({
        type: "success",
        message: "All activities are successfully synced to the cloud.",
        action: "none",
      });
    }

    const response = {
      syncHealth,
      pendingActivities: pendingActivities.map((activity) => ({
        id: activity.id,
        name: `Activity ${activity.id.slice(0, 8)}`,
        sport: "unknown", // Default since we don't have sport info in schema
        startedAt:
          activity.startedAt?.toISOString() || activity.createdAt.toISOString(),
        syncStatus: activity.syncStatus,
        syncError:
          activity.syncStatus === "sync_failed" ? "Sync failed" : undefined,
        hasLocalFile: !!activity.localStoragePath,
        duration: activity.totalTime || 0,
        distance: activity.distance ? Number(activity.distance) : 0,
      })),
      recommendations,
      lastChecked: new Date().toISOString(),
    };

    console.log(
      "Sync status retrieved successfully for user:",
      user.id,
      syncHealth,
    );

    return successResponse(response);
  } catch (error) {
    console.error("Error fetching sync status:", error);
    return handleApiError(error);
  }
}
