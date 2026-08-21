import {
  activityPrescriptionQuantificationBundleSchema,
  getPlannedEstimate,
  type SemanticMetric,
} from "@repo/core";
import { formatDuration } from "./activity-route-helpers";

export function describeTrainingPlanSessions(structure: unknown) {
  if (!structure || typeof structure !== "object") return "No sessions specified";
  const sessions = collectTrainingPlanSessions(structure);
  if (sessions.length === 0) return "No sessions specified";

  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

type ActivityPlanMetricSummaryInput = {
  prescriptionQuantification?: unknown;
  structure?: unknown;
};

export function getActivityPlanMetricSummary({
  prescriptionQuantification,
}: ActivityPlanMetricSummaryInput) {
  const summary: string[] = [];
  const parsed = activityPrescriptionQuantificationBundleSchema.safeParse(
    prescriptionQuantification,
  );
  if (!parsed.success) return summary;
  const estimate = getPlannedEstimate(parsed.data);
  if (
    estimate.durationSeconds.status === "known" ||
    estimate.durationSeconds.status === "estimated"
  ) {
    summary.push(formatDuration(estimate.durationSeconds.value));
  }
  if (
    estimate.distanceMeters.status === "known" ||
    estimate.distanceMeters.status === "estimated"
  ) {
    summary.push(`${(estimate.distanceMeters.value / 1_000).toFixed(1)} km`);
  }
  if (estimate.load.status === "estimated") {
    summary.push(
      `${estimate.load.basis === "plan_intent" ? "Plan-intent load" : "Personalized load"} ${Math.round(estimate.load.value * 10) / 10}`,
    );
  }
  if (estimate.normalizedIntensity.status === "estimated") {
    summary.push(`Calculated intensity ${estimate.normalizedIntensity.value.toFixed(2)}`);
  }
  return summary;
}

/** Card/detail summary formatting never substitutes missing or partial values with zero. */
export function formatActivityPlanProjectionMetrics(metrics: readonly SemanticMetric[]): string[] {
  return metrics.flatMap((metric) => {
    if (metric.status === "unavailable") return [];
    const value =
      metric.unit === "seconds"
        ? formatDuration(metric.value)
        : metric.unit === "meters"
          ? `${Math.round((metric.value / 1_000) * 10) / 10} km`
          : metric.unit === "ratio"
            ? metric.value.toFixed(2)
            : String(Math.round(metric.value * 10) / 10);
    return [`${metric.label} ${value}${metric.status === "partial" ? " known (partial)" : ""}`];
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
