import type { CompiledActivityPlan, CompiledActivityPlanOccurrence } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { describeActivityPlanDuration } from "./seconds";

export type ActivityPlanCategoryDuration = {
  activity_category: CanonicalActivityCategory;
  timedActiveSeconds: number;
  restSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
};

export type ActivityPlanDurationSummary = {
  exactElapsedSeconds: number | null;
  timedActiveSeconds: number;
  restSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
  activity_categories: ActivityPlanCategoryDuration[];
};

/** Summarizes V4 compiled step occurrences. V4 encodes recovery as ordinary steps. */
export function summarizeActivityPlanDuration(
  plan: Pick<CompiledActivityPlan, "occurrences"> | readonly CompiledActivityPlanOccurrence[],
): ActivityPlanDurationSummary {
  const occurrences: readonly CompiledActivityPlanOccurrence[] = Array.isArray(plan)
    ? plan
    : (plan as Pick<CompiledActivityPlan, "occurrences">).occurrences;
  const byCategory = new Map<CanonicalActivityCategory, ActivityPlanCategoryDuration>();
  let timedActiveSeconds = 0;
  let restSeconds = 0;
  let distanceMeters = 0;
  let repetitionCount = 0;
  let openOccurrenceCount = 0;
  let allTimed = true;

  for (const occurrence of occurrences) {
    const semantics = describeActivityPlanDuration(occurrence.duration, {
      isRest: occurrence.targets.some((target) => target.type === "rest"),
    });
    if (occurrence.activity_category === null) continue;
    allTimed &&= semantics.exactElapsedSeconds !== null;
    timedActiveSeconds += semantics.timedSeconds;
    restSeconds += semantics.restSeconds;
    distanceMeters += semantics.distanceMeters;
    repetitionCount += semantics.repetitionCount;
    openOccurrenceCount += semantics.open ? 1 : 0;

    const activity_category = byCategory.get(occurrence.activity_category) ?? {
      activity_category: occurrence.activity_category,
      timedActiveSeconds: 0,
      restSeconds: 0,
      distanceMeters: 0,
      repetitionCount: 0,
      openOccurrenceCount: 0,
    };
    activity_category.timedActiveSeconds += semantics.timedSeconds;
    activity_category.restSeconds += semantics.restSeconds;
    activity_category.distanceMeters += semantics.distanceMeters;
    activity_category.repetitionCount += semantics.repetitionCount;
    activity_category.openOccurrenceCount += semantics.open ? 1 : 0;
    byCategory.set(occurrence.activity_category, activity_category);
  }

  const explicitSeconds = timedActiveSeconds + restSeconds;
  return {
    exactElapsedSeconds: allTimed ? explicitSeconds : null,
    timedActiveSeconds,
    restSeconds,
    distanceMeters,
    repetitionCount,
    openOccurrenceCount,
    activity_categories: [...byCategory.values()],
  };
}
