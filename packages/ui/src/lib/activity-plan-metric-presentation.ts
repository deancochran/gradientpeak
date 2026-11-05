import {
  type ActivityPlanMetric,
  type ActivityPlanMetricKey,
  activityPlanMetricSchema,
} from "@repo/core";

const unavailableHeadline = "—";

/** Explain calculation limits without claiming the athlete has not supplied data. */
export function describeActivityPlanLoadAvailability(metric: unknown): string | null {
  const parsed = activityPlanMetricSchema.safeParse(metric);
  if (!parsed.success || parsed.data.key !== "common_load") {
    return "Load estimate is not available yet.";
  }
  if (parsed.data.status === "available") return null;
  switch (parsed.data.reason) {
    case "threshold_missing":
    case "category_calibration_required":
      return "Load unavailable: usable sport-specific calibration was not supplied to this estimate.";
    case "activity_data_missing":
    case "no_objective_target":
      return "Load unavailable: the estimator cannot calculate load from the current activity inputs.";
    case "incomplete_members":
    case "incomplete_contributors":
      return "Load unavailable: only part of this activity can be estimated.";
    default:
      return "Load unavailable: the current calculation did not return a complete estimate.";
  }
}

function formatDurationSeconds(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const remainder = roundedSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  return `${remainder}s`;
}

function formatAvailableValue(
  metric: Extract<ActivityPlanMetric, { status: "available" }>,
): string {
  switch (metric.key) {
    case "distance":
      return metric.value >= 1_000
        ? `${Math.round((metric.value / 1_000) * 10) / 10} km`
        : `${Math.round(metric.value)} m`;
    case "elapsed_duration":
      return formatDurationSeconds(metric.value);
    case "common_load":
      return String(Math.round(metric.value * 10) / 10);
    case "objective_intensity":
      return metric.value.toFixed(2);
  }
}

/** The estimate marker is determined only by the canonical headline provenance. */
export function shouldMarkActivityPlanMetricEstimated(metric: ActivityPlanMetric): boolean {
  return metric.status === "available" && metric.provenance === "estimated";
}

/**
 * Formats one canonical plan headline. Partial, malformed, absent, and unavailable
 * inputs fail closed instead of exposing a numeric fragment.
 */
export function formatActivityPlanHeadlineMetric(
  metric: unknown,
  expectedKey: ActivityPlanMetricKey,
): string {
  const parsed = activityPlanMetricSchema.safeParse(metric);
  if (!parsed.success || parsed.data.key !== expectedKey || parsed.data.status !== "available") {
    return unavailableHeadline;
  }
  const value = formatAvailableValue(parsed.data);
  return shouldMarkActivityPlanMetricEstimated(parsed.data) ? `~${value}` : value;
}
