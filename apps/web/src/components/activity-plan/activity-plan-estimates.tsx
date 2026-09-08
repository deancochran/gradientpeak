import { ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS, type SemanticMetric } from "@repo/core";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";

import { CanonicalMetricsRow } from "../activity/canonical-metrics-row";

const estimateOrder = ["distance", "elapsed_duration", "common_load"] as const;

const estimateLabels: Record<(typeof estimateOrder)[number], string> = {
  distance: "Distance",
  elapsed_duration: "Duration",
  common_load: "Load",
};

export function getActivityPlanEstimateItems(metrics: readonly SemanticMetric[]) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const baseItems = estimateOrder.map((key) => {
    const metric = byKey.get(key);
    const value = formatActivityPlanHeadlineMetric(metric, key);
    const provenance = value === "—" ? null : (metric?.provenance ?? null);
    return {
      key,
      label: estimateLabels[key],
      provenanceLabel:
        provenance === null ? "Unavailable" : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[provenance],
      value,
    };
  });
  const intensity = byKey.get("objective_intensity");
  const intensityValue = formatActivityPlanHeadlineMetric(intensity, "objective_intensity");
  const intensityProvenance = intensityValue === "—" ? null : (intensity?.provenance ?? null);
  return [
    ...baseItems,
    {
      key: "objective_intensity",
      label: "Intensity",
      provenanceLabel:
        intensityProvenance === null
          ? "Unavailable"
          : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[intensityProvenance],
      value: intensityValue,
    },
  ];
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
        const accessibilityValue = estimate.value === "—" ? "Unavailable" : estimate.value;
        return {
          accessibilityLabel: `${estimate.label}, ${accessibilityValue}, ${estimate.provenanceLabel}`,
          key: estimate.key,
          label: estimate.label,
          ...(estimate.key === "common_load" || estimate.label === "Intensity"
            ? { tone: "primary" as const }
            : {}),
          value: estimate.value,
        };
      })}
      testID="activity-plan-estimates"
    />
  );
}
