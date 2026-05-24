import { decodePolyline } from "@repo/core";
import { useMemo } from "react";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

export interface ActivityDetailStreamData {
  type: string;
  stream: NumericActivityStream;
  color: string;
  label: string;
  unit: string;
  yAxis?: "left" | "right";
}

export type NumericActivityStream = Omit<DecompressedStream, "dataType" | "values"> & {
  dataType: "float";
  values: Array<number | null>;
};

type ActivityLike = {
  id?: string | null;
  polyline?: string | null;
  type?: string | null;
};

type ActivityStreamsData =
  | {
      records?: any[] | null;
    }
  | null
  | undefined;

export function getStreamStats(values: Array<number | null | undefined>) {
  const finiteValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (finiteValues.length === 0) return { min: 0, max: 0, avg: 0 };

  let min = finiteValues[0] ?? 0;
  let max = finiteValues[0] ?? 0;
  let sum = 0;

  for (const value of finiteValues) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  return {
    min,
    max,
    avg: sum / finiteValues.length,
  };
}

function readMetricValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPaceMinutesPerKm(speedMetersPerSecond: unknown): number | null {
  if (typeof speedMetersPerSecond !== "number" || !Number.isFinite(speedMetersPerSecond)) {
    return null;
  }

  const minutesPerKm = 1000 / speedMetersPerSecond / 60;
  return Number.isFinite(minutesPerKm) ? minutesPerKm : null;
}

function hasFiniteMetricValue(data: Array<{ val: number | null }>): boolean {
  return data.some((entry) => typeof entry.val === "number" && Number.isFinite(entry.val));
}

export function useActivityDetailStreams({
  activity,
  streamsData,
}: {
  activity: ActivityLike | null | undefined;
  streamsData: ActivityStreamsData;
}) {
  const routeCoordinates = useMemo(() => {
    if (activity?.polyline) {
      return decodePolyline(activity.polyline);
    }

    const records = streamsData?.records;
    if (!records || records.length === 0) {
      return [];
    }

    const coordinates: Array<{ latitude: number; longitude: number }> = [];

    for (const record of records) {
      const latitude =
        typeof record.positionLat === "number"
          ? record.positionLat
          : typeof record.latitude === "number"
            ? record.latitude
            : null;
      const longitude =
        typeof record.positionLong === "number"
          ? record.positionLong
          : typeof record.longitude === "number"
            ? record.longitude
            : null;

      if (
        latitude !== null &&
        longitude !== null &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0)
      ) {
        coordinates.push({ latitude, longitude });
      }
    }

    return coordinates;
  }, [activity?.polyline, streamsData?.records]);

  const streamModel = useMemo(() => {
    if (!streamsData?.records) {
      return { chartStreams: [], elevationStream: null, distanceStream: null };
    }

    const hrData: { val: number | null; ts: number }[] = [];
    const powerData: { val: number | null; ts: number }[] = [];
    const speedData: { val: number | null; ts: number }[] = [];
    const cadenceData: { val: number | null; ts: number }[] = [];
    const altData: { val: number; ts: number }[] = [];
    const distData: { val: number; ts: number }[] = [];

    streamsData.records.forEach((record) => {
      const ts = new Date(record.timestamp).getTime();
      if (!Number.isFinite(ts)) return;

      if (record.heartRate !== undefined) {
        hrData.push({ val: readMetricValue(record.heartRate), ts });
      }
      if (record.power !== undefined) {
        powerData.push({ val: readMetricValue(record.power), ts });
      }

      if (record.speed !== undefined) {
        const value =
          activity?.type === "run"
            ? readPaceMinutesPerKm(record.speed)
            : readMetricValue(record.speed * 3.6);
        speedData.push({ val: value, ts });
      }

      if (record.cadence !== undefined) {
        cadenceData.push({ val: readMetricValue(record.cadence), ts });
      }
      if (record.altitude !== undefined) altData.push({ val: record.altitude, ts });
      if (record.distance !== undefined) distData.push({ val: record.distance, ts });
    });

    const createStream = (
      type: string,
      data: { val: number | null; ts: number }[],
    ): NumericActivityStream => ({
      type,
      dataType: "float",
      values: data.map((entry) => entry.val),
      timestamps: data.map((entry) => entry.ts),
      sampleCount: data.length,
    });

    const createNumberStream = (
      type: string,
      data: { val: number; ts: number }[],
    ): DecompressedStream => ({
      type,
      dataType: "float",
      values: data.map((entry) => entry.val),
      timestamps: data.map((entry) => entry.ts),
      sampleCount: data.length,
    });

    const chartStreams: ActivityDetailStreamData[] = [];

    if (hasFiniteMetricValue(hrData)) {
      chartStreams.push({
        type: "heartrate",
        stream: createStream("heartrate", hrData),
        color: "#ef4444",
        label: "Heart Rate",
        unit: "bpm",
      });
    }

    if (hasFiniteMetricValue(powerData)) {
      chartStreams.push({
        type: "power",
        stream: createStream("power", powerData),
        color: "#a855f7",
        label: "Power",
        unit: "W",
      });
    }

    if (hasFiniteMetricValue(speedData)) {
      const isRun = activity?.type === "run";
      chartStreams.push({
        type: "speed",
        stream: createStream("speed", speedData),
        color: "#3b82f6",
        label: isRun ? "Pace" : "Speed",
        unit: isRun ? "min/km" : "km/h",
      });
    }

    if (hasFiniteMetricValue(cadenceData)) {
      chartStreams.push({
        type: "cadence",
        stream: createStream("cadence", cadenceData),
        color: "#22c55e",
        label: "Cadence",
        unit: activity?.type === "run" ? "spm" : "rpm",
      });
    }

    return {
      chartStreams,
      elevationStream: altData.length > 0 ? createNumberStream("altitude", altData) : null,
      distanceStream: distData.length > 0 ? createNumberStream("distance", distData) : null,
    };
  }, [activity?.type, streamsData?.records]);

  return {
    routeCoordinates,
    ...streamModel,
  };
}
