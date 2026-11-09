import { downsampleStream } from "@repo/core";
import { alignSeriesByTimestamp } from "@repo/ui/lib/chart";

type NumericSeries = {
  timestamps: readonly number[];
  values: readonly unknown[];
};

export type ElevationProfilePoint = {
  elevation: number;
  x: number;
};

function toTimestampedValues(series: NumericSeries) {
  return series.timestamps.map((timestamp, index) => ({
    timestamp,
    value: typeof series.values[index] === "number" ? series.values[index] : null,
  }));
}

/** Aligns cumulative distance to elevation timestamps before sampling chart points. */
export function buildElevationProfilePoints(
  elevationSeries: NumericSeries,
  distanceSeries?: NumericSeries,
  maxPoints = 500,
): ElevationProfilePoint[] {
  const elevationPoints = toTimestampedValues(elevationSeries);

  if (!distanceSeries) {
    const validElevation = elevationPoints.filter(
      (point): point is { timestamp: number; value: number } =>
        Number.isFinite(point.timestamp) && point.value != null && Number.isFinite(point.value),
    );
    if (validElevation.length === 0) return [];

    const sampled = downsampleStream(
      validElevation.map((point) => point.value),
      validElevation.map((point) => point.timestamp),
      maxPoints,
      "avg",
    );
    const startTime = sampled.timestamps[0] ?? 0;
    return sampled.values.map((elevation, index) => ({
      elevation,
      x: ((sampled.timestamps[index] ?? startTime) - startTime) / 1000,
    }));
  }

  const aligned = alignSeriesByTimestamp(elevationPoints, toTimestampedValues(distanceSeries));
  if (aligned.length === 0) return [];

  const sampledElevation = downsampleStream(
    aligned.map((point) => point.primary),
    aligned.map((point) => point.timestamp),
    maxPoints,
    "avg",
  );

  const sampledWithDistance = alignSeriesByTimestamp(
    sampledElevation.timestamps.map((timestamp, index) => ({
      timestamp,
      value: sampledElevation.values[index] ?? null,
    })),
    aligned.map((point) => ({ timestamp: point.timestamp, value: point.secondary })),
  );

  return sampledWithDistance.map((point) => ({
    elevation: point.primary,
    x: point.secondary / 1000,
  }));
}
