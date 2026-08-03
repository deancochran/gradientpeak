import {
  type AthletePerformanceTargetFacts,
  type CommonLoadAggregate,
  type CommonLoadResult,
  numericPlannedCommonLoad,
} from "@repo/core";
import {
  type ActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
} from "@repo/core/plan";

/** API transport wrapper; Core owns prescription quantification and identity. */
export function resolvePlannedActivityQuantification(input: {
  asOf: Date;
  planId?: string;
  structure: unknown;
  performanceTargets: AthletePerformanceTargetFacts;
  stage?: "template" | "plan" | "scheduled";
  scheduledEventId?: string;
}): ActivityPlanPlanningEstimate {
  const stage = input.stage ?? "plan";
  return estimateActivityPlanForTrainingContext({
    asOf: input.asOf.toISOString(),
    structure: input.structure,
    performanceTargets: input.performanceTargets,
    stage,
    planId: input.planId,
    scheduledEventId: input.scheduledEventId,
  });
}

export function resolvePlannedCommonLoad(input: {
  asOf: Date;
  planId?: string;
  structure: unknown;
  performanceTargets: AthletePerformanceTargetFacts;
  stage?: "template" | "plan" | "scheduled";
  scheduledEventId?: string;
}): CommonLoadResult | CommonLoadAggregate {
  return resolvePlannedActivityQuantification(input).prescriptionQuantification.summary.commonLoad;
}

export { numericPlannedCommonLoad };
