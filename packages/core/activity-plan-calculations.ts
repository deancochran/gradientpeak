import type {
  CompiledActivityPlan,
  CompiledActivityPlanOccurrence,
  CompiledActivityStepOccurrence,
} from "./activity-plan";
import { type ActivityPlanDurationSummary, summarizeActivityPlanDuration } from "./duration";
import type { CanonicalActivityCategory } from "./schemas/activity-category";

export type ActivityProfilePoint = {
  occurrenceId: string;
  globalOrdinal: number;
  repeatId?: string;
  repeatIteration: number;
  activity_category: CanonicalActivityCategory | null;
  role: CompiledActivityPlanOccurrence["role"];
  durationSeconds: number | null;
  cumulativeExactSeconds: number | null;
  targets: CompiledActivityPlanOccurrence["targets"];
};

export type ActivityCategoryDose = {
  activity_category: CanonicalActivityCategory;
  occurrenceCount: number;
  timedActiveSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
};

export type ActivityPlanStats = {
  occurrenceCount: number;
  duration: ActivityPlanDurationSummary;
  categoryDoses: ActivityCategoryDose[];
};

/** Creates visualization points without assigning guessed time to non-time completion policies. */
export function extractActivityProfile(plan: CompiledActivityPlan): ActivityProfilePoint[] {
  let cumulativeExactSeconds: number | null = 0;
  return plan.occurrences.map((occurrence) => {
    const durationSeconds =
      occurrence.duration.type === "time" ? occurrence.duration.seconds : null;
    const point: ActivityProfilePoint = {
      occurrenceId: occurrence.occurrenceId,
      globalOrdinal: occurrence.globalOrdinal,
      ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
      repeatIteration: occurrence.repeatIteration,
      activity_category: occurrence.activity_category,
      role: occurrence.role,
      durationSeconds,
      cumulativeExactSeconds,
      targets: occurrence.targets,
    };
    cumulativeExactSeconds =
      cumulativeExactSeconds !== null && durationSeconds !== null
        ? cumulativeExactSeconds + durationSeconds
        : null;
    return point;
  });
}

/**
 * Calculates authored completion quantities only. Prescription Common Load and
 * normalized intensity belong to ActivityQuantification and are intentionally
 * not reconstructed in this presentation helper.
 */
export function calculateActivityPlanStats(plan: CompiledActivityPlan): ActivityPlanStats {
  const duration = summarizeActivityPlanDuration(plan);
  const occurrencesByCategory = new Map<
    CanonicalActivityCategory,
    CompiledActivityStepOccurrence[]
  >();
  for (const occurrence of plan.occurrences) {
    const categoryOccurrences = occurrencesByCategory.get(occurrence.activity_category) ?? [];
    categoryOccurrences.push(occurrence);
    occurrencesByCategory.set(occurrence.activity_category, categoryOccurrences);
  }

  const categoryDoses = duration.activity_categories.map<ActivityCategoryDose>(
    (categoryDuration) => ({
      ...categoryDuration,
      occurrenceCount: occurrencesByCategory.get(categoryDuration.activity_category)?.length ?? 0,
    }),
  );

  return { occurrenceCount: plan.occurrences.length, duration, categoryDoses };
}

/** Resolves only within the exact timed prefix; unknown-duration occurrences are an explicit boundary. */
export function getOccurrenceAtElapsedTime(
  plan: CompiledActivityPlan,
  elapsedSeconds: number,
): { occurrence: CompiledActivityPlanOccurrence; elapsedSeconds: number; progress: number } | null {
  let cumulativeSeconds = 0;
  for (const occurrence of plan.occurrences) {
    if (occurrence.duration.type !== "time") return null;
    if (elapsedSeconds < cumulativeSeconds + occurrence.duration.seconds) {
      const elapsed = elapsedSeconds - cumulativeSeconds;
      return {
        occurrence,
        elapsedSeconds: elapsed,
        progress: elapsed / occurrence.duration.seconds,
      };
    }
    cumulativeSeconds += occurrence.duration.seconds;
  }
  return null;
}
