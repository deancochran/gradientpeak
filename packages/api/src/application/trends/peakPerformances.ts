export type PeakPerformanceMetric = "distance" | "speed" | "power" | "duration" | "tss";

export type PeakPerformanceActivityRow = {
  id: string;
  name: string;
  type: string;
  started_at: Date;
  distance_meters: number | null;
  moving_seconds: number | null;
  avg_speed_mps: number | null;
  avg_power: number | null;
};

export type PeakPerformanceDerivedSummary = {
  tss?: number | null;
};

export type PeakPerformancesResult = {
  performances: Array<{
    activityId: string;
    activityName: string;
    date: string;
    value: number;
    unit: string;
    category: string;
    rank: number;
  }>;
};

function resolvePeakPerformanceValue(
  activity: PeakPerformanceActivityRow,
  metric: PeakPerformanceMetric,
  derivedMap: ReadonlyMap<string, PeakPerformanceDerivedSummary> | null,
) {
  switch (metric) {
    case "distance":
      return { value: activity.distance_meters, unit: "m" };
    case "speed":
      return { value: activity.avg_speed_mps, unit: "m/s" };
    case "power":
      return { value: activity.avg_power, unit: "W" };
    case "duration":
      return { value: activity.moving_seconds, unit: "s" };
    case "tss":
      return { value: derivedMap?.get(activity.id)?.tss ?? null, unit: "TSS" };
  }
}

export function buildPeakPerformances(
  activityRows: PeakPerformanceActivityRow[],
  metric: PeakPerformanceMetric,
  limit: number,
  derivedMap: ReadonlyMap<string, PeakPerformanceDerivedSummary> | null = null,
): PeakPerformancesResult {
  if (activityRows.length === 0) {
    return { performances: [] };
  }

  const allPerformances = activityRows
    .map((activity) => {
      const { value, unit } = resolvePeakPerformanceValue(activity, metric, derivedMap);

      if (value === null || value === undefined) {
        return null;
      }

      return {
        activityId: activity.id,
        activityName: activity.name,
        date: activity.started_at.toISOString(),
        value,
        unit,
        category: activity.type,
      };
    })
    .filter((performance) => performance !== null);

  // Database ordering is sufficient for directly ordered metrics. Re-sort derived/nullable metric
  // candidates that may have been over-fetched or calculated outside the primary activity row.
  if (["speed", "power", "tss"].includes(metric)) {
    allPerformances.sort((a, b) => b.value - a.value);
  }

  return {
    performances: allPerformances.slice(0, limit).map((performance, index) => ({
      ...performance,
      rank: index + 1,
    })),
  };
}
