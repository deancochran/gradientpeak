import type { StandardActivity } from "@repo/core";
import type { getRequiredDb } from "../../db";
import type { ImportedActivityCreateInput } from "../../lib/provider-sync/imported-activity";
import { submitActivity } from "../activities/submit-activity";
import { analyzeParsedActivityFile } from "./analyze-parsed-activity-file";

type DbClient = ReturnType<typeof getRequiredDb>;

/** Re-analyze an existing provider activity from its canonical stored artifact. */
export async function enrichImportedActivityArtifact(
  db: DbClient,
  input: {
    activityId: string;
    activity: ImportedActivityCreateInput;
    parsedActivity: StandardActivity;
  },
) {
  const analysis = await analyzeParsedActivityFile(db, {
    activityId: input.activityId,
    profileId: input.activity.profileId,
    activityType: input.activity.type,
    parsedData: input.parsedActivity,
  });

  await submitActivity(db, {
    kind: "enrich",
    activityId: input.activityId,
    profileId: input.activity.profileId,
    activityFilePath: input.activity.activityFilePath,
    activityFileSize: input.activity.activityFileSize,
    activityFileType: "fit",
    deviceManufacturer: input.parsedActivity.metadata.manufacturer,
    deviceProduct: input.parsedActivity.metadata.product,
    laps: input.parsedActivity.laps ?? null,
    mapBounds: analysis.geometry.mapBounds,
    polyline: analysis.geometry.polyline,
    summaryValues: analysis.summaryValues,
    efforts: analysis.effortsToInsert,
    detectedLTHR: analysis.detectedLTHR,
    activityCompletedAt: analysis.activityCompletedAt,
    activityPlanId: input.activity.activityPlanId,
    name: input.activity.name,
    activityType: input.activity.type,
    isPrivate: input.activity.isPrivate,
    startedAt: analysis.startedAt,
    finishedAt: analysis.activityCompletedAt,
    ingestion: {
      source: "provider_sync",
      provider: input.activity.provider,
      externalId: input.activity.externalId,
    },
  });

  return { id: input.activityId };
}
