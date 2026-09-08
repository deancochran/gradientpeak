import type { CompletedActivitySegmentSet } from "../activity-segments";
import { completedActivitySegmentSetSchema } from "../activity-segments";
import { calculateCyclingNormalizedPower } from "../calculations/normalized-power";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export type StravaCanonicalActivitySource = {
  id: string;
  name: string;
  sportType: string;
  startedAt: string;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  elevationGainMeters?: number | null;
  caloriesKcal?: number | null;
  averageHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  averagePowerWatts?: number | null;
  maxPowerWatts?: number | null;
  averageCadenceRpm?: number | null;
  averageSpeedMetersPerSecond?: number | null;
  maxSpeedMetersPerSecond?: number | null;
  deviceName?: string | null;
  summaryPolyline?: string | null;
};

export type StravaCanonicalStreams = Partial<{
  time: readonly number[];
  distance: readonly number[];
  heartrate: readonly number[];
  watts: readonly number[];
  cadence: readonly number[];
  velocity_smooth: readonly number[];
  altitude: readonly number[];
  latlng: readonly (readonly [number, number])[];
  moving: readonly boolean[];
  temp: readonly number[];
}>;

export type CanonicalStravaActivity = {
  activeMs: number;
  activityCategory: CanonicalActivityCategory;
  avgCadence: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  avgSpeedMps: number | null;
  avgTemperature: number | null;
  calories: number | null;
  contentVisibility: "private";
  deviceProduct: string | null;
  distanceMeters: number;
  elapsedMs: number;
  elevationGainMeters: number | null;
  evidenceTier: "provider_summary" | "raw_samples";
  externalId: string;
  finishedAt: Date;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  maxCadence: number | null;
  maxHeartRate: number | null;
  maxPower: number | null;
  maxSpeedMps: number | null;
  movingMs: number;
  name: string;
  polyline: string | null;
  segmentSet: CompletedActivitySegmentSet;
  startedAt: Date;
  timingCoverage: "complete";
};

const runTypes = new Set(["Run", "TrailRun", "VirtualRun", "Wheelchair"]);
const bikeTypes = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "VirtualRide",
  "EBikeRide",
  "EMountainBikeRide",
  "Velomobile",
]);
const swimTypes = new Set(["Swim"]);
const strengthTypes = new Set(["WeightTraining", "Crossfit"]);

export function mapStravaSportType(sportType: string): CanonicalActivityCategory {
  if (runTypes.has(sportType)) return "run";
  if (bikeTypes.has(sportType)) return "bike";
  if (swimTypes.has(sportType)) return "swim";
  if (strengthTypes.has(sportType)) return "strength";
  return "other";
}

function finiteNonnegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function average(values: readonly number[] | undefined): number | null {
  if (!values || values.length === 0) return null;
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0);
  return usable.length > 0 ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function maximum(values: readonly number[] | undefined): number | null {
  if (!values || values.length === 0) return null;
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0);
  return usable.length > 0 ? Math.max(...usable) : null;
}

function positiveElevationGain(values: readonly number[] | undefined): number | null {
  if (!values || values.length < 2) return null;
  let gain = 0;
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current !== undefined && previous !== undefined && current > previous)
      gain += current - previous;
  }
  return gain;
}

function mapBounds(
  points: readonly (readonly [number, number])[] | undefined,
): CanonicalStravaActivity["mapBounds"] {
  if (!points || points.length === 0) return null;
  const valid = points.filter(
    ([lat, lng]) =>
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180,
  );
  if (valid.length === 0) return null;
  return {
    minLat: Math.min(...valid.map(([lat]) => lat)),
    maxLat: Math.max(...valid.map(([lat]) => lat)),
    minLng: Math.min(...valid.map(([, lng]) => lng)),
    maxLng: Math.max(...valid.map(([, lng]) => lng)),
  };
}

function hasRawMetricStreams(streams: StravaCanonicalStreams): boolean {
  return Object.values(streams).some((values) => Array.isArray(values) && values.length > 0);
}

export function mapStravaActivityToCanonical(input: {
  activity: StravaCanonicalActivitySource;
  segmentId: string;
  streams?: StravaCanonicalStreams;
}): CanonicalStravaActivity {
  const streams = input.streams ?? {};
  const startedAt = new Date(input.activity.startedAt);
  if (!Number.isFinite(startedAt.getTime()))
    throw new Error("Strava activity start time is invalid");
  if (!Number.isFinite(input.activity.elapsedSeconds) || input.activity.elapsedSeconds <= 0) {
    throw new Error("Strava activity elapsed time is invalid");
  }
  const elapsedMs = Math.round(input.activity.elapsedSeconds * 1_000);
  const movingMs = Math.min(
    elapsedMs,
    Math.max(0, Math.round(input.activity.movingSeconds * 1_000)),
  );
  const activityCategory = mapStravaSportType(input.activity.sportType);
  const rawAverageHeartRate = average(streams.heartrate);
  const rawAveragePower = average(streams.watts);
  const rawAverageCadence = average(streams.cadence);
  const rawAverageSpeed = average(streams.velocity_smooth);
  const rawElevationGain = positiveElevationGain(streams.altitude);
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: (streams.time ?? []).map((timestampSeconds, index) => ({
      timestampSeconds,
      powerWatts: finiteNonnegative(streams.watts?.[index]),
      ...(streams.moving?.[index] === undefined ? {} : { included: streams.moving[index] }),
    })),
  });
  const distanceMeters =
    streams.distance && streams.distance.length > 0
      ? (finiteNonnegative(streams.distance.at(-1)) ?? input.activity.distanceMeters)
      : input.activity.distanceMeters;
  const summary = {
    version: 1 as const,
    timing: { timingCoverage: "complete" as const, activeMs: movingMs, movingMs },
    distanceMeters: Math.max(0, distanceMeters),
    ...((rawElevationGain ?? finiteNonnegative(input.activity.elevationGainMeters))
      ? {
          ascentMeters:
            rawElevationGain ?? finiteNonnegative(input.activity.elevationGainMeters) ?? 0,
        }
      : {}),
    ...(finiteNonnegative(input.activity.caloriesKcal) === null
      ? {}
      : { caloriesKcal: finiteNonnegative(input.activity.caloriesKcal) ?? 0 }),
    ...((rawAverageHeartRate ?? finiteNonnegative(input.activity.averageHeartRateBpm))
      ? {
          averageHeartRateBpm:
            rawAverageHeartRate ?? finiteNonnegative(input.activity.averageHeartRateBpm) ?? 0,
        }
      : {}),
    ...((rawAveragePower ?? finiteNonnegative(input.activity.averagePowerWatts))
      ? {
          averagePowerWatts:
            rawAveragePower ?? finiteNonnegative(input.activity.averagePowerWatts) ?? 0,
        }
      : {}),
    normalizedPowerResult,
    ...((rawAverageCadence ?? finiteNonnegative(input.activity.averageCadenceRpm))
      ? {
          averageCadenceRpm:
            rawAverageCadence ?? finiteNonnegative(input.activity.averageCadenceRpm) ?? 0,
        }
      : {}),
    ...((rawAverageSpeed ?? finiteNonnegative(input.activity.averageSpeedMetersPerSecond))
      ? {
          averageSpeedMetersPerSecond:
            rawAverageSpeed ?? finiteNonnegative(input.activity.averageSpeedMetersPerSecond) ?? 0,
        }
      : {}),
  };
  const segmentSet = completedActivitySegmentSetSchema.parse({
    version: 1,
    elapsedMs,
    segments: [
      {
        id: input.segmentId,
        ordinal: 0,
        role: "activity",
        activity_category: activityCategory,
        startOffsetMs: 0,
        endOffsetMs: elapsedMs,
        source: { kind: "raw", rawType: input.activity.sportType },
        summary,
      },
    ],
  });

  return {
    activeMs: movingMs,
    activityCategory,
    avgCadence: rawAverageCadence ?? finiteNonnegative(input.activity.averageCadenceRpm),
    avgHeartRate: rawAverageHeartRate ?? finiteNonnegative(input.activity.averageHeartRateBpm),
    avgPower: rawAveragePower ?? finiteNonnegative(input.activity.averagePowerWatts),
    avgSpeedMps: rawAverageSpeed ?? finiteNonnegative(input.activity.averageSpeedMetersPerSecond),
    avgTemperature: average(streams.temp),
    calories: finiteNonnegative(input.activity.caloriesKcal),
    contentVisibility: "private",
    deviceProduct: input.activity.deviceName ?? null,
    distanceMeters: Math.max(0, distanceMeters),
    elapsedMs,
    elevationGainMeters: rawElevationGain ?? finiteNonnegative(input.activity.elevationGainMeters),
    evidenceTier: hasRawMetricStreams(streams) ? "raw_samples" : "provider_summary",
    externalId: input.activity.id,
    finishedAt: new Date(startedAt.getTime() + elapsedMs),
    mapBounds: mapBounds(streams.latlng),
    maxCadence: maximum(streams.cadence),
    maxHeartRate: maximum(streams.heartrate) ?? finiteNonnegative(input.activity.maxHeartRateBpm),
    maxPower: maximum(streams.watts) ?? finiteNonnegative(input.activity.maxPowerWatts),
    maxSpeedMps:
      maximum(streams.velocity_smooth) ?? finiteNonnegative(input.activity.maxSpeedMetersPerSecond),
    movingMs,
    name: input.activity.name,
    polyline: input.activity.summaryPolyline ?? null,
    segmentSet,
    startedAt,
    timingCoverage: "complete",
  };
}
