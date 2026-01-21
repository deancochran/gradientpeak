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
  PublicActivityStreamsInsert,
} from "@repo/core";
import pako from "pako";
import { useCallback, useEffect, useReducer } from "react";

// ================================
// Types
// ================================

type SubmissionPhase = "loading" | "ready" | "uploading" | "success" | "error";

interface SubmissionState {
  phase: SubmissionPhase;
  activity: PublicActivitiesInsert | null;
  streams: Omit<PublicActivityStreamsInsert, "activity_id">[] | null;
  error: string | null;
}

type Action =
  | {
      type: "READY";
      activity: PublicActivitiesInsert;
      streams: Omit<PublicActivityStreamsInsert, "activity_id">[];
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
        streams: action.streams,
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

async function compressStreamData(
  aggregated: AggregatedStream,
): Promise<Omit<PublicActivityStreamsInsert, "activity_id">> {
  let compressedValues: Uint8Array;
  let originalSize: number;

  if (aggregated.dataType === "latlng") {
    // Store nested array directly as JSON
    const jsonStr = JSON.stringify(aggregated.values);
    compressedValues = pako.gzip(new TextEncoder().encode(jsonStr));
    originalSize = jsonStr.length + aggregated.timestamps.length * 4;
  } else {
    // For numeric data, use Float32Array
    const valuesArray = new Float32Array(aggregated.values as number[]);
    compressedValues = pako.gzip(new Uint8Array(valuesArray.buffer));
    originalSize = valuesArray.byteLength + aggregated.timestamps.length * 4;
  }

  const timestampsArray = new Float32Array(aggregated.timestamps);
  const compressedTimestamps = pako.gzip(
    new Uint8Array(timestampsArray.buffer),
  );

  return {
    type: aggregated.metric,
    data_type: aggregated.dataType,
    compressed_values: uint8ArrayToBase64(compressedValues),
    compressed_timestamps: uint8ArrayToBase64(compressedTimestamps),
    sample_count: aggregated.sampleCount,
    original_size: originalSize,
    min_value: aggregated.minValue,
    max_value: aggregated.maxValue,
    avg_value: aggregated.avgValue,
  };
}

// ================================
// Main Hook
// ================================

export function useActivitySubmission(service: ActivityRecorderService | null) {
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(submissionReducer, {
    phase: "loading",
    activity: null,
    streams: null,
    error: null,
  });

  // Mutation for calculating activity metrics (TSS, zones, curves, test detection)
  const calculateMetricsMutation =
    trpc.activities.calculateMetrics.useMutation();

  const createActivityWithStreamsMutation =
    trpc.activities.createWithStreams.useMutation({
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
            (Array.isArray(query.queryKey) &&
              query.queryKey[0]?.[0] === "home"),
        });

        // Invalidate trends to update charts with new activity data
        queryClient.invalidateQueries({
          queryKey: queryKeys.trends.all(),
        });

        // Set the new activity in cache
        if (data.id) {
          queryClient.setQueryData(queryKeys.activities.detail(data.id), data);
        }

        console.log(
          "[useActivitySubmission] Activity uploaded successfully. Triggering metrics calculation...",
        );

        // Trigger async metrics calculation (TSS, zones, curves, test detection)
        // This uses temporal metric lookup from profile_performance_metric_logs
        // and profile_metric_logs tables with intelligent defaults
        if (data.id) {
          try {
            await calculateMetricsMutation.mutateAsync({
              activityId: data.id,
            });
            console.log(
              "[useActivitySubmission] Metrics calculated successfully",
            );

            // Invalidate activity detail to show updated metrics
            queryClient.invalidateQueries({
              queryKey: queryKeys.activities.detail(data.id),
            });
          } catch (error) {
            console.error(
              "[useActivitySubmission] Failed to calculate metrics:",
              error,
            );
            // Don't fail the whole upload if metrics calculation fails
            // User can manually recalculate later
          }
        }
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

      // 2. Compress streams with error handling
      const compressedStreams: Omit<
        PublicActivityStreamsInsert,
        "activity_id"
      >[] = [];
      const compressionErrors: Array<{ stream: string; error: Error }> = [];

      for (const [key, aggregated] of aggregatedStreams.entries()) {
        try {
          const compressed = await compressStreamData(aggregated);
          compressedStreams.push(compressed);
          console.log(
            `[useActivitySubmission] Successfully compressed stream: ${key}`,
          );
        } catch (error) {
          console.error(
            `[useActivitySubmission] Failed to compress stream ${key}:`,
            error,
          );
          compressionErrors.push({
            stream: key,
            error: error instanceof Error ? error : new Error(String(error)),
          });

          // Store uncompressed data as fallback
          // This prevents complete data loss
          console.warn(
            `[useActivitySubmission] Storing ${key} as uncompressed fallback`,
          );

          // Create a fallback stream entry with raw data
          const fallbackStream: Omit<
            PublicActivityStreamsInsert,
            "activity_id"
          > = {
            type: aggregated.metric,
            data_type: aggregated.dataType,
            compressed_values: JSON.stringify(aggregated.values),
            compressed_timestamps: JSON.stringify(aggregated.timestamps),
            sample_count: aggregated.sampleCount,
            original_size:
              aggregated.values.length * 8 + aggregated.timestamps.length * 4,
            min_value: aggregated.minValue,
            max_value: aggregated.maxValue,
            avg_value: aggregated.avgValue,
          };
          compressedStreams.push(fallbackStream);
        }
      }

      // Warn user if compression failed for any streams
      if (compressionErrors.length > 0) {
        const streamNames = compressionErrors.map((e) => e.stream).join(", ");
        console.warn(
          `[useActivitySubmission] ${compressionErrors.length} stream(s) failed compression: ${streamNames}`,
        );

        // Note: Alert shown but processing continues
        // Data is saved with larger file size rather than lost
        Alert.alert(
          "Compression Warning",
          `Some activity data (${streamNames}) couldn't be compressed. Your activity will be uploaded with a larger file size. All data is preserved.`,
          [{ text: "OK" }],
        );
      }

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
        metrics: calculatedMetrics.metrics as any, // JSONB metrics object
        hr_zone_seconds: calculatedMetrics.hrZoneSeconds ?? undefined,
        power_zone_seconds: calculatedMetrics.powerZoneSeconds ?? undefined,
        activity_plan_id: activityPlanId, // Use activity_plan_id instead of planned_activity_id
      };

      console.log("[useActivitySubmission] Activity processed successfully");
      dispatch({ type: "READY", activity, streams: compressedStreams });
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

  const submit = useCallback(async () => {
    if (!state.activity || !state.streams || !service) {
      throw new Error("No data to submit");
    }

    dispatch({ type: "UPLOADING" });

    try {
      await createActivityWithStreamsMutation.mutateAsync({
        activity: state.activity,
        activity_streams: state.streams,
      });

      // Clean up stream files after successful upload
      await service.liveMetricsManager.streamBuffer.cleanup();

      console.log(
        "[useActivitySubmission] Activity uploaded, cache invalidated, and local files deleted",
      );
      dispatch({ type: "SUCCESS" });
    } catch (err) {
      console.error("[useActivitySubmission] Upload failed:", err);
      dispatch({
        type: "ERROR",
        error: err instanceof Error ? err.message : "Upload failed",
      });
      throw err;
    }
  }, [
    state.activity,
    state.streams,
    service,
    createActivityWithStreamsMutation,
  ]);

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
    streams: state.streams,
    error: state.error,

    // Actions
    update,
    submit,
  };
}
