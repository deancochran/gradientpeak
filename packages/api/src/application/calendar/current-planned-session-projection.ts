import type { SemanticMetric } from "@repo/core";
import { type ActivityPlanPlanningEstimate, getPlannedEstimate } from "@repo/core/plan";
import { createActivityPlanProjectionMetrics } from "../activity-plans/read-projections";

/**
 * The mutable, owner-authorized authority used when rendering a future
 * planned session.  It deliberately contains no athlete facts from the
 * scheduling manifest: authored plan estimates are safe to recompute from
 * current structure, while personalized historical facts are not.
 */
export type CurrentPlannedSessionPlan = {
  id: string;
  name: string;
  structure: unknown;
  updatedAt: Date | string;
  prescriptionQuantification?: ActivityPlanPlanningEstimate["prescriptionQuantification"];
};

export type CurrentPlannedSessionProjection = {
  title: string;
  activityCategory: string;
  metrics: SemanticMetric[];
  commonLoad: number | null;
  durationSeconds: number | null;
};

export function materializeCurrentPlannedSessionProjection(
  plan: CurrentPlannedSessionPlan | null,
): CurrentPlannedSessionProjection | null {
  if (!plan) return null;
  const fallbackMetrics = createActivityPlanProjectionMetrics({
    id: plan.id,
    structure: plan.structure,
    updatedAt: plan.updatedAt,
  });
  const currentEstimate = plan.prescriptionQuantification
    ? getPlannedEstimate(plan.prescriptionQuantification)
    : null;
  const projected: SemanticMetric[] = currentEstimate
    ? [
        metric("elapsed_duration", "Duration", currentEstimate.durationSeconds.value, "seconds"),
        metric("common_load", "Load", currentEstimate.load.value, "load"),
      ].flatMap((item) => (item ? [item] : []))
    : fallbackMetrics.flatMap((item): SemanticMetric[] => {
        if (item.status !== "available") return [];
        if (item.key === "elapsed_duration") {
          return [metric(item.key, item.label, item.value, "seconds")].flatMap((value) =>
            value ? [value] : [],
          );
        }
        if (item.key === "common_load") {
          return [metric(item.key, item.label, item.value, "load")].flatMap((value) =>
            value ? [value] : [],
          );
        }
        return [];
      });
  const duration = projected.find((item) => item.key === "elapsed_duration")?.value ?? null;
  const commonLoad = projected.find((item) => item.key === "common_load")?.value ?? null;
  const structure = plan.structure as { activity_category?: unknown };
  return {
    title: plan.name.trim() || "Scheduled session",
    activityCategory:
      typeof structure.activity_category === "string" ? structure.activity_category : "other",
    metrics: projected,
    durationSeconds: duration,
    commonLoad,
  };
}

function metric(
  key: "elapsed_duration" | "common_load",
  label: string,
  value: number | null,
  unit: string,
): SemanticMetric | null {
  return value === null ? null : { key, label, value, unit, status: "partial", reason: "estimate" };
}
