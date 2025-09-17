import {
    getUserFromHeaders,
    handleApiError,
    NotFoundError,
    successResponse,
    UnauthorizedError,
    validateRequest
} from "@/lib/api-utils";
import {
    deletePlannedActivity,
    getPlannedActivityById,
    markPlannedActivityCompleted,
    markPlannedActivitySkipped,
    updatePlannedActivity
} from "@/lib/drizzle/queries";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdatePlannedActivitySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  scheduledDate: z.string().datetime().optional(),
  estimatedDuration: z.number().positive().optional(),
  estimatedDistance: z.number().nonnegative().optional(),
  estimatedTSS: z.number().nonnegative().optional(),
  structure: z.any().optional(),
  completionStatus: z.enum(["pending", "completed", "skipped"]).optional(),
  completedActivityId: z.string().uuid().optional()
}).partial();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log("Fetching planned activity:", id, "for user:", user.id);

    const activity = await getPlannedActivityById(id);

    if (!activity) {
      throw new NotFoundError("Planned activity not found");
    }

    if (activity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to access this planned activity");
    }

    return successResponse(activity);
  } catch (error) {
    console.error("Error fetching planned activity:", error);
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);
    const updateData = await validateRequest(request, UpdatePlannedActivitySchema);

    console.log("Updating planned activity:", id, "for user:", user.id);

    // First verify the activity exists and belongs to the user
    const existingActivity = await getPlannedActivityById(id);

    if (!existingActivity) {
      throw new NotFoundError("Planned activity not found");
    }

    if (existingActivity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to update this planned activity");
    }

    // Handle completion status changes
    if (updateData.completionStatus === "completed") {
      const completedActivity = await markPlannedActivityCompleted(
        id,
        updateData.completedActivityId
      );
      return successResponse(completedActivity);
    }

    if (updateData.completionStatus === "skipped") {
      const skippedActivity = await markPlannedActivitySkipped(id);
      return successResponse(skippedActivity);
    }

    // Regular update
    const updatedActivity = await updatePlannedActivity(id, {
      ...updateData,
      ...(updateData.scheduledDate && { scheduledDate: new Date(updateData.scheduledDate) })
    });

    console.log("Planned activity updated successfully:", updatedActivity?.id);

    return successResponse(updatedActivity);
  } catch (error) {
    console.error("Error updating planned activity:", error);
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log("Deleting planned activity:", id, "for user:", user.id);

    // First verify the activity exists and belongs to the user
    const existingActivity = await getPlannedActivityById(id);

    if (!existingActivity) {
      throw new NotFoundError("Planned activity not found");
    }

    if (existingActivity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to delete this planned activity");
    }

    const deletedActivity = await deletePlannedActivity(id);

    console.log("Planned activity deleted successfully:", deletedActivity?.id);

    return successResponse({ success: true, id });
  } catch (error) {
    console.error("Error deleting planned activity:", error);
    return handleApiError(error);
  }
}
