import type { ActivityPlanStructureV2, DurationV2, IntervalV2 } from "../schemas/activity_plan_v2";
import type { DurationEstimateOptions } from "./seconds";
import { getDurationSeconds } from "./seconds";

export function calculateTotalDurationFromSteps(
  steps: Array<{ duration: DurationV2 }>,
  options?: DurationEstimateOptions,
): number {
  return steps.reduce((total, step) => total + getDurationSeconds(step.duration, options), 0);
}

export function calculateTotalDurationFromIntervals(
  intervals: IntervalV2[],
  options?: DurationEstimateOptions,
): number {
  return intervals.reduce((total, interval) => {
    const intervalDuration = calculateTotalDurationFromSteps(interval.steps, options);
    return total + intervalDuration * interval.repetitions;
  }, 0);
}

export function calculateStructureDurationSeconds(
  structure: ActivityPlanStructureV2,
  options?: DurationEstimateOptions,
): number {
  return calculateTotalDurationFromIntervals(structure.intervals, options);
}
