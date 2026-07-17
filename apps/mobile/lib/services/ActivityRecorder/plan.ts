import {
  type ActivityPlanTarget,
  activityPlanStructureSchemaV3,
  type CompiledActivityPlan,
  type CompiledActivityPlanOccurrence,
  compileValidatedActivityPlanV3,
} from "@repo/core";

export interface RecordingActivityPlanV3Input {
  id?: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  gps_recording_enabled?: boolean;
  /** Untrusted transport input; compileRecordingPlan performs strict V3 parsing. */
  structure: unknown;
}

type PresentableOccurrence<T extends CompiledActivityPlanOccurrence> = T extends unknown
  ? Omit<T, "targets"> & {
      id: string;
      name: string;
      description?: string;
      notes?: string;
      targets: ActivityPlanTarget[];
    }
  : never;
export type RecordingPlanOccurrence = PresentableOccurrence<CompiledActivityPlanOccurrence>;

export type CompiledRecordingPlan = Omit<CompiledActivityPlan, "occurrences"> & {
  occurrences: readonly RecordingPlanOccurrence[];
};

/** Compiles the strict V3 snapshot and adds presentation-only labels without changing identity/order. */
export function compileRecordingPlan(plan: RecordingActivityPlanV3Input): CompiledRecordingPlan {
  const structure = activityPlanStructureSchemaV3.parse(plan.structure);
  const compiled = compileValidatedActivityPlanV3(structure);

  return {
    ...compiled,
    occurrences: compiled.occurrences.map((occurrence) => {
      const segment = structure.segments[occurrence.segmentIndex];
      if (occurrence.role !== "activity") {
        return {
          ...occurrence,
          id: occurrence.occurrenceId,
          name: segment?.name ?? occurrence.role,
          targets: [...occurrence.targets],
        };
      }
      const step =
        segment?.role === "activity"
          ? segment.intervals[occurrence.intervalIndex]?.steps[occurrence.stepIndex]
          : undefined;
      return {
        ...occurrence,
        id: occurrence.occurrenceId,
        name: step?.name ?? "Activity step",
        targets: [...occurrence.targets],
        ...(step?.description ? { description: step.description } : {}),
        ...(step?.notes ? { notes: step.notes } : {}),
      };
    }),
  };
}
