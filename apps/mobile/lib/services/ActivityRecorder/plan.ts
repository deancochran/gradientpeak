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

const FREE_RECORDING_SEGMENT_ID = "00000000-0000-4000-8000-000000000001";
const FREE_RECORDING_INTERVAL_ID = "00000000-0000-4000-8000-000000000002";
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
      version: 3,
      activity_category,
      segments: [
        {
          id: FREE_RECORDING_SEGMENT_ID,
          role: "activity",
          name,
          intervals: [
            {
              id: FREE_RECORDING_INTERVAL_ID,
              name,
              repetitions: 1,
              steps: [
                {
                  id: FREE_RECORDING_STEP_ID,
                  name,
                  duration: { type: "untilFinished" },
                  targets: [{ type: "RPE", intensity: 1 }],
                },
              ],
            },
          ],
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
