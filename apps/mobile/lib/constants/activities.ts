import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/supabase";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";

/**
 * Activity category configuration for icons, labels, and colors
 * Used for the new separated category + location system
 */
export const ACTIVITY_CATEGORY_CONFIGS = {
  run: {
    name: "Run",
    icon: Footprints,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  bike: {
    name: "Bike",
    icon: Bike,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  swim: {
    name: "Swim",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
  },
  strength: {
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  other: {
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
} as const;

/**
 * Get activity configuration for category + location
 */
export function getActivityCategoryConfig(category: string) {
  return (
    ACTIVITY_CATEGORY_CONFIGS[category as PublicActivityCategory] ||
    ACTIVITY_CATEGORY_CONFIGS.other
  );
}

/**
 * Get display name for category + location combination
 */
export function getActivityDisplayName(
  category: PublicActivityCategory,
  location: PublicActivityLocation,
): string {
  const categoryConfig = getActivityCategoryConfig(category);
  const locationText = location === "indoor" ? "Indoor" : "Outdoor";

  // Special cases for better naming
  if (category === "run" && location === "indoor") {
    return "Treadmill";
  }
  if (category === "bike" && location === "indoor") {
    return "Bike Trainer";
  }

  return `${locationText} ${categoryConfig.name}`;
}

/**
 * Legacy: Activity type configuration for backwards compatibility
 * @deprecated Use ACTIVITY_CATEGORY_CONFIGS with getActivityCategoryConfig instead
 */
export const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    shortName: "Run",
    icon: Footprints,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  outdoor_bike: {
    name: "Outdoor Bike",
    shortName: "Bike",
    icon: Bike,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  indoor_run: {
    name: "Treadmill",
    shortName: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  indoor_bike: {
    name: "Bike Trainer",
    shortName: "Trainer",
    icon: Bike,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  indoor_strength: {
    name: "Strength Training",
    shortName: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  indoor_swim: {
    name: "Swimming",
    shortName: "Swim",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
  },
  other: {
    name: "Other Activity",
    shortName: "Other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
} as const;

/**
 * Valid activity type keys
 */
export type ActivityType = keyof typeof ACTIVITY_CONFIGS;

/**
 * Get activity configuration for a given type (legacy)
 * Returns 'other' config as fallback if type not found
 * @deprecated Use getActivityCategoryConfig instead
 */
export function getActivityConfig(activityType: string) {
  return (
    ACTIVITY_CONFIGS[activityType as ActivityType] || ACTIVITY_CONFIGS.other
  );
}

/**
 * Activity type options for filters and selectors
 */
export const ACTIVITY_FILTER_OPTIONS = [
  { value: "all" as const, label: "All", icon: Activity },
  { value: "outdoor_run" as const, label: "Run", icon: Footprints },
  { value: "outdoor_bike" as const, label: "Bike", icon: Bike },
  { value: "indoor_strength" as const, label: "Strength", icon: Dumbbell },
] as const;

/**
 * All activity type options for creation and editing
 */
export const ACTIVITY_CATEGORY_OPTIONS = [
  { value: "outdoor_run", label: "Outdoor Run", icon: Footprints },
  { value: "outdoor_bike", label: "Outdoor Bike", icon: Bike },
  { value: "indoor_run", label: "Treadmill", icon: Footprints },
  { value: "indoor_bike", label: "Bike Trainer", icon: Bike },
  { value: "indoor_strength", label: "Strength Training", icon: Dumbbell },
  { value: "indoor_swim", label: "Swimming", icon: Waves },
  { value: "other", label: "Other", icon: Activity },
] as const;
