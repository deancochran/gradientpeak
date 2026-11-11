import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityPlanDuration, ActivityPlanTarget } from "./structure-schema";

export type CompiledActivityPlanOccurrence = {
  occurrenceId: string;
  /** Chronological zero-based position in the expanded prescription. */
  ordinal: number;
  /** @deprecated Use ordinal. */
  globalOrdinal: number;
  stepId: string;
  repeatId?: string;
  /** Zero for a standalone step; zero-based execution index for repeat children. */
  repeatIteration: number;
  role: "activity";
  activity_category: CanonicalActivityCategory;
  completionPolicy: ActivityPlanDuration["type"];
  duration: ActivityPlanDuration;
  targets: readonly ActivityPlanTarget[];
};
/** @deprecated Use CompiledActivityPlanOccurrence. */
export type CompiledActivityStepOccurrence = CompiledActivityPlanOccurrence;
/** Stable V5 identity; standalone occurrences deliberately have no invented repeat identity. */
export function createActivityStepOccurrenceId(input: {
  stepId: string;
  repeatId?: string;
  repeatIteration: number;
}): string {
  return input.repeatId
    ? `activity:repeat:${input.repeatId}:${input.repeatIteration}:step:${input.stepId}`
    : `activity:step:${input.stepId}`;
}
