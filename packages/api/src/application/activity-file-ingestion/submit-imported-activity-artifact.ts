import {
  activityLapRecordListSchema,
  type ContentVisibility,
  type StandardActivity,
} from "@repo/core";
import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { activitySourceReferences, profiles } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import type { ImportedActivityCreateInput } from "../../lib/provider-sync/imported-activity";
import { getActivityArtifactStorageService } from "../../storage-service";
import {
  type ActivitySubmissionTransaction,
  activityArtifactId,
  providerActivityId,
  submitActivity,
} from "../activities/submit-activity";
import { analyzeParsedActivityFile } from "./analyze-parsed-activity-file";
import { finalizeActivityArtifactIngestion } from "./finalize-activity-artifact-ingestion";

type DbClient = ReturnType<typeof getRequiredDb>;

export class ImportedActivityAnalysisError extends Error {
  constructor(
    public readonly code: "activity_analysis_failed" | "activity_laps_invalid",
    cause: unknown,
  ) {
    super(code, { cause });
    this.name = "ImportedActivityAnalysisError";
  }
}

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
    beforePersist?: (tx: ActivitySubmissionTransaction) => Promise<void>;
    importRunId?: string;
    deferAthleteStateRefresh?: boolean;
    deferPerformanceCalibration?: boolean;
  },
) {
  const [existingActivity] = await db
    .select({ id: activitySourceReferences.activity_id })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, input.activity.profileId),
        eq(activitySourceReferences.provider, input.activity.provider),
        eq(activitySourceReferences.provider_external_id, input.activity.externalId),
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
  const storage = getActivityArtifactStorageService();
  const { data: bytes } = await storage.readObjectBounded({
    bucket: "activity-files",
    path: input.activity.activityFilePath,
    maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
  });
  return finalizeActivityArtifactIngestion(db, {
    profileId: input.activity.profileId,
    storage,
    bucket: "activity-files",
    stagingPath: input.activity.activityFilePath,
    bytes,
    format: "fit",
    mediaType: "application/octet-stream",
    ...(input.artifactSha256 ? { expectedSha256: input.artifactSha256 } : {}),
    parse: () => input.parsedActivity,
    submit: async ({ parsedData, artifact: promoted }) => {
      const artifactSha256 = promoted.sha256;
      const artifactByteSize = promoted.byteSize;
      const artifactId = activityArtifactId(
        input.activity.profileId,
        artifactSha256,
        artifactByteSize,
      );
      let analysis: Awaited<ReturnType<typeof analyzeParsedActivityFile>>;
      try {
        analysis = await analyzeParsedActivityFile(db, {
          activityId,
          profileId: input.activity.profileId,
          parsedData,
          artifactId,
          providerActiveDurationSeconds: input.activity.providerActiveDurationSeconds,
          provider: input.activity.provider,
        });
      } catch (error) {
        throw new ImportedActivityAnalysisError("activity_analysis_failed", error);
      }
      const summary = analysis.summaryValues;
      const contentVisibility =
        input.activity.contentVisibility ??
        (await getProfileDefaultContentVisibility(db, input.activity.profileId));

      const submission: Parameters<typeof submitActivity>[1] = {
        requestedActivityId: activityId,
        profileId: input.activity.profileId,
        activityPlanId: input.activity.activityPlanId,
        name: input.activity.name,
        notes: null,
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
        avgCadence: valueOrNull(summary.avg_cadence),
        maxCadence: valueOrNull(summary.max_cadence),
        avgSpeedMps: valueOrNull(summary.avg_speed_mps),
        maxSpeedMps: valueOrNull(summary.max_speed_mps),
        normalizedSpeedMps: valueOrNull(summary.normalized_speed_mps),
        avgTemperature: valueOrNull(summary.avg_temperature),
        poolLengthMeters: valueOrNull(summary.pool_length_meters),
        totalStrokes: valueOrNull(summary.total_strokes),
        avgSwolf: valueOrNull(summary.avg_swolf),
        deviceManufacturer: parsedData.metadata.manufacturer,
        deviceProduct: parsedData.metadata.product,
        laps: (() => {
          const laps = parsedData.laps ?? null;
          if (laps === null) return null;
          try {
            return activityLapRecordListSchema.parse(laps);
          } catch (error) {
            throw new ImportedActivityAnalysisError("activity_laps_invalid", error);
          }
        })(),
        mapBounds: analysis.geometry.mapBounds,
        polyline: analysis.geometry.polyline,
        providerProvenance: {
          provider: input.activity.provider,
          externalId: input.activity.externalId,
          integrationId: input.activity.integrationId,
          integrationGeneration: input.activity.integrationGeneration,
          providerUpdatedAt: input.activity.providerUpdatedAt,
        },
        analysis: {
          efforts: analysis.effortsToInsert,
          detectedLTHR: analysis.detectedLTHR,
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
      };
      return submitActivity(db, submission, {
        ...(input.beforePersist ? { beforePersist: input.beforePersist } : {}),
        ...(input.importRunId ? { importRunId: input.importRunId } : {}),
        ...(input.deferAthleteStateRefresh ? { deferAthleteStateRefresh: true } : {}),
        ...(input.deferPerformanceCalibration ? { deferPerformanceCalibration: true } : {}),
      });
    },
  });
}
