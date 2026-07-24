import { createHash } from "node:crypto";
import type { ContentVisibility } from "@repo/core";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import {
  type ActivityFileIngestionRow,
  type ActivityRow,
  activities,
  activityFileIngestions,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  activityArtifactId,
  manualImportActivityId,
  submitActivity,
} from "../activities/submit-activity";
import {
  analyzeParsedActivityFile,
  type ParsedActivityFileForAnalysis,
} from "./analyze-parsed-activity-file";
import {
  type ActivityArtifactStorage,
  cleanupActivityArtifactStaging,
  promoteActivityArtifact,
} from "./artifact-storage";
import {
  ActivityFileIngestionClaimLostError,
  createActivityFileIngestion,
  markFailed,
  markProcessing,
  markUploaded,
} from "./ingestion-state";

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
  isPrivate?: boolean;
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

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

function safeFailure(error: unknown) {
  return error instanceof TRPCError && error.code === "BAD_REQUEST"
    ? { code: "parse_failed", message: "Unable to parse activity file" }
    : { code: "process_failed", message: "Activity file processing failed" };
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

async function loadOwnedActivity(db: DbClient, profileId: string, activityId: string) {
  return db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.profile_id, profileId)),
  });
}

async function claimManualIngestion(
  db: DbClient,
  ingestion: ActivityFileIngestionRow,
  profileId: string,
) {
  if (ingestion.status === "ready") return ingestion;
  if (ingestion.status === "processing") {
    // Reclaim only by issuing a fresh conditional claim; never reuse its token.
    return markProcessing(db, { id: ingestion.id, profileId });
  }
  try {
    if (ingestion.status === "pending_upload" || ingestion.status === "failed") {
      ingestion = await markUploaded(db, { id: ingestion.id, profileId });
    }
    if (ingestion.status === "uploaded") {
      return await markProcessing(db, { id: ingestion.id, profileId });
    }
  } catch (cause) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Activity file ingestion is already being processed",
      cause,
    });
  }
  throw new TRPCError({ code: "CONFLICT", message: "Activity file ingestion cannot be claimed" });
}

async function markManualIngestionFailed(
  db: DbClient,
  deps: ProcessManualActivityFileDependencies,
  input: { ingestionId: string; profileId: string; claimToken?: string; error: unknown },
) {
  if (!input.claimToken) return;
  try {
    const failure = safeFailure(input.error);
    await markFailed(db, {
      id: input.ingestionId,
      profileId: input.profileId,
      claimToken: input.claimToken,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
  } catch (markError) {
    deps.logger.error("Failed to mark manual activity ingestion failed", {
      error: errorMessage(markError),
    });
  }
}

/** Converges manual staging uploads through the shared ingestion state machine and canonical writer. */
export async function processManualActivityFile(
  db: DbClient,
  input: ProcessManualActivityFileInput,
  deps: ProcessManualActivityFileDependencies,
): Promise<{ activity: ActivityRow; ingestion: ActivityFileIngestionRow }> {
  const stored = await deps.readStoredActivityFile({
    activityFilePath: input.activityFilePath,
    removeOnParseFailure: false,
  });
  const sha256 = digest(stored.data);
  const operationKey = `manual_import:${sha256}`;
  const activityId = manualImportActivityId(input.profileId, sha256);
  const ingestion = await createActivityFileIngestion(db, {
    activityId: null,
    profileId: input.profileId,
    source: "manual_import",
    operationKey,
    filePath: input.activityFilePath,
    fileSize: stored.activityFile.size ?? stored.data.byteLength,
    fileType: input.fileType,
  });

  if (ingestion.status === "ready") {
    if (!ingestion.activity_id)
      throw new Error("Ready activity file ingestion is missing activity identity");
    const activity = await loadOwnedActivity(db, input.profileId, ingestion.activity_id);
    if (!activity) throw new Error("Ready activity file ingestion activity was not found");
    await cleanupActivityArtifactStaging(deps.storage, {
      bucket: "activity-files",
      stagingPath: input.activityFilePath,
      path: `artifacts/sha256/${input.profileId}/${sha256}`,
    });
    return { activity, ingestion };
  }

  let claimToken: string | undefined;
  try {
    const claimed = await claimManualIngestion(db, ingestion, input.profileId);
    claimToken = claimed.claim_token ?? undefined;
    if (!claimToken) {
      throw new TRPCError({ code: "CONFLICT", message: "Activity file ingestion claim was lost" });
    }
    const promoted = await promoteActivityArtifact(deps.storage, {
      profileId: input.profileId,
      bucket: "activity-files",
      stagingPath: input.activityFilePath,
      bytes: stored.data,
      format: input.fileType,
      ...(stored.activityFile.type === undefined ? {} : { mediaType: stored.activityFile.type }),
    });
    const parsedData = deps.decodeActivityFile({
      data: stored.data,
      activityFilePath: input.activityFilePath,
      fileType: input.fileType,
    });
    const artifactId = activityArtifactId(input.profileId, promoted.sha256, promoted.byteSize);
    const analysis = await analyzeParsedActivityFile(db, {
      profileId: input.profileId,
      activityId,
      parsedData,
      artifactId,
    });
    const contentVisibility =
      input.contentVisibility ??
      (input.isPrivate === undefined
        ? await deps.getProfileDefaultContentVisibility(db, input.profileId)
        : input.isPrivate
          ? "private"
          : "followers");
    await submitActivity(db, {
      requestedActivityId: activityId,
      profileId: input.profileId,
      name: input.name,
      notes: input.notes || null,
      isPrivate: contentVisibility === "private",
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
      normalizedPower: analysis.summaryValues.normalized_power,
      avgCadence: analysis.summaryValues.avg_cadence,
      maxCadence: analysis.summaryValues.max_cadence,
      avgSpeedMps: analysis.summaryValues.avg_speed_mps,
      maxSpeedMps: analysis.summaryValues.max_speed_mps,
      normalizedSpeedMps: analysis.summaryValues.normalized_speed_mps,
      normalizedGradedSpeedMps: analysis.summaryValues.normalized_graded_speed_mps,
      efficiencyFactor: analysis.summaryValues.efficiency_factor,
      aerobicDecoupling: analysis.summaryValues.aerobic_decoupling,
      avgTemperature: analysis.summaryValues.avg_temperature,
      deviceManufacturer: parsedData.metadata.manufacturer,
      deviceProduct: parsedData.metadata.product,
      laps: parsedData.laps ?? null,
      mapBounds: analysis.geometry.mapBounds,
      polyline: analysis.geometry.polyline,
      analysis: {
        efforts: analysis.effortsToInsert,
        detectedLTHR: analysis.detectedLTHR,
        activityCompletedAt: analysis.activityCompletedAt,
        ingestion: {
          source: "manual_import",
          operationKey,
          claimToken,
          artifact: { ...promoted, originalName: input.originalName ?? null },
        },
      },
      segmentSet: analysis.segmentSet,
    });
    const activity = await loadOwnedActivity(db, input.profileId, activityId);
    if (!activity) throw new Error("Failed to load created activity record");
    const ready =
      (await db.query.activityFileIngestions.findFirst({
        where: and(
          eq(activityFileIngestions.profile_id, input.profileId),
          eq(activityFileIngestions.operation_key, operationKey),
        ),
      })) ?? claimed;
    await cleanupActivityArtifactStaging(deps.storage, promoted);
    return { activity, ingestion: ready };
  } catch (error) {
    deps.logger.error("Manual activity file processing failed", { error: errorMessage(error) });
    const claimLost = error instanceof ActivityFileIngestionClaimLostError;
    if (!(claimLost || (isTrpcError(error) && error.code === "CONFLICT"))) {
      await markManualIngestionFailed(db, deps, {
        ingestionId: ingestion.id,
        profileId: input.profileId,
        ...(claimToken === undefined ? {} : { claimToken }),
        error,
      });
    }
    if (claimLost || (isTrpcError(error) && error.code === "CONFLICT"))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Activity file ingestion is already being processed",
      });
    if (isTrpcError(error) && error.code === "BAD_REQUEST")
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to parse activity file" });
    if (isTrpcError(error) && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Activity file processing failed",
    });
  }
}
