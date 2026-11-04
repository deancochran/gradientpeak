import { formatActivityPlanHeadlineMetric } from "./activity-plan-metric-presentation";

/** Generic activity-plan intensity never falls back to another metric family. */
export function formatObjectiveIntensity(metric: unknown): string {
  return formatActivityPlanHeadlineMetric(metric, "objective_intensity");
}
