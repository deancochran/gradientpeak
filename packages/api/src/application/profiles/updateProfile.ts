import type { getRequiredDb } from "../../db";
import {
  type ProfileFields,
  syncAppendOnlyProfileMetric,
  updateOwnedProfileFields,
} from "../../repositories/profile-update-repository";

type DbClient = ReturnType<typeof getRequiredDb>;

export interface UpdateProfileInput extends ProfileFields {
  profileId: string;
  weight_kg?: number | null;
  ftp?: number | null;
  threshold_hr?: number | null;
}

export class ProfileUpdateNotFoundError extends Error {
  constructor() {
    super("Profile not found");
    this.name = "ProfileUpdateNotFoundError";
  }
}

export class ProfileUsernameConflictError extends Error {
  constructor() {
    super("That username is already taken");
    this.name = "ProfileUsernameConflictError";
  }
}

function isUsernameConflict(error: unknown): boolean {
  let candidate = error;
  const visited = new Set<unknown>();

  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const record = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (record.code === "23505" && record.constraint === "profiles_username_unique_idx")
      return true;
    candidate = record.cause;
  }

  return false;
}

/** Atomically updates owned profile fields and their synchronized manual metrics. */
export async function updateProfile(db: DbClient, input: UpdateProfileInput): Promise<void> {
  const { profileId, weight_kg, ftp, threshold_hr, ...fields } = input;
  if (ftp !== undefined || threshold_hr !== undefined) {
    throw new Error("Training thresholds are calculated from trusted activity evidence.");
  }

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const updated = await updateOwnedProfileFields(tx, { profileId, fields, now });
      if (!updated) throw new ProfileUpdateNotFoundError();

      await syncAppendOnlyProfileMetric(tx, {
        profileId,
        metricType: "weight_kg",
        value: weight_kg,
        now,
      });
    });
  } catch (error) {
    if (error instanceof ProfileUpdateNotFoundError) throw error;
    if (isUsernameConflict(error)) throw new ProfileUsernameConflictError();
    throw error;
  }
}
