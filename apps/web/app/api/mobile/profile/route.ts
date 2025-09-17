import {
  getUserFromHeaders,
  handleApiError,
  successResponse,
  validateRequest,
} from "@/lib/api-utils";
import {
  createProfile,
  getProfileById,
  updateProfile,
} from "@/lib/drizzle/queries";
import { NextRequest } from "next/server";
import { z } from "zod";

const UpdateProfileSchema = z
  .object({
    username: z
      .string()
      .min(1)
      .max(50)
      .nullish()
      .transform((val) => val ?? null),
    gender: z.enum(["male", "female", "other"]).optional(),
    dob: z.string().optional(),
    weightKg: z.string().optional(),
    thresholdHr: z.number().min(100).max(250).optional(),
    ftp: z.number().min(50).max(500).optional(),
    preferredUnits: z.enum(["metric", "imperial"]).optional(),
    language: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(500).optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);

    console.log("Fetching profile for user:", user.id);

    const profile = await getProfileById(user.id);

    if (!profile) {
      // Create a minimal profile if one doesn't exist
      const newProfile = await createProfile({
        id: user.id,
        username: user.email.split("@")[0], // Use email prefix as default username
        preferredUnits: "metric",
      });

      console.log("Created new profile for user:", user.id);
      return successResponse(newProfile, 201);
    }

    return successResponse(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromHeaders(request);
    const updateData = await validateRequest(request, UpdateProfileSchema);

    console.log("Updating profile for user:", user.id, Object.keys(updateData));

    // Ensure profile exists
    let profile = await getProfileById(user.id);

    if (!profile) {
      // Create profile first if it doesn't exist
      profile = await createProfile({
        id: user.id,
        username: user.email.split("@")[0],
        preferredUnits: "metric",
        weightKg: updateData.weightKg
          ? updateData.weightKg.toString()
          : undefined,
        ...updateData,
      });

      console.log("Created and updated profile for user:", user.id);
      return successResponse(profile, 201);
    }

    // Update existing profile
    const updatedProfile = await updateProfile(user.id, {
      ...updateData,
      dob: updateData.dob,
      weightKg: updateData.weightKg
        ? updateData.weightKg.toString()
        : undefined,
    });

    console.log("Profile updated successfully for user:", user.id);

    return successResponse(updatedProfile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return handleApiError(error);
  }
}
