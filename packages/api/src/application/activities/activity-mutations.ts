import { type ContentVisibility, legacyPrivateFlagToContentVisibility } from "@repo/core";
import { activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityArtifactRetentionService } from "../activity-file-ingestion/artifact-retention";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import { updateCanonicalActivityFields } from "./submit-activity";

type ActivitiesDb = ReturnType<typeof getRequiredDb>;

export type UpdateActivityForProfileInput = {
  id: string;
  name?: string;
  notes?: string | null;
  is_private?: boolean;
  content_visibility?: ContentVisibility;
};

export async function updateActivityForProfile({
  db,
  input,
  profileId,
}: {
  db: ActivitiesDb;
  input: UpdateActivityForProfileInput;
  profileId: string;
}) {
  // Defend the application boundary as well as the strict transport schema: legacy callers
  // cannot restore parent normalized power as a writable authority by bypassing TypeScript.
  const {
    id,
    normalized_power: _normalizedPower,
    ...updates
  } = input as UpdateActivityForProfileInput & {
    normalized_power?: unknown;
  };
  const fields =
    updates.content_visibility !== undefined
      ? { ...updates, is_private: updates.content_visibility === "private" }
      : updates.is_private !== undefined
        ? {
            ...updates,
            content_visibility: legacyPrivateFlagToContentVisibility(updates.is_private),
          }
        : updates;

  const data = await db.transaction((tx) =>
    updateCanonicalActivityFields(tx, { activityId: id, profileId, fields }),
  );

  if (!data) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity not found",
    });
  }

  return data;
}

export async function deleteActivityForProfile({
  db,
  artifactStorage,
  activityId,
  profileId,
}: {
  db: ActivitiesDb;
  artifactStorage: ActivityArtifactStorage;
  activityId: string;
  profileId: string;
}) {
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.profile_id, profileId)),
  });

  if (!activity) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity not found or you do not have permission to delete it.",
    });
  }

  const retention = createActivityArtifactRetentionService(db, artifactStorage);
  // A failed storage call leaves a deletion_pending tombstone. Resume those first so a retry
  // can finish even though the lifecycle request already revoked the original activity link.
  while ((await retention.resumeDeletionForProfile(profileId)) > 0) {}
  await retention.deleteForActivity({ activityId, profileId });

  await db
    .delete(activities)
    .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)));

  return { success: true, deletedActivityId: activityId };
}
