import type { CanonicalSport } from "../schemas/sport";
import type { ActivityPlanDuration, ActivityPlanTarget } from "./v3-schema";

export type CompiledActivityStepOccurrence = {
  occurrenceId: string;
  globalOrdinal: number;
  segmentId: string;
  segmentIndex: number;
  role: "activity";
  category: CanonicalSport;
  intervalId: string;
  intervalIndex: number;
  stepId: string;
  stepIndex: number;
  repeatIteration: number;
  completionPolicy: ActivityPlanDuration["type"];
  duration: ActivityPlanDuration;
  targets: readonly ActivityPlanTarget[];
};

export type CompiledBoundaryOccurrence = {
  occurrenceId: string;
  globalOrdinal: number;
  segmentId: string;
  segmentIndex: number;
  role: "transition" | "rest";
  category: null;
  intervalId: null;
  intervalIndex: null;
  stepId: null;
  stepIndex: null;
  repeatIteration: null;
  completionPolicy: "time";
  duration: { type: "time"; seconds: number };
  targets: readonly [];
};

export type CompiledActivityPlanOccurrence =
  | CompiledActivityStepOccurrence
  | CompiledBoundaryOccurrence;

/** IDs are delimiter-safe because every identity component has fixed UUID or integer grammar. */
export function createActivityStepOccurrenceId(input: {
  segmentId: string;
  intervalId: string;
  repeatIteration: number;
  stepId: string;
}): string {
  return `activity:${input.segmentId}:${input.intervalId}:${input.repeatIteration}:${input.stepId}`;
}

export function createBoundaryOccurrenceId(segmentId: string): string {
  return `boundary:${segmentId}`;
}
