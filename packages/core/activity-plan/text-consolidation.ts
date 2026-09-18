import type { EditableActivityPlanStructure } from "./structure-schema";

export const ACTIVITY_PLAN_TEXT_LIMITS = {
  // Legacy plans accepted 1,000 description and 2,000 notes code points.
  // The canonical field retains both with "\n\nNotes:\n" between them.
  planDescription: 3_009,
  stepInstructions: 1_000,
} as const;

type ActivityPlanTextIssue = {
  limit: number;
  path: string;
};

type ActivityPlanTextConsolidation =
  | {
      status: "valid";
      value: {
        description: string | null;
        notes: null;
        structure: EditableActivityPlanStructure;
      };
    }
  | { issues: readonly ActivityPlanTextIssue[]; status: "too_long" };

function isMeaningful(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Keeps the canonical value unchanged unless distinct legacy text must be retained.
 * Only the legacy value receives a label, so a second consolidation is idempotent.
 */
export function consolidateActivityPlanText(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  secondaryLabel: string,
): string | null {
  if (!isMeaningful(primary)) return isMeaningful(secondary) ? secondary : null;
  if (!isMeaningful(secondary) || primary.trim() === secondary.trim()) return primary;
  return `${primary}\n\n${secondaryLabel}:\n${secondary}`;
}

function hasMoreThanCodePoints(value: string | null, limit: number): boolean {
  return value !== null && Array.from(value).length > limit;
}

/**
 * Converts paired legacy text only at an explicit authoring save boundary.
 * Reads may use consolidateActivityPlanText for display but must not persist this result.
 */
export function consolidateActivityPlanAuthoringText(input: {
  description: string | null | undefined;
  notes: string | null | undefined;
  structure: EditableActivityPlanStructure;
}): ActivityPlanTextConsolidation {
  const description = consolidateActivityPlanText(input.description, input.notes, "Notes");
  const issues: ActivityPlanTextIssue[] = [];
  if (hasMoreThanCodePoints(description, ACTIVITY_PLAN_TEXT_LIMITS.planDescription)) {
    issues.push({ limit: ACTIVITY_PLAN_TEXT_LIMITS.planDescription, path: "description" });
  }

  const structure: EditableActivityPlanStructure = {
    ...input.structure,
    segments: input.structure.segments.map((segment, segmentIndex) =>
      segment.role !== "activity"
        ? segment
        : {
            ...segment,
            intervals: segment.intervals.map((interval, intervalIndex) => ({
              ...interval,
              steps: interval.steps.map((step, stepIndex) => {
                const instructions = consolidateActivityPlanText(
                  step.notes,
                  step.description,
                  "Description",
                );
                if (
                  hasMoreThanCodePoints(instructions, ACTIVITY_PLAN_TEXT_LIMITS.stepInstructions)
                ) {
                  issues.push({
                    limit: ACTIVITY_PLAN_TEXT_LIMITS.stepInstructions,
                    path: `segments.${segmentIndex}.intervals.${intervalIndex}.steps.${stepIndex}.notes`,
                  });
                }
                const { description: _description, ...stepWithoutDescription } = step;
                return {
                  ...stepWithoutDescription,
                  ...(instructions ? { notes: instructions } : {}),
                };
              }),
            })),
          },
    ),
  };

  if (issues.length > 0) return { status: "too_long", issues };
  return { status: "valid", value: { description, notes: null, structure } };
}
