import {
  getUserFromHeaders,
  handleApiError,
  successResponse,
  validateRequest,
} from "@/lib/api-utils";
import {
  createActivity,
  getActivityById,
  updateActivitySync,
} from "@/lib/drizzle/queries";
import { NextRequest } from "next/server";
import { z } from "zod";

const SyncActivitySchema = z.object({
  activityId: z.string().uuid(),
  startedAt: z.string().datetime(),
  liveMetrics: z.object({
    name: z.string().min(1).max(255),
    sport: z.string().min(1),
    duration: z.number().positive(),
    distance: z.number().nonnegative().optional(),
    elevationGain: z.number().nonnegative().optional(),
    calories: z.number().nonnegative().optional(),
    avgHeartRate: z.number().positive().optional(),
    maxHeartRate: z.number().positive().optional(),
    avgPower: z.number().nonnegative().optional(),
    maxPower: z.number().nonnegative().optional(),
    avgCadence: z.number().nonnegative().optional(),
    tss: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  }),
  filePath: z.string().optional(), // Supabase Storage path
});

const BulkSyncSchema = z.object({
  activities: z.array(SyncActivitySchema).min(1).max(50), // Limit bulk operations
});

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const { searchParams } = new URL(request.url);
    const isBulk = searchParams.get("bulk") === "true";

    if (isBulk) {
      return await handleBulkSync(request, user);
    } else {
      return await handleSingleSync(request, user);
    }
  } catch (error) {
    console.error("Error in activity sync:", error);
    return handleApiError(error);
  }
}

async function handleSingleSync(
  request: NextRequest,
  user: { id: string; email: string },
) {
  const { activityId, startedAt, liveMetrics, filePath } =
    await validateRequest(request, SyncActivitySchema);

  console.log("Syncing single activity:", activityId, "for user:", user.id);

  try {
    // Check if activity already exists
    const existingActivity = await getActivityById(activityId);

    if (existingActivity) {
      // Update existing activity
      const updatedActivity = await updateActivitySync(
        activityId,
        "synced",
        filePath,
      );

      console.log("Activity updated successfully:", updatedActivity?.id);

      return successResponse({
        success: true,
        activityId,
        action: "updated",
        activity: updatedActivity,
      });
    } else {
      // Create new activity
      const activityData = {
        id: activityId,
        profileId: user.id,
        startedAt: new Date(startedAt),
        completedAt:
          new Date(startedAt).getTime() + liveMetrics.duration * 1000, // Calculate end time
        syncStatus: "synced" as const,
        cloudStoragePath: filePath,
        ...liveMetrics,
      };

      const activity = await createActivity(activityData);

      console.log("Activity created successfully:", activity.id);

      return successResponse(
        {
          success: true,
          activityId,
          action: "created",
          activity,
        },
        201,
      );
    }
  } catch (error) {
    console.error("Error processing activity sync:", error);

    // Update sync status to failed if activity exists
    try {
      await updateActivitySync(activityId, "sync_failed");
    } catch (updateError) {
      console.error("Failed to update sync status:", updateError);
    }

    throw error;
  }
}

async function handleBulkSync(
  request: NextRequest,
  user: { id: string; email: string },
) {
  const { activities } = await validateRequest(request, BulkSyncSchema);

  console.log(
    "Syncing bulk activities:",
    activities.length,
    "for user:",
    user.id,
  );

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const activityData of activities) {
    try {
      const { activityId, startedAt, liveMetrics, filePath } = activityData;

      // Check if activity already exists
      const existingActivity = await getActivityById(activityId);

      if (existingActivity) {
        const updatedActivity = await updateActivitySync(
          activityId,
          "synced",
          filePath,
        );

        results.push({
          activityId,
          success: true,
          action: "updated",
          activity: updatedActivity,
        });
      } else {
        const newActivityData = {
          id: activityId,
          profileId: user.id,
          startedAt: new Date(startedAt),
          completedAt: new Date(
            new Date(startedAt).getTime() + liveMetrics.duration * 1000,
          ),
          syncStatus: "synced" as const,
          cloudStoragePath: filePath,
          ...liveMetrics,
        };

        const activity = await createActivity(newActivityData);

        results.push({
          activityId,
          success: true,
          action: "created",
          activity,
        });
      }

      successCount++;
    } catch (error) {
      console.error("Error syncing activity:", activityData.activityId, error);

      results.push({
        activityId: activityData.activityId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      errorCount++;
    }
  }

  console.log("Bulk sync completed:", { successCount, errorCount });

  return successResponse({
    success: true,
    totalActivities: activities.length,
    successCount,
    errorCount,
    results,
  });
}
