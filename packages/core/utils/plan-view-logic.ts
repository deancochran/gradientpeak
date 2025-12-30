import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";

export type ActivityType =
  | "outdoor_run"
  | "outdoor_bike"
  | "indoor_treadmill"
  | "indoor_bike_trainer"
  | "indoor_strength"
  | "indoor_swim"
  | "other";

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
  activityType: ActivityType,
  structure: ActivityPlanStructureV2,
  routeId: string | null | undefined,
): RecordingViewConfig {
  const hasSteps = !!(structure.intervals && structure.intervals.length > 0);
  const hasRoute = !!routeId;
  const isIndoor =
    activityType === "indoor_treadmill" ||
    activityType === "indoor_bike_trainer";
  const isOutdoor =
    activityType === "outdoor_run" || activityType === "outdoor_bike";

  // Indoor without route
  if (isIndoor && !hasRoute) {
    return {
      showMapCard: false,
      showStepCarousel: hasSteps,
      showRouteOverlay: false,
      showTurnByTurn: false,
      primaryNavigation: hasSteps ? "steps" : "time",
    };
  }

  // Indoor with route (visual guidance, no turn-by-turn)
  if (isIndoor && hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: true,
      showTurnByTurn: false, // No navigation for indoor
      primaryNavigation: hasSteps ? "steps" : "distance",
    };
  }

  // Outdoor without route
  if (isOutdoor && !hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: false,
      showTurnByTurn: false,
      primaryNavigation: hasSteps ? "steps" : "time",
    };
  }

  // Outdoor with route (full turn-by-turn navigation)
  if (isOutdoor && hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: true,
      showTurnByTurn: true, // Enable navigation
      primaryNavigation: hasSteps ? "steps" : "distance",
    };
  }

  // Fallback for other activity types (strength, swim, etc.)
  return {
    showMapCard: false,
    showStepCarousel: hasSteps,
    showRouteOverlay: false,
    showTurnByTurn: false,
    primaryNavigation: "time",
  };
}

/**
 * Check if an activity type can have a route
 * Note: All activity types can optionally have a route attached
 */
export function canHaveRoute(activityType: ActivityType): boolean {
  return true; // Routes are optional for all activity types
}

/**
 * Check if activity type is outdoor (GPS-based)
 */
export function isOutdoorActivity(activityType: ActivityType): boolean {
  return activityType === "outdoor_run" || activityType === "outdoor_bike";
}

/**
 * Check if activity type is indoor
 */
export function isIndoorActivity(activityType: ActivityType): boolean {
  return [
    "indoor_treadmill",
    "indoor_bike_trainer",
    "indoor_strength",
    "indoor_swim",
  ].includes(activityType);
}
