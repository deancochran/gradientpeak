import { randomUUID } from "node:crypto";
import type { ContentVisibility, StandardActivity } from "@repo/core";
import { profiles } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import type { ImportedActivityCreateInput } from "../../lib/provider-sync/imported-activity";
import { submitActivity } from "../activities/submit-activity";
import { analyzeParsedActivityFile } from "./analyze-parsed-activity-file";

type DbClient = ReturnType<typeof getRequiredDb>;

function valueOrNull(value: number | null | undefined): number | null {
  return value ?? null;
}

async function getProfileDefaultContentVisibility(
  db: DbClient,
  profileId: string,
): Promise<ContentVisibility> {
  if (!("select" in db) || typeof db.select !== "function") {
    return "private";
  }

  const [profile] = await db
    .select({ defaultContentVisibility: profiles.default_content_visibility })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  return profile?.defaultContentVisibility ?? "private";
}

/** Persist an imported canonical artifact and every projection derived from it. */
export async function submitImportedActivityArtifact(
  db: DbClient,
  input: {
    activity: ImportedActivityCreateInput;
    parsedActivity: StandardActivity;
  },
) {
  const activityId = randomUUID();
  const analysis = await analyzeParsedActivityFile(db, {
    activityId,
    profileId: input.activity.profileId,
    activityType: input.activity.type,
    parsedData: input.parsedActivity,
  });
  const summary = analysis.summaryValues;
  const contentVisibility =
    input.activity.contentVisibility ??
    (await getProfileDefaultContentVisibility(db, input.activity.profileId));

  return submitActivity(db, {
    requestedActivityId: activityId,
    profileId: input.activity.profileId,
    activityPlanId: input.activity.activityPlanId,
    name: input.activity.name,
    notes: null,
    activityType: input.activity.type,
    isPrivate: input.activity.isPrivate,
    contentVisibility,
    startedAt: analysis.startedAt,
    finishedAt: analysis.activityCompletedAt,
    durationSeconds: summary.duration_seconds ?? input.activity.durationSeconds,
    movingSeconds: summary.moving_seconds ?? input.activity.movingSeconds,
    distanceMeters: summary.distance_meters ?? input.activity.distanceMeters,
    calories: valueOrNull(summary.calories),
    elevationGainMeters: valueOrNull(summary.elevation_gain_meters),
    avgHeartRate: valueOrNull(summary.avg_heart_rate),
    maxHeartRate: valueOrNull(summary.max_heart_rate),
    avgPower: valueOrNull(summary.avg_power),
    maxPower: valueOrNull(summary.max_power),
    normalizedPower: valueOrNull(summary.normalized_power),
    avgCadence: valueOrNull(summary.avg_cadence),
    maxCadence: valueOrNull(summary.max_cadence),
    avgSpeedMps: valueOrNull(summary.avg_speed_mps),
    maxSpeedMps: valueOrNull(summary.max_speed_mps),
    normalizedSpeedMps: valueOrNull(summary.normalized_speed_mps),
    normalizedGradedSpeedMps: valueOrNull(summary.normalized_graded_speed_mps),
    efficiencyFactor: valueOrNull(summary.efficiency_factor),
    aerobicDecoupling: valueOrNull(summary.aerobic_decoupling),
    avgTemperature: valueOrNull(summary.avg_temperature),
    activityFilePath: input.activity.activityFilePath,
    activityFileSize: input.activity.activityFileSize,
    importSource: input.activity.provider,
    importFileType: "fit",
    importOriginalFileName: null,
    deviceManufacturer: input.parsedActivity.metadata.manufacturer,
    deviceProduct: input.parsedActivity.metadata.product,
    laps: input.parsedActivity.laps ?? null,
    mapBounds: analysis.geometry.mapBounds,
    polyline: analysis.geometry.polyline,
    providerProvenance: {
      provider: input.activity.provider,
      externalId: input.activity.externalId,
      integrationId: input.activity.integrationId,
      providerUpdatedAt: input.activity.providerUpdatedAt,
    },
    analysis: {
      efforts: analysis.effortsToInsert,
      detectedLTHR: analysis.detectedLTHR,
      activityCompletedAt: analysis.activityCompletedAt,
      ingestion: {
        source: "provider_sync",
        provider: input.activity.provider,
        externalId: input.activity.externalId,
        fileType: "fit",
      },
    },
  });
}
