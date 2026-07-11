import type { CanonicalSport } from "../schemas/sport";
import {
  ACTIVITY_READINESS_CONSTANTS,
  ACTIVITY_READINESS_POLICY_VERSION,
} from "./policies/activity-readiness";
import {
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
  EFFORT_CURVE_POLICY_VERSION,
} from "./policies/effort-curves";
import { GOAL_DEMAND_POLICY_VERSION } from "./policies/goal-demand";
import {
  PHYSIOLOGY_METRICS_POLICY_CONSTANTS,
  PHYSIOLOGY_METRICS_POLICY_VERSION,
} from "./policies/physiology-metrics";
import {
  PROJECTION_DECISION_QUALITY_POLICY,
  PROJECTION_DECISION_QUALITY_POLICY_VERSION,
} from "./policies/projection";
import {
  MAX_RECURRENCE_OCCURRENCES,
  TRAINING_FEASIBILITY_POLICY_VERSION,
} from "./policies/training-feasibility";

export type CalculationPolicyId =
  | "activity-readiness"
  | "effort-curve"
  | "effort-curve-decision-uncertainty"
  | "goal-demand"
  | "physiology-metrics"
  | "projection-decision-quality"
  | "training-feasibility";

type SupportedSports = readonly CanonicalSport[] | "any";
type PolicyConstants = Readonly<Record<string, unknown>>;

export type PolicyDescriptor<
  Id extends CalculationPolicyId = CalculationPolicyId,
  Version extends string = string,
  Constants extends PolicyConstants = PolicyConstants,
> = Readonly<{
  id: Id;
  version: Version;
  supportedSports: SupportedSports;
  supportedModalities: readonly string[];
  constants: Constants;
}>;

function createPolicyDescriptor<
  const Id extends CalculationPolicyId,
  const Version extends string,
  const Constants extends PolicyConstants,
>(descriptor: {
  id: Id;
  version: Version;
  supportedSports: SupportedSports;
  supportedModalities: readonly string[];
  constants: Constants;
}): PolicyDescriptor<Id, Version, Constants> {
  return Object.freeze({
    ...descriptor,
    supportedSports:
      descriptor.supportedSports === "any" ? "any" : Object.freeze([...descriptor.supportedSports]),
    supportedModalities: Object.freeze([...descriptor.supportedModalities]),
  });
}

/** Exact immutable boundaries consumed by the activity-readiness policy. */
export const activityReadinessPolicyConstants = Object.freeze(ACTIVITY_READINESS_CONSTANTS);
/** The effort-curve calculation itself exports no policy knobs. */
export const effortCurvePolicyConstants = Object.freeze({});
/** Exact immutable boundaries consumed by the effort-curve decision-safety policy. */
export const effortCurveDecisionUncertaintyPolicyConstants = Object.freeze(
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
);
/** The goal-demand policy exports no policy knobs. */
export const goalDemandPolicyConstants = Object.freeze({});
/** Exact immutable boundaries consumed by the physiology-metrics policy. */
export const physiologyMetricsPolicyConstants = Object.freeze(PHYSIOLOGY_METRICS_POLICY_CONSTANTS);
/** Exact immutable boundary consumed by the projection decision-quality policy. */
export const projectionDecisionQualityPolicyConstants = Object.freeze(
  PROJECTION_DECISION_QUALITY_POLICY,
);
/** The recurrence cap is the training-feasibility policy's only exported knob. */
export const trainingFeasibilityPolicyConstants = Object.freeze({
  maxRecurrenceOccurrences: MAX_RECURRENCE_OCCURRENCES,
});

export const activityReadinessPolicyDescriptor = createPolicyDescriptor({
  id: "activity-readiness",
  version: ACTIVITY_READINESS_POLICY_VERSION,
  supportedSports: "any",
  supportedModalities: ["activity", "readiness_context"],
  constants: activityReadinessPolicyConstants,
});

export const effortCurvePolicyDescriptor = createPolicyDescriptor({
  id: "effort-curve",
  version: EFFORT_CURVE_POLICY_VERSION,
  supportedSports: ["bike", "run"],
  supportedModalities: ["power", "pace"],
  constants: effortCurvePolicyConstants,
});

/** Safety policy that qualifies effort-curve decisions when their evidence is uncertain. */
export const effortCurveDecisionUncertaintyPolicyDescriptor = createPolicyDescriptor({
  id: "effort-curve-decision-uncertainty",
  version: EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
  supportedSports: ["bike", "run"],
  supportedModalities: ["power", "pace"],
  constants: effortCurveDecisionUncertaintyPolicyConstants,
});

export const goalDemandPolicyDescriptor = createPolicyDescriptor({
  id: "goal-demand",
  version: GOAL_DEMAND_POLICY_VERSION,
  supportedSports: "any",
  supportedModalities: ["event_performance", "threshold", "completion", "consistency"],
  constants: goalDemandPolicyConstants,
});

export const physiologyMetricsPolicyDescriptor = createPolicyDescriptor({
  id: "physiology-metrics",
  version: PHYSIOLOGY_METRICS_POLICY_VERSION,
  supportedSports: "any",
  supportedModalities: ["profile_metric", "manual_observation", "activity", "activity_effort"],
  constants: physiologyMetricsPolicyConstants,
});

export const projectionDecisionQualityPolicyDescriptor = createPolicyDescriptor({
  id: "projection-decision-quality",
  version: PROJECTION_DECISION_QUALITY_POLICY_VERSION,
  supportedSports: "any",
  supportedModalities: ["projection"],
  constants: projectionDecisionQualityPolicyConstants,
});

export const trainingFeasibilityPolicyDescriptor = createPolicyDescriptor({
  id: "training-feasibility",
  version: TRAINING_FEASIBILITY_POLICY_VERSION,
  supportedSports: "any",
  supportedModalities: ["schedule", "availability", "training_context"],
  constants: trainingFeasibilityPolicyConstants,
});

/** Closed declarations of each calculation policy's current compatibility boundary. */
export const policyDescriptors = Object.freeze({
  "activity-readiness": activityReadinessPolicyDescriptor,
  "effort-curve": effortCurvePolicyDescriptor,
  "effort-curve-decision-uncertainty": effortCurveDecisionUncertaintyPolicyDescriptor,
  "goal-demand": goalDemandPolicyDescriptor,
  "physiology-metrics": physiologyMetricsPolicyDescriptor,
  "projection-decision-quality": projectionDecisionQualityPolicyDescriptor,
  "training-feasibility": trainingFeasibilityPolicyDescriptor,
} satisfies Record<CalculationPolicyId, PolicyDescriptor>);
