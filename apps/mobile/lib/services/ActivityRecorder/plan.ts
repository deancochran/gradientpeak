import {
  type ActivityPlanTarget,
  activityPlanStructureSchema,
  type CompiledActivityPlan,
  type CompiledActivityPlanOccurrence,
  compileValidatedActivityPlan,
  type RecordingActivityCategory,
} from "@repo/core";
export interface RecordingActivityPlanInput {
  id?: string;
  name: string;
  description?: string | null | undefined;
  notes?: string | null | undefined;
  gps_recording_enabled?: boolean | undefined;
  /** Untrusted transport input; compileRecordingPlan performs strict parsing. */
  structure: unknown;
}
const FREE_RECORDING_STEP_ID = "00000000-0000-4000-8000-000000000003";
/**
 * Creates the canonical execution-only structure for a free recording.
 *
 * This is deliberately not an ActivityPlan: it has no plan id and callers must
 * keep it outside selected-plan state. Stable structure ids make the compiled
 * occurrence identity and hash deterministic for a selected activity_category.
 */
export function createFreeRecordingExecutionPlan(
  activity_category: RecordingActivityCategory,
): RecordingActivityPlanInput {
  const name = `${activity_category} free recording`;
  return {
    name,
    structure: {
      version: 5,
      activity_category,
      items: [
        {
          type: "step",
          id: FREE_RECORDING_STEP_ID,
          name,
          duration: { type: "untilFinished" },
          targets: [],
        },
      ],
    },
  };
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
/** Compiles the strict snapshot and adds presentation-only labels without changing identity/order. */
export function compileRecordingPlan(plan: RecordingActivityPlanInput): CompiledRecordingPlan {
  const structure = activityPlanStructureSchema.parse(plan.structure);
  const compiled = compileValidatedActivityPlan(structure);
  return {
    ...compiled,
    occurrences: compiled.occurrences.map((occurrence) => {
      const step = structure.items.find((item) =>
        item.type === "step"
          ? item.id === occurrence.stepId
          : item.steps.some((candidate) => candidate.id === occurrence.stepId),
      );
      const matchedStep =
        step?.type === "step"
          ? step
          : step?.steps.find((candidate) => candidate.id === occurrence.stepId);
      return {
        ...occurrence,
        id: occurrence.occurrenceId,
        name: matchedStep?.name ?? "Activity step",
        targets: [...occurrence.targets],
        ...(matchedStep?.instructions ? { description: matchedStep.instructions } : {}),
      };
    }),
  };
}
