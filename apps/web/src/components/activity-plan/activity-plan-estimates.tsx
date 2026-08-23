import { ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS, type SemanticMetric } from "@repo/core";

import { formatDuration } from "../../lib/activity-route-helpers";
import { CanonicalMetricsRow } from "../activity/canonical-metrics-row";

const estimateOrder = [
  "distance",
  "elapsed_duration",
  "common_load",
  "normalized_intensity",
] as const;

const estimateLabels: Record<(typeof estimateOrder)[number], string> = {
  distance: "Distance",
  elapsed_duration: "Duration",
  common_load: "Load",
  normalized_intensity: "Intensity",
};

function formatMetricValue(metric: SemanticMetric): string | null {
  if (metric.status === "unavailable" || metric.value === null) return null;
  const value =
    metric.unit === "seconds"
      ? formatDuration(metric.value)
      : metric.unit === "meters"
        ? metric.value >= 1_000
          ? `${Math.round((metric.value / 1_000) * 10) / 10} km`
          : `${Math.round(metric.value)} m`
        : metric.unit === "ratio"
          ? metric.value.toFixed(2)
          : String(Math.round(metric.value * 10) / 10);
  return metric.status === "partial" ? `${value} known (partial)` : value;
}

export function getActivityPlanEstimateItems(metrics: readonly SemanticMetric[]) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  return estimateOrder.map((key) => {
    const metric = byKey.get(key);
    const value = metric ? formatMetricValue(metric) : null;
    const provenance = metric?.provenance ?? null;
    return {
      key,
      label: estimateLabels[key],
      provenanceLabel:
        provenance === null ? "Unavailable" : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[provenance],
      value: value ?? "—",
    };
  });
}

export function ActivityPlanEstimateRow({
  metrics,
}: {
  metrics: readonly SemanticMetric[];
  compact?: boolean;
}) {
  const estimates = getActivityPlanEstimateItems(metrics);

  return (
    <CanonicalMetricsRow
      items={estimates.map((estimate) => {
        const value = estimate.value === "—" ? "Unavailable" : estimate.value;
        return {
          accessibilityLabel: `${estimate.label}, ${value}, ${estimate.provenanceLabel}`,
          key: estimate.key,
          label: estimate.label,
          ...(estimate.key === "common_load" || estimate.key === "normalized_intensity"
            ? { tone: "primary" as const }
            : {}),
          value,
        };
      })}
      testID="activity-plan-estimates"
    />
  );
}
