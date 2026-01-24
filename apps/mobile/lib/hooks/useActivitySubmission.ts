/**
 * useActivitySubmission - Automatic Activity Processing & Upload
 *
 * Add this to your useActivityRecorder hooks file.
 * Automatically processes finished recording data and prepares for upload.
 *
 * @example
 * ```tsx
 * // In your submit screen:
 * function SubmitScreen() {
 *   const service = useSharedActivityRecorder();
 *   const submission = useActivitySubmission(service);
 *
 *   if (submission.isLoading) return <Spinner />;
 *   if (submission.isError) return <Error error={submission.error} />;
 *
 *   return (
 *     <Form>
 *       <Input
 *         value={submission.activity.name}
 *         onChangeText={(name) => submission.update({ name })}
 *       />
 *       <Button onPress={submission.submit}>Save Activity</Button>
 *     </Form>
 *   );
 * }
 * ```
 */

import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { trpc } from "@/lib/trpc";
import { queryKeys } from "@repo/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import {
  AggregatedStream,
  calculateAge,
  calculateAverageGrade,
  calculateCalories,
  calculateDecoupling,
  calculateEfficiencyFactor,
  calculateElapsedTime,
  calculateElevationChanges,
  calculateElevationGainPerKm,
  calculateHRZones,
  calculateIntensityFactor,
  calculateMovingTime,
  calculateNormalizedPower,
  calculatePowerHeartRateRatio,
  calculatePowerWeightRatio,
  calculatePowerZones,
  calculateTotalWork,
  calculateTSS,
  calculateVariabilityIndex,
  PublicActivitiesInsert,
} from "@repo/core";
import { useCallback, useEffect, useReducer } from "react";

import { FitUploader } from "@/lib/services/fit/FitUploader";

// ================================
// Types
// ================================

type SubmissionPhase = "loading" | "ready" | "uploading" | "success" | "error";

interface SubmissionState {
  phase: SubmissionPhase;
  activity: PublicActivitiesInsert | null;
  error: string | null;
}

type Action =
  | {
      type: "READY";
      activity: PublicActivitiesInsert;
    }
  | {
      type: "UPDATE";
      updates: { name?: string; notes?: string; is_private?: boolean };
    }
  | { type: "UPLOADING" }
  | { type: "SUCCESS" }
  | { type: "ERROR"; error: string };

// ================================
// Reducer
// ================================

function submissionReducer(
  state: SubmissionState,
  action: Action,
): SubmissionState {
  switch (action.type) {
    case "READY":
      return {
        phase: "ready",
        activity: action.activity,
        error: null,
      };

    case "UPDATE":
      if (!state.activity) return state;
      return {
        ...state,
        activity: { ...state.activity, ...action.updates },
      };

    case "UPLOADING":
      return { ...state, phase: "uploading", error: null };

    case "SUCCESS":
      return { ...state, phase: "success" };

    case "ERROR":
      return { ...state, phase: "error", error: action.error };

    default:
      return state;
  }
}

// ================================
// Utility Functions (Internal)
// ================================

function calculateActivityMetrics(
  metadata: import("@/lib/services/ActivityRecorder/types").RecordingMetadata,
  aggregatedStreams: Map<string, AggregatedStream>,
): {
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  metrics: Record<string, unknown>;
  hrZoneSeconds: number[] | null;
  powerZoneSeconds: number[] | null;
  location: "indoor" | "outdoor" | null;
} {
  if (!metadata.startedAt || !metadata.endedAt) {
    throw new Error(
      `Invalid recording: startedAt=${metadata.startedAt}, endedAt=${metadata.endedAt}`,
    );
  }

  // Extract stream references
  const hrStream = aggregatedStreams.get("heartrate");
  const powerStream = aggregatedStreams.get("power");
  const distanceStream = aggregatedStreams.get("distance");
  const speedStream = aggregatedStreams.get("speed");
  const cadenceStream = aggregatedStreams.get("cadence");
  const elevationStream = aggregatedStreams.get("elevation");
  const gradientStream = aggregatedStreams.get("gradient");

  // Base calculations
  const duration_seconds = Math.round(
    calculateElapsedTime(metadata.startedAt, metadata.endedAt),
  );
  const moving_seconds = Math.round(
    calculateMovingTime(
      metadata.startedAt,
      metadata.endedAt,
      aggregatedStreams,
    ),
  );

  // Distance in meters
  const distance_meters = Math.round(distanceStream?.maxValue || 0);

  // Simple aggregated values
  const avg_hr = hrStream?.avgValue ? Math.round(hrStream.avgValue) : undefined;
  const max_hr = hrStream?.maxValue ? Math.round(hrStream.maxValue) : undefined;
  const avg_power = powerStream?.avgValue
    ? Math.round(powerStream.avgValue)
    : undefined;
  const max_power = powerStream?.maxValue
    ? Math.round(powerStream.maxValue)
    : undefined;
  const avg_speed = speedStream?.avgValue;
  const max_speed = speedStream?.maxValue;
  const avg_cadence = cadenceStream?.avgValue
    ? Math.round(cadenceStream.avgValue)
    : undefined;
  const max_cadence = cadenceStream?.maxValue
    ? Math.round(cadenceStream.maxValue)
    : undefined;

  // Power-derived metrics
  // NOTE: Advanced metrics (TSS, IF, zones) will be calculated on server
  // using historical metrics from profile_performance_metric_logs table
  const normalized_power = calculateNormalizedPower(powerStream);
  const intensity_factor = undefined; // requires FTP from metric logs
  const tss = undefined; // requires FTP from metric logs
  const vi = Math.round(
    calculateVariabilityIndex(powerStream, normalized_power) || 0,
  );
  const total_work = Math.round(
    calculateTotalWork(powerStream, duration_seconds) || 0,
  );

  // Zone calculations - will be recalculated on server with historical metrics
  const hr_zones = null; // calculateHRZones requires threshold_hr from metric logs
  const power_zones = null; // calculatePowerZones requires ftp from metric logs

  // Multi-stream advanced metrics
  const ef = Math.round(calculateEfficiencyFactor(powerStream, hrStream) || 0);
  const decoupling = Math.round(
    calculateDecoupling(powerStream, hrStream) || 0,
  );
  const power_hr_ratio = calculatePowerHeartRateRatio(powerStream, hrStream);
  // power_weight_ratio requires weight from metric logs - calculated on server
  const power_weight_ratio = undefined;

  // Elevation calculations
  const { totalAscent, totalDescent } =
    calculateElevationChanges(elevationStream);
  const total_ascent = Math.round(totalAscent || 0);
  const total_descent = Math.round(totalDescent || 0);
  const avg_grade = calculateAverageGrade(gradientStream);
  const elevation_gain_per_km = calculateElevationGainPerKm(
    total_ascent,
    distanceStream,
  );

  // Calories - will be calculated on server with weight from metric logs
  const calories = undefined;

  // Max HR percentage of threshold - will be calculated on server
  const max_hr_pct_threshold = undefined;

  // Build metrics JSONB object
  const metrics: Record<string, unknown> = {};

  // Only include defined values
  if (avg_power !== undefined) metrics.avg_power = avg_power;
  if (max_power !== undefined) metrics.max_power = max_power;
  if (normalized_power !== undefined)
    metrics.normalized_power = normalized_power;
  if (avg_hr !== undefined) metrics.avg_hr = avg_hr;
  if (max_hr !== undefined) metrics.max_hr = max_hr;
  if (max_hr_pct_threshold !== undefined)
    metrics.max_hr_pct_threshold = max_hr_pct_threshold;
  if (avg_cadence !== undefined) metrics.avg_cadence = avg_cadence;
  if (max_cadence !== undefined) metrics.max_cadence = max_cadence;
  if (avg_speed !== undefined) metrics.avg_speed = avg_speed;
  if (max_speed !== undefined) metrics.max_speed = max_speed;
  if (total_work !== undefined) metrics.total_work = total_work;
  if (calories !== undefined) metrics.calories = calories;
  if (total_ascent !== undefined) metrics.total_ascent = total_ascent;
  if (total_descent !== undefined) metrics.total_descent = total_descent;
  if (avg_grade !== undefined) metrics.avg_grade = avg_grade;
  if (elevation_gain_per_km !== undefined)
    metrics.elevation_gain_per_km = elevation_gain_per_km;
  if (tss !== undefined) metrics.tss = tss;
  if (intensity_factor !== undefined) metrics.if = intensity_factor;
  if (vi !== undefined) metrics.vi = vi;
  if (ef !== undefined) metrics.ef = ef;
  if (power_weight_ratio !== undefined)
    metrics.power_weight_ratio = power_weight_ratio;
  if (power_hr_ratio !== undefined) metrics.power_hr_ratio = power_hr_ratio;
  if (decoupling !== undefined) metrics.decoupling = decoupling;

  // Build HR zone seconds array (5 zones) - will be calculated on server
  const hrZoneSeconds = null;

  // Build power zone seconds array (7 zones) - will be calculated on server
  const powerZoneSeconds = null;

  // Get location from metadata
  const location = metadata.activityLocation;

  return {
    durationSeconds: duration_seconds,
    movingSeconds: moving_seconds,
    distanceMeters: distance_meters,
    metrics,
    hrZoneSeconds,
    powerZoneSeconds,
    location,
  };
}

/**
 * Convert Uint8Array to base64 string (React Native compatible)
 * Uses manual base64 encoding without external dependencies
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const base64abc =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i;
  const l = bytes.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[((bytes[i - 1] & 0x0f) << 2) | (bytes[i] >> 6)];
    result += base64abc[bytes[i] & 0x3f];
  }
  if (i === l + 1) {
    // 1 octet yet to write
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 0x03) << 4];
    result += "==";
  }
  if (i === l) {
    // 2 octets yet to write
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[(bytes[i - 1] & 0x0f) << 2];
    result += "=";
  }
  return result;
}

// ================================
// Main Hook
// ================================

export function useActivitySubmission(service: ActivityRecorderService | null) {
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(submissionReducer, {
    phase: "loading",
    activity: null,
    error: null,
  });

  const createActivityMutation = trpc.activities.create.useMutation({
    onSuccess: async (data) => {
      // Invalidate relevant queries after successful upload
      queryClient.invalidateQueries({
        queryKey: queryKeys.activities.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingPlans.status(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.plannedActivities.weekCount(),
      });
      // Invalidate home dashboard to update CTL/ATL/TSB and weekly stats
      // Use predicate to invalidate all home-related queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "home" ||
          (Array.isArray(query.queryKey) && query.queryKey[0]?.[0] === "home"),
      });

      // Invalidate trends to update charts with new activity data
      queryClient.invalidateQueries({
        queryKey: queryKeys.trends.all(),
      });

      // Set the new activity in cache
      if (data.id) {
        queryClient.setQueryData(queryKeys.activities.detail(data.id), data);
      }

      console.log("[useActivitySubmission] Activity uploaded successfully.");
    },
    onError: (error) => {
      console.error("[useActivitySubmission] Upload failed:", error);
      Alert.alert(
        "Upload Failed",
        error.message || "Failed to upload activity. Please try again.",
      );
    },
  });

  // ================================
  // Auto-process recording on recordingComplete event
  // ================================

  const processRecording = useCallback(async () => {
    if (!service) {
      dispatch({ type: "ERROR", error: "No service found" });
      return;
    }

    // Wait for recording to be in finished state
    if (service.state !== "finished") {
      console.log(
        "[useActivitySubmission] Recording not finished yet, waiting...",
      );
      return;
    }

    const metadata = service.getRecordingMetadata();
    if (!metadata) {
      dispatch({ type: "ERROR", error: "No recording metadata found" });
      return;
    }

    try {
      console.log("[useActivitySubmission] Processing recording");

      // Verify recording has been properly finished
      if (!metadata.startedAt || !metadata.endedAt) {
        throw new Error(
          "Recording is not properly finished. Missing start or end time.",
        );
      }

      // 1. Aggregate all chunks from StreamBuffer
      console.log(
        "[useActivitySubmission] Aggregating stream data from files...",
      );
      const aggregatedStreams =
        await service.liveMetricsManager.streamBuffer.aggregateAllChunks();

      if (aggregatedStreams.size === 0) {
        throw new Error("No stream data found for recording");
      }

      console.log(
        `[useActivitySubmission] Aggregated ${aggregatedStreams.size} metrics`,
      );

      // 3. Build final activity object
      const calculatedMetrics = calculateActivityMetrics(
        metadata,
        aggregatedStreams,
      );

      // 3a. Get activity_plan_id from the activityPlan if it exists
      const activityPlanId: string | null = metadata.activityPlan?.id || null;

      const activity: PublicActivitiesInsert = {
        profile_id: metadata.profileId,
        started_at: metadata.startedAt,
        finished_at: metadata.endedAt,
        name: `${metadata.activityLocation} ${metadata.activityCategory} - ${new Date(metadata.startedAt).toLocaleDateString()}`,
        type: metadata.activityCategory,
        location: calculatedMetrics.location,
        duration_seconds: calculatedMetrics.durationSeconds,
        moving_seconds: calculatedMetrics.movingSeconds,
        distance_meters: calculatedMetrics.distanceMeters,
        // Map individual metrics
        avg_power: calculatedMetrics.metrics.avg_power as number | undefined,
        max_power: calculatedMetrics.metrics.max_power as number | undefined,
        normalized_power: calculatedMetrics.metrics.normalized_power as
          | number
          | undefined,
        avg_heart_rate: calculatedMetrics.metrics.avg_hr as number | undefined,
        max_heart_rate: calculatedMetrics.metrics.max_hr as number | undefined,
        avg_cadence: calculatedMetrics.metrics.avg_cadence as
          | number
          | undefined,
        max_cadence: calculatedMetrics.metrics.max_cadence as
          | number
          | undefined,
        avg_speed_mps: calculatedMetrics.metrics.avg_speed as
          | number
          | undefined,
        max_speed_mps: calculatedMetrics.metrics.max_speed as
          | number
          | undefined,
        calories: calculatedMetrics.metrics.calories as number | undefined,
        elevation_gain_meters: calculatedMetrics.metrics.total_ascent as
          | number
          | undefined,
        elevation_loss_meters: calculatedMetrics.metrics.total_descent as
          | number
          | undefined,
        training_stress_score: calculatedMetrics.metrics.tss as
          | number
          | undefined,
        intensity_factor: calculatedMetrics.metrics.if as number | undefined,
        hr_zone_1_seconds: calculatedMetrics.hrZoneSeconds?.[0] ?? undefined,
        hr_zone_2_seconds: calculatedMetrics.hrZoneSeconds?.[1] ?? undefined,
        hr_zone_3_seconds: calculatedMetrics.hrZoneSeconds?.[2] ?? undefined,
        hr_zone_4_seconds: calculatedMetrics.hrZoneSeconds?.[3] ?? undefined,
        hr_zone_5_seconds: calculatedMetrics.hrZoneSeconds?.[4] ?? undefined,
        power_zone_1_seconds:
          calculatedMetrics.powerZoneSeconds?.[0] ?? undefined,
        power_zone_2_seconds:
          calculatedMetrics.powerZoneSeconds?.[1] ?? undefined,
        power_zone_3_seconds:
          calculatedMetrics.powerZoneSeconds?.[2] ?? undefined,
        power_zone_4_seconds:
          calculatedMetrics.powerZoneSeconds?.[3] ?? undefined,
        power_zone_5_seconds:
          calculatedMetrics.powerZoneSeconds?.[4] ?? undefined,
        power_zone_6_seconds:
          calculatedMetrics.powerZoneSeconds?.[5] ?? undefined,
        power_zone_7_seconds:
          calculatedMetrics.powerZoneSeconds?.[6] ?? undefined,
        activity_plan_id: activityPlanId, // Use activity_plan_id instead of planned_activity_id
      };

      console.log("[useActivitySubmission] Activity processed successfully");
      dispatch({ type: "READY", activity });
    } catch (err) {
      console.error("[useActivitySubmission] Processing failed:", err);
      dispatch({
        type: "ERROR",
        error: err instanceof Error ? err.message : "Processing failed",
      });
    }
  }, [service?.recordingMetadata?.startedAt, service?.state]);

  // Listen for recording completion event
  useEffect(() => {
    if (!service) return;

    const handleRecordingComplete = () => {
      console.log("[useActivitySubmission] Recording complete event received");
      processRecording();
    };

    const subscription = service.addListener(
      "recordingComplete",
      handleRecordingComplete,
    );

    // Also check if already finished (in case event was missed)
    if (service.state === "finished" && service.getRecordingMetadata()) {
      console.log(
        "[useActivitySubmission] Recording already finished, processing...",
      );
      processRecording();
    }

    return () => {
      subscription.remove();
    };
  }, [service, processRecording]);

  // ================================
  // Actions
  // ================================

  const update = useCallback((updates: { name?: string; notes?: string }) => {
    dispatch({ type: "UPDATE", updates });
  }, []);

  const processFitFileMutation = trpc.fitFiles.processFitFile.useMutation({
    onSuccess: async (data) => {
      // Invalidate relevant queries after successful processing
      queryClient.invalidateQueries({
        queryKey: queryKeys.activities.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingPlans.status(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.plannedActivities.weekCount(),
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "home" ||
          (Array.isArray(query.queryKey) && query.queryKey[0]?.[0] === "home"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.trends.all(),
      });

      // Set the new activity in cache
      if (data.activity?.id) {
        queryClient.setQueryData(
          queryKeys.activities.detail(data.activity.id),
          data.activity,
        );
      }

      console.log(
        "[useActivitySubmission] Activity processed successfully via FIT file.",
      );
    },
    onError: (error) => {
      console.error("[useActivitySubmission] Processing failed:", error);
      Alert.alert(
        "Processing Failed",
        error.message ||
          "Failed to process activity from FIT file. Please try again.",
      );
    },
  });

  const submit = useCallback(async () => {
    if (!state.activity || !service) {
      throw new Error("No data to submit");
    }

    dispatch({ type: "UPLOADING" });

    try {
      // Check if we have a FIT file to upload
      const metadata = service.getRecordingMetadata();

      if (metadata?.fitFilePath) {
        console.log(
          "[useActivitySubmission] Uploading FIT file:",
          metadata.fitFilePath,
        );

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

        const uploader = new FitUploader(
          supabaseUrl,
          supabaseAnonKey,
          "activity-files", // Use activity-files bucket as per spec
        );

        // Use a temporary ID for the activity since we haven't created it yet
        const tempActivityId = `pending_${Date.now()}`;

        const uploadResult = await uploader.uploadFile(
          metadata.fitFilePath,
          metadata.profileId,
          tempActivityId,
        );

        if (uploadResult.success && uploadResult.fileUrl) {
          console.log(
            "[useActivitySubmission] FIT file uploaded:",
            uploadResult.fileUrl,
          );

          // Extract the storage path from the URL
          // FitUploader returns full public URL: .../activity-files/activities/...
          // We need just the path: activities/...
          const storagePath =
            uploadResult.fileUrl.split("/activity-files/")[1] ||
            `activities/${metadata.profileId}/${tempActivityId}/${Date.now()}.fit`;

          console.log(
            "[useActivitySubmission] Calling tRPC processFitFile with path:",
            storagePath,
          );

          // Call tRPC mutation to process FIT file
          // Server will parse FIT, calculate metrics, and create activity
          const result = await processFitFileMutation.mutateAsync({
            fitFilePath: storagePath,
            name: state.activity.name || "Untitled Activity",
            notes: state.activity.notes || undefined,
            activityType: state.activity.type,
          });

          if (!result.success) {
            throw new Error("FIT file processing failed");
          }

          // Clean up stream files after successful processing
          await service.liveMetricsManager.streamBuffer.cleanup();

          // Clean up local FIT file
          if (metadata.fitFilePath) {
            try {
              const FileSystem = await import("expo-file-system");
              await FileSystem.deleteAsync(metadata.fitFilePath, {
                idempotent: true,
              });
              console.log("[useActivitySubmission] Local FIT file deleted");
            } catch (cleanupError) {
              console.warn(
                "[useActivitySubmission] Failed to delete local FIT file:",
                cleanupError,
              );
            }
          }

          console.log(
            "[useActivitySubmission] Activity processed, cache invalidated, and local files deleted",
          );
          dispatch({ type: "SUCCESS" });
        } else {
          // FIT file upload failed - throw error
          const errorMessage =
            uploadResult.error || "Failed to upload FIT file";
          console.error(
            "[useActivitySubmission] FIT upload failed:",
            errorMessage,
          );

          Alert.alert(
            "Upload Failed",
            "Failed to upload activity file. Please check your connection and try again.",
          );

          dispatch({
            type: "ERROR",
            error: errorMessage,
          });
          throw new Error(errorMessage);
        }
      } else {
        throw new Error("No FIT file found in recording metadata");
      }
    } catch (err) {
      console.error("[useActivitySubmission] Upload failed:", err);

      // Show user-friendly error message
      const errorMessage = err instanceof Error ? err.message : "Upload failed";

      // Don't show duplicate alert if we already showed one
      if (
        !errorMessage.includes("upload") &&
        !errorMessage.includes("process")
      ) {
        Alert.alert(
          "Upload Failed",
          "Failed to save your activity. Please try again.",
        );
      }

      dispatch({
        type: "ERROR",
        error: errorMessage,
      });
      throw err;
    }
  }, [state.activity, service, processFitFileMutation, queryClient]);

  // ================================
  // Return Clean API
  // ================================

  return {
    // State flags
    isLoading: state.phase === "loading",
    isReady: state.phase === "ready",
    isUploading: state.phase === "uploading",
    isSuccess: state.phase === "success",
    isError: state.phase === "error",

    // Data (null-safe access)
    activity: state.activity,
    error: state.error,

    // Actions
    update,
    submit,
  };
}
