import type { EditableActivityPlanStructure } from "./structure-schema";
export const ACTIVITY_PLAN_TEXT_LIMITS = {
  planDescription: 3_009,
  stepInstructions: 1_000,
} as const;
type ActivityPlanTextIssue = { limit: number; path: string };
type ActivityPlanTextConsolidation =
  | {
      status: "valid";
      value: { description: string | null; notes: null; structure: EditableActivityPlanStructure };
    }
  | { issues: readonly ActivityPlanTextIssue[]; status: "too_long" };
function isMeaningful(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
/** Consolidates text only where a caller explicitly provides two source values. V4 steps have one instructions field. */
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
/** Validates V4 authoring text without adding legacy fields or topology. */
export function consolidateActivityPlanAuthoringText(input: {
  description: string | null | undefined;
  notes?: never;
  structure: EditableActivityPlanStructure;
}): ActivityPlanTextConsolidation {
  const description = isMeaningful(input.description) ? input.description : null;
  const issues: ActivityPlanTextIssue[] = [];
  if (hasMoreThanCodePoints(description, ACTIVITY_PLAN_TEXT_LIMITS.planDescription))
    issues.push({ limit: ACTIVITY_PLAN_TEXT_LIMITS.planDescription, path: "description" });
  input.structure.items.forEach((item, itemIndex) => {
    (item.type === "step" ? [item] : item.steps).forEach((step, stepIndex) => {
      if (
        hasMoreThanCodePoints(step.instructions ?? null, ACTIVITY_PLAN_TEXT_LIMITS.stepInstructions)
      )
        issues.push({
          limit: ACTIVITY_PLAN_TEXT_LIMITS.stepInstructions,
          path:
            item.type === "step"
              ? `items.${itemIndex}.instructions`
              : `items.${itemIndex}.steps.${stepIndex}.instructions`,
        });
    });
  });
  return issues.length > 0
    ? { status: "too_long", issues }
    : { status: "valid", value: { description, notes: null, structure: input.structure } };
}
