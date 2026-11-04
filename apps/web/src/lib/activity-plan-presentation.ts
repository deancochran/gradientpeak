import type { SemanticMetric } from "@repo/core";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";

export function describeTrainingPlanSessions(structure: unknown) {
  if (!structure || typeof structure !== "object") return "No sessions specified";
  const sessions = collectTrainingPlanSessions(structure);
  if (sessions.length === 0) return "No sessions specified";

  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

type ActivityPlanMetricSummaryInput = {
  metrics?: readonly SemanticMetric[];
};

export function getActivityPlanMetricSummary({ metrics = [] }: ActivityPlanMetricSummaryInput) {
  return formatActivityPlanProjectionMetrics(metrics);
}

/** Card/detail summary formatting never substitutes missing values with zero. */
export function formatActivityPlanProjectionMetrics(metrics: readonly SemanticMetric[]): string[] {
  return metrics.flatMap((metric) => {
    if (metric.key === "normalized_intensity") {
      throw new Error("Activity-plan summaries must use objective_intensity");
    }
    if (
      metric.key !== "distance" &&
      metric.key !== "elapsed_duration" &&
      metric.key !== "common_load" &&
      metric.key !== "objective_intensity"
    ) {
      return [];
    }
    return [`${metric.label} ${formatActivityPlanHeadlineMetric(metric, metric.key)}`];
  });
}

function collectTrainingPlanSessions(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const ownSessions = Array.isArray(record.sessions) ? record.sessions : [];
  const blockSessions = Array.isArray(record.blocks)
    ? record.blocks.flatMap((block) => collectTrainingPlanSessions(block))
    : [];
  return [...ownSessions, ...blockSessions];
}
