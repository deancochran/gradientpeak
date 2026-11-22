import {
  type ActivityPlanMetric,
  type AthletePerformanceTargetFacts,
  activityPlanDraftMetrics,
} from "@repo/core";

/**
 * Mobile authoring and detail surfaces use the same canonical projection when
 * current athlete facts are available. A detail keeps its server-projected
 * metrics only while that context has not loaded, rather than presenting a
 * stale projection as a current estimate.
 */
export function resolveMobileActivityPlanEstimateMetrics(input: {
  structure: unknown;
  performanceTargets?: AthletePerformanceTargetFacts;
  persistedMetrics: readonly ActivityPlanMetric[];
}): readonly ActivityPlanMetric[] {
  return input.performanceTargets
    ? activityPlanDraftMetrics(input.structure, input.performanceTargets)
    : input.persistedMetrics;
}

/** Saved estimates are valid only for the untouched edit snapshot while facts load. */
export function canRetainSavedMobileActivityPlanEstimateMetrics(input: {
  athleteFactsLoading: boolean;
  editPlanId: string | undefined;
  hydratedPlanId: string | null;
  isEditMode: boolean;
  structure: unknown;
  hydratedStructure: unknown;
}): boolean {
  return (
    input.isEditMode &&
    input.athleteFactsLoading &&
    input.hydratedPlanId === input.editPlanId &&
    JSON.stringify(input.structure) === JSON.stringify(input.hydratedStructure)
  );
}
