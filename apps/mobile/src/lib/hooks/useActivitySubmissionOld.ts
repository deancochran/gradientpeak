import { localdb } from "@/lib/db";
import {
  activityRecordings,
  activityRecordingStreams,
  SelectActivityRecording,
  SelectRecordingStream,
} from "@/lib/db/schemas";
import { trpc } from "@/lib/trpc";
import { createId } from "@paralleldrive/cuid2";
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
  calculateMaxHRPercent,
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
  PublicProfilesRow,
} from "@repo/core";
import { eq } from "drizzle-orm";
import pako from "pako";
import { useCallback, useEffect, useState } from "react";

export type SubmissionState =
  | "idle"
  | "preparing"
  | "aggregating"
  | "computing"
  | "compressing"
  | "ready"
  | "uploading"
  | "success"
  | "error";

export interface ActivityPayload {
  activity: PublicActivitiesInsert;
  streams: PublicActivityStreamsInsert[];
}

interface UseActivitySubmissionProps {
  recordingId: string;
  profile?: PublicProfilesRow;
}

export const useActivitySubmission = ({
  recordingId,
  profile,
}: UseActivitySubmissionProps) => {
  const [state, setState] = useState<SubmissionState>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [payload, setPayload] = useState<ActivityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createActivityMutation = trpc.activities.create.useMutation();

  // ================================
  // Stream Aggregation
  // ================================
  const parseStreamData = useCallback(
    (
      stream: SelectRecordingStream,
    ): {
      data: number[];
      timestamps: number[];
    } => {
      try {
        const data = JSON.parse(stream.data as string);
        const timestamps = JSON.parse(stream.timestamps as string);

        if (!Array.isArray(data) || !Array.isArray(timestamps)) {
          throw new Error("Invalid stream data format");
        }

        return { data: data as number[], timestamps: timestamps as number[] };
      } catch (error) {
        throw new Error(`Failed to parse stream data: ${error}`);
      }
    },
    [],
  );

  const groupStreamsByMetric = useCallback(
    (
      streams: SelectRecordingStream[],
    ): Map<string, SelectRecordingStream[]> => {
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
    },
    [],
  );

  const aggregateMetricStreams = useCallback(
    (streams: SelectRecordingStream[]): AggregatedStream => {
      if (streams.length === 0) {
        throw new Error("Cannot aggregate empty stream array");
      }

      const firstStream = streams[0];
      const allValues: number[] = [];
      const allTimestamps: number[] = [];

      // Pre-allocate arrays if we know the total size
      let totalSize = 0;
      for (const stream of streams) {
        totalSize += stream.sampleCount;
      }

      allValues.length = totalSize;
      allTimestamps.length = totalSize;

      let offset = 0;
      for (const stream of streams) {
        const parsed = parseStreamData(stream);

        // Copy data into pre-allocated arrays
        for (let i = 0; i < parsed.data.length; i++) {
          allValues[offset + i] = parsed.data[i];
          allTimestamps[offset + i] = parsed.timestamps[i];
        }

        offset += parsed.data.length;
      }

      // Calculate statistics for numeric metrics in a single pass
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
    },
    [parseStreamData],
  );

  // ================================
  // Metrics Calculation
  // ================================
  const calculateActivityMetrics = useCallback(
    (
      recording: SelectActivityRecording,
      aggregatedStreams: Map<string, AggregatedStream>,
    ): Omit<
      PublicActivitiesInsert,
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
    > => {
      if (!recording.startedAt || !recording.endedAt) {
        throw new Error("Invalid recording");
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
      const distance = distanceStream?.maxValue || 0;
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
      const training_stress_score = calculateTSS(
        recording.startedAt,
        recording.endedAt,
        powerStream,
        recording.profile,
      );
      const variability_index = calculateVariabilityIndex(
        powerStream,
        normalized_power,
      );
      const total_work = calculateTotalWork(powerStream, elapsed_time);

      // Zone calculations
      const hr_zones = calculateHRZones(
        hrStream,
        recording.profile.threshold_hr,
      );
      const power_zones = calculatePowerZones(
        powerStream,
        recording.profile.ftp,
      );
      const max_hr_percent = calculateMaxHRPercent(
        hrStream,
        recording.profile.threshold_hr,
      );

      // Multi-stream advanced metrics
      const efficiency_factor = calculateEfficiencyFactor(
        powerStream,
        hrStream,
      );
      const decoupling = calculateDecoupling(powerStream, hrStream);
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
      const avg_grade = calculateAverageGrade(gradientStream);
      const elevation_gain_per_km = calculateElevationGainPerKm(
        totalAscent,
        distanceStream,
      );

      // Calories
      const calories = calculateCalories(
        recording.startedAt,
        recording.endedAt,
        recording.profile,
        powerStream,
        hrStream,
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
        total_ascent: totalAscent,
        total_descent: totalDescent,
        avg_grade,
        elevation_gain_per_km,
        efficiency_factor,
        decoupling,
        power_heart_rate_ratio,
        power_weight_ratio,
        calories,
      };
    },
    [],
  );

  // ================================
  // Stream Compression
  // ================================
  const getDataTypeForMetric = useCallback(
    (metric: PublicActivityMetric): PublicActivityMetricDataType => {
      switch (metric) {
        case "latlng":
          return "latlng";
        case "moving":
          return "boolean";
        default:
          return "float";
      }
    },
    [],
  );

  const compressStreamData = useCallback(
    async (
      activityId: string,
      aggregated: AggregatedStream,
      metric: PublicActivityMetric,
      dataType: PublicActivityMetricDataType,
    ): Promise<PublicActivityStreamsInsert> => {
      // Convert to Float32Array for efficient compression
      const valuesArray = new Float32Array(aggregated.values);
      const timestampsArray = new Float32Array(aggregated.timestamps);

      // Compress using pako (gzip)
      const compressedValues = pako.gzip(new Uint8Array(valuesArray.buffer));
      const compressedTimestamps = pako.gzip(
        new Uint8Array(timestampsArray.buffer),
      );

      const originalSize = valuesArray.byteLength + timestampsArray.byteLength;

      return {
        activity_id: activityId,
        type: metric,
        data_type: dataType,
        compressed_values: Buffer.from(compressedValues).toString("base64"),
        compressed_timestamps:
          Buffer.from(compressedTimestamps).toString("base64"),
        sample_count: aggregated.sampleCount,
        original_size: originalSize,
        min_value: aggregated.minValue,
        max_value: aggregated.maxValue,
        avg_value: aggregated.avgValue,
      };
    },
    [],
  );

  // ================================
  // Payload Preparation
  // ================================
  const preparePayload = useCallback(async (): Promise<ActivityPayload> => {
    setState("preparing");
    setProgress(10);

    // Fetch recording and streams
    const recording = await localdb
      .select()
      .from(activityRecordings)
      .where(eq(activityRecordings.id, recordingId))
      .limit(1);

    if (!recording[0]) throw new Error("Recording not found");

    const streams = await localdb
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, recordingId))
      .orderBy(
        activityRecordingStreams.metric,
        activityRecordingStreams.chunkIndex,
      );

    if (streams.length === 0) throw new Error("No streams found for recording");

    setProgress(20);
    setState("aggregating");

    // Aggregate streams
    const aggregatedStreams = new Map<string, AggregatedStream>();
    const streamsByMetric = groupStreamsByMetric(streams);

    let currentMetric = 0;
    const totalMetrics = streamsByMetric.size;

    for (const [metric, metricStreams] of streamsByMetric.entries()) {
      const aggregated = aggregateMetricStreams(metricStreams);
      aggregatedStreams.set(metric, aggregated);
      currentMetric++;
      setProgress(20 + (currentMetric / totalMetrics) * 20); // 20-40%
    }

    setState("computing");
    setProgress(45);

    // Calculate metrics
    const metrics = calculateActivityMetrics(recording[0], aggregatedStreams);

    setProgress(60);
    setState("compressing");

    // Generate activity ID
    const activity_id = createId();

    // Compress streams
    const activity_streams: PublicActivityStreamsInsert[] = [];
    let compressedCount = 0;

    for (const [metric, aggregated] of aggregatedStreams.entries()) {
      const compressed = await compressStreamData(
        activity_id,
        aggregated,
        metric as PublicActivityMetric,
        getDataTypeForMetric(metric as PublicActivityMetric),
      );
      activity_streams.push(compressed);
      compressedCount++;
      setProgress(60 + (compressedCount / aggregatedStreams.size) * 30); // 60-90%
    }

    setProgress(90);

    // Create activity object
    const profile_age = calculateAge(recording[0].profile.dob);
    const activity: PublicActivitiesInsert = {
      id: activity_id,
      profile_id: recording[0].profile.id,
      started_at: recording[0].startedAt!,
      finished_at: recording[0].endedAt!,
      name: `Activity ${new Date().toLocaleDateString()}`,
      activity_type: recording[0].activityType,
      profile_age,
      profile_ftp: recording[0].profile.ftp,
      profile_threshold_hr: recording[0].profile.threshold_hr,
      profile_weight_kg: recording[0].profile.weight_kg,
      ...metrics,
    };

    setProgress(100);
    setState("ready");

    return {
      activity,
      streams: activity_streams,
    };
  }, [
    recordingId,
    profile,
    groupStreamsByMetric,
    aggregateMetricStreams,
    calculateActivityMetrics,
    compressStreamData,
    getDataTypeForMetric,
  ]);

  // ================================
  // Public Methods
  // ================================
  const prepare = useCallback(async () => {
    if (state !== "idle") return;

    setError(null);

    try {
      const preparedPayload = await preparePayload();
      setPayload(preparedPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to prepare payload",
      );
      setState("error");
      setProgress(0);
    }
  }, [state, preparePayload]);

  const updateActivityDetails = useCallback(
    (updates: { name?: string; notes?: string }) => {
      if (!payload) return;

      setPayload({
        ...payload,
        activity: {
          ...payload.activity,
          ...updates,
        },
      });
    },
    [payload],
  );

  const submit = useCallback(async () => {
    if (state !== "ready" || !payload) {
      throw new Error("Payload not ready for submission");
    }

    setState("uploading");
    setError(null);

    try {
      const response = await createActivityMutation.mutateAsync({
        activity: payload.activity,
        activity_streams: payload.streams,
      });

      await localdb
        .delete(activityRecordings)
        .where(eq(activityRecordings.id, recordingId));

      setState("success");
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setState("error");
      throw err;
    }
  }, [state, payload, recordingId, createActivityMutation]);

  const retry = useCallback(() => {
    setState("idle");
    setProgress(0);
    setError(null);
    setPayload(null);
  }, []);

  return {
    // State
    state,
    progress,
    payload,
    error,

    // Status helpers
    isPreparing:
      state === "preparing" ||
      state === "aggregating" ||
      state === "computing" ||
      state === "compressing",
    isReady: state === "ready",
    isUploading: state === "uploading",
    isSuccess: state === "success",
    isError: state === "error",

    // Methods
    prepare,
    updateActivityDetails,
    submit,
    retry,
  };
};
