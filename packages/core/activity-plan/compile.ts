import type { CanonicalSport } from "../schemas/sport";
import {
  type CompiledActivityPlanOccurrence,
  createActivityStepOccurrenceId,
  createBoundaryOccurrenceId,
} from "./occurrence";
import { type ActivityPlanStructureV3, activityPlanStructureSchemaV3 } from "./v3-schema";

export const ACTIVITY_PLAN_COMPILER_VERSION = 1 as const;

export type CompiledActivityPlan = {
  compilerVersion: typeof ACTIVITY_PLAN_COMPILER_VERSION;
  structureVersion: 3;
  primaryCategory: CanonicalSport;
  categories: readonly CanonicalSport[];
  occurrences: readonly CompiledActivityPlanOccurrence[];
  explicitTimedDurationSeconds: number;
};

/** Parses once and expands the plan into stable recorder/calculation occurrences. */
export function compileActivityPlanV3(input: unknown): CompiledActivityPlan {
  const structure = activityPlanStructureSchemaV3.parse(input);
  return compileValidatedActivityPlanV3(structure);
}

/** Compiles a previously parsed V3 value without introducing runtime state or randomness. */
export function compileValidatedActivityPlanV3(
  structure: ActivityPlanStructureV3,
): CompiledActivityPlan {
  const occurrences: CompiledActivityPlanOccurrence[] = [];
  const categories: CanonicalSport[] = [];
  const seenCategories = new Set<CanonicalSport>();
  let primaryCategory: CanonicalSport | undefined;
  let explicitTimedDurationSeconds = 0;

  structure.segments.forEach((segment, segmentIndex) => {
    if (segment.role !== "activity") {
      explicitTimedDurationSeconds += segment.duration.seconds;
      occurrences.push({
        occurrenceId: createBoundaryOccurrenceId(segment.id),
        globalOrdinal: occurrences.length,
        segmentId: segment.id,
        segmentIndex,
        role: segment.role,
        category: null,
        intervalId: null,
        intervalIndex: null,
        stepId: null,
        stepIndex: null,
        repeatIteration: null,
        completionPolicy: "time",
        duration: segment.duration,
        targets: [],
      });
      return;
    }

    if (!seenCategories.has(segment.category)) {
      seenCategories.add(segment.category);
      categories.push(segment.category);
    }
    primaryCategory ??= segment.category;

    segment.intervals.forEach((interval, intervalIndex) => {
      for (let repeatIteration = 0; repeatIteration < interval.repetitions; repeatIteration += 1) {
        interval.steps.forEach((step, stepIndex) => {
          if (step.duration.type === "time") {
            explicitTimedDurationSeconds += step.duration.seconds;
          }
          occurrences.push({
            occurrenceId: createActivityStepOccurrenceId({
              segmentId: segment.id,
              intervalId: interval.id,
              repeatIteration,
              stepId: step.id,
            }),
            globalOrdinal: occurrences.length,
            segmentId: segment.id,
            segmentIndex,
            role: "activity",
            category: segment.category,
            intervalId: interval.id,
            intervalIndex,
            stepId: step.id,
            stepIndex,
            repeatIteration,
            completionPolicy: step.duration.type,
            duration: step.duration,
            targets: step.targets,
          });
        });
      }
    });
  });

  if (primaryCategory === undefined) {
    throw new Error("Validated activity plan must contain an activity segment.");
  }

  return {
    compilerVersion: ACTIVITY_PLAN_COMPILER_VERSION,
    structureVersion: 3,
    primaryCategory,
    categories,
    occurrences,
    explicitTimedDurationSeconds,
  };
}
