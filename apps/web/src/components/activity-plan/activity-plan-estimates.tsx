import { ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS, type SemanticMetric } from "@repo/core";
import { ResourceMetricsRow } from "@repo/ui/components/resource-presentation";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";

const estimateDefinitions = [
  { key: "distance", label: "Distance" },
  { key: "elapsed_duration", label: "Duration" },
  { key: "common_load", label: "Load" },
  { key: "objective_intensity", label: "Intensity" },
] as const;

function unavailableEstimateDescription(metric: SemanticMetric) {
  return `${metric.label}: ${metric.reason?.replaceAll("_", " ") ?? "Unknown"}`;
}

function formatHeadline(metric: SemanticMetric, key: (typeof estimateDefinitions)[number]["key"]) {
  const formatted = formatActivityPlanHeadlineMetric(metric, key);
  if (formatted !== "—" || metric.value !== 0) return formatted;
  if (key === "distance") return "0 m";
  if (key === "elapsed_duration") return "0s";
  if (key === "objective_intensity") return "0.00";
  return "0";
}

export function getActivityPlanEstimateItems(metrics: readonly SemanticMetric[]) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  return estimateDefinitions.flatMap(({ key, label }) => {
    const metric = byKey.get(key);
    // Headline metrics are evidence, not placeholders: include available zeroes, omit unknowns.
    if (metric?.status !== "available") return [];
    return [
      {
        key,
        label,
        provenanceLabel:
          metric.provenance == null
            ? "Unavailable"
            : ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS[metric.provenance],
        value: formatHeadline(metric, key),
      },
    ];
  });
}

export function ActivityPlanEstimateRow({
  compact = false,
  metrics,
  showUnavailableDetails = true,
}: {
  metrics: readonly SemanticMetric[];
  compact?: boolean;
  showUnavailableDetails?: boolean;
}) {
  const estimates = getActivityPlanEstimateItems(metrics);
  const unavailable = metrics.filter((metric) => metric.status !== "available");

  return (
    <div className="space-y-2">
      <ResourceMetricsRow
        compact={compact}
        metrics={estimates.map((estimate) => {
          const accessibilityValue = estimate.value === "—" ? "Unavailable" : estimate.value;
          return {
            accessibilityLabel: `${estimate.label}, ${accessibilityValue}, ${estimate.provenanceLabel}`,
            label: estimate.label,
            ...(estimate.key === "common_load" || estimate.label === "Intensity"
              ? { tone: "primary" as const }
              : {}),
            value: estimate.value,
          };
        })}
        testID="activity-plan-estimates"
      />
      {showUnavailableDetails && unavailable.length ? (
        <details className="text-sm text-muted-foreground">
          <summary>Estimate details</summary>
          <ul className="mt-1 list-disc pl-5">
            {unavailable.map((metric) => (
              <li key={metric.key}>{unavailableEstimateDescription(metric)}</li>
            ))}
          </ul>
        </details>
      ) : unavailable.length ? (
        <p className="text-xs text-muted-foreground">
          Unavailable estimates — {unavailable.map(unavailableEstimateDescription).join("; ")}
        </p>
      ) : null}
    </div>
  );
}
