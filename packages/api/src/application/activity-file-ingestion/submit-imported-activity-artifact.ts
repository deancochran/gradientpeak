import type { ContentVisibility, StandardActivity } from "@repo/core";
import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { activities, activityArtifacts, profiles } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
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
import {
  cleanupActivityArtifactStaging,
  cleanupOwnedPromotedActivityArtifact,
  type PromotedActivityArtifact,
  promoteActivityArtifact,
} from "./artifact-storage";

type DbClient = ReturnType<typeof getRequiredDb>;

function valueOrNull(value: number | null | undefined): number | null {
  return value ?? null;
}

/**
 * A failed promotion is represented durably before attempting object removal.
 * The digest lock is shared with normal acceptance, so a concurrently accepted
 * artifact wins and its bytes are never removed. No database transaction is
 * held while the storage call runs.
 */
async function quarantineFailedPromotion(
  db: DbClient,
  promoted: PromotedActivityArtifact,
  profileId: string,
) {
  if (!promoted.createdDestination) return null;
  const artifactId = activityArtifactId(profileId, promoted.sha256, promoted.byteSize);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${profileId}:${promoted.sha256}`}))`,
    );
    const [acceptedArtifact] = await tx
      .select({ availability: activityArtifacts.availability })
      .from(activityArtifacts)
      .where(
        and(
          eq(activityArtifacts.profile_id, profileId),
          eq(activityArtifacts.bucket, promoted.bucket),
          eq(activityArtifacts.path, promoted.path),
          eq(activityArtifacts.digest, promoted.sha256),
          eq(activityArtifacts.byte_size, promoted.byteSize),
        ),
      )
      .limit(1);
    if (acceptedArtifact?.availability === "accepted") return null;
    await tx
      .insert(activityArtifacts)
      .values({
        id: artifactId,
        profile_id: profileId,
        digest_algorithm: "sha256",
        digest: promoted.sha256,
        byte_size: promoted.byteSize,
        bucket: promoted.bucket,
        path: promoted.path,
        media_type: promoted.mediaType,
        format: promoted.format,
        availability: "deletion_pending",
        deletion_requested_at: new Date(),
      })
      .onConflictDoNothing();
    return artifactId;
  });
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
  const storage = getActivityArtifactStorageService();
  const { data: bytes } = await storage.readObjectBounded({
    bucket: "activity-files",
    path: input.activity.activityFilePath,
    maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
  });
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
  try {
    const artifactSha256 = promoted.sha256;
    const artifactByteSize = promoted.byteSize;
    const artifactId = activityArtifactId(
      input.activity.profileId,
      artifactSha256,
      artifactByteSize,
    );
    const analysis = await analyzeParsedActivityFile(db, {
      activityId,
      profileId: input.activity.profileId,
      parsedData: input.parsedActivity,
      artifactId,
      providerActiveDurationSeconds: input.activity.providerActiveDurationSeconds,
    });
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
      normalizedGradedSpeedMps: valueOrNull(summary.normalized_graded_speed_mps),
      efficiencyFactor: valueOrNull(summary.efficiency_factor),
      aerobicDecoupling: valueOrNull(summary.aerobic_decoupling),
      avgTemperature: valueOrNull(summary.avg_temperature),
      poolLengthMeters: valueOrNull(summary.pool_length_meters),
      totalStrokes: valueOrNull(summary.total_strokes),
      avgSwolf: valueOrNull(summary.avg_swolf),
      deviceManufacturer: input.parsedActivity.metadata.manufacturer,
      deviceProduct: input.parsedActivity.metadata.product,
      laps: input.parsedActivity.laps ?? null,
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
    };
    const submitted = input.beforePersist
      ? await submitActivity(db, submission, { beforePersist: input.beforePersist })
      : await submitActivity(db, submission);
    await cleanupActivityArtifactStaging(storage, promoted);
    return submitted;
  } catch (error) {
    // Staging belongs to this provider delivery. A later parser/transaction
    // failure must not leave it available for a disconnected generation.
    await cleanupActivityArtifactStaging(storage, promoted).catch(() => undefined);
    const deletionArtifactId = await quarantineFailedPromotion(
      db,
      promoted,
      input.activity.profileId,
    );
    if (deletionArtifactId) {
      try {
        await cleanupOwnedPromotedActivityArtifact(storage, promoted);
        await db.execute(
          sql`select public.finalize_activity_artifact_deletion(${deletionArtifactId}::uuid, true)`,
        );
      } catch {
        // The deletion_pending artifact row is the bounded durable repair
        // authority; do not log its path, digest, or provider identifier.
      }
    }
    throw error;
  }
}
