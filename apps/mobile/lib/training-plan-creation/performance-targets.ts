import {
  type AthletePerformanceTargetFacts,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";

export type MobilePlanningTargetHydrationSource = "canonical" | "unavailable";

/** Keeps mobile planning fail-closed when its owner-only performance-model query is unavailable. */
export function resolveMobilePlanningPerformanceTargets(input: {
  snapshot: AthletePerformanceTargetFacts | null | undefined;
  fallbackAsOf: string;
}): AthletePerformanceTargetFacts {
  return input.snapshot ?? createUnavailableAthletePerformanceTargetFacts(input.fallbackAsOf);
}

/** Prevents ordinary model refetches from replacing builder-owned context edits. */
export function shouldReplaceMobilePlanningAthleteContext(input: {
  hydratedSource: MobilePlanningTargetHydrationSource | null;
  nextSource: MobilePlanningTargetHydrationSource;
}): boolean {
  return (
    input.hydratedSource === null ||
    (input.hydratedSource === "unavailable" && input.nextSource === "canonical")
  );
}
