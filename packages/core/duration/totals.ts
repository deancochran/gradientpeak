import type { CompiledActivityPlan, CompiledActivityPlanOccurrence } from "../activity-plan";
import type { CanonicalSport } from "../schemas/sport";
import { describeActivityPlanDuration } from "./seconds";

export type ActivityPlanCategoryDuration = {
  category: CanonicalSport;
  timedActiveSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
};

export type ActivityPlanDurationSummary = {
  exactElapsedSeconds: number | null;
  timedActiveSeconds: number;
  restSeconds: number;
  transitionSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
  categories: ActivityPlanCategoryDuration[];
};

/** Summarizes compiled occurrences while keeping active, rest, transition, and open time distinct. */
export function summarizeActivityPlanDuration(
  plan: Pick<CompiledActivityPlan, "occurrences"> | readonly CompiledActivityPlanOccurrence[],
): ActivityPlanDurationSummary {
  const occurrences: readonly CompiledActivityPlanOccurrence[] = Array.isArray(plan)
    ? plan
    : (plan as Pick<CompiledActivityPlan, "occurrences">).occurrences;
  const byCategory = new Map<CanonicalSport, ActivityPlanCategoryDuration>();
  let timedActiveSeconds = 0;
  let restSeconds = 0;
  let transitionSeconds = 0;
  let distanceMeters = 0;
  let repetitionCount = 0;
  let openOccurrenceCount = 0;
  let allTimed = true;

  for (const occurrence of occurrences) {
    if (occurrence.role === "rest") {
      restSeconds += occurrence.duration.seconds;
      continue;
    }
    if (occurrence.role === "transition") {
      transitionSeconds += occurrence.duration.seconds;
      continue;
    }

    const semantics = describeActivityPlanDuration(occurrence.duration);
    if (occurrence.category === null) continue;
    allTimed &&= semantics.exactElapsedSeconds !== null;
    timedActiveSeconds += semantics.timedSeconds;
    distanceMeters += semantics.distanceMeters;
    repetitionCount += semantics.repetitionCount;
    openOccurrenceCount += semantics.open ? 1 : 0;

    const category = byCategory.get(occurrence.category) ?? {
      category: occurrence.category,
      timedActiveSeconds: 0,
      distanceMeters: 0,
      repetitionCount: 0,
      openOccurrenceCount: 0,
    };
    category.timedActiveSeconds += semantics.timedSeconds;
    category.distanceMeters += semantics.distanceMeters;
    category.repetitionCount += semantics.repetitionCount;
    category.openOccurrenceCount += semantics.open ? 1 : 0;
    byCategory.set(occurrence.category, category);
  }

  const explicitSeconds = timedActiveSeconds + restSeconds + transitionSeconds;
  return {
    exactElapsedSeconds: allTimed ? explicitSeconds : null,
    timedActiveSeconds,
    restSeconds,
    transitionSeconds,
    distanceMeters,
    repetitionCount,
    openOccurrenceCount,
    categories: [...byCategory.values()],
  };
}
