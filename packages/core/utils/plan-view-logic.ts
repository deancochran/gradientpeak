import type { CompiledActivityPlan } from "../activity-plan";

export interface RecordingViewConfig {
  showMapCard: boolean;
  showStepCarousel: boolean;
  showRouteOverlay: boolean;
  showTurnByTurn: boolean;
  primaryNavigation: "steps" | "distance" | "time";
}

/**
 * Determine what UI elements should be shown during activity recording
 * based on activity category, structure, and route presence
 */
export function getRecordingViewConfig(
  plan: CompiledActivityPlan,
  routeId: string | null | undefined,
  gpsRecordingEnabled: boolean,
): RecordingViewConfig {
  const hasSteps = plan.occurrences.length > 0;
  const hasRoute = !!routeId;
  const canTrackLocation = gpsRecordingEnabled;

  return {
    showMapCard: canTrackLocation || hasRoute,
    showStepCarousel: hasSteps,
    showRouteOverlay: canTrackLocation && hasRoute,
    showTurnByTurn: canTrackLocation && hasRoute,
    primaryNavigation: hasSteps ? "steps" : canTrackLocation ? "distance" : "time",
  };
}

/**
 * Check if an activity category can have a route
 * Note: All activity categories can optionally have a route attached
 */
export function canHaveRoute(plan: CompiledActivityPlan): boolean {
  return plan.occurrences.some(
    (occurrence) =>
      occurrence.activity_category === "run" || occurrence.activity_category === "bike",
  );
}
