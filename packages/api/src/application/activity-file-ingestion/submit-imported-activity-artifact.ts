import {
  activityLapRecordListSchema,
  type ContentVisibility,
  type StandardActivity,
} from "@repo/core";
import { activityArtifactContentPath } from "@repo/core/activity-artifacts";
import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import {
  activityArtifactLinks,
  activityArtifacts,
  activityPlans,
  activitySourceReferences,
  profiles,
} from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";
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
  activityArtifactSha256,
  cleanupActivityArtifactStaging,
  cleanupOwnedPromotedActivityArtifact,
} from "./artifact-storage";
import {
  acceptActivityIngestion,
  activityIngestionOperationId,
  beginActivityIngestionOperation,
  claimActivityIngestionProcessing,
  completeActivityIngestionCleanup,
  deferActivityIngestionCleanup,
  failActivityIngestion,
} from "./direct-activity-ingestion";
import {
  type ActivityArtifactIngestionFailureStage,
  finalizeActivityArtifactIngestion,
} from "./finalize-activity-artifact-ingestion";

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

function failureForStage(stage: ActivityArtifactIngestionFailureStage) {
  switch (stage) {
    case "parse":
      return { failureCode: "invalid_activity" as const, retryable: false };
    case "hash":
      return { failureCode: "hash_mismatch" as const, retryable: false };
    case "promotion":
      return { failureCode: "promotion_failed" as const, retryable: true };
    case "persistence":
      return { failureCode: "internal" as const, retryable: true };
  }
}

async function cleanupReplayedStaging(
  storage: ReturnType<typeof getActivityArtifactStorageService>,
  input: { profileId: string; stagingPath: string; expectedSha256: string | null },
) {
  if (!input.expectedSha256) return;
  await cleanupActivityArtifactStaging(storage, {
    bucket: "activity-files",
    stagingPath: input.stagingPath,
    path: activityArtifactContentPath(input.profileId, input.expectedSha256),
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
    importRunId?: string;
    deferAthleteStateRefresh?: boolean;
    deferPerformanceCalibration?: boolean;
  },
) {
  const storage = getActivityArtifactStorageService();
  const operationId = activityIngestionOperationId(
    `provider_sync:${input.activity.provider}:${input.activity.externalId}:${input.activity.providerUpdatedAt ?? "unversioned"}`,
  );
  const operationRepository = createDrizzleActivityIngestionRepository(db);
  const replay = await operationRepository.getOwnedByOperation({
    profileId: input.activity.profileId,
    operationId,
  });
  if (replay?.status === "succeeded" && replay.activityId) {
    // A provider may upload staging bytes before discovering this completed operation.
    // Remove that fresh upload even when the original operation's cleanup already finished.
    await cleanupReplayedStaging(storage, {
      profileId: replay.profileId,
      stagingPath: input.activity.activityFilePath,
      expectedSha256: replay.expectedSha256,
    });
    if (
      replay.stagingCleanupPending &&
      replay.stagingBucket &&
      replay.stagingPath &&
      replay.expectedSha256
    ) {
      try {
        await cleanupActivityArtifactStaging(storage, {
          bucket: replay.stagingBucket,
          stagingPath: replay.stagingPath,
          path: activityArtifactContentPath(replay.profileId, replay.expectedSha256),
        });
        await completeActivityIngestionCleanup(db, {
          profileId: replay.profileId,
          ingestionId: replay.id,
        });
      } catch {
        await deferActivityIngestionCleanup(db, {
          profileId: replay.profileId,
          ingestionId: replay.id,
        }).catch(() => false);
      }
    }
    return { id: replay.activityId, compositionResult: undefined, noOp: true };
  }
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
  const { data: bytes } = await storage.readObjectBounded({
    bucket: "activity-files",
    path: input.activity.activityFilePath,
    maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
  });
  const artifactSha256 = input.artifactSha256 ?? activityArtifactSha256(bytes);
  let operation = await beginActivityIngestionOperation(db, {
    profileId: input.activity.profileId,
    operationId,
    source: "provider_sync",
    provider: input.activity.provider,
    externalId: input.activity.externalId,
    integrationId: input.activity.integrationId,
    stagingBucket: "activity-files",
    stagingPath: input.activity.activityFilePath,
    expectedSha256: artifactSha256,
    expectedByteSize: bytes.byteLength,
    expectedFormat: "fit",
    expectedMediaType: "application/vnd.ant.fit",
    uploaded: true,
  });
  if (operation.status === "succeeded" && operation.activityId) {
    await cleanupReplayedStaging(storage, {
      profileId: operation.profileId,
      stagingPath: input.activity.activityFilePath,
      expectedSha256: operation.expectedSha256,
    });
    if (
      operation.stagingCleanupPending &&
      operation.stagingBucket &&
      operation.stagingPath &&
      operation.expectedSha256
    ) {
      try {
        await cleanupActivityArtifactStaging(storage, {
          bucket: operation.stagingBucket,
          stagingPath: operation.stagingPath,
          path: activityArtifactContentPath(operation.profileId, operation.expectedSha256),
        });
        await completeActivityIngestionCleanup(db, {
          profileId: operation.profileId,
          ingestionId: operation.id,
        });
      } catch {
        await deferActivityIngestionCleanup(db, {
          profileId: operation.profileId,
          ingestionId: operation.id,
        }).catch(() => false);
      }
    }
    return { id: operation.activityId, compositionResult: undefined, noOp: true };
  }
  const processingClaim = await claimActivityIngestionProcessing(db, {
    ingestionId: operation.id,
    profileId: input.activity.profileId,
    source: "provider_sync",
    operationId,
  });
  operation = processingClaim.operation;
  if (processingClaim.status === "existing") {
    if (operation.status === "succeeded" && operation.activityId) {
      await cleanupReplayedStaging(storage, {
        profileId: operation.profileId,
        stagingPath: input.activity.activityFilePath,
        expectedSha256: operation.expectedSha256,
      });
      return { id: operation.activityId, compositionResult: undefined, noOp: true };
    }
    if (
      operation.status === "processing" &&
      operation.stagingPath !== input.activity.activityFilePath
    ) {
      await cleanupReplayedStaging(storage, {
        profileId: operation.profileId,
        stagingPath: input.activity.activityFilePath,
        expectedSha256: artifactSha256,
      });
    }
    return {
      id: activityId,
      compositionResult: undefined,
      noOp: true,
      inProgress: true,
    };
  }
  return finalizeActivityArtifactIngestion(db, {
    profileId: input.activity.profileId,
    storage,
    bucket: "activity-files",
    stagingPath: input.activity.activityFilePath,
    bytes,
    format: "fit",
    mediaType: "application/vnd.ant.fit",
    expectedSha256: artifactSha256,
    parse: () => input.parsedActivity,
    onFailure: async (stage: ActivityArtifactIngestionFailureStage) => {
      await failActivityIngestion(db, {
        profileId: operation.profileId,
        ingestionId: operation.id,
        ...failureForStage(stage),
      });
    },
    onCleanup: async ({ cleaned }: { cleaned: boolean }) => {
      if (cleaned) {
        await completeActivityIngestionCleanup(db, {
          profileId: operation.profileId,
          ingestionId: operation.id,
        });
      } else {
        await deferActivityIngestionCleanup(db, {
          profileId: operation.profileId,
          ingestionId: operation.id,
        });
      }
    },
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
            operationId,
            ingestionId: operation.id,
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
      const result = await submitActivity(db, submission, {
        ...(input.beforePersist || input.activity.activityPlanId
          ? {
              beforePersist: async (tx: ActivitySubmissionTransaction) => {
                await input.beforePersist?.(tx);
                const activityPlanId = input.activity.activityPlanId;
                if (!activityPlanId) return;
                const [ownedPlan] = await tx
                  .select({ id: activityPlans.id })
                  .from(activityPlans)
                  .where(
                    and(
                      eq(activityPlans.id, activityPlanId),
                      eq(activityPlans.profile_id, input.activity.profileId),
                    ),
                  )
                  .limit(1);
                if (!ownedPlan) throw new Error("activity_plan_not_owned");
              },
            }
          : {}),
        ...(input.importRunId ? { importRunId: input.importRunId } : {}),
        ...(input.deferAthleteStateRefresh ? { deferAthleteStateRefresh: true } : {}),
        ...(input.deferPerformanceCalibration ? { deferPerformanceCalibration: true } : {}),
      });
      if (result.noOp) {
        const persistedOperation = await operationRepository.getOwned({
          profileId: operation.profileId,
          ingestionId: operation.id,
        });
        if (persistedOperation?.status !== "succeeded") {
          const [currentArtifact] = await db
            .select({ id: activityArtifacts.id })
            .from(activityArtifactLinks)
            .innerJoin(
              activityArtifacts,
              and(
                eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
                eq(activityArtifacts.profile_id, input.activity.profileId),
                eq(activityArtifacts.availability, "accepted"),
              ),
            )
            .where(
              and(
                eq(activityArtifactLinks.profile_id, input.activity.profileId),
                eq(activityArtifactLinks.activity_id, result.id),
                eq(activityArtifactLinks.role, "source"),
                eq(activityArtifactLinks.is_current, true),
              ),
            )
            .limit(1);
          if (!currentArtifact) throw new Error("Provider replay has no accepted source artifact");
          await acceptActivityIngestion(db, {
            profileId: operation.profileId,
            ingestionId: operation.id,
            operationId,
            source: "provider_sync",
            activityId: result.id,
            artifactId: currentArtifact.id,
            completedAt: new Date(),
          });
          await cleanupOwnedPromotedActivityArtifact(storage, promoted);
        }
      }
      return result;
    },
  });
}
