import type { ContentVisibility } from "@repo/core";
import { activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import { createActivityArtifactRetentionService } from "../activity-file-ingestion/artifact-retention";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import { updateCanonicalActivityFields } from "./submit-activity";

type ActivitiesDb = ReturnType<typeof getRequiredDb>;

export type UpdateActivityForProfileInput = {
  id: string;
  name?: string;
  notes?: string | null;
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
  const data = await db.transaction((tx) =>
    updateCanonicalActivityFields(tx, { activityId: input.id, profileId, fields: input }),
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

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(activities)
      .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)))
      .returning({ id: activities.id, finishedAt: activities.finished_at });
    if (!deleted) throw new Error("Activity deletion lost ownership before commit");
    await markAthleteStateDirty(tx, {
      profileId,
      effectiveAt: deleted.finishedAt,
    });
  });

  return { success: true, deletedActivityId: activityId };
}
