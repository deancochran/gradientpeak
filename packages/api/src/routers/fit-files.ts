/**
 * FIT File Operations Router
 *
 * Handles FIT file upload, processing, and management operations.
 * Integrates with the analyze-fit-file edge function.
 */

import { randomUUID } from "node:crypto";
import { parseFitFileWithSDK } from "@repo/core";
import {
  calculateAerobicDecoupling,
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
import { activities, activityEfforts, profileMetrics } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { fetchActivityTemperature } from "../utils/weather";

const storageService = getApiStorageService();

const FIT_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const FIT_FILE_TYPES = [".fit"];

const FIT_FILE_NAME_PATTERN = /^[^/\\\0]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const fitFileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name is too long")
  .refine((value) => FIT_FILE_NAME_PATTERN.test(value), {
    message: "File name must not include path separators or null bytes",
  })
  .refine((value) => FIT_FILE_TYPES.some((ext) => value.toLowerCase().endsWith(ext)), {
    message: `File type must be one of: ${FIT_FILE_TYPES.join(", ")}`,
  });

const fitStoragePathSchema = z
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

const fitRecordSchema = z
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

const fitSummarySchema = z
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

const parsedFitActivitySchema = z
  .object({
    metadata: z
      .object({
        type: z.string().trim().min(1),
        startTime: z.date(),
      })
      .passthrough(),
    summary: fitSummarySchema,
    records: z.array(fitRecordSchema),
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

const analyzeFitFileResponseSchema = z
  .object({
    queued: z.boolean(),
  })
  .passthrough();

const uploadFitFileInput = z
  .object({
    fileName: fitFileNameSchema,
    fileSize: z
      .number()
      .int("File size must be an integer")
      .positive("File size must be greater than zero")
      .max(
        FIT_FILE_SIZE_LIMIT,
        `File size must be less than ${FIT_FILE_SIZE_LIMIT / (1024 * 1024)}MB`,
      ),
    fileType: fitFileNameSchema,
    fileData: base64FileDataSchema,
  })
  .strict();

const analyzeFitFileInput = z
  .object({
    activityId: z.string().uuid(),
    filePath: fitStoragePathSchema,
    bucketName: z.literal("fit-files").default("fit-files"),
  })
  .strict();

const manualHistoricalImportProvenanceSchema = z.object({
  import_source: z.literal("manual_historical"),
  import_file_type: z.literal("fit"),
  import_original_file_name: z.string().trim().min(1, "Original file name is required"),
});

const processFitFileInput = z
  .object({
    fitFilePath: fitStoragePathSchema,
    name: z.string().trim().min(1, "Activity name is required"),
    notes: z.string().trim().optional(),
    activityType: z.string().trim().min(1, "Activity type is required"),
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

function isOwnedFitFilePath(userId: string, filePath: string): boolean {
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
    startedAt: Date;
    finishedAt: Date;
    durationSeconds: number;
    movingSeconds: number;
    distanceMeters: number;
    fitFilePath: string;
    fitFileSize: number;
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
  },
) {
  const activityId = randomUUID();

  await db.execute(sql`
    insert into activities (
      id,
      profile_id,
      name,
      notes,
      type,
      is_private,
      started_at,
      finished_at,
      duration_seconds,
      moving_seconds,
      distance_meters,
      fit_file_path,
      fit_file_size,
      import_source,
      import_file_type,
      import_original_file_name,
      calories,
      elevation_gain_meters,
      avg_heart_rate,
      max_heart_rate,
      avg_power,
      max_power,
      normalized_power,
      avg_cadence,
      max_cadence,
      avg_speed_mps,
      max_speed_mps,
      normalized_speed_mps,
      normalized_graded_speed_mps,
      efficiency_factor,
      aerobic_decoupling,
      avg_temperature,
      created_at,
      updated_at
    ) values (
      ${activityId}::uuid,
      ${input.profileId}::uuid,
      ${input.name},
      ${input.notes},
      ${input.activityType},
      ${true},
      ${input.startedAt},
      ${input.finishedAt},
      ${input.durationSeconds},
      ${input.movingSeconds},
      ${input.distanceMeters},
      ${input.fitFilePath},
      ${input.fitFileSize},
      ${input.importSource},
      ${input.importFileType},
      ${input.importOriginalFileName},
      ${input.calories},
      ${input.elevationGainMeters},
      ${input.avgHeartRate},
      ${input.maxHeartRate},
      ${input.avgPower},
      ${input.maxPower},
      ${input.normalizedPower},
      ${input.avgCadence},
      ${input.maxCadence},
      ${input.avgSpeedMps},
      ${input.maxSpeedMps},
      ${input.normalizedSpeedMps},
      ${input.normalizedGradedSpeedMps},
      ${input.efficiencyFactor},
      ${input.aerobicDecoupling},
      ${input.avgTemperature},
      now(),
      now()
    )
  `);

  return db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });
}

async function canAccessActivityStreams(db: DbClient, activityId: string, userId: string) {
  const activity = await db.query.activities.findFirst({
    columns: {
      profile_id: true,
      is_private: true,
    },
    where: eq(activities.id, activityId),
  });

  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  }

  if (activity.profile_id === userId || !activity.is_private) {
    return;
  }

  const followResult = await db.execute(sql<{ has_access: boolean }>`
    select exists(
      select 1
      from follows
      where follower_id = ${userId}::uuid
        and following_id = ${activity.profile_id}::uuid
        and status = 'accepted'
    ) as has_access
  `);

  if (!followResult.rows[0]?.has_access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Access denied: You can only access your own activities or public activities from users you follow",
    });
  }
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

export const fitFilesRouter = createTRPCRouter({
  /**
   * Get a signed URL for uploading a FIT file
   * This allows the client to upload directly to storage without passing the session token
   */
  getSignedUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: fitFileNameSchema,
        fileSize: z.number().int().positive().max(FIT_FILE_SIZE_LIMIT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { fileName, fileSize } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Validate file extension
        if (!fileName.toLowerCase().endsWith(".fit")) {
          throw new Error("Only .fit files are supported");
        }

        // Generate a unique path: activities/userId/pending_timestamp/filename
        // We use a temporary uploads folder
        const timestamp = Date.now();
        const filePath = `activities/${userId}/uploads/${timestamp}_${fileName}`;

        // Create signed upload URL
        const { data, error } = await supabase.storage
          .from("fit-files")
          .createSignedUploadUrl(filePath);

        if (error) {
          throw new Error(`Failed to create signed upload URL: ${error.message}`);
        }

        const signedUploadData = signedUploadUrlDataSchema.parse(data);

        return {
          signedUrl: signedUploadData.signedUrl,
          token: signedUploadData.token,
          path: signedUploadData.path,
          filePath: filePath, // Return the full path so the client knows where it went
        };
      } catch (error) {
        console.error("Get signed upload URL error:", error);
        throw new Error(`Failed to generate upload URL: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Process a FIT file that has been uploaded to storage
   */
  processFitFile: protectedProcedure.input(processFitFileInput).mutation(async ({ ctx, input }) => {
    const { fitFilePath, name, notes, activityType, importProvenance } = input;
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
      console.log("[processFitFile] Starting FIT file processing:", {
        fitFilePath,
        userId,
        name,
        activityType,
      });

      // ========================================================================
      // T-302, T-303: Download FIT file from storage
      // ========================================================================
      console.log("[processFitFile] Downloading FIT file from storage:", fitFilePath);

      const { data: fitFile, error: downloadError } = await supabase.storage
        .from("fit-files")
        .download(fitFilePath);

      if (downloadError || !fitFile) {
        // Log error and notify admins
        console.error("[processFitFile] Failed to download FIT file:", {
          error: downloadError,
          errorMessage: downloadError?.message,
          fitFilePath,
          userId,
        });
        // TODO: Send notification to admin/monitoring system

        // Remove the invalid FIT file from storage
        await supabase.storage.from("fit-files").remove([fitFilePath]);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to download FIT file from storage: ${downloadError?.message || "Unknown error"}`,
          cause: downloadError,
        });
      }

      console.log("[processFitFile] FIT file downloaded successfully:", {
        size: fitFile.size,
        type: fitFile.type,
      });

      // ========================================================================
      // T-304, T-305: Parse FIT file using @repo/core
      // ========================================================================
      let parsedData: z.infer<typeof parsedFitActivitySchema>;
      try {
        console.log("[processFitFile] Parsing FIT file with SDK...");
        const fitFileBlob = requireBlobLike(fitFile);
        const buffer = await toBufferFromBlobLike(fitFileBlob);
        parsedData = parsedFitActivitySchema.parse(parseFitFileWithSDK(buffer));
        console.log("[processFitFile] FIT file parsed successfully:", {
          sport: parsedData.metadata.type,
          duration: parsedData.summary.totalTime,
          distance: parsedData.summary.totalDistance,
          recordCount: parsedData.records.length,
          lapCount: parsedData.laps?.length,
        });
      } catch (parseError) {
        // Log error and notify admins
        console.error("[processFitFile] Failed to parse FIT file:", {
          error: parseError,
          ...getErrorDetails(parseError),
          fitFilePath,
          fileSize: fitFile.size,
        });
        // TODO: Send notification to admin/monitoring system

        // Remove the invalid FIT file from storage
        await supabase.storage.from("fit-files").remove([fitFilePath]);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to parse FIT file: ${getErrorMessage(parseError)}`,
        });
      }

      const { summary, records } = parsedData;

      // ========================================================================
      // T-306: Extract activity summary
      // ========================================================================
      const startTime = parsedData.metadata.startTime;
      const duration = summary.totalTime;

      console.log("[processFitFile] Activity summary extracted:", {
        startTime: startTime.toISOString(),
        duration,
        distance: summary.totalDistance,
        avgHeartRate: summary.avgHeartRate,
        avgPower: summary.avgPower,
      });

      if (duration <= 0) {
        console.error(
          `[processFitFile] Invalid FIT file: duration is ${duration}. Deleting file: ${fitFilePath}`,
        );
        await supabase.storage.from("fit-files").remove([fitFilePath]);
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
      const maxHR =
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
      normalizedPower = powerStream.length > 0 ? calculateNormalizedPower(powerStream) : undefined;

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

      console.log("[processFitFile] Attempting to insert activity record:", {
        profile_id: userId,
        name,
        type: activityType,
        duration: Math.round(duration),
        distance: Math.round(distance),
        fit_file_path: fitFilePath,
      });

      let createdActivity;
      try {
        createdActivity = await createActivityRecord(db, {
          profileId: userId,
          name,
          notes: notes || null,
          activityType,
          startedAt: startTime,
          finishedAt: endTime,
          durationSeconds: Math.round(duration),
          movingSeconds: Math.round(duration),
          distanceMeters: Math.round(distance),
          fitFilePath,
          fitFileSize: fitFile.size,
          importSource: importProvenance?.import_source ?? null,
          importFileType: importProvenance?.import_file_type ?? null,
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
        });
      } catch (insertError) {
        // T-316: Cleanup uploaded file on failure
        console.error("[processFitFile] Failed to insert activity record:", {
          error: insertError,
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

        await supabase.storage.from("fit-files").remove([fitFilePath]);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create activity record: ${getErrorMessage(insertError)}`,
          cause: insertError,
        });
      }

      if (!createdActivity) {
        await supabase.storage.from("fit-files").remove([fitFilePath]);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load created activity record",
        });
      }

      console.log("[processFitFile] Activity record created successfully:", createdActivity.id);

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
        } catch (effortsError) {
          console.error("Failed to insert best efforts:", effortsError);
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
            value: String(detectedLTHR),
            unit: "bpm",
            recorded_at: new Date(activityCompletedAtIso),
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
        console.error("[processFitFile] TRPCError caught:", {
          code: error.code,
          message: error.message,
          cause: error.cause,
        });
        throw error;
      }

      // Log unexpected errors with full context
      console.error("[processFitFile] Unexpected error:", {
        error,
        ...getErrorDetails(error),
        fitFilePath,
        userId,
        name,
        activityType,
      });

      // Cleanup file on unexpected errors
      try {
        await supabase.storage.from("fit-files").remove([fitFilePath]);
        console.log("[processFitFile] Cleaned up FIT file after error:", fitFilePath);
      } catch (cleanupError) {
        console.error("[processFitFile] Failed to cleanup file after error:", cleanupError);
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `FIT file processing failed: ${getErrorMessage(error)}`,
        cause: error,
      });
    }
  }),

  /**
   * Upload a FIT file to Supabase Storage
   */
  uploadFitFile: protectedProcedure.input(uploadFitFileInput).mutation(async ({ ctx, input }) => {
    const { fileName, fileSize, fileData, fileType } = input;
    const userId = ctx.session?.user?.id;
    const supabase = storageService;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    try {
      // Validate file type again (double security)
      if (fileType.toLowerCase() !== fileName.toLowerCase()) {
        throw new Error("File type must match file name");
      }

      if (!fileName.toLowerCase().endsWith(".fit")) {
        throw new Error("Only .fit files are supported");
      }

      // Convert base64 to buffer
      const binaryString = atob(fileData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create unique file path
      const filePath = `${userId}/${Date.now()}-${fileName}`;

      // Upload to storage
      const { error } = await supabase.storage.from("fit-files").upload(filePath, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });

      if (error) {
        throw new Error(`Failed to upload FIT file: ${error.message}`);
      }

      return {
        success: true,
        filePath,
        size: fileSize,
      };
    } catch (error) {
      console.error("FIT file upload error:", error);
      throw new Error(`FIT file upload failed: ${getErrorMessage(error)}`);
    }
  }),

  /**
   * Trigger FIT file analysis via edge function
   */
  analyzeFitFile: protectedProcedure.input(analyzeFitFileInput).mutation(async ({ ctx, input }) => {
    const { activityId, filePath, bucketName } = input;
    const userId = ctx.session?.user?.id;
    const supabase = storageService;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    try {
      // Note: This assumes the activities table has been migrated to include FIT file columns
      // For now, we'll just call the edge function and return the result
      const { data, error } = await supabase.functions.invoke("analyze-fit-file", {
        body: {
          activityId,
          filePath,
          bucketName,
        },
      });

      if (error) {
        throw new Error(`Edge function error: ${error.message}`);
      }

      return analyzeFitFileResponseSchema.parse(data);
    } catch (error) {
      console.error("FIT file analysis error:", error);
      throw new Error(`FIT file analysis failed: ${getErrorMessage(error)}`);
    }
  }),

  /**
   * Get FIT file processing status
   */
  getFitFileStatus: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { activityId } = input;
      const userId = ctx.session?.user?.id;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throw new Error("User not authenticated");
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
        console.error("FIT file status error:", error);
        throw new Error(`Failed to get FIT file status: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * List FIT files for a user
   */
  listFitFiles: protectedProcedure
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
        throw new Error("User not authenticated");
      }

      try {
        const conditions = [eq(activities.profile_id, userId), isNotNull(activities.fit_file_path)];

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
          .where(and(...conditions))
          .orderBy(desc(activities.created_at))
          .limit(pageSize);

        return {
          files: data.map((file) => serializeActivityDates(file)),
          nextCursor:
            data.length === pageSize ? data[data.length - 1]?.created_at.toISOString() : null,
        };
      } catch (error) {
        console.error("List FIT files error:", error);
        throw new Error(`Failed to list FIT files: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Get FIT file download URL (presigned)
   */
  getFitFileUrl: protectedProcedure
    .input(
      z.object({
        filePath: fitStoragePathSchema,
        expiresIn: z.number().int().min(60).max(3600).default(3600), // 1 hour default
      }),
    )
    .query(async ({ ctx, input }) => {
      const { filePath, expiresIn } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file (check file path starts with user ID)
        if (!isOwnedFitFilePath(userId, filePath)) {
          throw new Error("Access denied: You can only access your own files");
        }

        // Generate signed URL
        const { data, error } = await supabase.storage
          .from("fit-files")
          .createSignedUrl(filePath, expiresIn);

        if (error) {
          throw new Error(`Failed to generate download URL: ${error.message}`);
        }

        return signedDownloadUrlDataSchema.parse(data);
      } catch (error) {
        console.error("Get FIT file URL error:", error);
        throw new Error(`Failed to generate download URL: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Delete a FIT file from storage
   */
  deleteFitFile: protectedProcedure
    .input(
      z.object({
        filePath: fitStoragePathSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { filePath } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file
        if (!isOwnedFitFilePath(userId, filePath)) {
          throw new Error("Access denied: You can only delete your own files");
        }

        // Delete from storage
        const { error } = await supabase.storage.from("fit-files").remove([filePath]);

        if (error) {
          throw new Error(`Failed to delete FIT file: ${error.message}`);
        }

        return { success: true };
      } catch (error) {
        console.error("FIT file deletion error:", error);
        throw new Error(`FIT file deletion failed: ${getErrorMessage(error)}`);
      }
    }),

  /**
   * Get parsed streams from a FIT file
   * Used for visualizing activity data (charts, maps) without storing streams in DB
   */
  getStreams: protectedProcedure
    .input(
      z.object({
        fitFilePath: fitStoragePathSchema,
        activityId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { fitFilePath, activityId } = input;
      const userId = ctx.session?.user?.id;
      const supabase = storageService;
      const db = getRequiredDb(ctx);

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // If activityId is provided, use proper database-driven authorization
        if (activityId) {
          await canAccessActivityStreams(db, activityId, userId);
        } else {
          // Fallback: legacy behavior - check file path ownership directly
          const cleanPath = fitFilePath.trim();
          const isOwnFile = isOwnedFitFilePath(userId, cleanPath);

          if (!isOwnFile) {
            throw new Error("Access denied: You can only access your own files");
          }
        }

        // Download FIT file from storage
        const { data: fitFile, error: downloadError } = await supabase.storage
          .from("fit-files")
          .download(fitFilePath.trim());

        if (downloadError || !fitFile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "FIT file not found",
            cause: downloadError,
          });
        }

        // Parse FIT file
        const fitFileBlob = requireBlobLike(fitFile);
        const buffer = await toBufferFromBlobLike(fitFileBlob);
        const parsedData = parsedFitActivitySchema.parse(parseFitFileWithSDK(buffer));

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

        console.error("Get streams error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to retrieve streams: ${getErrorMessage(error)}`,
        });
      }
    }),
});
