/**
 * Activity File Operations Router
 *
 * Handles activity file upload, processing, and management operations.
 */

import { randomUUID } from "node:crypto";
import {
  type ActivityFileType,
  calculateBounds,
  encodePolyline,
  inferActivityFileType,
  parseActivityFile,
  simplifyCoordinates,
} from "@repo/core";
import {
  calculateBestEfforts,
  calculateDecouplingFromStreams,
  calculateEfficiencyFactor,
  calculateGradedSpeedStream,
  calculateNGP,
  calculateNormalizedPower,
  calculateNormalizedSpeed,
  detectLTHR,
  estimateVO2Max,
} from "@repo/core/calculations";
import {
  activities,
  activityEfforts,
  activityGeometry,
  activityImports,
  activityLaps,
  activitySummaries,
  profileMetrics,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { logger } from "../lib/logger";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { markProfileAnalysisDirty } from "../utils/profile-estimation-state";
import { fetchActivityTemperature } from "../utils/weather";

const storageService = getApiStorageService();

const ACTIVITY_FILE_BUCKET = "activity-files";
const ACTIVITY_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const ACTIVITY_FILE_BUCKET_SIZE_LIMIT = "50MB";
const ACTIVITY_FILE_TYPES = [".fit", ".gpx", ".tcx"];

const ACTIVITY_FILE_NAME_PATTERN = /^[^/\\\0]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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

const base64FileDataSchema = z
  .string()
  .min(1, "File data is required")
  .refine((value) => value.length % 4 === 0 && BASE64_PATTERN.test(value), {
    message: "File data must be valid base64",
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

const analyzeActivityFileResponseSchema = z
  .object({
    queued: z.boolean(),
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

const uploadActivityFileInput = z
  .object({
    fileName: activityFileNameSchema,
    fileSize: z
      .number()
      .int("File size must be an integer")
      .positive("File size must be greater than zero")
      .max(
        ACTIVITY_FILE_SIZE_LIMIT,
        `File size must be less than ${ACTIVITY_FILE_SIZE_LIMIT / (1024 * 1024)}MB`,
      ),
    fileType: activityFileNameSchema,
    fileData: base64FileDataSchema,
  })
  .strict();

const analyzeActivityFileInput = z
  .object({
    activityId: z.string().uuid(),
    filePath: activityStoragePathSchema,
    bucketName: z.literal(ACTIVITY_FILE_BUCKET).default(ACTIVITY_FILE_BUCKET),
  })
  .strict();

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
    importProvenance: manualHistoricalImportProvenanceSchema.optional(),
  })
  .strict();

type DbClient = ReturnType<typeof getRequiredDb>;

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

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

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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

async function getLatestProfileMetricValue(
  db: DbClient,
  input: {
    profileId: string;
    metricType: "lthr" | "max_hr" | "resting_hr";
    recordedAtLte: Date;
  },
): Promise<number | null> {
  const row = await db
    .select({ value: profileMetrics.value })
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        eq(profileMetrics.metric_type, input.metricType),
        lte(profileMetrics.recorded_at, input.recordedAtLte),
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return toNumberOrNull(row?.value);
}

async function createActivityRecord(
  db: DbClient,
  input: {
    profileId: string;
    name: string;
    notes: string | null;
    activityType: string;
    isPrivate: boolean;
    startedAt: Date;
    finishedAt: Date;
    durationSeconds: number;
    movingSeconds: number;
    distanceMeters: number;
    activityFilePath: string;
    activityFileSize: number;
    importSource: string | null;
    importFileType: string | null;
    importOriginalFileName: string | null;
    calories: number | null;
    elevationGainMeters: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
    avgPower: number | null;
    maxPower: number | null;
    normalizedPower: number | null;
    avgCadence: number | null;
    maxCadence: number | null;
    avgSpeedMps: number | null;
    maxSpeedMps: number | null;
    normalizedSpeedMps: number | null;
    normalizedGradedSpeedMps: number | null;
    efficiencyFactor: number | null;
    aerobicDecoupling: number | null;
    avgTemperature: number | null;
    deviceManufacturer: string | null;
    deviceProduct: string | null;
    laps: unknown[] | null;
    mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
    polyline: string | null;
  },
) {
  const activityId = randomUUID();

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: input.name,
      notes: input.notes,
      type: input.activityType,
      is_private: input.isPrivate,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(activitySummaries).values({
      activity_id: activityId,
      profile_id: input.profileId,
      duration_seconds: input.durationSeconds,
      moving_seconds: input.movingSeconds,
      distance_meters: input.distanceMeters,
      elevation_gain_meters: input.elevationGainMeters,
      calories: input.calories,
      avg_heart_rate: input.avgHeartRate,
      max_heart_rate: input.maxHeartRate,
      avg_power: input.avgPower,
      max_power: input.maxPower,
      normalized_power: input.normalizedPower,
      avg_cadence: input.avgCadence,
      max_cadence: input.maxCadence,
      avg_speed_mps: input.avgSpeedMps,
      max_speed_mps: input.maxSpeedMps,
      normalized_speed_mps: input.normalizedSpeedMps,
      normalized_graded_speed_mps: input.normalizedGradedSpeedMps,
      efficiency_factor: input.efficiencyFactor,
      aerobic_decoupling: input.aerobicDecoupling,
      avg_temperature: input.avgTemperature,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(activityImports).values({
      activity_id: activityId,
      profile_id: input.profileId,
      activity_file_path: input.activityFilePath,
      activity_file_size: input.activityFileSize,
      import_source: input.importSource,
      import_file_type: input.importFileType,
      import_original_file_name: input.importOriginalFileName,
      device_manufacturer: input.deviceManufacturer,
      device_product: input.deviceProduct,
      created_at: now,
      updated_at: now,
    });

    if (input.mapBounds || input.polyline) {
      await tx.insert(activityGeometry).values({
        activity_id: activityId,
        profile_id: input.profileId,
        map_bounds: input.mapBounds,
        polyline: input.polyline,
        created_at: now,
        updated_at: now,
      });
    }

    if (input.laps) {
      await tx.insert(activityLaps).values(
        input.laps.map((lap, index) => ({
          id: randomUUID(),
          activity_id: activityId,
          profile_id: input.profileId,
          lap_index: index,
          payload: lap,
          created_at: now,
          updated_at: now,
        })),
      );
    }
  });

  return db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });
}

async function canAccessActivityStreams(
  db: DbClient,
  activityId: string,
  userId: string,
): Promise<string | null> {
  const [activity] = await db
    .select({
      activity_file_path: activityImports.activity_file_path,
      profile_id: activities.profile_id,
      is_private: activities.is_private,
    })
    .from(activities)
    .leftJoin(activityImports, eq(activities.id, activityImports.activity_id))
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  }

  if (activity.profile_id === userId) {
    return activity.activity_file_path ?? null;
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

function buildActivityGeometry(records: Array<{ positionLat?: number; positionLong?: number }>) {
  const coords = records
    .filter(
      (record) =>
        record.positionLat !== undefined &&
        record.positionLong !== undefined &&
        Math.abs(record.positionLat) <= 90 &&
        Math.abs(record.positionLong) <= 180 &&
        !(record.positionLat === 0 && record.positionLong === 0),
    )
    .map((record) => ({ latitude: record.positionLat!, longitude: record.positionLong! }));

  if (coords.length === 0) {
    return { mapBounds: null, polyline: null };
  }

  const tolerance = coords.length <= 200 ? 0 : coords.length <= 1000 ? 0.0002 : 0.0005;
  const simplified = simplifyCoordinates(coords, tolerance);

  return {
    mapBounds: calculateBounds(coords),
    polyline: encodePolyline(simplified),
  };
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
      const { fileName, fileSize } = input;
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
      const { activityFilePath, name, notes, activityType, is_private, importProvenance } = input;
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
          logger.debug("[processActivityFile] Parsing activity file", { activityFileType });
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
        const powerStream: number[] = [];
        const hrStream: number[] = [];
        const timestamps: number[] = [];
        const cadenceStream: number[] = [];
        const altitudeStream: number[] = [];
        const speedStream: number[] = [];
        const coords: { latitude: number; longitude: number }[] = [];

        for (const record of records) {
          if (record.timestamp !== undefined) {
            timestamps.push(record.timestamp.getTime() / 1000);
          }
          if (record.power !== undefined) {
            powerStream.push(record.power);
          }
          if (record.heartRate !== undefined) {
            hrStream.push(record.heartRate);
          }
          if (record.cadence !== undefined) {
            cadenceStream.push(record.cadence);
          }
          if (record.altitude !== undefined) {
            altitudeStream.push(record.altitude);
          }
          if (record.speed !== undefined) {
            speedStream.push(record.speed);
          }
          // Collect valid coordinates for polyline
          if (
            record.positionLat !== undefined &&
            record.positionLong !== undefined &&
            Math.abs(record.positionLat) <= 90 &&
            Math.abs(record.positionLong) <= 180 &&
            !(record.positionLat === 0 && record.positionLong === 0)
          ) {
            coords.push({
              latitude: record.positionLat,
              longitude: record.positionLong,
            });
          }
        }

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

        // Cold Start: Default to 170bpm if no LTHR found
        const lthr =
          (await getLatestProfileMetricValue(db, {
            profileId: userId,
            metricType: "lthr",
            recordedAtLte: activityCompletedAt,
          })) ?? 170;

        // Cold Start: Default to 190bpm if no Max HR found
        const _maxHR =
          maxHeartRate ??
          (await getLatestProfileMetricValue(db, {
            profileId: userId,
            metricType: "max_hr",
            recordedAtLte: activityCompletedAt,
          })) ??
          190;

        const restingHR =
          (await getLatestProfileMetricValue(db, {
            profileId: userId,
            metricType: "resting_hr",
            recordedAtLte: activityCompletedAt,
          })) ?? 60;

        let normalizedPower: number | undefined;
        // Preserve activity-local derived metrics that remain durable.
        normalizedPower =
          powerStream.length > 0 ? calculateNormalizedPower(powerStream) : undefined;

        // ========================================================================
        // T-5.1, T-5.2: Calculate Advanced Metrics
        // ========================================================================

        // 1. Normalized Speed (All activities)
        const normalizedSpeed = calculateNormalizedSpeed(distance, duration);

        // 2. Normalized Graded Pace (Run)
        let normalizedGradedSpeed: number | null = null;
        if (activityType === "run" && speedStream.length > 0 && altitudeStream.length > 0) {
          const gradedSpeedStream = calculateGradedSpeedStream(
            speedStream,
            altitudeStream,
            timestamps,
          );
          normalizedGradedSpeed = calculateNGP(gradedSpeedStream);
        }

        // 3. Efficiency Factor (EF)
        // EF = Normalized Power / Avg HR (Bike) or Normalized Graded Speed / Avg HR (Run)
        let efficiencyFactor: number | null = null;
        if (avgHeartRate && avgHeartRate > 0) {
          if (activityType === "bike" && normalizedPower) {
            efficiencyFactor = calculateEfficiencyFactor(normalizedPower, avgHeartRate);
          } else if (activityType === "run" && normalizedGradedSpeed) {
            efficiencyFactor = calculateEfficiencyFactor(normalizedGradedSpeed, avgHeartRate);
          }
        }

        // 4. Aerobic Decoupling (Pa:HR)
        let aerobicDecoupling: number | null = null;
        if (powerStream.length > 0 && hrStream.length > 0) {
          aerobicDecoupling = calculateDecouplingFromStreams(
            powerStream,
            hrStream,
            timestamps,
            calculateNormalizedPower,
          );
        } else if (activityType === "run" && speedStream.length > 0 && hrStream.length > 0) {
          // For run, use graded speed if available, else speed
          const runPowerStream = normalizedGradedSpeed
            ? calculateGradedSpeedStream(speedStream, altitudeStream, timestamps)
            : speedStream;
          aerobicDecoupling = calculateDecouplingFromStreams(
            runPowerStream,
            hrStream,
            timestamps,
            calculateNGP,
          );
        }

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

        logger.debug("[processActivityFile] Attempting to insert activity record", {
          profile_id: userId,
          name,
          type: activityType,
          duration: Math.round(duration),
          distance: Math.round(distance),
          activity_file_path: activityFilePath,
        });

        let createdActivity;
        try {
          createdActivity = await createActivityRecord(db, {
            profileId: userId,
            name,
            notes: notes || null,
            activityType,
            isPrivate: is_private ?? true,
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
            deviceManufacturer: toStringOrNull(parsedData.metadata.manufacturer),
            deviceProduct: toStringOrNull(parsedData.metadata.product),
            laps: parsedData.laps ?? null,
            mapBounds: geometry.mapBounds,
            polyline: geometry.polyline,
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

        await markProfileAnalysisDirty(db, {
          profileId: userId,
          kinds: ["fitness"],
          dirtySince: activityCompletedAtIso,
        });

        // ========================================================================
        // T-5.4, T-5.5, T-5.6: Post-Processing (Best Efforts, Profile Metrics, Notifications)
        // ========================================================================

        // 1. Calculate Best Efforts
        const effortsToInsert: any[] = [];

        // Power Efforts
        if (powerStream.length > 0) {
          const bestPowers = calculateBestEfforts(powerStream, timestamps);
          for (const effort of bestPowers) {
            effortsToInsert.push({
              activity_id: createdActivity.id,
              profile_id: userId,
              activity_category: activityType,
              duration_seconds: effort.duration,
              effort_type: "power",
              value: effort.value,
              unit: "watts",
              start_offset:
                effort.startIndex !== undefined
                  ? Math.round(timestamps[effort.startIndex]! - timestamps[0]!)
                  : null,
              recorded_at: activityCompletedAtIso,
            });
          }
        }

        // Speed/Pace Efforts (Run)
        if (activityType === "run" && speedStream.length > 0) {
          // Use graded speed if available for "effort"
          const streamToUse = normalizedGradedSpeed
            ? calculateGradedSpeedStream(speedStream, altitudeStream, timestamps)
            : speedStream;
          const bestSpeeds = calculateBestEfforts(streamToUse, timestamps);
          for (const effort of bestSpeeds) {
            effortsToInsert.push({
              activity_id: createdActivity.id,
              profile_id: userId,
              activity_category: activityType,
              duration_seconds: effort.duration,
              effort_type: "speed",
              value: effort.value,
              unit: "meters_per_second",
              start_offset:
                effort.startIndex !== undefined
                  ? Math.round(timestamps[effort.startIndex]! - timestamps[0]!)
                  : null,
              recorded_at: activityCompletedAtIso,
            });
          }
        }

        // Bulk insert efforts
        if (effortsToInsert.length > 0) {
          try {
            await db.insert(activityEfforts).values(
              effortsToInsert.map((effort) => ({
                id: randomUUID(),
                created_at: new Date(),
                updated_at: new Date(),
                activity_id: createdActivity.id,
                profile_id: userId,
                recorded_at: new Date(activityCompletedAtIso),
                activity_category:
                  effort.activity_category as typeof activityEfforts.$inferInsert.activity_category,
                effort_type: effort.effort_type,
                duration_seconds: effort.duration_seconds,
                start_offset: effort.start_offset,
                unit: effort.unit,
                value: effort.value,
              })),
            );
            await markProfileAnalysisDirty(db, {
              profileId: userId,
              kinds: ["performance"],
              dirtySince: activityCompletedAtIso,
            });
          } catch (effortsError) {
            logger.error("Failed to insert best efforts", getErrorDetails(effortsError));
          }
        }

        // 2. Detect LTHR
        if (hrStream.length > 0) {
          const detectedLTHR = detectLTHR(hrStream, timestamps);
          if (detectedLTHR && detectedLTHR > lthr) {
            await db.insert(profileMetrics).values({
              id: randomUUID(),
              created_at: new Date(),
              profile_id: userId,
              metric_type: "lthr",
              value: detectedLTHR,
              unit: "bpm",
              recorded_at: new Date(activityCompletedAtIso),
            });
            await markProfileAnalysisDirty(db, {
              profileId: userId,
              kinds: ["metrics"],
              dirtySince: activityCompletedAtIso,
            });
          }
        }

        // 3. Estimate VO2 Max
        if (maxHeartRate && restingHR) {
          void estimateVO2Max(maxHeartRate, restingHR);
        }

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

  /**
   * Upload an activity file to Supabase Storage
   */
  uploadActivityFile: protectedProcedure
    .input(uploadActivityFileInput)
    .mutation(async ({ ctx, input }) => {
      const { fileName, fileSize, fileData, fileType } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        // Validate file type again (double security)
        if (fileType.toLowerCase() !== fileName.toLowerCase()) {
          throw new Error("File type must match file name");
        }

        inferActivityFileType(fileName);

        // Convert base64 to buffer
        const binaryString = atob(fileData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create unique file path
        const filePath = `${userId}/${Date.now()}-${fileName}`;

        await ensureActivityFilesBucketExists();

        // Upload to storage
        const { error } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .upload(filePath, bytes, {
            contentType: "application/octet-stream",
            upsert: false,
          });

        if (error) {
          throw new Error(`Failed to upload activity file: ${error.message}`);
        }

        return {
          success: true,
          filePath,
          size: fileSize,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Activity file upload error", getErrorDetails(error));
        throw new Error(`Activity file upload failed: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Trigger activity file analysis via edge function
   */
  analyzeActivityFile: protectedProcedure
    .input(analyzeActivityFileInput)
    .mutation(async ({ ctx, input }) => {
      const { activityId, filePath, bucketName } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        const { data, error } = await supabase.functions.invoke("analyze-activity-file", {
          body: {
            activityId,
            filePath,
            bucketName,
          },
        });

        if (error) {
          throw new Error(`Edge function error: ${error.message}`);
        }

        return analyzeActivityFileResponseSchema.parse(data);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Activity file analysis error", getErrorDetails(error));
        throw new Error(`Activity file analysis failed: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Get activity file processing status
   */
  getActivityFileStatus: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { activityId } = input;
      const userId = ctx.session?.user?.id;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      // Note: This will work once the migration is applied
      // For now, return a placeholder response
      try {
        const activity = await db.query.activities.findFirst({
          columns: {
            id: true,
            name: true,
            type: true,
            started_at: true,
          },
          where: and(eq(activities.id, activityId), eq(activities.profile_id, userId)),
        });

        if (!activity) {
          throw new Error("Failed to get activity");
        }

        return {
          processingStatus: "pending", // Placeholder
          filePath: null, // Placeholder
          fileSize: null, // Placeholder
          version: null, // Placeholder
          updatedAt: null, // Placeholder
          activity: serializeActivityDates(activity), // Basic activity info
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Activity file status error", getErrorDetails(error));
        throw new Error(`Failed to get activity file status: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * List activity files for a user
   */
  listActivityFiles: protectedProcedure
    .input(
      z.object({
        pageSize: z.number().min(1).max(100).default(20),
        cursor: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { pageSize, cursor } = input;
      const userId = ctx.session?.user?.id;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        const conditions = [
          eq(activities.profile_id, userId),
          isNotNull(activityImports.activity_file_path),
        ];

        if (cursor) {
          conditions.push(lt(activities.created_at, new Date(cursor)));
        }

        const data = await db
          .select({
            id: activities.id,
            name: activities.name,
            type: activities.type,
            started_at: activities.started_at,
            created_at: activities.created_at,
          })
          .from(activities)
          .innerJoin(activityImports, eq(activities.id, activityImports.activity_id))
          .where(and(...conditions))
          .orderBy(desc(activities.created_at))
          .limit(pageSize);

        return {
          files: data.map((file) => serializeActivityDates(file)),
          nextCursor:
            data.length === pageSize ? data[data.length - 1]?.created_at.toISOString() : null,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("List activity files error", getErrorDetails(error));
        throw new Error(`Failed to list activity files: ${getErrorMessage(error)}`);
      }
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
   * Delete an activity file from storage
   */
  deleteActivityFile: protectedProcedure
    .input(
      z.object({
        filePath: activityStoragePathSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { filePath } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        // Verify user owns this file
        if (!isOwnedActivityFilePath(userId, filePath)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied: You can only delete your own files",
          });
        }

        // Delete from storage
        const { error } = await supabase.storage.from(ACTIVITY_FILE_BUCKET).remove([filePath]);

        if (error) {
          throw new Error(`Failed to delete activity file: ${error.message}`);
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error("Activity file deletion error", getErrorDetails(error));
        throw new Error(`Activity file deletion failed: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Get parsed streams from an activity file
   * Used for visualizing activity data (charts, maps) without storing streams in DB
   */
  getStreams: protectedProcedure
    .input(
      z.object({
        activityFilePath: activityStoragePathSchema,
        activityId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { activityFilePath, activityId } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throwUnauthorizedActivityFileAccess();
      }

      try {
        let resolvedActivityFilePath = activityFilePath.trim();

        // If activityId is provided, use proper database-driven authorization
        if (activityId) {
          const authorizedActivityFilePath = await canAccessActivityStreams(db, activityId, userId);

          if (!authorizedActivityFilePath) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Activity does not have an associated activity file",
            });
          }

          resolvedActivityFilePath = authorizedActivityFilePath;
        } else {
          // Fallback: legacy behavior - check file path ownership directly
          const isOwnFile = isOwnedActivityFilePath(userId, resolvedActivityFilePath);

          if (!isOwnFile) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Access denied: You can only access your own files",
            });
          }
        }

        // Download activity file from storage
        const { data: activityFile, error: downloadError } = await supabase.storage
          .from(ACTIVITY_FILE_BUCKET)
          .download(resolvedActivityFilePath);

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
          parseActivityFile({ data: buffer, fileName: resolvedActivityFilePath }),
        );

        // Extract streams in a format suitable for frontend charting
        // We return the raw records, the frontend can map them to arrays
        return {
          records: parsedData.records,
          laps: parsedData.laps,
          lengths: parsedData.lengths,
          summary: parsedData.summary,
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
