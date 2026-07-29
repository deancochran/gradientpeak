/**
 * Wahoo Activity Type Utilities
 * Handles conversion between database activity categories and
 * Wahoo activity type semantics.
 */

import type { PublicActivityCategory } from "@repo/db";

export type ActivityCategory = PublicActivityCategory;
export type WahooActivityType = ActivityCategory;

/**
 * Convert from database schema to Wahoo activity type format.
 */
export function toActivityType(category: PublicActivityCategory): WahooActivityType {
  return category;
}

/**
 * Convert from Wahoo activity type format to database schema fields.
 */
export function fromActivityType(activityType: WahooActivityType): {
  category: PublicActivityCategory;
} {
  return { category: activityType };
}

/**
 * Check if a Wahoo activity type supports routes
 * Bike and run support routes.
 */
export function supportsRoutes(activityType: WahooActivityType): boolean {
  return activityType === "bike" || activityType === "run";
}

/**
 * Check if the Wahoo activity type is supported.
 * Wahoo supports only cycling and running with structured activity plans.
 */
export function isWahooSupported(activityType: WahooActivityType): boolean {
  const supportedTypes: WahooActivityType[] = ["bike", "run"];
  return supportedTypes.includes(activityType);
}

/**
 * Map an activity category to Wahoo's workout_type_family and workout_type_location
 */
export function toWahooTypes(
  activityType: WahooActivityType,
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
 * Get the category name required by Wahoo route metadata
 */
export function toSportName(activityType: WahooActivityType): string {
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
 * Map an activity category to Wahoo's workout_type_id.
 * These IDs are used when creating Wahoo workout calendar entries
 */
export function toWahooWorkoutTypeId(
  activityType: WahooActivityType,
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
