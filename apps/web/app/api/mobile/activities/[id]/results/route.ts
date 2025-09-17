import {
  getUserFromHeaders,
  handleApiError,
  NotFoundError,
  successResponse,
  UnauthorizedError,
  validateRequest,
} from "@/lib/api-utils";
import { getActivityById, getActivityResult } from "@/lib/drizzle/queries";
import { createActivityResult as createActivityResultDb } from "@/lib/drizzle/queries/activity-result";
import { NextRequest } from "next/server";
import { z } from "zod";

const CreateActivityResultSchema = z.object({
  activityId: z.string().uuid(),
  startedAt: z.string().datetime(),
  movingTime: z.number().positive().optional(),
  elapsedTime: z.number().positive().optional(),
  distance: z.number().nonnegative().optional(),
  elevationGain: z.number().nonnegative().optional(),
  elevationLoss: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  avgHeartRate: z.number().positive().optional(),
  maxHeartRate: z.number().positive().optional(),
  avgPower: z.number().nonnegative().optional(),
  maxPower: z.number().nonnegative().optional(),
  normalizedPower: z.number().nonnegative().optional(),
  avgCadence: z.number().nonnegative().optional(),
  maxCadence: z.number().nonnegative().optional(),
  avgSpeed: z.number().nonnegative().optional(),
  maxSpeed: z.number().nonnegative().optional(),
  tss: z.number().nonnegative().optional(),
  if: z.number().nonnegative().optional(),
  vi: z.number().nonnegative().optional(),
  peakPower: z.number().nonnegative().optional(),
  peakHeartRate: z.number().positive().optional(),
  peakCadence: z.number().nonnegative().optional(),
  peakSpeed: z.number().nonnegative().optional(),
  trainingStressBalance: z.number().optional(),
  efficiencyFactor: z.number().nonnegative().optional(),
  work: z.number().nonnegative().optional(),
  powerStressScore: z.number().nonnegative().optional(),
  heartRateStressScore: z.number().nonnegative().optional(),
  aerobicDecoupling: z.number().optional(),
  variabilityIndex: z.number().nonnegative().optional(),
  intensityFactor: z.number().nonnegative().optional(),
  normalizedGradedPace: z.number().nonnegative().optional(),
  gradeAdjustedPace: z.number().nonnegative().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);

    console.log(
      "Fetching activity results for activity:",
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

    // Get the activity result
    const activityResult = await getActivityResult(id);

    if (!activityResult) {
      throw new NotFoundError("Activity results not found");
    }

    return successResponse(activityResult);
  } catch (error) {
    console.error("Error fetching activity results:", error);
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);
    const resultData = await validateRequest(
      request,
      CreateActivityResultSchema,
    );

    console.log(
      "Creating activity results for activity:",
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
      throw new UnauthorizedError("Not authorized to update this activity");
    }

    // Create the activity result
    const activityResult = await createActivityResultDb({
      ...resultData,
      activityId: id,
    });

    console.log("Activity results created successfully:", activityResult.id);

    return successResponse(activityResult, 201);
  } catch (error) {
    console.error("Error creating activity results:", error);
    return handleApiError(error);
  }
}
