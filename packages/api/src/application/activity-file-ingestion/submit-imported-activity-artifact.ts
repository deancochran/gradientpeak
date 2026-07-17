import type { ContentVisibility, StandardActivity } from "@repo/core";
import { activities, profiles } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import type { ImportedActivityCreateInput } from "../../lib/provider-sync/imported-activity";
import { getApiStorageService } from "../../storage-service";
import {
  activityArtifactId,
  providerActivityId,
  submitActivity,
} from "../activities/submit-activity";
import { analyzeParsedActivityFile } from "./analyze-parsed-activity-file";
import { cleanupActivityArtifactStaging, promoteActivityArtifact } from "./artifact-storage";

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
    artifactSha256?: string;
  },
) {
  const [existingActivity] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.activity.profileId),
        eq(activities.provider, input.activity.provider),
        eq(activities.external_id, input.activity.externalId),
      ),
    )
    .limit(1);
  const activityId =
    existingActivity?.id ??
    providerActivityId(
      input.activity.profileId,
      input.activity.provider,
      input.activity.externalId,
    );
  const storage = getApiStorageService();
  const { data, error } = await storage.storage
    .from("activity-files")
    .download(input.activity.activityFilePath);
  if (error || !data) {
    throw new Error(`Failed to load staged provider artifact: ${error?.message ?? "not found"}`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const promoted = await promoteActivityArtifact(storage, {
    profileId: input.activity.profileId,
    bucket: "activity-files",
    stagingPath: input.activity.activityFilePath,
    bytes,
    format: "fit",
    mediaType: "application/octet-stream",
  });
  if (input.artifactSha256 && input.artifactSha256 !== promoted.sha256) {
    throw new Error("Provider artifact digest does not match staged bytes");
  }
  const artifactSha256 = promoted.sha256;
  const artifactByteSize = promoted.byteSize;
  const artifactId = activityArtifactId(input.activity.profileId, artifactSha256, artifactByteSize);
  const analysis = await analyzeParsedActivityFile(db, {
    activityId,
    profileId: input.activity.profileId,
    parsedData: input.parsedActivity,
    artifactId,
  });
  const summary = analysis.summaryValues;
  const contentVisibility =
    input.activity.contentVisibility ??
    (await getProfileDefaultContentVisibility(db, input.activity.profileId));

  const submitted = await submitActivity(db, {
    requestedActivityId: activityId,
    profileId: input.activity.profileId,
    activityPlanId: input.activity.activityPlanId,
    name: input.activity.name,
    notes: null,
    isPrivate: input.activity.isPrivate,
    contentVisibility,
    startedAt: analysis.startedAt,
    finishedAt: analysis.activityCompletedAt,
    elapsedMs: summary.elapsed_ms,
    activeMs: summary.active_ms,
    movingMs: summary.moving_ms,
    timingCoverage: summary.timing_coverage,
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
        operationKey: `provider_sync:${input.activity.provider}:${input.activity.externalId}:${artifactSha256}`,
        artifact: {
          sha256: artifactSha256,
          byteSize: artifactByteSize,
          bucket: promoted.bucket,
          path: promoted.path,
          mediaType: promoted.mediaType,
          format: "fit",
          originalName: input.activity.activityFilePath.split("/").at(-1) ?? null,
        },
      },
    },
    segmentSet: analysis.segmentSet,
  });
  await cleanupActivityArtifactStaging(storage, promoted);
  return submitted;
}
