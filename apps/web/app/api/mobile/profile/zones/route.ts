import {
  getUserFromHeaders,
  handleApiError,
  successResponse,
  validateRequest,
} from "@/lib/api-utils";
import { getProfileById, updateProfile } from "@/lib/drizzle/queries";
import { calculateHrZones, calculatePowerZones } from "@repo/core";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateZonesSchema = z.object({
  maxHeartRate: z.number().min(100).max(250).optional(),
  restingHeartRate: z.number().min(30).max(120).optional(),
  ftpWatts: z.number().min(50).max(500).optional(),
  zoneCalculationMethod: z
    .enum(["percentage", "lactate_threshold", "custom"])
    .optional(),
  customHeartRateZones: z
    .array(
      z.object({
        zone: z.number().min(1).max(7),
        name: z.string(),
        minBpm: z.number(),
        maxBpm: z.number(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  customPowerZones: z
    .array(
      z.object({
        zone: z.number().min(1).max(7),
        name: z.string(),
        minWatts: z.number(),
        maxWatts: z.number(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

const RecalculateZonesSchema = z.object({
  type: z.enum(["heart_rate", "power", "both"]),
  maxHeartRate: z.number().min(100).max(250).optional(),
  restingHeartRate: z.number().min(30).max(120).optional(),
  ftpWatts: z.number().min(50).max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);

    console.log("Fetching training zones for user:", user.id);

    const profile = await getProfileById(user.id);

    if (!profile) {
      return successResponse({
        heartRateZones: null,
        powerZones: null,
        message: "Profile not found. Create profile first.",
      });
    }

    // Calculate zones based on current profile data
    let heartRateZones = null;
    let powerZones = null;

    if (profile.maxHeartRate && profile.restingHeartRate) {
      heartRateZones = calculateHrZones(
        profile.maxHeartRate,
        profile.restingHeartRate,
      );
    }

    if (profile.ftpWatts) {
      powerZones = calculatePowerZones(profile.ftpWatts);
    }

    return successResponse({
      heartRateZones,
      powerZones,
      profile: {
        maxHeartRate: profile.maxHeartRate,
        restingHeartRate: profile.restingHeartRate,
        ftpWatts: profile.ftpWatts,
        trainingZonePreference: profile.trainingZonePreference,
      },
    });
  } catch (error) {
    console.error("Error fetching training zones:", error);
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const updateData = await validateRequest(request, UpdateZonesSchema);

    console.log("Updating training zones for user:", user.id);

    // Update profile with new zone data
    const updatedProfile = await updateProfile(user.id, updateData);

    // Recalculate zones based on updated data
    let heartRateZones = null;
    let powerZones = null;

    if (updatedProfile.maxHeartRate && updatedProfile.restingHeartRate) {
      heartRateZones = calculateHrZones(
        updatedProfile.maxHeartRate,
        updatedProfile.restingHeartRate,
      );
    }

    if (updatedProfile.ftpWatts) {
      powerZones = calculatePowerZones(updatedProfile.ftpWatts);
    }

    console.log("Training zones updated successfully for user:", user.id);

    return successResponse({
      profile: updatedProfile,
      heartRateZones,
      powerZones,
    });
  } catch (error) {
    console.error("Error updating training zones:", error);
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const { type, maxHeartRate, restingHeartRate, ftpWatts } =
      await validateRequest(request, RecalculateZonesSchema);

    console.log(
      "Recalculating training zones for user:",
      user.id,
      "type:",
      type,
    );

    const profile = await getProfileById(user.id);

    if (!profile) {
      return handleApiError(new Error("Profile not found"));
    }

    // Use provided values or fall back to profile values
    const hrMax = maxHeartRate || profile.maxHeartRate;
    const hrRest = restingHeartRate || profile.restingHeartRate;
    const ftp = ftpWatts || profile.ftpWatts;

    let heartRateZones = null;
    let powerZones = null;

    if ((type === "heart_rate" || type === "both") && hrMax && hrRest) {
      heartRateZones = calculateHrZones(hrMax, hrRest);

      // Update profile with new HR values if provided
      if (maxHeartRate || restingHeartRate) {
        await updateProfile(user.id, {
          maxHeartRate: maxHeartRate || profile.maxHeartRate,
          restingHeartRate: restingHeartRate || profile.restingHeartRate,
        });
      }
    }

    if ((type === "power" || type === "both") && ftp) {
      powerZones = calculatePowerZones(ftp);

      // Update profile with new FTP if provided
      if (ftpWatts) {
        await updateProfile(user.id, {
          ftpWatts,
        });
      }
    }

    console.log("Training zones recalculated successfully for user:", user.id);

    return successResponse({
      heartRateZones,
      powerZones,
      message: "Training zones recalculated successfully",
    });
  } catch (error) {
    console.error("Error recalculating training zones:", error);
    return handleApiError(error);
  }
}
