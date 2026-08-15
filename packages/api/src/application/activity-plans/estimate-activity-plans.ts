import { compileActivityPlan } from "@repo/core/activity-plan";
import type { CommonLoadResult } from "@repo/core/load";
import type { AthletePerformanceTargetFacts } from "@repo/core/performance-model";
import {
  type ActivityPlanPlanningEstimate,
  createUnavailableActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
} from "@repo/core/plan";
import type { ActivityPlanRow } from "@repo/db";
import type { DrizzleQueryExecutor } from "../../db";
import { readPublishedAthletePerformanceTargets } from "../athlete-intelligence/published-athlete-state";

export type EstimatableActivityPlan = Pick<
  ActivityPlanRow,
  "id" | "profile_id" | "name" | "description" | "structure"
>;

export type SupportedActivityPlan = EstimatableActivityPlan &
  Pick<ActivityPlanRow, "gps_recording_enabled" | "structure" | "structure_hash"> & {
    updated_at: Date | string;
  };

export type ActivityPlanWithEstimate<TPlan extends EstimatableActivityPlan> = TPlan & {
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
};

export type CurrentActivityPlanEstimateOptions = {
  /** Stable request time used to assess the published snapshot. */
  asOf?: Date;
};

function buildEstimatedPlan<TPlan extends EstimatableActivityPlan>(
  plan: TPlan,
  planning: ActivityPlanPlanningEstimate,
): ActivityPlanWithEstimate<TPlan> {
  return {
    ...plan,
    prescriptionQuantification: planning.prescriptionQuantification,
  };
}

function estimatePlan(
  plan: EstimatableActivityPlan,
  performanceTargets: AthletePerformanceTargetFacts,
): ActivityPlanPlanningEstimate {
  return estimateActivityPlanForTrainingContext({
    asOf: performanceTargets.asOf,
    structure: plan.structure,
    performanceTargets,
    stage: "plan",
    planId: plan.id,
  });
}

function unavailablePlan<TPlan extends EstimatableActivityPlan>(
  plan: TPlan,
  asOf: Date,
  reason: "source_missing" | "invalid_data" = "source_missing",
): ActivityPlanWithEstimate<TPlan> {
  let activityCategory: CommonLoadResult["activity_category"] = "other";
  try {
    activityCategory = compileActivityPlan(plan.structure).activity_category;
  } catch {
    // Invalid stored structures cannot supply an activity category.
  }
  const planning = createUnavailableActivityPlanPlanningEstimate({
    asOf: asOf.toISOString(),
    stage: "plan",
    planId: plan.id,
    activityCategory,
    reason,
  });
  return {
    ...plan,
    prescriptionQuantification: planning.prescriptionQuantification,
  };
}

export async function estimateActivityPlan<TPlan extends SupportedActivityPlan>(
  plan: TPlan,
  db: DrizzleQueryExecutor,
  profileId: string,
  options?: CurrentActivityPlanEstimateOptions,
): Promise<ActivityPlanWithEstimate<TPlan>> {
  const [estimated] = await estimateActivityPlans([plan], db, profileId, options);
  return estimated ?? unavailablePlan(plan, options?.asOf ?? new Date());
}

export async function estimateActivityPlans<TPlan extends SupportedActivityPlan>(
  plans: Array<TPlan | null | undefined>,
  db: DrizzleQueryExecutor,
  profileId: string,
  options?: CurrentActivityPlanEstimateOptions,
): Promise<Array<ActivityPlanWithEstimate<TPlan>>> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");
  if (normalizedPlans.length === 0) return [];

  const asOf = options?.asOf ?? new Date();
  try {
    const published = await readPublishedAthletePerformanceTargets({ db, profileId, now: asOf });
    // Projection freshness is descriptive. A stale canonical threshold remains
    // usable; only an unavailable target fact activates range/RPE fallback.
    if (published.status === "unavailable") {
      return normalizedPlans.map((plan) => unavailablePlan(plan, asOf));
    }
    const memo = new Map<string, ActivityPlanPlanningEstimate>();
    return normalizedPlans.map((plan) => {
      const key = JSON.stringify({ id: plan.id, structure: plan.structure });
      const existing = memo.get(key);
      if (existing) return buildEstimatedPlan(plan, existing);
      try {
        const planning = estimatePlan(plan, published.targets);
        memo.set(key, planning);
        return buildEstimatedPlan(plan, planning);
      } catch (error) {
        console.error(
          `Failed to estimate activity plan ${plan.id}: ${error instanceof Error ? error.message : "unknown estimation error"}`,
        );
        return unavailablePlan(plan, asOf, "invalid_data");
      }
    });
  } catch {
    console.error("Failed to load the published activity-plan estimation snapshot.");
    return normalizedPlans.map((plan) => unavailablePlan(plan, asOf));
  }
}
