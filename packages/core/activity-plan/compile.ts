import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { type CompiledActivityPlanOccurrence, createActivityStepOccurrenceId } from "./occurrence";
import {
  type ActivityPlanStep,
  type ActivityPlanStructure,
  activityPlanStructureSchema,
} from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS } from "./structure-validation";
export const ACTIVITY_PLAN_COMPILER_VERSION = 3 as const;
export type CompiledActivityPlan = {
  compilerVersion: typeof ACTIVITY_PLAN_COMPILER_VERSION;
  structureVersion: 5;
  activity_category: CanonicalActivityCategory;
  occurrences: readonly CompiledActivityPlanOccurrence[];
  explicitTimedDurationSeconds: number;
};
/** Parses once and expands V5 steps/repeats in chronological order. */
export function compileActivityPlan(input: unknown): CompiledActivityPlan {
  return compileValidatedActivityPlan(activityPlanStructureSchema.parse(input));
}
export function compileValidatedActivityPlan(
  structure: ActivityPlanStructure,
): CompiledActivityPlan {
  // Validation already establishes this bound; retain the check before output allocation for callers of this public helper.
  const expanded = structure.items.reduce(
    (total, item) => total + (item.type === "step" ? 1 : item.steps.length * item.count),
    0,
  );
  if (expanded > ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences)
    throw new Error("Activity plan expansion exceeds its safety limit.");
  const occurrences: CompiledActivityPlanOccurrence[] = [];
  let explicitTimedDurationSeconds = 0;
  const append = (
    step: ActivityPlanStep,
    repeatId: string | undefined,
    repeatIteration: number,
  ) => {
    if (step.duration.type === "time") explicitTimedDurationSeconds += step.duration.seconds;
    const ordinal = occurrences.length;
    occurrences.push({
      occurrenceId: createActivityStepOccurrenceId({
        stepId: step.id,
        ...(repeatId ? { repeatId } : {}),
        repeatIteration,
      }),
      ordinal,
      globalOrdinal: ordinal,
      stepId: step.id,
      ...(repeatId ? { repeatId } : {}),
      repeatIteration,
      role: "activity",
      activity_category: structure.activity_category,
      completionPolicy: step.duration.type,
      duration: step.duration,
      targets: step.targets,
    });
  };
  for (const item of structure.items) {
    if (item.type === "step") append(item, undefined, 0);
    else
      for (let iteration = 0; iteration < item.count; iteration += 1)
        for (const step of item.steps) append(step, item.id, iteration);
  }
  return {
    compilerVersion: ACTIVITY_PLAN_COMPILER_VERSION,
    structureVersion: 5,
    activity_category: structure.activity_category,
    occurrences,
    explicitTimedDurationSeconds,
  };
}
