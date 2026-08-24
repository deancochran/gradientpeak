import { type ContentVisibility, getCalendarDateInIanaZone } from "@repo/core";
import { activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  createDrizzleAthleteDerivedStateRepository,
  createDrizzlePlannedSessionRepository,
} from "../../infrastructure/repositories";
import {
  deleteThresholdChainsForImpacts,
  readThresholdImpactForActivity,
  rebuildThresholdChainWithProfileLockHeld,
} from "../../repositories/threshold-repository";
import { createActivityArtifactRetentionService } from "../activity-file-ingestion/artifact-retention";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import { deleteThresholdEvidence } from "../athlete-intelligence/replace-threshold-evidence";
import {
  buildAthleteRecalculationRequest,
  requestAthleteRecalculation,
} from "../athlete-intelligence/request-athlete-recalculation";
import { unlinkDeletedActivityCompletionsForActivity } from "../calendar/unlink-deleted-activity-completion";
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
  const exclusiveArtifacts = await retention.listExclusiveArtifactIdsForActivity({
    activityId,
    profileId,
    limit: 10_000,
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
    const now = new Date();
    await unlinkDeletedActivityCompletionsForActivity({
      repository: createDrizzlePlannedSessionRepository(tx),
      profileId,
      activityId,
      unlinkedAt: now.toISOString(),
    });
    const impacts = await readThresholdImpactForActivity(tx, {
      activityId,
      profileId,
    });
    const athleteRepository = createDrizzleAthleteDerivedStateRepository(tx);
    await deleteThresholdEvidence({
      repository: athleteRepository,
      profileId,
      activityId,
    });
    // The self-referencing threshold chain is removed first; deleting the source
    // activity then cascades its efforts, normalized links, and evaluations.
    await deleteThresholdChainsForImpacts(tx, { profileId, impacts });
    // Engagement tables use polymorphic entity IDs and therefore cannot declare
    // an activity foreign key. Remove only this activity's engagement in the
    // same transaction so a hard delete never leaves orphaned actor-owned rows.
    await tx.execute(
      sql`delete from comments where entity_type = 'activity' and entity_id = ${activityId}::uuid`,
    );
    await tx.execute(
      sql`delete from likes where entity_type = 'activity' and entity_id = ${activityId}::uuid`,
    );
    const [deleted] = await tx
      .delete(activities)
      .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)))
      .returning({ id: activities.id, finishedAt: activities.finished_at });
    if (!deleted) throw new Error("Activity deletion lost ownership before commit");
    for (const impact of impacts) {
      await rebuildThresholdChainWithProfileLockHeld(tx, {
        profileId,
        identity: { activityCategory: impact.activityCategory, metric: impact.metric },
        asOf: now,
        now,
      });
    }
    const effectiveAt = new Date(
      Math.min(
        deleted.finishedAt.getTime(),
        ...impacts.map(({ effectiveAt }) => effectiveAt.getTime()),
      ),
    );
    const state = await athleteRepository.lockPublicationState({ profileId });
    if (!state) throw new Error("Athlete publication state is unavailable after activity deletion");
    await requestAthleteRecalculation({
      repository: athleteRepository,
      profileId,
      request: buildAthleteRecalculationRequest({
        profileId,
        earliestAffectedAt: effectiveAt.toISOString(),
        earliestAffectedPlanningDate: getCalendarDateInIanaZone(
          effectiveAt.toISOString(),
          state.planningTimezone,
        ),
        sourceRevision: state.sourceRevision + 1,
        reasons: ["activity_deleted"],
        requestedAt: now.toISOString(),
      }),
    });
  });

  // Database truth is removed first so activity-effort source FKs cascade cleanly.
  // Object storage cleanup is retryable through deletion_pending tombstones.
  for (const artifact of exclusiveArtifacts) {
    await retention.deleteForProfile({ artifactId: artifact.id, profileId });
  }

  return { success: true, deletedActivityId: activityId };
}
