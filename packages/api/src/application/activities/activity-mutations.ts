import { type ContentVisibility, legacyPrivateFlagToContentVisibility } from "@repo/core";
import { activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { updateCanonicalActivityFields } from "./submit-activity";

type ActivitiesDb = ReturnType<typeof getRequiredDb>;

export type UpdateActivityForProfileInput = {
  id: string;
  normalized_power?: number;
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
  const { id, ...updates } = input;
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
  activityId,
  profileId,
}: {
  db: ActivitiesDb;
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

  await db
    .delete(activities)
    .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)));

  return { success: true, deletedActivityId: activityId };
}
