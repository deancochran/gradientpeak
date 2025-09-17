import {
  getUserFromHeaders,
  handleApiError,
  NotFoundError,
  successResponse,
  UnauthorizedError,
  validateRequest,
} from "@/lib/api-utils";
import { getActivityById } from "@/lib/drizzle/queries";
import {
  createActivityStream as createActivityStreamDb,
  getActivityStream as getActivityStreamDb,
  getActivityStreams as getActivityStreamsDb,
} from "@/lib/drizzle/queries/activity-stream";
import { NextRequest } from "next/server";
import { z } from "zod";

const CreateActivityStreamSchema = z.object({
  type: z.string().min(1),
  data: z.array(z.number()),
  originalSize: z.number().positive().optional(),
  resolution: z.enum(["low", "medium", "high", "original"]).default("medium"),
  sampleRate: z.number().positive().optional(),
  dataType: z.enum(["int", "float", "boolean"]).default("float"),
  unit: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  avgValue: z.number().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = getUserFromHeaders(request);
    const { searchParams } = new URL(request.url);
    const streamType = searchParams.get("type");

    console.log(
      "Fetching activity streams for activity:",
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

    if (streamType) {
      // Fetch specific stream type
      const stream = await getActivityStreamDb(id, streamType);

      if (!stream) {
        throw new NotFoundError(
          `Stream type '${streamType}' not found for activity`,
        );
      }

      return successResponse(stream);
    } else {
      // Fetch all streams for the activity
      const streams = await getActivityStreamsDb(id);

      if (!streams || streams.length === 0) {
        throw new NotFoundError("No streams found for activity");
      }

      return successResponse(streams);
    }
  } catch (error) {
    console.error("Error fetching activity streams:", error);
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
    const streamData = await validateRequest(
      request,
      CreateActivityStreamSchema,
    );

    console.log(
      "Creating activity stream for activity:",
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

    // Create the activity stream
    const activityStream = await createActivityStreamDb({
      ...streamData,
      activityId: id,
    });

    console.log("Activity stream created successfully:", activityStream.id);

    return successResponse(activityStream, 201);
  } catch (error) {
    console.error("Error creating activity stream:", error);
    return handleApiError(error);
  }
}
