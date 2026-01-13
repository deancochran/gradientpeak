/**
 * Activity Type Utilities
 * Handles conversion between database schema (activity_category + activity_location)
 * and legacy activity_type format used throughout the application
 */

import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/supabase";

export type ActivityCategory = "run" | "bike" | "swim" | "strength" | "other";
export type ActivityLocation = "outdoor" | "indoor";

// Legacy activity type format (still used in code)
export type ActivityType =
  | "outdoor_run"
  | "outdoor_bike"
  | "indoor_treadmill"
  | "indoor_bike_trainer"
  | "indoor_strength"
  | "indoor_swim"
  | "other";

/**
 * Convert from database schema to legacy activity_type format
 */
export function toActivityType(
  category: PublicActivityCategory,
  location: PublicActivityLocation,
): ActivityType {
  // Handle special cases
  if (category === "bike" && location === "indoor") {
    return "indoor_bike_trainer";
  }
  if (category === "run" && location === "indoor") {
    return "indoor_treadmill";
  }
  if (category === "strength") {
    return "indoor_strength";
  }
  if (category === "swim") {
    return "indoor_swim";
  }
  if (category === "other") {
    return "other";
  }

  // Standard format: location_category
  return `${location}_${category}` as ActivityType;
}

/**
 * Convert from legacy activity_type format to database schema
 */
export function fromActivityType(activityType: ActivityType): {
  category: PublicActivityCategory;
  location: PublicActivityLocation;
} {
  // Handle special cases
  if (activityType === "indoor_bike_trainer") {
    return { category: "bike", location: "indoor" };
  }
  if (activityType === "indoor_treadmill") {
    return { category: "run", location: "indoor" };
  }
  if (activityType === "indoor_strength") {
    return { category: "strength", location: "indoor" };
  }
  if (activityType === "indoor_swim") {
    return { category: "swim", location: "indoor" };
  }
  if (activityType === "other") {
    return { category: "other", location: "indoor" };
  }

  // Standard format: outdoor_category
  const [location, category] = activityType.split("_") as [
    ActivityLocation,
    ActivityCategory,
  ];
  return { category, location };
}

/**
 * Check if activity type supports routes
 * Only outdoor bike and outdoor run support routes
 */
export function supportsRoutes(activityType: ActivityType): boolean {
  return activityType === "outdoor_bike" || activityType === "outdoor_run";
}

/**
 * Check if activity type is supported by Wahoo
 * Wahoo only supports cycling and running with structured workouts
 */
export function isWahooSupported(activityType: ActivityType): boolean {
  const supportedTypes: ActivityType[] = [
    "outdoor_bike",
    "indoor_bike_trainer",
    "outdoor_run",
    "indoor_treadmill",
  ];
  return supportedTypes.includes(activityType);
}

/**
 * Map activity type to Wahoo's workout_type_family and workout_type_location
 */
export function toWahooTypes(activityType: ActivityType): {
  workout_type_family: number;
  workout_type_location: number;
} | null {
  switch (activityType) {
    case "outdoor_bike":
      return { workout_type_family: 0, workout_type_location: 1 };
    case "indoor_bike_trainer":
      return { workout_type_family: 0, workout_type_location: 0 };
    case "outdoor_run":
      return { workout_type_family: 1, workout_type_location: 1 };
    case "indoor_treadmill":
      return { workout_type_family: 1, workout_type_location: 0 };
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
 * Map activity type to Wahoo's workout_type_id
 * These IDs are used when creating workouts on the calendar
 */
export function toWahooWorkoutTypeId(activityType: ActivityType): number | null {
  switch (activityType) {
    case "outdoor_bike":
      return 0;
    case "outdoor_run":
      return 1;
    case "indoor_treadmill":
      return 5;
    case "indoor_bike_trainer":
      return 12;
    default:
      return null;
  }
}
