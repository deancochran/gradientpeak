import type { ActivityPlanItem, ActivityPlanRepeat } from "@repo/core";

/** Finds the authored repeat that owns a step; root steps deliberately have no wrapper. */
export function findRepeatForStep(
  items: readonly ActivityPlanItem[],
  stepId: string,
): ActivityPlanRepeat | undefined {
  return items.find(
    (item): item is ActivityPlanRepeat =>
      item.type === "repeat" && item.steps.some((step) => step.id === stepId),
  );
}
