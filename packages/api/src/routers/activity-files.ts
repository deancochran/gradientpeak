/**
 * Activity File Operations Router
 *
 * Handles activity file upload, processing, and management operations.
 */

import { randomUUID } from "node:crypto";
import {
  type ActivityCalibrationQuality,
  type ActivityStreamThresholdIdentity,
  activityStreamAnalysisSchema,
  analyzeActivityStreams,
  canonicalSportSchema,
  contentVisibilitySchema,
} from "@repo/core";
import {
  type ActivityFileType,
  inferActivityFileType,
  parseActivityFile,
} from "@repo/core/server/activity-files";
import { activities, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { analyzeParsedActivityFile } from "../application/activity-file-ingestion/analyze-parsed-activity-file";
import { persistExistingActivityFileEnrichment } from "../application/activity-file-ingestion/persist-existing-activity-file-enrichment";
import { persistNewActivityFileImport } from "../application/activity-file-ingestion/persist-new-activity-file-import";
import { processUploadedActivityFile } from "../application/activity-file-ingestion/process-uploaded-activity-file";
import { calculateActivityFileStreamDerivedMetrics } from "../application/activity-file-ingestion/stream-derived-calculations";
import {
  buildActivityGeometry,
  collectActivityFileStreamMetadata,
} from "../application/activity-file-ingestion/stream-metadata";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories/drizzle-activity-analysis-repository";
import { resolveActivityContextAsOf } from "../lib/activity-analysis/context";
import { logger } from "../lib/logger";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { fetchActivityTemperature } from "../utils/weather";

const storageService = getApiStorageService();

const ACTIVITY_FILE_BUCKET = "activity-files";
const ACTIVITY_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const ACTIVITY_FILE_BUCKET_SIZE_LIMIT = "50MB";
const ACTIVITY_FILE_TYPES = [".fit", ".gpx", ".tcx"];

const ACTIVITY_FILE_NAME_PATTERN = /^[^/\\\0]+$/;

function toStreamThresholdIdentity(
  quality: ActivityCalibrationQuality | null | undefined,
): ActivityStreamThresholdIdentity | null {
  if (!quality) return null;
  return {
    source: quality.source,
    observed_at: quality.observed_at,
    confidence: quality.confidence,
    stale: quality.stale,
    estimate: quality.estimate,
    calculation_version: quality.calculation_version ?? null,
  };
}

const activityFileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name is too long")
  .refine((value) => ACTIVITY_FILE_NAME_PATTERN.test(value), {
    message: "File name must not include path separators or null bytes",
  })
  .refine((value) => ACTIVITY_FILE_TYPES.some((ext) => value.toLowerCase().endsWith(ext)), {
    message: `File type must be one of: ${ACTIVITY_FILE_TYPES.join(", ")}`,
  });

const activityStoragePathSchema = z
  .string()
  .trim()
  .min(1, "File path is required")
  .refine((value) => !value.startsWith("/") && !value.includes(".."), {
    message: "File path must be a relative storage path",
  });

const blobLikeSchema = z
  .object({
    size: z.number().finite().nonnegative(),
    type: z.string().optional(),
    arrayBuffer: z.custom<() => Promise<ArrayBuffer>>((value) => typeof value === "function", {
      message: "Downloaded file is missing arrayBuffer()",
    }),
  })
  .passthrough();

// Activity file parser output is a compatibility boundary. Keep passthrough so newly
// emitted parser fields do not break uploads while required fields stay typed.
const activityFileParserRecordCompatibilitySchema = z
  .object({
    timestamp: z.date().optional(),
    power: z.number().finite().optional(),
    heartRate: z.number().finite().optional(),
    cadence: z.number().finite().optional(),
    altitude: z.number().finite().optional(),
    speed: z.number().finite().optional(),
    temperature: z.number().finite().optional(),
    positionLat: z.number().finite().optional(),
    positionLong: z.number().finite().optional(),
  })
  .passthrough();

const activityFileParserSummaryCompatibilitySchema = z
  .object({
    totalTime: z.number().finite(),
    totalDistance: z.number().finite(),
    calories: z.number().finite().optional(),
    totalAscent: z.number().finite().optional(),
    avgHeartRate: z.number().finite().optional(),
    maxHeartRate: z.number().finite().optional(),
    avgPower: z.number().finite().optional(),
    maxPower: z.number().finite().optional(),
    avgCadence: z.number().finite().optional(),
    maxCadence: z.number().finite().optional(),
    avgSpeed: z.number().finite().optional(),
    maxSpeed: z.number().finite().optional(),
  })
  .passthrough();

const parsedActivityFileCompatibilitySchema = z
  .object({
    metadata: z
      .object({
        type: z.string().trim().min(1),
        startTime: z.date(),
      })
      .passthrough(),
    summary: activityFileParserSummaryCompatibilitySchema,
    records: z.array(activityFileParserRecordCompatibilitySchema),
    laps: z.array(z.unknown()).optional().default([]),
    lengths: z.array(z.unknown()).optional().default([]),
  })
  .passthrough();

const getStreamsOutputSchema = z
  .object({
    records: z.array(activityFileParserRecordCompatibilitySchema),
    laps: z.array(z.unknown()),
    lengths: z.array(z.unknown()),
    summary: activityFileParserSummaryCompatibilitySchema,
    analysis: activityStreamAnalysisSchema,
  })
  .strict();

const signedUploadUrlDataSchema = z.object({
  signedUrl: z.string().url(),
  token: z.string().min(1),
  path: z.string().min(1),
});

const signedDownloadUrlDataSchema = z
  .object({
    signedUrl: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .passthrough();

async function ensureActivityFilesBucketExists() {
  const { error } = await storageService.storage.createBucket(ACTIVITY_FILE_BUCKET, {
    public: false,
    fileSizeLimit: ACTIVITY_FILE_BUCKET_SIZE_LIMIT,
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to ensure activity files bucket: ${error.message}`,
    });
  }
}

const manualHistoricalImportProvenanceSchema = z.object({
  import_source: z.literal("manual_historical"),
  import_file_type: z.enum(["fit", "gpx", "tcx"]),
  import_original_file_name: z.string().trim().min(1, "Original file name is required"),
});

const processActivityFileInput = z
  .object({
    activityFilePath: activityStoragePathSchema,
    name: z.string().trim().min(1, "Activity name is required"),
    notes: z.string().trim().optional(),
    activityType: z.string().trim().min(1, "Activity type is required"),
    is_private: z.boolean().optional(),
    content_visibility: contentVisibilitySchema.optional(),
    importProvenance: manualHistoricalImportProvenanceSchema.optional(),
  })
  .strict();

const markUploadedAndProcessInput = z
  .object({
    ingestionId: z.string().uuid(),
    activityId: z.string().uuid(),
    activityFilePath: activityStoragePathSchema,
    fileSize: z.number().int().nonnegative().optional(),
    fileType: z.enum(["fit", "gpx", "tcx"]).optional(),
  })
  .strict();

async function getProfileDefaultContentVisibility(
  db: ReturnType<typeof getRequiredDb>,
  profileId: string,
) {
  let profile: { defaultContentVisibility: "private" | "followers" | "public" } | undefined;
  try {
    [profile] = await db
      .select({ defaultContentVisibility: profiles.default_content_visibility })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
  } catch {
    if (process.env.NODE_ENV === "test") return "private";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load profile defaults",
    });
  }

  return profile?.defaultContentVisibility ?? "private";
}

type DbClient = ReturnType<typeof getRequiredDb>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function throwUnauthorizedActivityFileAccess(): never {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "User not authenticated",
  });
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
    };
  }

  return {
    errorMessage: undefined,
    errorStack: undefined,
    errorName: undefined,
  };
}

function isOwnedActivityFilePath(userId: string, filePath: string): boolean {
  return filePath.startsWith(`${userId}/`) || filePath.startsWith(`activities/${userId}/`);
}

type BlobLike = Blob & { arrayBuffer: () => Promise<ArrayBuffer> };

function requireBlobLike(blob: unknown): BlobLike {
  return blobLikeSchema.parse(blob) && (blob as BlobLike);
}

async function toBufferFromBlobLike(blob: BlobLike): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer.call(blob);
  return Buffer.from(arrayBuffer);
}

async function canAccessActivityStreams(
  db: DbClient,
  activityId: string,
  userId: string,
): Promise<{ activityFilePath: string | null; activityType: string }> {
  const [activity] = await db
    .select({
      activity_file_path: activities.activity_file_path,
      profile_id: activities.profile_id,
      is_private: activities.is_private,
      type: activities.type,
    })
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  }

  if (activity.profile_id === userId) {
    return {
      activityFilePath: activity.activity_file_path ?? null,
      activityType: activity.type,
    };
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Access denied: Detailed activity streams are only available to the activity owner",
  });
}

function serializeActivityDates<T extends Record<string, unknown>>(activity: T): T {
  const copy = { ...activity } as Record<string, unknown>;

  for (const key of ["created_at", "updated_at", "started_at", "finished_at"]) {
    const value = copy[key];
    if (value instanceof Date) {
      copy[key] = value.toISOString();
    }
  }

  return copy as T;
}

function getActivityFileTypeFromPath(filePath: string): ActivityFileType {
  return inferActivityFileType(filePath);
}

type ParsedActivityFile = z.infer<typeof parsedActivityFileCompatibilitySchema>;

async function parseStoredActivityFile(input: {
  activityFilePath: string;
  fileType?: ActivityFileType;
  removeOnParseFailure: boolean;
}) {
  const { data: activityFile, error: downloadError } = await storageService.storage
    .from(ACTIVITY_FILE_BUCKET)
    .download(input.activityFilePath);

  if (downloadError || !activityFile) {
    if (input.removeOnParseFailure) {
      await storageService.storage.from(ACTIVITY_FILE_BUCKET).remove([input.activityFilePath]);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to download activity file from storage: ${downloadError?.message || "Unknown error"}`,
      cause: downloadError,
    });
  }

  const activityFileType = input.fileType ?? getActivityFileTypeFromPath(input.activityFilePath);

  try {
    const activityFileBlob = requireBlobLike(activityFile);
    const buffer = await toBufferFromBlobLike(activityFileBlob);
    const parsedData = parsedActivityFileCompatibilitySchema.parse(
      parseActivityFile({
        data: buffer,
        fileName: input.activityFilePath,
        fileType: activityFileType,
      }),
    );

    return { activityFile, activityFileType, parsedData };
  } catch (parseError) {
    if (input.removeOnParseFailure) {
      await storageService.storage.from(ACTIVITY_FILE_BUCKET).remove([input.activityFilePath]);
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Failed to parse activity file: ${getErrorMessage(parseError)}`,
      cause: parseError,
    });
  }
}

async function upsertExistingActivityFileEnrichment(
  db: DbClient,
  input: {
    activityId: string;
    profileId: string;
    activityType: string;
    activityFilePath: string;
    activityFileSize: number | null;
    activityFileType: ActivityFileType;
    parsedData: ParsedActivityFile;
  },
) {
  const enrichment = await analyzeParsedActivityFile(db, {
    profileId: input.profileId,
    activityId: input.activityId,
    activityType: input.activityType,
    parsedData: input.parsedData,
  });

  await persistExistingActivityFileEnrichment(db, {
    activityId: input.activityId,
    profileId: input.profileId,
    activityFilePath: input.activityFilePath,
    activityFileSize: input.activityFileSize,
    activityFileType: input.activityFileType,
    activityType: input.activityType,
    parsedData: input.parsedData,
    enrichment,
  });
}

export const activityFilesRouter = createTRPCRouter({
  /**
   * Get a signed URL for uploading an activity file
   * This allows the client to upload directly to storage without passing the session token
   */
  getSignedUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: activityFileNameSchema,
        fileSize: z.number().int().positive().max(ACTIVITY_FILE_SIZE_LIMIT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { fileName } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      try {
        // Validate file extension
        if (!fileName.toLowerCase().endsWith(".fit")) {
          inferActivityFileType(fileName);
        }

        // Generate a unique path: activities/userId/pending_timestamp/filename
        // We use a temporary uploads folder
        const timestamp = Date.now();
        const filePath = `activities/${userId}/uploads/${timestamp}_${fileName}`;

        await ensureActivityFilesBucketExists();

        // Create signed upload URL
        const { data, error } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .createSignedUploadUrl(filePath);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create signed upload URL: ${error.message}`,
            cause: error,
          });
        }

        const signedUploadData = signedUploadUrlDataSchema.parse(data);

        return {
          signedUrl: signedUploadData.signedUrl,
          token: signedUploadData.token,
          path: signedUploadData.path,
          filePath: filePath, // Return the full path so the client knows where it went
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Get signed upload URL error", getErrorDetails(error));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate upload URL: ${getErrorMessage(error)}`,
          cause: error,
        });
      }
    }),

  /**
   * Process an activity file that has been uploaded to storage
   */
  processActivityFile: protectedProcedure
    .input(processActivityFileInput)
    .mutation(async ({ ctx, input }) => {
      const {
        activityFilePath,
        name,
        notes,
        activityType,
        is_private,
        content_visibility,
        importProvenance,
      } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      try {
        logger.debug("[processActivityFile] Starting activity file processing", {
          activityFilePath,
          userId,
          name,
          activityType,
        });

        if (!isOwnedActivityFilePath(userId, activityFilePath)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied: You can only process your own activity files",
          });
        }

        // ========================================================================
        // T-302, T-303: Download activity file from storage
        // ========================================================================
        logger.debug("[processActivityFile] Downloading activity file from storage", {
          activityFilePath,
        });

        const { data: activityFile, error: downloadError } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .download(activityFilePath);

        if (downloadError || !activityFile) {
          // Log error and notify admins
          logger.error("[processActivityFile] Failed to download activity file", {
            errorMessage: downloadError?.message,
            activityFilePath,
            userId,
          });
          // TODO: Send notification to admin/monitoring system

          // Remove the invalid activity file from storage
          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to download activity file from storage: ${downloadError?.message || "Unknown error"}`,
            cause: downloadError,
          });
        }

        logger.debug("[processActivityFile] Activity file downloaded successfully", {
          size: activityFile.size,
          type: activityFile.type,
        });

        // ========================================================================
        // T-304, T-305: Parse activity file using @repo/core
        // ========================================================================
        let parsedData: z.infer<typeof parsedActivityFileCompatibilitySchema>;
        const activityFileType = getActivityFileTypeFromPath(activityFilePath);
        try {
          logger.debug("[processActivityFile] Parsing activity file", {
            activityFileType,
          });
          const activityFileBlob = requireBlobLike(activityFile);
          const buffer = await toBufferFromBlobLike(activityFileBlob);
          parsedData = parsedActivityFileCompatibilitySchema.parse(
            parseActivityFile({
              data: buffer,
              fileName: activityFilePath,
              fileType: activityFileType,
            }),
          );
          logger.debug("[processActivityFile] Activity file parsed successfully", {
            sport: parsedData.metadata.type,
            duration: parsedData.summary.totalTime,
            distance: parsedData.summary.totalDistance,
            recordCount: parsedData.records.length,
            lapCount: parsedData.laps?.length,
          });
        } catch (parseError) {
          // Log error and notify admins
          logger.error("[processActivityFile] Failed to parse activity file", {
            ...getErrorDetails(parseError),
            activityFilePath,
            fileSize: activityFile.size,
          });
          // TODO: Send notification to admin/monitoring system

          // Remove the invalid activity file from storage
          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to parse activity file: ${getErrorMessage(parseError)}`,
          });
        }

        const { summary, records } = parsedData;
        const geometry = buildActivityGeometry(records);

        // ========================================================================
        // T-306: Extract activity summary
        // ========================================================================
        const startTime = parsedData.metadata.startTime;
        const duration = summary.totalTime;

        logger.debug("[processActivityFile] Activity summary extracted", {
          startTime: startTime.toISOString(),
          duration,
          distance: summary.totalDistance,
          avgHeartRate: summary.avgHeartRate,
          avgPower: summary.avgPower,
        });

        if (duration <= 0) {
          logger.error("[processActivityFile] Invalid activity file duration", {
            duration,
            activityFilePath,
          });
          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Activity has zero duration and cannot be processed.",
          });
        }

        const distance = summary.totalDistance || 0;
        const calories = summary.calories || 0;
        const elevationGain = summary.totalAscent || 0;
        const avgHeartRate = summary.avgHeartRate;
        const maxHeartRate = summary.maxHeartRate;
        const avgPower = summary.avgPower;
        const maxPower = summary.maxPower;
        const avgCadence = summary.avgCadence;
        const maxCadence = summary.maxCadence;

        // ========================================================================
        // T-307: Extract streams for calculations
        // ========================================================================
        const {
          powerStream,
          powerTimestamps,
          hrStream,
          hrTimestamps,
          timestamps,
          altitudeStream,
          altitudeTimestamps,
          speedStream,
          speedTimestamps,
          coords,
        } = collectActivityFileStreamMetadata(records);

        // ========================================================================
        // Calculate Polyline and Bounds (commented out until migration is applied)
        // ========================================================================
        // let polyline: string | null = null;
        // let mapBounds: any = null;
        //
        // if (coords.length > 0) {
        //   polyline = encodePolyline(coords);
        //   const bounds = calculateBounds(coords);
        //   mapBounds = {
        //     min_lat: bounds.minLat,
        //     max_lat: bounds.maxLat,
        //     min_lng: bounds.minLng,
        //     max_lng: bounds.maxLng,
        //   };
        // }

        // ========================================================================
        // T-308: Fetch User Performance Metrics (with Cold Start Defaults)
        // ========================================================================

        // REFACTOR: We no longer use profile_performance_metric_logs.
        // Instead, we should use the new analytics router logic or just defaults for now.
        // For TSS calculation, we need FTP and LTHR.

        const activityCompletedAt = new Date(startTime.getTime() + duration * 1000);
        const activityCompletedAtIso = activityCompletedAt.toISOString();

        const {
          normalizedPower,
          normalizedSpeed,
          normalizedGradedSpeed,
          efficiencyFactor,
          aerobicDecoupling,
        } = calculateActivityFileStreamDerivedMetrics({
          activityType,
          distance,
          duration,
          avgHeartRate,
          streamMetadata: {
            powerStream,
            powerTimestamps,
            hrStream,
            hrTimestamps,
            timestamps,
            altitudeStream,
            altitudeTimestamps,
            speedStream,
            speedTimestamps,
          },
        });

        // ========================================================================
        // T-5.3: Fetch Weather
        // ========================================================================
        let avgTemperature: number | null = null;

        // Calculate average temperature from records if available
        let tempSum = 0;
        let tempCount = 0;
        for (const record of records) {
          if (record.temperature !== undefined) {
            tempSum += record.temperature;
            tempCount++;
          }
        }

        if (tempCount > 0) {
          avgTemperature = tempSum / tempCount;
        }

        if (avgTemperature === null) {
          // Fetch from API if we have coordinates
          if (coords.length > 0) {
            const startCoord = coords[0];
            if (startCoord) {
              const temp = await fetchActivityTemperature(
                startCoord.latitude,
                startCoord.longitude,
                startTime,
              );
              if (temp !== null) {
                avgTemperature = temp;
              }
            }
          }
        }

        // ========================================================================
        // T-313, T-314: Create activity record
        // ========================================================================
        const endTime = new Date(activityCompletedAtIso);
        const requestedActivityId = randomUUID();
        const artifactAnalysis = await analyzeParsedActivityFile(db, {
          profileId: userId,
          activityId: requestedActivityId,
          activityType,
          parsedData,
        });

        logger.debug("[processActivityFile] Attempting to insert activity record", {
          profile_id: userId,
          name,
          type: activityType,
          duration: Math.round(duration),
          distance: Math.round(distance),
          activity_file_path: activityFilePath,
        });

        const contentVisibility =
          content_visibility ??
          (is_private === undefined
            ? await getProfileDefaultContentVisibility(db, userId)
            : is_private
              ? "private"
              : "followers");

        let createdActivity: Awaited<ReturnType<typeof persistNewActivityFileImport>>;
        try {
          createdActivity = await persistNewActivityFileImport(db, {
            requestedActivityId,
            profileId: userId,
            name,
            notes: notes || null,
            activityType,
            isPrivate: contentVisibility === "private",
            contentVisibility,
            startedAt: startTime,
            finishedAt: endTime,
            durationSeconds: Math.round(duration),
            movingSeconds: Math.round(duration),
            distanceMeters: Math.round(distance),
            activityFilePath,
            activityFileSize: activityFile.size,
            importSource: importProvenance?.import_source ?? null,
            importFileType: importProvenance?.import_file_type ?? activityFileType,
            importOriginalFileName: importProvenance?.import_original_file_name ?? null,
            calories: calories ? Math.round(calories) : null,
            elevationGainMeters: elevationGain ? Math.round(elevationGain) : null,
            avgHeartRate: avgHeartRate ? Math.round(avgHeartRate) : null,
            maxHeartRate: maxHeartRate ? Math.round(maxHeartRate) : null,
            avgPower: avgPower ? Math.round(avgPower) : null,
            maxPower: maxPower ? Math.round(maxPower) : null,
            normalizedPower: normalizedPower ? Math.round(normalizedPower) : null,
            avgCadence: avgCadence ? Math.round(avgCadence) : null,
            maxCadence: maxCadence ? Math.round(maxCadence) : null,
            avgSpeedMps: summary.avgSpeed ?? (distance && duration ? distance / duration : null),
            maxSpeedMps: summary.maxSpeed ?? null,
            normalizedSpeedMps: normalizedSpeed || null,
            normalizedGradedSpeedMps: normalizedGradedSpeed || null,
            efficiencyFactor: efficiencyFactor || null,
            aerobicDecoupling: aerobicDecoupling || null,
            avgTemperature: avgTemperature ? Math.round(avgTemperature) : null,
            deviceManufacturer: parsedData.metadata.manufacturer,
            deviceProduct: parsedData.metadata.product,
            laps: parsedData.laps ?? null,
            mapBounds: geometry.mapBounds,
            polyline: geometry.polyline,
            analysis: {
              efforts: artifactAnalysis.effortsToInsert,
              detectedLTHR: artifactAnalysis.detectedLTHR,
              activityCompletedAt: artifactAnalysis.activityCompletedAt,
              ingestion: {
                source: "manual_import",
                fileType: activityFileType,
              },
            },
          });
        } catch (insertError) {
          // T-316: Cleanup uploaded file on failure
          logger.error("[processActivityFile] Failed to insert activity record", {
            errorMessage: getErrorMessage(insertError),
            activityData: {
              profile_id: userId,
              name,
              type: activityType,
              started_at: startTime.toISOString(),
              finished_at: endTime.toISOString(),
              duration_seconds: Math.round(duration),
              distance_meters: Math.round(distance),
            },
          });

          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create activity record: ${getErrorMessage(insertError)}`,
            cause: insertError,
          });
        }

        if (!createdActivity) {
          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to load created activity record",
          });
        }

        logger.debug("[processActivityFile] Activity record created successfully", {
          activityId: createdActivity.id,
        });

        return {
          success: true,
          activity: serializeActivityDates(createdActivity),
        };
      } catch (error) {
        // T-316: Handle errors with proper TRPCError types
        if (error instanceof TRPCError) {
          logger.error("[processActivityFile] TRPCError caught", {
            code: error.code,
            message: error.message,
          });
          throw error;
        }

        // Log unexpected errors with full context
        logger.error("[processActivityFile] Unexpected error", {
          ...getErrorDetails(error),
          activityFilePath,
          userId,
          name,
          activityType,
        });

        // Cleanup file on unexpected errors
        try {
          await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([activityFilePath]);
          logger.debug("[processActivityFile] Cleaned up activity file after error", {
            activityFilePath,
          });
        } catch (cleanupError) {
          logger.error(
            "[processActivityFile] Failed to cleanup file after error",
            getErrorDetails(cleanupError),
          );
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Activity file processing failed: ${getErrorMessage(error)}`,
          cause: error,
        });
      }
    }),

  markUploadedAndProcess: protectedProcedure
    .input(markUploadedAndProcessInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      if (!isOwnedActivityFilePath(userId, input.activityFilePath)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: You can only process your own activity files",
        });
      }

      const activityFileType =
        input.fileType ?? getActivityFileTypeFromPath(input.activityFilePath);

      const result = await processUploadedActivityFile(
        db,
        {
          userId,
          ingestionId: input.ingestionId,
          activityId: input.activityId,
          activityFilePath: input.activityFilePath,
          fileSize: input.fileSize,
          fileType: activityFileType,
        },
        {
          parseStoredActivityFile,
          upsertExistingActivityFileEnrichment,
          logger,
        },
      );

      return {
        success: true,
        activity: serializeActivityDates(result.activity),
        ingestion: {
          id: result.ingestion.id,
          status: result.ingestion.status,
          activityId: result.ingestion.activity_id,
        },
      };
    }),

  /**
   * Get activity file download URL (presigned)
   */
  getActivityFileUrl: protectedProcedure
    .input(
      z.object({
        filePath: activityStoragePathSchema,
        expiresIn: z.number().int().min(60).max(3600).default(3600), // 1 hour default
      }),
    )
    .query(async ({ ctx, input }) => {
      const { filePath, expiresIn } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        // Verify user owns this file (check file path starts with user ID)
        if (!isOwnedActivityFilePath(userId, filePath)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied: You can only access your own files",
          });
        }

        // Generate signed URL
        const { data, error } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .createSignedUrl(filePath, expiresIn);

        if (error) {
          throw new Error(`Failed to generate download URL: ${error.message}`);
        }

        return signedDownloadUrlDataSchema.parse(data);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Get activity file URL error", getErrorDetails(error));
        throw new Error(`Failed to generate download URL: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Get parsed streams from an activity file
   * Used for visualizing activity data (charts, maps) without storing streams in DB
   */
  getStreams: protectedProcedure
    .input(
      z.object({
        activityId: z.string().uuid(),
      }),
    )
    .output(getStreamsOutputSchema)
    .query(async ({ ctx, input }) => {
      const { activityId } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        const access = await canAccessActivityStreams(db, activityId, userId);

        if (!access.activityFilePath) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity does not have an associated activity file",
          });
        }

        // Download activity file from storage
        const { data: activityFile, error: downloadError } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .download(access.activityFilePath);

        if (downloadError || !activityFile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activity file not found",
            cause: downloadError,
          });
        }

        // Parse activity file
        const activityFileBlob = requireBlobLike(activityFile);
        const buffer = await toBufferFromBlobLike(activityFileBlob);
        const parsedData = parsedActivityFileCompatibilitySchema.parse(
          parseActivityFile({
            data: buffer,
            fileName: access.activityFilePath,
          }),
        );

        const sport = canonicalSportSchema.parse(access.activityType);
        const context = await resolveActivityContextAsOf({
          store: createActivityAnalysisStore(db),
          profileId: userId,
          activityTimestamp: parsedData.metadata.startTime,
          activityId,
          evidenceScope: "thresholds",
        });
        const sportLthr =
          context.profileMetrics.lthr_by_sport?.[sport] ?? context.profileMetrics.lthr;
        const analysis = analyzeActivityStreams({
          records: parsedData.records,
          sport,
          thresholds: {
            lthrBySport: { [sport]: sportLthr },
            ftpWatts: context.profileMetrics.ftp,
            runThresholdSpeedMps: context.profileMetrics.threshold_speed_mps,
            swimThresholdSpeedMps: context.profileMetrics.swim_threshold_speed_mps,
            identities: {
              lthrBySport: {
                [sport]: toStreamThresholdIdentity(
                  context.calibrationQuality?.lthrBySport?.[sport] ??
                    context.calibrationQuality?.lthr,
                ),
              },
              ftpWatts: toStreamThresholdIdentity(context.calibrationQuality?.ftp),
              runThresholdSpeedMps: toStreamThresholdIdentity(
                context.calibrationQuality?.runThreshold,
              ),
              swimThresholdSpeedMps: toStreamThresholdIdentity(
                context.calibrationQuality?.swimThreshold,
              ),
            },
          },
        });

        // Extract streams in a format suitable for frontend charting
        // We return the raw records, the frontend can map them to arrays
        return {
          records: parsedData.records,
          laps: parsedData.laps,
          lengths: parsedData.lengths,
          summary: parsedData.summary,
          analysis,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Get streams error", getErrorDetails(error));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to retrieve streams: ${getErrorMessage(error)}`,
        });
      }
    }),
});
