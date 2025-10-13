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

import { localdb } from "@/lib/db";
import {
  activityRecordings,
  activityRecordingStreams,
  SelectActivityRecording,
  SelectRecordingStream,
} from "@/lib/db/schemas";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { trpc } from "@/lib/trpc";

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
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityStreamsInsert,
} from "@repo/core";
import { eq } from "drizzle-orm";
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
  | { type: "UPDATE"; updates: { name?: string; notes?: string } }
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

function parseStreamData(stream: SelectRecordingStream): {
  data: number[] | number[][];
  timestamps: number[];
} {
  const data = JSON.parse(stream.data as string);
  const timestamps = JSON.parse(stream.timestamps as string);

  if (!Array.isArray(data) || !Array.isArray(timestamps)) {
    throw new Error("Invalid stream data format");
  }

  return { data, timestamps };
}

function groupStreamsByMetric(
  streams: SelectRecordingStream[],
): Map<string, SelectRecordingStream[]> {
  const grouped = new Map<string, SelectRecordingStream[]>();

  for (const stream of streams) {
    const existing = grouped.get(stream.metric);
    if (existing) {
      existing.push(stream);
    } else {
      grouped.set(stream.metric, [stream]);
    }
  }

  return grouped;
}

function aggregateMetricStreams(
  streams: SelectRecordingStream[],
): AggregatedStream {
  if (streams.length === 0) {
    throw new Error("Cannot aggregate empty stream array");
  }

  const firstStream = streams[0];
  const allTimestamps: number[] = [];

  // Handle lat/lng data differently
  if (firstStream.dataType === "latlng") {
    const allLatLngPairs: number[][] = [];

    for (const stream of streams) {
      const parsed = parseStreamData(stream);
      if (Array.isArray(parsed.data[0])) {
        // It's an array of [lat, lng] pairs
        allLatLngPairs.push(...(parsed.data as number[][]));
        allTimestamps.push(...parsed.timestamps);
      }
    }

    return {
      metric: firstStream.metric,
      dataType: firstStream.dataType,
      values: allLatLngPairs as any, // Keep as nested array
      timestamps: allTimestamps,
      sampleCount: allLatLngPairs.length, // Count pairs, not individual values
      minValue: undefined,
      maxValue: undefined,
      avgValue: undefined,
    };
  }

  // Handle regular numeric data
  const allValues: number[] = [];

  // Pre-allocate arrays
  let totalSize = 0;
  for (const stream of streams) {
    totalSize += stream.sampleCount;
  }

  allValues.length = totalSize;
  allTimestamps.length = totalSize;

  let offset = 0;
  for (const stream of streams) {
    const parsed = parseStreamData(stream);

    for (let i = 0; i < parsed.data.length; i++) {
      allValues[offset + i] = parsed.data[i] as number;
      allTimestamps[offset + i] = parsed.timestamps[i];
    }

    offset += parsed.data.length;
  }

  // Calculate statistics
  let minValue: number | undefined;
  let maxValue: number | undefined;
  let avgValue: number | undefined;

  if (firstStream.dataType === "float" && allValues.length > 0) {
    let sum = 0;
    minValue = allValues[0];
    maxValue = allValues[0];

    for (let i = 0; i < allValues.length; i++) {
      const val = allValues[i];
      sum += val;
      if (val < minValue) minValue = val;
      if (val > maxValue) maxValue = val;
    }

    avgValue = sum / allValues.length;
  }

  return {
    metric: firstStream.metric,
    dataType: firstStream.dataType,
    values: allValues,
    timestamps: allTimestamps,
    sampleCount: allValues.length,
    minValue,
    maxValue,
    avgValue,
  };
}

function calculateActivityMetrics(
  recording: SelectActivityRecording,
  aggregatedStreams: Map<string, AggregatedStream>,
): Omit<
  PublicActivitiesInsert,
  | "id"
  | "name"
  | "notes"
  | "activity_type"
  | "started_at"
  | "finished_at"
  | "planned_activity_id"
  | "profile_id"
  | "profile_age"
  | "profile_ftp"
  | "profile_threshold_hr"
  | "profile_weight_kg"
> {
  if (!recording.startedAt || !recording.endedAt) {
    throw new Error(
      `Invalid recording: startedAt=${recording.startedAt}, endedAt=${recording.endedAt}`,
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
  const elapsed_time = calculateElapsedTime(
    recording.startedAt,
    recording.endedAt,
  );
  const moving_time = calculateMovingTime(
    recording.startedAt,
    recording.endedAt,
    aggregatedStreams,
  );

  // Simple aggregated values
  const distance = Math.round(distanceStream?.maxValue || 0);
  const avg_heart_rate = hrStream?.avgValue
    ? Math.round(hrStream.avgValue)
    : undefined;
  const max_heart_rate = hrStream?.maxValue
    ? Math.round(hrStream.maxValue)
    : undefined;
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
  const normalized_power = calculateNormalizedPower(powerStream);
  const intensity_factor = calculateIntensityFactor(
    powerStream,
    recording.profile.ftp,
  );
  const training_stress_score = Math.round(
    calculateTSS(
      recording.startedAt,
      recording.endedAt,
      powerStream,
      recording.profile,
    ) || 0,
  );
  const variability_index = Math.round(
    calculateVariabilityIndex(powerStream, normalized_power) || 0,
  );
  const total_work = Math.round(
    calculateTotalWork(powerStream, elapsed_time) || 0,
  );

  // Zone calculations
  const hr_zones = calculateHRZones(hrStream, recording.profile.threshold_hr);
  const power_zones = calculatePowerZones(powerStream, recording.profile.ftp);

  // Multi-stream advanced metrics
  const efficiency_factor = Math.round(
    calculateEfficiencyFactor(powerStream, hrStream) || 0,
  );
  const decoupling = Math.round(
    calculateDecoupling(powerStream, hrStream) || 0,
  );
  const power_heart_rate_ratio = calculatePowerHeartRateRatio(
    powerStream,
    hrStream,
  );
  const power_weight_ratio = calculatePowerWeightRatio(
    powerStream,
    recording.profile.weight_kg,
  );

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

  // Calories
  const calories = Math.round(
    calculateCalories(
      recording.startedAt,
      recording.endedAt,
      recording.profile,
      powerStream,
      hrStream,
    ) || 0,
  );

  return {
    elapsed_time,
    moving_time,
    distance,
    avg_speed,
    max_speed,
    avg_heart_rate,
    max_heart_rate,
    hr_zone_1_time: hr_zones.zone1,
    hr_zone_2_time: hr_zones.zone2,
    hr_zone_3_time: hr_zones.zone3,
    hr_zone_4_time: hr_zones.zone4,
    hr_zone_5_time: hr_zones.zone5,
    avg_power,
    max_power,
    normalized_power,
    intensity_factor,
    training_stress_score,
    variability_index,
    total_work,
    power_zone_1_time: power_zones.zone1,
    power_zone_2_time: power_zones.zone2,
    power_zone_3_time: power_zones.zone3,
    power_zone_4_time: power_zones.zone4,
    power_zone_5_time: power_zones.zone5,
    power_zone_6_time: power_zones.zone6,
    power_zone_7_time: power_zones.zone7,
    avg_cadence,
    max_cadence,

    total_ascent,
    total_descent,
    avg_grade,
    elevation_gain_per_km,
    efficiency_factor,
    decoupling,
    power_heart_rate_ratio,
    power_weight_ratio,
    calories,
  };
}

function getDataTypeForMetric(
  metric: PublicActivityMetric,
): PublicActivityMetricDataType {
  switch (metric) {
    case "latlng":
      return "latlng";
    case "moving":
      return "boolean";
    default:
      return "float";
  }
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
  metric: PublicActivityMetric,
  dataType: PublicActivityMetricDataType,
): Promise<Omit<PublicActivityStreamsInsert, "activity_id">> {
  let compressedValues: Uint8Array;
  let originalSize: number;

  if (dataType === "latlng") {
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
    type: metric,
    data_type: dataType,
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
  const [state, dispatch] = useReducer(submissionReducer, {
    phase: "loading",
    activity: null,
    streams: null,
    error: null,
  });

  const createActivityWithStreamsMutation =
    trpc.activities.createWithStreams.useMutation();

  // ================================
  // Auto-process recording on recordingComplete event
  // ================================

  const processRecording = useCallback(async () => {
    if (!service?.recording?.id) {
      dispatch({ type: "ERROR", error: "No recording found" });
      return;
    }

    // Wait for recording to be in finished state
    if (service.state !== "finished") {
      console.log(
        "[useActivitySubmission] Recording not finished yet, waiting...",
      );
      return;
    }

    try {
      const recordingId = service.recording.id;
      console.log("[useActivitySubmission] Processing recording:", recordingId);

      // 1. Fetch recording and streams from local DB
      const [recording] = await localdb
        .select()
        .from(activityRecordings)
        .where(eq(activityRecordings.id, recordingId))
        .limit(1);

      if (!recording) {
        throw new Error("Recording not found in database");
      }

      // Verify recording has been properly finished
      if (!recording.startedAt || !recording.endedAt) {
        throw new Error(
          "Recording is not properly finished. Missing start or end time.",
        );
      }

      const streams = await localdb
        .select()
        .from(activityRecordingStreams)
        .where(eq(activityRecordingStreams.activityRecordingId, recordingId));

      if (streams.length === 0) {
        throw new Error("No streams found for recording");
      }

      console.log(
        `[useActivitySubmission] Found ${streams.length} streams for recording`,
      );

      // 2. Aggregate streams by metric
      const streamsByMetric = groupStreamsByMetric(streams);
      const aggregatedStreams = new Map<string, AggregatedStream>();

      for (const [metric, metricStreams] of streamsByMetric.entries()) {
        const aggregated = aggregateMetricStreams(metricStreams);
        aggregatedStreams.set(metric, aggregated);
      }

      // 3. Calculate activity metrics
      const metrics = calculateActivityMetrics(recording, aggregatedStreams);

      // 4. Compress streams
      const compressedStreams: Omit<
        PublicActivityStreamsInsert,
        "activity_id"
      >[] = [];

      for (const [metric, aggregated] of aggregatedStreams.entries()) {
        const compressed = await compressStreamData(
          aggregated,
          metric as PublicActivityMetric,
          getDataTypeForMetric(metric as PublicActivityMetric),
        );
        compressedStreams.push(compressed);
      }

      // 5. Build final activity object
      const profileAge = calculateAge(recording.profile.dob);
      const activity: PublicActivitiesInsert = {
        profile_id: recording.profile.id,
        started_at: recording.startedAt,
        finished_at: recording.endedAt,
        name: `${recording.activityType.replace(/_/g, " ")} - ${new Date(recording.startedAt).toLocaleDateString()}`,
        activity_type: recording.activityType,
        profile_age: profileAge,
        profile_ftp: recording.profile.ftp,
        profile_threshold_hr: recording.profile.threshold_hr,
        profile_weight_kg: recording.profile.weight_kg,
        planned_activity_id: recording.plannedActivityId || null,
        ...metrics,
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
  }, [service?.recording?.id, service?.state]);

  // Listen for recording completion event
  useEffect(() => {
    if (!service) return;

    const handleRecordingComplete = (recordingId: string) => {
      console.log(
        "[useActivitySubmission] Recording complete event received:",
        recordingId,
      );
      if (recordingId === service.recording?.id) {
        processRecording();
      }
    };

    service.on("recordingComplete", handleRecordingComplete);

    // Also check if already finished (in case event was missed)
    if (service.state === "finished" && service.recording?.id) {
      console.log(
        "[useActivitySubmission] Recording already finished, processing...",
      );
      processRecording();
    }

    return () => {
      service.off("recordingComplete", handleRecordingComplete);
    };
  }, [service, processRecording]);

  // ================================
  // Actions
  // ================================

  const update = useCallback((updates: { name?: string; notes?: string }) => {
    dispatch({ type: "UPDATE", updates });
  }, []);

  const submit = useCallback(async () => {
    if (!state.activity || !state.streams || !service?.recording?.id) {
      throw new Error("No data to submit");
    }

    dispatch({ type: "UPLOADING" });

    try {
      await createActivityWithStreamsMutation.mutateAsync({
        activity: state.activity,
        activity_streams: state.streams,
      });

      // Delete local recording after successful upload
      await localdb
        .delete(activityRecordings)
        .where(eq(activityRecordings.id, service.recording.id));

      console.log(
        "[useActivitySubmission] Activity uploaded and local data deleted",
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
    service?.recording?.id,
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
