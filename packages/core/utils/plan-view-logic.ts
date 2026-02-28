import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";

export type ActivityType = "run" | "bike" | "swim" | "strength" | "other";

export interface RecordingViewConfig {
  showMapCard: boolean;
  showStepCarousel: boolean;
  showRouteOverlay: boolean;
  showTurnByTurn: boolean;
  primaryNavigation: "steps" | "distance" | "time";
}

/**
 * Determine what UI elements should be shown during activity recording
 * based on activity type, structure, and route presence
 */
export function getRecordingViewConfig(
  _activityType: ActivityType,
  structure: ActivityPlanStructureV2,
  routeId: string | null | undefined,
  gpsRecordingEnabled: boolean,
): RecordingViewConfig {
  const hasSteps = !!(structure.intervals && structure.intervals.length > 0);
  const hasRoute = !!routeId;
  const canTrackLocation = gpsRecordingEnabled;

  return {
    showMapCard: canTrackLocation || hasRoute,
    showStepCarousel: hasSteps,
    showRouteOverlay: canTrackLocation && hasRoute,
    showTurnByTurn: canTrackLocation && hasRoute,
    primaryNavigation: hasSteps
      ? "steps"
      : canTrackLocation
        ? "distance"
        : "time",
  };
}

/**
 * Check if an activity type can have a route
 * Note: All activity types can optionally have a route attached
 */
export function canHaveRoute(_activityType: ActivityType): boolean {
  return true; // Routes are optional for all activity types
}
