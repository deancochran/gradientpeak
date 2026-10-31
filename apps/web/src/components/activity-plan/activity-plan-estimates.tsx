import { ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS, type SemanticMetric } from "@repo/core";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";

import { CanonicalMetricsRow } from "../activity/canonical-metrics-row";

const estimateOrder = ["distance", "elapsed_duration", "common_load"] as const;

const estimateLabels: Record<(typeof estimateOrder)[number], string> = {
  distance: "Distance",
  elapsed_duration: "Duration",
  common_load: "Load",
};

function formatHeadline(
  metric: SemanticMetric,
  key: (typeof estimateOrder)[number] | "objective_intensity",
) {
  const formatted = formatActivityPlanHeadlineMetric(metric, key);
  if (formatted !== "—" || metric.value !== 0) return formatted;
  if (key === "distance") return "0 m";
  if (key === "elapsed_duration") return "0s";
  if (key === "objective_intensity") return "0.00";
  return "0";
}

export function getActivityPlanEstimateItems(metrics: readonly SemanticMetric[]) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const baseItems = estimateOrder.flatMap((key) => {
    const metric = byKey.get(key);
    // Headline metrics are evidence, not placeholders: include available zeroes, omit unknowns.
    if (metric?.status !== "available") return [];
    const value = formatHeadline(metric, key);
    return [
      {
        key,
        label: estimateLabels[key],
        provenanceLabel:
          metric.provenance == null
            ? "Unavailable"
            : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[metric.provenance],
        value,
      },
    ];
  });
  const intensity = byKey.get("objective_intensity");
  return [
    ...baseItems,
    ...(intensity?.status === "available"
      ? [
          {
            key: "objective_intensity",
            label: "Intensity",
            provenanceLabel:
              intensity.provenance == null
                ? "Unavailable"
                : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[intensity.provenance],
            value: formatHeadline(intensity, "objective_intensity"),
          },
        ]
      : []),
  ];
}

export function ActivityPlanEstimateRow({
  metrics,
}: {
  metrics: readonly SemanticMetric[];
  compact?: boolean;
}) {
  const estimates = getActivityPlanEstimateItems(metrics);
  const unavailable = metrics.filter((metric) => metric.status !== "available");

  return (
    <div className="space-y-2">
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
      {unavailable.length ? (
        <details className="text-sm text-muted-foreground">
          <summary>Estimate details</summary>
          <ul className="mt-1 list-disc pl-5">
            {unavailable.map((metric) => (
              <li key={metric.key}>
                {metric.label}: {metric.reason ?? "Unknown"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
