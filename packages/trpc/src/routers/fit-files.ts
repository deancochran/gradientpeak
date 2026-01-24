/**
 * FIT File Operations Router
 *
 * Handles FIT file upload, processing, and management operations.
 * Integrates with the analyze-fit-file edge function.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import type { Context } from "../context";
import type { StandardActivity } from "@repo/core";
import {
  parseFitFileWithSDK,
  calculateTSSFromAvailableData,
  extractHeartRateZones,
  extractPowerZones,
} from "@repo/core";

const FIT_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const FIT_FILE_TYPES = [".fit"];

const uploadFitFileInput = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileSize: z
    .number()
    .max(
      FIT_FILE_SIZE_LIMIT,
      `File size must be less than ${FIT_FILE_SIZE_LIMIT / (1024 * 1024)}MB`,
    ),
  fileType: z
    .string()
    .refine(
      (type) => FIT_FILE_TYPES.some((ext) => type.toLowerCase().endsWith(ext)),
      {
        message: `File type must be one of: ${FIT_FILE_TYPES.join(", ")}`,
      },
    ),
  fileData: z.string(), // Base64 encoded file data
});

const analyzeFitFileInput = z.object({
  activityId: z.string().uuid(),
  filePath: z.string().min(1, "File path is required"),
  bucketName: z.string().default("fit-files"),
});

const processFitFileInput = z.object({
  fitFilePath: z.string().min(1, "File path is required"),
  name: z.string().min(1, "Activity name is required"),
  notes: z.string().optional(),
  activityType: z.string().min(1, "Activity type is required"),
});

export const fitFilesRouter = createTRPCRouter({
  /**
   * Get a signed URL for uploading a FIT file
   * This allows the client to upload directly to storage without passing the session token
   */
  getSignedUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        fileSize: z.number().max(FIT_FILE_SIZE_LIMIT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { fileName, fileSize } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

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
          throw new Error(
            `Failed to create signed upload URL: ${error.message}`,
          );
        }

        return {
          signedUrl: data.signedUrl,
          token: data.token,
          path: data.path,
          filePath: filePath, // Return the full path so the client knows where it went
        };
      } catch (error) {
        console.error("Get signed upload URL error:", error);
        throw new Error(
          `Failed to generate upload URL: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Process a FIT file that has been uploaded to storage
   */
  processFitFile: protectedProcedure
    .input(processFitFileInput)
    .mutation(async ({ ctx, input }) => {
      const { fitFilePath, name, notes, activityType } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      try {
        // ========================================================================
        // T-302, T-303: Download FIT file from storage
        // ========================================================================
        const { data: fitFile, error: downloadError } = await supabase.storage
          .from("fit-files")
          .download(fitFilePath);

        if (downloadError || !fitFile) {
          // Log error and notify admins
          console.error("Failed to download FIT file:", downloadError);
          // TODO: Send notification to admin/monitoring system

          // Remove the invalid FIT file from storage
          await supabase.storage.from("fit-files").remove([fitFilePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to download FIT file from storage",
            cause: downloadError,
          });
        }

        // ========================================================================
        // T-304, T-305: Parse FIT file using @repo/core
        // ========================================================================
        let parsedData: StandardActivity;
        try {
          const buffer = Buffer.from(await fitFile.arrayBuffer());
          parsedData = parseFitFileWithSDK(buffer);
        } catch (parseError) {
          // Log error and notify admins
          console.error("Failed to parse FIT file:", parseError);
          // TODO: Send notification to admin/monitoring system

          // Remove the invalid FIT file from storage
          await supabase.storage.from("fit-files").remove([fitFilePath]);

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to parse FIT file: ${(parseError as Error).message}`,
          });
        }

        const { summary, records } = parsedData;

        // ========================================================================
        // T-306: Extract activity summary
        // ========================================================================
        const startTime = parsedData.metadata.startTime;
        const duration = summary.totalTime;

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
        }

        // ========================================================================
        // T-308: Fetch User Performance Metrics (with Cold Start Defaults)
        // ========================================================================
        // Fetch FTP for cycling activities (1-hour power)
        const { data: ftpMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("value")
          .eq("profile_id", userId)
          .eq("category", "bike")
          .eq("type", "power")
          .eq("duration_seconds", 3600) // FTP is 1-hour power
          .lte("recorded_at", startTime.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Cold Start: Default to 200W if no FTP found
        const ftp = ftpMetric?.value ? Number(ftpMetric.value) : 200;

        // Fetch LTHR (Lactate Threshold Heart Rate) for all activities
        const { data: lthrMetric } = await supabase
          .from("profile_performance_metric_logs")
          .select("value")
          .eq("profile_id", userId)
          .eq("type", "heart_rate")
          .lte("recorded_at", startTime.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Cold Start: Default to 170bpm if no LTHR found
        const lthr = lthrMetric?.value ? Number(lthrMetric.value) : 170;

        // Fetch Max HR for all activities
        const { data: maxHRMetric } = await supabase
          .from("profile_metric_logs")
          .select("value")
          .eq("profile_id", userId)
          .eq("metric_type", "resting_hr_bpm")
          .lte("recorded_at", startTime.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Note: We're using maxHeartRate from session data if available,
        // but in the future we could use a stored max_hr metric
        // Cold Start: Default to 190bpm if no Max HR found
        const maxHR =
          maxHeartRate ||
          (maxHRMetric?.value ? Number(maxHRMetric.value) : 190);

        // Log when metrics are missing for debugging (but proceed with defaults)
        if (powerStream.length > 0 && !ftpMetric?.value) {
          console.log(
            `No FTP found for user ${userId} - using default 200W for TSS calculation`,
          );
        }

        // ========================================================================
        // T-308: Calculate TSS using @repo/core (Universal Method)
        // ========================================================================
        let tss: number | undefined;
        let normalizedPower: number | undefined;
        let intensityFactor: number | undefined;

        // Calculate TSS using whatever data is available (Power > HR > Pace)
        try {
          const tssResult = calculateTSSFromAvailableData({
            powerStream,
            hrStream,
            timestamps,
            ftp,
            lthr,
            maxHR,
            // Estimate threshold pace if needed (e.g. 5:00/km = 300s/km)
            thresholdPace: 300,
            distance,
            activityType: activityType as any,
          });

          if (tssResult) {
            // Normalize the result based on the source
            if ("tss" in tssResult) {
              // Power, Running, or Swimming TSS
              tss = tssResult.tss;
              intensityFactor = tssResult.intensityFactor;
            } else if ("hrss" in tssResult) {
              // Heart Rate TSS
              tss = tssResult.hrss;
              // Estimate IF for HR: AvgHR / LTHR (rough approximation)
              if (lthr && tssResult.avgHR) {
                intensityFactor =
                  Math.round((tssResult.avgHR / lthr) * 100) / 100;
              }
            }

            // Only set NP if it was a power-based calculation
            if ("normalizedPower" in tssResult) {
              normalizedPower = tssResult.normalizedPower;
            }

            console.log(
              `TSS calculated (${tssResult.source}): ${tss} (IF: ${intensityFactor})`,
            );
          }
        } catch (error) {
          console.error("Failed to calculate TSS:", error);
          // Don't fail the mutation, just skip TSS calculation
        }

        // ========================================================================
        // T-310: Extract zones using @repo/core
        // ========================================================================
        let hrZones: ReturnType<typeof extractHeartRateZones> | undefined;
        let powerZones: ReturnType<typeof extractPowerZones> | undefined;

        if (records.length > 0) {
          hrZones = extractHeartRateZones(records);
          powerZones = extractPowerZones(records);
        }

        // ========================================================================
        // T-313, T-314: Create activity record
        // ========================================================================
        const endTime = new Date(startTime.getTime() + duration * 1000);

        const activityData = {
          profile_id: userId,
          name,
          notes: notes || null,
          type: activityType,
          location: "outdoor", // Could be inferred from GPS data
          is_private: true,
          started_at: startTime.toISOString(),
          finished_at: endTime.toISOString(),
          duration_seconds: Math.round(duration),
          moving_seconds: Math.round(duration), // Could be calculated from speed stream
          distance_meters: Math.round(distance),

          // FIT file metadata
          fit_file_path: fitFilePath,
          fit_file_size: fitFile.size,

          // Basic metrics
          calories: calories ? Math.round(calories) : null,
          elevation_gain_meters: elevationGain
            ? Math.round(elevationGain)
            : null,

          // Heart rate metrics
          avg_heart_rate: avgHeartRate ? Math.round(avgHeartRate) : null,
          max_heart_rate: maxHeartRate ? Math.round(maxHeartRate) : null,

          // Power metrics
          avg_power: avgPower ? Math.round(avgPower) : null,
          max_power: maxPower ? Math.round(maxPower) : null,
          normalized_power: normalizedPower
            ? Math.round(normalizedPower)
            : null,
          intensity_factor: intensityFactor || null,
          training_stress_score: tss ? Math.round(tss) : null,

          // Cadence metrics
          avg_cadence: avgCadence ? Math.round(avgCadence) : null,
          max_cadence: maxCadence ? Math.round(maxCadence) : null,

          // Speed metrics
          avg_speed_mps:
            summary.avgSpeed ??
            (distance && duration ? distance / duration : null),
          max_speed_mps: summary.maxSpeed ?? null,

          // Heart rate zones (seconds in each zone)
          hr_zone_1_seconds: hrZones?.zone1 || null,
          hr_zone_2_seconds: hrZones?.zone2 || null,
          hr_zone_3_seconds: hrZones?.zone3 || null,
          hr_zone_4_seconds: hrZones?.zone4 || null,
          hr_zone_5_seconds: hrZones?.zone5 || null,

          // Power zones (seconds in each zone)
          power_zone_1_seconds: powerZones?.zone1 || null,
          power_zone_2_seconds: powerZones?.zone2 || null,
          power_zone_3_seconds: powerZones?.zone3 || null,
          power_zone_4_seconds: powerZones?.zone4 || null,
          power_zone_5_seconds: powerZones?.zone5 || null,
          power_zone_6_seconds: powerZones?.zone6 || null,
        };

        const { data: createdActivity, error: insertError } = await supabase
          .from("activities")
          .insert(activityData)
          .select()
          .single();

        if (insertError || !createdActivity) {
          // T-316: Cleanup uploaded file on failure
          await supabase.storage.from("fit-files").remove([fitFilePath]);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create activity record",
            cause: insertError,
          });
        }

        return {
          success: true,
          activity: createdActivity,
        };
      } catch (error) {
        // T-316: Handle errors with proper TRPCError types
        if (error instanceof TRPCError) {
          throw error;
        }

        // Cleanup file on unexpected errors
        try {
          await supabase.storage.from("fit-files").remove([fitFilePath]);
        } catch (cleanupError) {
          console.error("Failed to cleanup file after error:", cleanupError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `FIT file processing failed: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Upload a FIT file to Supabase Storage
   */
  uploadFitFile: protectedProcedure
    .input(uploadFitFileInput)
    .mutation(async ({ ctx, input }) => {
      const { fileName, fileSize, fileType, fileData } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Validate file type again (double security)
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
        const { data, error } = await supabase.storage
          .from("fit-files")
          .upload(filePath, bytes, {
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
        throw new Error(`FIT file upload failed: ${(error as Error).message}`);
      }
    }),

  /**
   * Trigger FIT file analysis via edge function
   */
  analyzeFitFile: protectedProcedure
    .input(analyzeFitFileInput)
    .mutation(async ({ ctx, input }) => {
      const { activityId, filePath, bucketName } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Note: This assumes the activities table has been migrated to include FIT file columns
        // For now, we'll just call the edge function and return the result
        const { data, error } = await supabase.functions.invoke(
          "analyze-fit-file",
          {
            body: {
              activityId,
              filePath,
              bucketName,
            },
          },
        );

        if (error) {
          throw new Error(`Edge function error: ${error.message}`);
        }

        return data;
      } catch (error) {
        console.error("FIT file analysis error:", error);
        throw new Error(
          `FIT file analysis failed: ${(error as Error).message}`,
        );
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
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Note: This will work once the migration is applied
      // For now, return a placeholder response
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("id, name, type, started_at")
          .eq("id", activityId)
          .eq("profile_id", userId)
          .single();

        if (error) {
          throw new Error(`Failed to get activity: ${error.message}`);
        }

        return {
          processingStatus: "pending", // Placeholder
          filePath: null, // Placeholder
          fileSize: null, // Placeholder
          version: null, // Placeholder
          updatedAt: null, // Placeholder
          activity: data, // Basic activity info
        };
      } catch (error) {
        console.error("FIT file status error:", error);
        throw new Error(
          `Failed to get FIT file status: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * List FIT files for a user
   */
  listFitFiles: protectedProcedure
    .input(
      z.object({
        pageSize: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { pageSize, cursor } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        let query = supabase
          .from("activities")
          .select(
            `
            id,
            name,
            type,
            started_at,
            created_at
          `,
          )
          .eq("profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(pageSize);

        if (cursor) {
          query = query.gt("created_at", cursor);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to list activities: ${error.message}`);
        }

        return {
          files: data || [],
          nextCursor:
            data?.length === pageSize
              ? data[data.length - 1]?.created_at
              : null,
        };
      } catch (error) {
        console.error("List FIT files error:", error);
        throw new Error(
          `Failed to list FIT files: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Get FIT file download URL (presigned)
   */
  getFitFileUrl: protectedProcedure
    .input(
      z.object({
        filePath: z.string().min(1, "File path is required"),
        expiresIn: z.number().min(60).max(3600).default(3600), // 1 hour default
      }),
    )
    .query(async ({ ctx, input }) => {
      const { filePath, expiresIn } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file (check file path starts with user ID)
        if (!filePath.startsWith(`${userId}/`)) {
          throw new Error("Access denied: You can only access your own files");
        }

        // Generate signed URL
        const { data, error } = await supabase.storage
          .from("fit-files")
          .createSignedUrl(filePath, expiresIn);

        if (error) {
          throw new Error(`Failed to generate download URL: ${error.message}`);
        }

        return {
          signedUrl: (data as any)?.signedUrl,
          expiresAt: (data as any)?.expiresAt,
        };
      } catch (error) {
        console.error("Get FIT file URL error:", error);
        throw new Error(
          `Failed to generate download URL: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Delete a FIT file from storage
   */
  deleteFitFile: protectedProcedure
    .input(
      z.object({
        filePath: z.string().min(1, "File path is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { filePath } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file
        if (!filePath.startsWith(`${userId}/`)) {
          throw new Error("Access denied: You can only delete your own files");
        }

        // Delete from storage
        const { error } = await supabase.storage
          .from("fit-files")
          .remove([filePath]);

        if (error) {
          throw new Error(`Failed to delete FIT file: ${error.message}`);
        }

        return { success: true };
      } catch (error) {
        console.error("FIT file deletion error:", error);
        throw new Error(
          `FIT file deletion failed: ${(error as Error).message}`,
        );
      }
    }),
});
