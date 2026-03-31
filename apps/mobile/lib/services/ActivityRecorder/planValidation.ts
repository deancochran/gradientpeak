import type { RecordingServiceActivityPlan } from "@repo/core";
import {
  formatValidationMessage as formatCoreValidationMessage,
  type PlanValidationMessage,
  type PlanValidationMetrics,
  type PlanValidationResult,
  validatePlanRequirements as validateCorePlanRequirements,
} from "@repo/core/plan";
import type { PublicProfilesRow } from "@repo/db";

export type {
  MissingMetric,
  PlanValidationMessageAction,
} from "@repo/core/plan";

export type { PlanValidationMessage, PlanValidationMetrics, PlanValidationResult };

export function validatePlanRequirements(
  plan: RecordingServiceActivityPlan,
  _profile: PublicProfilesRow,
  metrics?: PlanValidationMetrics,
): PlanValidationResult {
  return validateCorePlanRequirements(plan, metrics);
}

export function formatValidationMessage(result: PlanValidationResult): PlanValidationMessage {
  return formatCoreValidationMessage(result);
}
