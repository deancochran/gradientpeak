/**
 * Activity Type Utilities
 * Handles conversion between database activity categories and
 * Wahoo integration activity type semantics.
 */

import type { PublicActivityCategory } from "@repo/db";

export type ActivityCategory = PublicActivityCategory;
export type ActivityType = ActivityCategory;

/**
 * Convert from database schema to integration activity type format.
 */
export function toActivityType(category: PublicActivityCategory): ActivityType {
  return category;
}

/**
 * Convert from integration activity type format to database schema fields.
 */
export function fromActivityType(activityType: ActivityType): {
  category: PublicActivityCategory;
} {
  return { category: activityType };
}

/**
 * Check if activity type supports routes
 * Bike and run support routes.
 */
export function supportsRoutes(activityType: ActivityType): boolean {
  return activityType === "bike" || activityType === "run";
}

/**
 * Check if activity type is supported by Wahoo
 * Wahoo only supports cycling and running with structured workouts.
 */
export function isWahooSupported(activityType: ActivityType): boolean {
  const supportedTypes: ActivityType[] = ["bike", "run"];
  return supportedTypes.includes(activityType);
}

/**
 * Map activity type to Wahoo's workout_type_family and workout_type_location
 */
export function toWahooTypes(
  activityType: ActivityType,
  options?: { hasRoute?: boolean },
): {
  workout_type_family: number;
  workout_type_location: number;
} | null {
  const hasRoute = options?.hasRoute ?? false;

  switch (activityType) {
    case "bike":
      return {
        workout_type_family: 0,
        workout_type_location: hasRoute ? 1 : 0,
      };
    case "run":
      return {
        workout_type_family: 1,
        workout_type_location: hasRoute ? 1 : 0,
      };
    default:
      return null;
  }
}

/**
 * Get sport name for route metadata
 */
export function toSportName(activityType: ActivityType): string {
  const { category } = fromActivityType(activityType);

  switch (category) {
    case "bike":
      return "cycling";
    case "run":
      return "running";
    case "swim":
      return "swimming";
    default:
      return "generic";
  }
}

/**
 * Map activity type to Wahoo's workout_type_id.
 * These IDs are used when creating workouts on the calendar
 */
export function toWahooWorkoutTypeId(
  activityType: ActivityType,
  options?: { hasRoute?: boolean },
): number | null {
  const hasRoute = options?.hasRoute ?? false;

  switch (activityType) {
    case "bike":
      return hasRoute ? 0 : 12;
    case "run":
      return hasRoute ? 1 : 5;
    default:
      return null;
  }
}
