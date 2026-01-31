/**
 * FIT File Operations Router
 *
 * Handles FIT file upload, processing, and management operations.
 * Integrates with the analyze-fit-file edge function.
 */

import type { StandardActivity } from "@repo/core";
import {
  calculateTSSFromAvailableData,
  extractHeartRateZones,
  extractPowerZones,
  parseFitFileWithSDK,
} from "@repo/core";
import {
  calculateAerobicDecoupling,
  calculateBestEfforts,
  calculateDecouplingFromStreams,
  calculateEfficiencyFactor,
  calculateGradedSpeedStream,
  calculateNGP,
  calculateNormalizedPower,
  calculateNormalizedSpeed,
  calculateTrainingEffect,
  detectLTHR,
  estimateVO2Max,
} from "@repo/core/calculations";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { fetchActivityTemperature } from "../utils/weather";

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
        console.log("[processFitFile] Starting FIT file processing:", {
          fitFilePath,
          userId,
          name,
          activityType,
        });

        // ========================================================================
        // T-302, T-303: Download FIT file from storage
        // ========================================================================
        console.log(
          "[processFitFile] Downloading FIT file from storage:",
          fitFilePath,
        );

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
        let parsedData: StandardActivity;
        try {
          console.log("[processFitFile] Parsing FIT file with SDK...");
          const buffer = Buffer.from(await fitFile.arrayBuffer());
          parsedData = parseFitFileWithSDK(buffer);
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
            errorMessage: (parseError as Error).message,
            errorStack: (parseError as Error).stack,
            fitFilePath,
            fileSize: fitFile.size,
          });
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
        // New: Calculate Swim Metrics
        // ========================================================================
        let avgSwolf: number | null = null;
        const totalStrokes = summary.totalStrokes || null;
        const poolLength = summary.poolLength || null;

        if (
          activityType === "swim" &&
          summary.totalDistance &&
          summary.totalTime &&
          totalStrokes &&
          poolLength
        ) {
          // SWOLF = Time + Strokes per length
          // Avg SWOLF = (Total Time + Total Strokes) / (Total Distance / Pool Length)
          const numLengths = summary.totalDistance / poolLength;
          if (numLengths > 0) {
            avgSwolf =
              (summary.totalTime + totalStrokes) / Math.round(numLengths);
            avgSwolf = Math.round(avgSwolf * 10) / 10; // Round to 1 decimal
          }
        }

        // Calculate pace stream from speed stream
        const paceStream: number[] = [];
        if (speedStream.length > 0) {
          for (const speed of speedStream) {
            if (speed > 0) {
              if (activityType === "swim") {
                // Swim pace: seconds per 100m
                paceStream.push(100 / speed);
              } else if (activityType === "run") {
                // Run pace: seconds per km
                paceStream.push(1000 / speed);
              } else {
                // Default to seconds per km for other activities
                paceStream.push(1000 / speed);
              }
            } else {
              paceStream.push(0);
            }
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
          .from("profile_metrics")
          .select("value")
          .eq("profile_id", userId)
          .eq("metric_type", "max_hr")
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
            paceStream, // Pass calculated pace stream
            timestamps,
            ftp,
            lthr,
            maxHR,
            // Estimate threshold pace if needed (e.g. 5:00/km = 300s/km)
            // TODO: Fetch threshold pace from user metrics if available
            thresholdPace: activityType === "swim" ? 120 : 300, // 2:00/100m for swim, 5:00/km for run
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
        // T-5.1, T-5.2: Calculate Advanced Metrics
        // ========================================================================

        // 1. Normalized Speed (All activities)
        const normalizedSpeed = calculateNormalizedSpeed(distance, duration);

        // 2. Normalized Graded Pace (Run)
        let normalizedGradedSpeed: number | null = null;
        if (
          activityType === "run" &&
          speedStream.length > 0 &&
          altitudeStream.length > 0
        ) {
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
            efficiencyFactor = calculateEfficiencyFactor(
              normalizedPower,
              avgHeartRate,
            );
          } else if (activityType === "run" && normalizedGradedSpeed) {
            efficiencyFactor = calculateEfficiencyFactor(
              normalizedGradedSpeed,
              avgHeartRate,
            );
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
        } else if (
          activityType === "run" &&
          speedStream.length > 0 &&
          hrStream.length > 0
        ) {
          // For run, use graded speed if available, else speed
          const runPowerStream = normalizedGradedSpeed
            ? calculateGradedSpeedStream(
                speedStream,
                altitudeStream,
                timestamps,
              )
            : speedStream;
          aerobicDecoupling = calculateDecouplingFromStreams(
            runPowerStream,
            hrStream,
            timestamps,
            calculateNGP,
          );
        }

        // 5. Training Effect
        let trainingEffectLabel: string | null = null;
        if (hrStream.length > 0 && lthr) {
          trainingEffectLabel = calculateTrainingEffect(
            hrStream,
            timestamps,
            lthr,
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
          normalized_speed_mps: normalizedSpeed || null,
          normalized_graded_speed_mps: normalizedGradedSpeed || null,

          // Efficiency & Training Effect
          efficiency_factor: efficiencyFactor || null,
          aerobic_decoupling: aerobicDecoupling || null,
          training_effect: trainingEffectLabel as any,
          avg_temperature: avgTemperature ? Math.round(avgTemperature) : null,

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

          // ========================================================================
          // Extended Metadata (only fields that exist in current schema)
          // Note: polyline, map_bounds, laps, total_strokes, pool_length, avg_swolf,
          // device_manufacturer, device_product will be added in future migration
          // ========================================================================
        };

        console.log("[processFitFile] Attempting to insert activity record:", {
          profile_id: userId,
          name,
          type: activityType,
          duration: Math.round(duration),
          distance: Math.round(distance),
          fit_file_path: fitFilePath,
        });

        const { data: createdActivity, error: insertError } = await supabase
          .from("activities")
          .insert(activityData)
          .select()
          .single();

        if (insertError || !createdActivity) {
          // T-316: Cleanup uploaded file on failure
          console.error("[processFitFile] Failed to insert activity record:", {
            error: insertError,
            errorMessage: insertError?.message,
            errorDetails: insertError?.details,
            errorHint: insertError?.hint,
            errorCode: insertError?.code,
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
            message: `Failed to create activity record: ${insertError?.message || "Unknown error"}. Details: ${insertError?.details || "None"}. Hint: ${insertError?.hint || "None"}`,
            cause: insertError,
          });
        }

        console.log(
          "[processFitFile] Activity record created successfully:",
          createdActivity.id,
        );

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
              recorded_at: startTime.toISOString(),
            });
          }
        }

        // Speed/Pace Efforts (Run)
        if (activityType === "run" && speedStream.length > 0) {
          // Use graded speed if available for "effort"
          const streamToUse = normalizedGradedSpeed
            ? calculateGradedSpeedStream(
                speedStream,
                altitudeStream,
                timestamps,
              )
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
              recorded_at: startTime.toISOString(),
            });
          }
        }

        // Bulk insert efforts
        if (effortsToInsert.length > 0) {
          const { error: effortsError } = await supabase
            .from("activity_efforts")
            .insert(effortsToInsert);
          if (effortsError) {
            console.error("Failed to insert best efforts:", effortsError);
          }
        }

        // 2. Detect LTHR / FTP
        // Detect LTHR
        if (hrStream.length > 0) {
          const detectedLTHR = detectLTHR(hrStream, timestamps);
          if (detectedLTHR && detectedLTHR > lthr) {
            // Create notification
            await supabase.from("notifications").insert({
              profile_id: userId,
              title: "New LTHR Detected!",
              message: `Your LTHR has improved to ${Math.round(detectedLTHR)} bpm based on your recent activity.`,
              is_read: false,
            });
          }
        }

        // Detect FTP (20min power)
        const effort20min = effortsToInsert.find(
          (e) => e.effort_type === "power" && e.duration_seconds === 1200,
        );
        if (effort20min) {
          const estimatedFTP = effort20min.value * 0.95;
          if (estimatedFTP > ftp) {
            // Create notification
            await supabase.from("notifications").insert({
              profile_id: userId,
              title: "New FTP Detected!",
              message: `Your estimated FTP has improved to ${Math.round(estimatedFTP)} watts based on your 20-minute power.`,
              is_read: false,
            });
          }
        }

        // 3. Estimate VO2 Max
        const { data: restingHRMetric } = await supabase
          .from("profile_metrics")
          .select("value")
          .eq("profile_id", userId)
          .eq("metric_type", "resting_hr")
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const restingHR = restingHRMetric?.value
          ? Number(restingHRMetric.value)
          : 60; // Default 60

        if (maxHeartRate && restingHR) {
          const estimatedVO2 = estimateVO2Max(maxHeartRate, restingHR);
          // We could log this or notify
        }

        return {
          success: true,
          activity: createdActivity,
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
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
          errorName: (error as Error).name,
          fitFilePath,
          userId,
          name,
          activityType,
        });

        // Cleanup file on unexpected errors
        try {
          await supabase.storage.from("fit-files").remove([fitFilePath]);
          console.log(
            "[processFitFile] Cleaned up FIT file after error:",
            fitFilePath,
          );
        } catch (cleanupError) {
          console.error(
            "[processFitFile] Failed to cleanup file after error:",
            cleanupError,
          );
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `FIT file processing failed: ${(error as Error).message}`,
          cause: error,
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

  /**
   * Get parsed streams from a FIT file
   * Used for visualizing activity data (charts, maps) without storing streams in DB
   */
  getStreams: protectedProcedure
    .input(
      z.object({
        fitFilePath: z.string().min(1, "File path is required"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { fitFilePath } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file (check file path starts with user ID)
        // Note: fitFilePath usually looks like "userId/timestamp-filename.fit"
        if (!fitFilePath.startsWith(`${userId}/`)) {
          // Allow access if it's in the activities/{userId} folder too (legacy or different structure)
          if (!fitFilePath.includes(userId)) {
            throw new Error(
              "Access denied: You can only access your own files",
            );
          }
        }

        // Download FIT file from storage
        const { data: fitFile, error: downloadError } = await supabase.storage
          .from("fit-files")
          .download(fitFilePath);

        if (downloadError || !fitFile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "FIT file not found",
            cause: downloadError,
          });
        }

        // Parse FIT file
        const buffer = Buffer.from(await fitFile.arrayBuffer());
        const parsedData = parseFitFileWithSDK(buffer);

        // Extract streams in a format suitable for frontend charting
        // We return the raw records, the frontend can map them to arrays
        return {
          records: parsedData.records,
          laps: parsedData.laps,
          lengths: parsedData.lengths,
          summary: parsedData.summary,
        };
      } catch (error) {
        console.error("Get streams error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to retrieve streams: ${(error as Error).message}`,
        });
      }
    }),
});
