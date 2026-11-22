import { activityPlanStructureSchema } from "../activity-plan";
import { type ActivityPlanMetric, createActivityPlanMetric } from "../contracts/read-projections";
import type { AthletePerformanceTargetFacts } from "../performance-model";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";
import { getPlannedEstimate } from "./planned-estimate";

/**
 * Adapts a valid, unsaved activity-plan revision to the same canonical headline
 * metric contract used by persisted plan read models. Callers retain raw editor
 * text separately, so an invalid draft keeps showing the last valid revision.
 */
export function activityPlanDraftMetrics(
  structure: unknown,
  performanceTargets: AthletePerformanceTargetFacts,
): ActivityPlanMetric[] {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  if (!parsed.success) return [];

  const planning = estimateActivityPlanForTrainingContext({
    structure: parsed.data,
    performanceTargets,
    asOf: performanceTargets.asOf,
    stage: "plan",
  });
  const estimate = getPlannedEstimate(planning.prescriptionQuantification);
  const distance = planning.planProjection?.distance;
  const intensity = planning.planProjection?.objectiveIntensity;
  const headline = (
    key: ActivityPlanMetric["key"],
    label: string,
    unit: string,
    value: number | null,
    provenance: ActivityPlanMetric["provenance"],
    reason: string | null,
  ) =>
    createActivityPlanMetric({
      key,
      label,
      unit,
      status: value === null ? "unavailable" : "available",
      value,
      provenance: value === null ? null : provenance,
      reason: value === null ? (reason ?? "not_available") : null,
    });

  return [
    headline(
      "distance",
      "Distance",
      "meters",
      distance?.status === "complete" ? distance.value : null,
      distance?.provenance === "authored" ? "authored" : "estimated",
      distance?.reason ?? null,
    ),
    headline(
      "elapsed_duration",
      "Duration",
      "seconds",
      estimate.durationSeconds.status === "known" || estimate.durationSeconds.status === "estimated"
        ? estimate.durationSeconds.value
        : null,
      estimate.durationSeconds.status === "known" ? "authored" : "estimated",
      "reason" in estimate.durationSeconds ? estimate.durationSeconds.reason : null,
    ),
    headline(
      "common_load",
      "Load",
      "score",
      estimate.load.status === "estimated" ? estimate.load.value : null,
      "estimated",
      "reason" in estimate.load ? estimate.load.reason : null,
    ),
    headline(
      "objective_intensity",
      "Intensity",
      "ratio",
      intensity?.status === "available" ? intensity.value : null,
      "estimated",
      intensity?.reason ?? null,
    ),
  ];
}
