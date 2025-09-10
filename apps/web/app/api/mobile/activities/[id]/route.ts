import {
  getUserFromHeaders,
  handleApiError,
  NotFoundError,
  successResponse,
  UnauthorizedError,
  validateRequest,
} from "@/lib/api-utils";
import { db } from "@/lib/drizzle";
import { deleteActivity, getActivityById } from "@/lib/drizzle/queries";
import { activities } from "@repo/drizzle/schemas";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateActivitySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    sport: z.string().min(1).optional(),
    duration: z.number().positive().optional(),
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
    syncStatus: z
      .enum(["local_only", "syncing", "synced", "sync_failed"])
      .optional(),
    cloudStoragePath: z.string().optional(),
  })
  .partial();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log("Fetching activity:", id, "for user:", user.id);

    const activity = await getActivityById(id);

    if (!activity) {
      throw new NotFoundError("Activity not found");
    }

    if (activity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to access this activity");
    }

    return successResponse(activity);
  } catch (error) {
    console.error("Error fetching activity:", error);
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);
    const updateData = await validateRequest(request, UpdateActivitySchema);

    console.log("Updating activity:", id, "for user:", user.id);

    // First verify the activity exists and belongs to the user
    const existingActivity = await getActivityById(id);

    if (!existingActivity) {
      throw new NotFoundError("Activity not found");
    }

    if (existingActivity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to update this activity");
    }

    // Update the activity
    const [updatedActivity] = await db
      .update(activities)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(activities.id, id), eq(activities.profileId, user.id)))
      .returning();

    console.log("Activity updated successfully:", updatedActivity.id);

    return successResponse(updatedActivity);
  } catch (error) {
    console.error("Error updating activity:", error);
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log("Deleting activity:", id, "for user:", user.id);

    // First verify the activity exists and belongs to the user
    const existingActivity = await getActivityById(id);

    if (!existingActivity) {
      throw new NotFoundError("Activity not found");
    }

    if (existingActivity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to delete this activity");
    }

    const deletedActivity = await deleteActivity(id);

    console.log("Activity deleted successfully:", deletedActivity?.id);

    return successResponse({ success: true, id });
  } catch (error) {
    console.error("Error deleting activity:", error);
    return handleApiError(error);
  }
}
