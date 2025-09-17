import {
    getUserFromHeaders,
    handleApiError,
    NotFoundError,
    successResponse,
    UnauthorizedError,
} from "@/lib/api-utils";
import { getActivityById } from "@/lib/drizzle/queries";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log(
      "Fetching activity metadata for activity:",
      id,
      "for user:",
      user.id,
    );

    // First verify the activity exists and belongs to the user
    const activity = await getActivityById(id);

    if (!activity) {
      throw new NotFoundError("Activity not found");
    }

    if (activity.profileId !== user.id) {
      throw new UnauthorizedError("Not authorized to access this activity");
    }

    // Return comprehensive activity metadata
    const metadata = {
      id: activity.id,
      name: activity.name,
      sport: activity.sport,
      startedAt: activity.startedAt,
      completedAt: activity.completedAt,
      duration: activity.duration,
      distance: activity.distance,
      elevationGain: activity.elevationGain,
      calories: activity.calories,
      avgHeartRate: activity.avgHeartRate,
      maxHeartRate: activity.maxHeartRate,
      avgPower: activity.avgPower,
      maxPower: activity.maxPower,
      avgCadence: activity.avgCadence,
      tss: activity.tss,
      notes: activity.notes,
      syncStatus: activity.syncStatus,
      cloudStoragePath: activity.cloudStoragePath,
      localStoragePath: activity.localStoragePath,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
      // Derived metadata
      hasResults: !!activity.duration || !!activity.distance,
      hasHeartRate: !!activity.avgHeartRate || !!activity.maxHeartRate,
      hasPower: !!activity.avgPower || !!activity.maxPower,
      hasCadence: !!activity.avgCadence,
      hasElevation: !!activity.elevationGain,
      hasCalories: !!activity.calories,
      hasTSS: !!activity.tss,
      isCompleted: !!activity.completedAt,
      isSynced: activity.syncStatus === "synced",
      fileSize: activity.localStoragePath ? await getFileSize(activity.localStoragePath) : null,
    };

    return successResponse(metadata);
  } catch (error) {
    console.error("Error fetching activity metadata:", error);
    return handleApiError(error);
  }
}

// Helper function to get file size if local file exists
async function getFileSize(filePath: string): Promise<number | null> {
  try {
    // This would be implemented with the appropriate file system API
    // For now, return null as this is typically handled client-side
    return null;
  } catch (error) {
    console.warn("Failed to get file size:", error);
    return null;
  }
}
