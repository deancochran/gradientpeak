import { activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { markProfileAnalysisDirty } from "../../utils/profile-estimation-state";

type ActivitiesDb = ReturnType<typeof getRequiredDb>;

export type UpdateActivityForProfileInput = {
  id: string;
  normalized_power?: number;
  name?: string;
  notes?: string | null;
  is_private?: boolean;
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

  const [data] = await db
    .update(activities)
    .set({
      ...updates,
      updated_at: new Date(),
    })
    .where(and(eq(activities.id, id), eq(activities.profile_id, profileId)))
    .returning();

  if (!data) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity not found",
    });
  }

  if (input.normalized_power !== undefined) {
    await markProfileAnalysisDirty(db, {
      profileId,
      kinds: ["fitness"],
      dirtySince: data.started_at,
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

  await markProfileAnalysisDirty(db, {
    profileId,
    kinds: ["performance", "fitness"],
    dirtySince: activity.started_at,
  });

  return { success: true, deletedActivityId: activityId };
}
