import type {
  ThresholdActivityCategory,
  ThresholdMetric,
} from "@repo/core/performance-calibration";

export type {
  ThresholdActivityCategory,
  ThresholdMetric,
} from "@repo/core/performance-calibration";
export type ThresholdUnit = "watts" | "meters_per_second" | "bpm";

/** A presentation-safe subset of the threshold overview transport contract. */
export type ThresholdHistoryPoint = {
  thresholdId: string;
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  unit: ThresholdUnit;
  value: number;
  confidence: number;
  effectiveAt: string;
  method: string;
  policyVersion: string;
  sourceActivities: readonly {
    id: string;
    name: string;
    finishedAt: string;
  }[];
};

export type ThresholdHistorySeries = {
  id: string;
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  unit: ThresholdUnit;
  points: readonly ThresholdHistoryPoint[];
};

export type ThresholdHistoryChartDatum = {
  timestamp: number;
  value: number | null;
  thresholdId?: string;
};

export function thresholdMetricLabel(category: ThresholdActivityCategory, metric: ThresholdMetric) {
  if (metric === "lthr") return `${category} LTHR`;
  if (metric === "power") return `${category} power`;
  return `${category} speed`;
}

export function formatThresholdValue(
  value: number,
  unit: ThresholdUnit,
  category: ThresholdActivityCategory,
) {
  if (!Number.isFinite(value) || value <= 0) return "Unavailable";
  if (unit === "watts") return `${Math.round(value)} W`;
  if (unit === "bpm") return `${Math.round(value)} bpm`;
  const distance = category === "swim" ? 100 : 1_000;
  const seconds = Math.round(distance / value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /${distance === 100 ? "100m" : "km"}`;
}

export function formatThresholdDate(instant: string) {
  const date = new Date(instant);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      }).format(date);
}

/** Separates unlike metrics before any scale or trend is rendered. */
export function groupThresholdHistory(
  points: readonly ThresholdHistoryPoint[],
): readonly ThresholdHistorySeries[] {
  const series = new Map<string, ThresholdHistorySeries>();
  for (const point of points) {
    const id = `${point.activityCategory}:${point.metric}:${point.unit}`;
    const existing = series.get(id);
    if (existing) {
      existing.points = [...existing.points, point];
    } else {
      series.set(id, {
        activityCategory: point.activityCategory,
        id,
        metric: point.metric,
        points: [point],
        unit: point.unit,
      });
    }
  }
  return [...series.values()]
    .map((item) => ({
      ...item,
      points: [...item.points].sort(
        (left, right) =>
          Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt) ||
          left.thresholdId.localeCompare(right.thresholdId),
      ),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function mergeThresholdHistoryPages(
  ...pages: readonly (readonly ThresholdHistoryPoint[])[]
): readonly ThresholdHistoryPoint[] {
  const unique = new Map<string, ThresholdHistoryPoint>();
  for (const page of pages) {
    // The newest page is authoritative when pagination overlaps at its boundary.
    for (const point of page) {
      if (!unique.has(point.thresholdId)) unique.set(point.thresholdId, point);
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) ||
      right.thresholdId.localeCompare(left.thresholdId),
  );
}

/** Preserves elapsed-time x positions and uses nulls to prevent false continuity. */
export function buildThresholdHistoryChartData(
  points: readonly ThresholdHistoryPoint[],
): readonly ThresholdHistoryChartDatum[] {
  return points.flatMap((point, index) => {
    const previous = points[index - 1];
    const timestamp = Date.parse(point.effectiveAt);
    const changedMethod =
      previous &&
      (previous.method !== point.method || previous.policyVersion !== point.policyVersion);
    return [
      ...(changedMethod ? [{ timestamp, value: null }] : []),
      { thresholdId: point.thresholdId, timestamp, value: point.value },
    ];
  });
}

export type ThresholdHistoryChartProps = {
  emptyMessage: string;
  series: ThresholdHistorySeries;
  testId?: string;
};
