import type { CanonicalSport } from "@repo/core";
import { Activity, Bike, Dumbbell, Footprints, Waves } from "lucide-react-native";

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
} as const satisfies Record<
  CanonicalSport,
  {
    name: string;
    icon: typeof Activity;
    color: string;
    bgColor: string;
    borderColor: string;
  }
>;

/**
 * Get activity configuration for category + location
 */
export function getActivityCategoryConfig(category: string) {
  return ACTIVITY_CATEGORY_CONFIGS[category as CanonicalSport] || ACTIVITY_CATEGORY_CONFIGS.other;
}

export function getUniqueActivityCategoryConfigs(
  categories: readonly (string | null | undefined)[],
) {
  const uniqueCategories = [
    ...new Set(categories.filter((category): category is string => !!category)),
  ];
  const resolvedCategories = uniqueCategories.length > 0 ? uniqueCategories : ["other"];
  return resolvedCategories.map((category) => ({
    category,
    ...getActivityCategoryConfig(category),
  }));
}

/**
 * Get display name for category + location combination
 */
export function getActivityDisplayName(
  category: CanonicalSport,
  gpsRecordingEnabled: boolean,
): string {
  const categoryConfig = getActivityCategoryConfig(category);
  const gpsText = gpsRecordingEnabled ? "GPS On" : "GPS Off";

  // Special cases for better naming
  if (category === "run" && !gpsRecordingEnabled) {
    return "Treadmill";
  }
  if (category === "bike" && !gpsRecordingEnabled) {
    return "Bike Trainer";
  }

  return `${categoryConfig.name} (${gpsText})`;
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
