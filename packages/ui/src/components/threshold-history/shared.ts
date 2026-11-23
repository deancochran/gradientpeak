export type ThresholdActivityCategory = "bike" | "run" | "swim";
export type ThresholdMetric = "power" | "speed" | "lthr";
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

export type ThresholdHistoryChartProps = {
  emptyMessage: string;
  series: ThresholdHistorySeries;
  testId?: string;
};
