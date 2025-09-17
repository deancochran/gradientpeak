import {
    getUserFromHeaders,
    handleApiError,
    successResponse,
    validateRequest
} from "@/lib/api-utils";
import {
    createPlannedActivity,
    getPlannedActivitiesByProfile,
    getUpcomingPlannedActivities
} from "@/lib/drizzle/queries";
import { NextRequest } from "next/server";
import { z } from "zod";

const CreatePlannedActivitySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  activityType: z.enum(["bike", "run", "swim", "strength", "other"]),
  scheduledDate: z.string().datetime(),
  estimatedDuration: z.number().positive().optional(),
  estimatedDistance: z.number().nonnegative().optional(),
  estimatedTSS: z.number().nonnegative().optional(),
  structure: z.any().optional(),
  requiresFtp: z.boolean().default(false),
  requiresThresholdHr: z.boolean().default(false)
});

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get("upcoming");
    const days = searchParams.get("days") ? parseInt(searchParams.get("days")!) : 7;

    console.log("Fetching planned activities for user:", user.id, { upcoming, days });

    let activities;

    if (upcoming === "true") {
      activities = await getUpcomingPlannedActivities(user.id, days);
    } else {
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;
      const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;
      activities = await getPlannedActivitiesByProfile(user.id, limit, offset);
    }

    return successResponse({
      activities,
      pagination: {
        limit: activities.length,
        offset: 0,
        total: activities.length
      }
    });
  } catch (error) {
    console.error("Error fetching planned activities:", error);
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const activityData = await validateRequest(request, CreatePlannedActivitySchema);

    console.log("Creating planned activity for user:", user.id, activityData.name);

    // Add user ID to activity data
    const activityWithUser = {
      ...activityData,
      profileId: user.id,
      scheduledDate: new Date(activityData.scheduledDate),
      structure: activityData.structure || {
        version: "1.0",
        steps: []
      }
    };

    const activity = await createPlannedActivity(activityWithUser);

    console.log("Planned activity created successfully:", activity.id);

    return successResponse(activity, 201);
  } catch (error) {
    console.error("Error creating planned activity:", error);
    return handleApiError(error);
  }
}
