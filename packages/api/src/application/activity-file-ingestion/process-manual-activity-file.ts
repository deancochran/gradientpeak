import { createHash } from "node:crypto";
import type { ContentVisibility } from "@repo/core";
import type { ActivityFileIngestionOperation } from "@repo/core/activity-files";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import { type ActivityRow, activities } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";
import {
  activityArtifactId,
  manualImportActivityId,
  submitActivity,
} from "../activities/submit-activity";
import {
  analyzeParsedActivityFile,
  type ParsedActivityFileForAnalysis,
} from "./analyze-parsed-activity-file";
import { type ActivityArtifactStorage, cleanupActivityArtifactStaging } from "./artifact-storage";
import {
  ActivityIngestionOperationConflictError,
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

interface LoggerLike {
  error(message: string, metadata?: unknown): void;
}

interface ReadStoredActivityFileResult {
  activityFile: { size?: number | null; type?: string | null };
  data: Uint8Array;
}

export interface ProcessManualActivityFileInput {
  profileId: string;
  activityFilePath: string;
  name: string;
  notes?: string;
  contentVisibility?: ContentVisibility;
  originalName?: string | null;
  fileType: ActivityFileType;
}

export interface ProcessManualActivityFileDependencies {
  storage: ActivityArtifactStorage;
  readStoredActivityFile(input: {
    activityFilePath: string;
    removeOnParseFailure: false;
  }): Promise<ReadStoredActivityFileResult>;
  decodeActivityFile(input: {
    data: Uint8Array;
    activityFilePath: string;
    fileType: ActivityFileType;
  }): ParsedActivityFileForAnalysis;
  getProfileDefaultContentVisibility(db: DbClient, profileId: string): Promise<ContentVisibility>;
  logger: LoggerLike;
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mediaType(fileType: ActivityFileType) {
  return fileType === "fit"
    ? ("application/vnd.ant.fit" as const)
    : fileType === "gpx"
      ? ("application/gpx+xml" as const)
      : ("application/vnd.garmin.tcx+xml" as const);
}

function isTrpcError(error: unknown): error is TRPCError {
  return (
    error instanceof TRPCError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string")
  );
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

async function loadOwnedActivity(db: DbClient, profileId: string, activityId: string) {
  return db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.profile_id, profileId)),
  });
}

async function retryCompletedCleanup(
  db: DbClient,
  storage: ActivityArtifactStorage,
  operation: ActivityFileIngestionOperation,
) {
  if (
    !operation.stagingCleanupPending ||
    !operation.stagingBucket ||
    !operation.stagingPath ||
    !operation.expectedSha256
  )
    return;
  try {
    await cleanupActivityArtifactStaging(storage, {
      bucket: operation.stagingBucket,
      stagingPath: operation.stagingPath,
      path: `artifacts/sha256/${operation.profileId}/${operation.expectedSha256}`,
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

/** Converges direct manual submissions through one idempotent operation and canonical writer. */
export async function processManualActivityFile(
  db: DbClient,
  input: ProcessManualActivityFileInput,
  deps: ProcessManualActivityFileDependencies,
): Promise<{ activity: ActivityRow; ingestion: ActivityFileIngestionOperation }> {
  const operationId = activityIngestionOperationId(
    `manual_import:${input.profileId}:${input.activityFilePath}`,
  );
  const operationRepository = createDrizzleActivityIngestionRepository(db);
  const replay = await operationRepository.getOwnedByOperation({
    profileId: input.profileId,
    operationId,
  });
  if (replay?.status === "succeeded") {
    if (!replay.activityId) throw new Error("Succeeded ingestion is missing activity identity");
    const activity = await loadOwnedActivity(db, input.profileId, replay.activityId);
    if (!activity) throw new Error("Succeeded ingestion activity was not found");
    await retryCompletedCleanup(db, deps.storage, replay);
    return { activity, ingestion: replay };
  }
  const stored = await deps.readStoredActivityFile({
    activityFilePath: input.activityFilePath,
    removeOnParseFailure: false,
  });
  const sha256 = digest(stored.data);
  const activityId = manualImportActivityId(input.profileId, sha256);
  const contentVisibility =
    input.contentVisibility ?? (await deps.getProfileDefaultContentVisibility(db, input.profileId));
  let operation: ActivityFileIngestionOperation;
  try {
    operation = await beginActivityIngestionOperation(db, {
      profileId: input.profileId,
      operationId,
      source: "manual_import",
      stagingBucket: "activity-files",
      stagingPath: input.activityFilePath,
      expectedSha256: sha256,
      expectedByteSize: stored.activityFile.size ?? stored.data.byteLength,
      expectedFormat: input.fileType,
      expectedMediaType: mediaType(input.fileType),
      uploaded: true,
    });
  } catch (error) {
    if (error instanceof ActivityIngestionOperationConflictError) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Activity file ingestion metadata conflicts with an existing operation",
        cause: error,
      });
    }
    throw error;
  }

  if (operation.status === "succeeded") {
    if (!operation.activityId) throw new Error("Succeeded ingestion is missing activity identity");
    const activity = await loadOwnedActivity(db, input.profileId, operation.activityId);
    if (!activity) throw new Error("Succeeded ingestion activity was not found");
    await retryCompletedCleanup(db, deps.storage, operation);
    return { activity, ingestion: operation };
  }

  try {
    const claim = await claimActivityIngestionProcessing(db, {
      profileId: input.profileId,
      ingestionId: operation.id,
      operationId,
      source: "manual_import",
    });
    operation = claim.operation;
    if (claim.status === "existing") {
      if (operation.status === "succeeded" && operation.activityId) {
        const activity = await loadOwnedActivity(db, input.profileId, operation.activityId);
        if (!activity) throw new Error("Succeeded ingestion activity was not found");
        await retryCompletedCleanup(db, deps.storage, operation);
        return { activity, ingestion: operation };
      }
      throw new ActivityIngestionOperationConflictError(
        "Activity ingestion is already being processed",
      );
    }
  } catch (error) {
    if (error instanceof ActivityIngestionOperationConflictError) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Activity file ingestion cannot be processed",
        cause: error,
      });
    }
    throw error;
  }

  try {
    return await finalizeActivityArtifactIngestion(db, {
      profileId: input.profileId,
      storage: deps.storage,
      bucket: "activity-files",
      stagingPath: input.activityFilePath,
      bytes: stored.data,
      format: input.fileType,
      ...(stored.activityFile.type === undefined ? {} : { mediaType: stored.activityFile.type }),
      expectedSha256: sha256,
      parse: () =>
        deps.decodeActivityFile({
          data: stored.data,
          activityFilePath: input.activityFilePath,
          fileType: input.fileType,
        }),
      onFailure: async (stage: ActivityArtifactIngestionFailureStage) => {
        await failActivityIngestion(db, {
          profileId: input.profileId,
          ingestionId: operation.id,
          ...failureForStage(stage),
        });
      },
      onCleanup: async ({ cleaned }: { cleaned: boolean }) => {
        if (cleaned) {
          await completeActivityIngestionCleanup(db, {
            profileId: input.profileId,
            ingestionId: operation.id,
          });
        } else {
          await deferActivityIngestionCleanup(db, {
            profileId: input.profileId,
            ingestionId: operation.id,
          });
        }
      },
      submit: async ({ parsedData, artifact: promoted }) => {
        const artifactId = activityArtifactId(input.profileId, promoted.sha256, promoted.byteSize);
        const analysis = await analyzeParsedActivityFile(db, {
          profileId: input.profileId,
          activityId,
          parsedData,
          artifactId,
        });
        await submitActivity(db, {
          requestedActivityId: activityId,
          profileId: input.profileId,
          name: input.name,
          notes: input.notes ?? null,
          contentVisibility,
          startedAt: analysis.startedAt,
          finishedAt: analysis.activityCompletedAt,
          elapsedMs: analysis.summaryValues.elapsed_ms,
          activeMs: analysis.summaryValues.active_ms,
          movingMs: analysis.summaryValues.moving_ms,
          timingCoverage: analysis.summaryValues.timing_coverage,
          distanceMeters: analysis.summaryValues.distance_meters ?? 0,
          calories: analysis.summaryValues.calories,
          elevationGainMeters: analysis.summaryValues.elevation_gain_meters,
          avgHeartRate: analysis.summaryValues.avg_heart_rate,
          maxHeartRate: analysis.summaryValues.max_heart_rate,
          avgPower: analysis.summaryValues.avg_power,
          maxPower: analysis.summaryValues.max_power,
          avgCadence: analysis.summaryValues.avg_cadence,
          maxCadence: analysis.summaryValues.max_cadence,
          avgSpeedMps: analysis.summaryValues.avg_speed_mps,
          maxSpeedMps: analysis.summaryValues.max_speed_mps,
          normalizedSpeedMps: analysis.summaryValues.normalized_speed_mps,
          avgTemperature: analysis.summaryValues.avg_temperature,
          poolLengthMeters: analysis.summaryValues.pool_length_meters,
          totalStrokes: analysis.summaryValues.total_strokes,
          avgSwolf: analysis.summaryValues.avg_swolf,
          deviceManufacturer: parsedData.metadata.manufacturer,
          deviceProduct: parsedData.metadata.product,
          laps: parsedData.laps ?? null,
          mapBounds: analysis.geometry.mapBounds,
          polyline: analysis.geometry.polyline,
          analysis: {
            efforts: analysis.effortsToInsert,
            detectedLTHR: analysis.detectedLTHR,
            ingestion: {
              source: "manual_import",
              operationId,
              ingestionId: operation.id,
              artifact: { ...promoted, originalName: input.originalName ?? null },
            },
          },
          segmentSet: analysis.segmentSet,
        });
        const activity = await loadOwnedActivity(db, input.profileId, activityId);
        if (!activity) throw new Error("Failed to load created activity record");
        const ingestion = await operationRepository.getOwned({
          profileId: input.profileId,
          ingestionId: operation.id,
        });
        if (!ingestion) throw new Error("Accepted ingestion could not be loaded");
        return { activity, ingestion };
      },
    });
  } catch (error) {
    const parseFailure = isTrpcError(error) && error.code === "BAD_REQUEST";
    deps.logger.error(
      `manual_activity_import.process.${parseFailure ? "parse_failed" : "process_failed"}`,
      { outcome: parseFailure ? "expected_error" : "unexpected_error" },
    );
    if (isTrpcError(error) && error.code === "CONFLICT") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Activity file ingestion is already being processed",
      });
    }
    if (parseFailure)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to parse activity file" });
    if (isTrpcError(error) && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Activity file processing failed",
    });
  }
}
