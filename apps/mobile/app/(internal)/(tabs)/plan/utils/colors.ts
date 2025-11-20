/**
 * Shared color utilities for Plan tab
 * Centralizes color logic for activities and intensity levels
 */

export interface ActivityColorConfig {
  name: string;
  bg: string;
  text: string;
  iconBg: string;
}

export interface IntensityColorConfig {
  text: string;
  bg: string;
}

/**
 * Activity type color configurations
 */
export const ACTIVITY_COLORS: Record<string, ActivityColorConfig> = {
  outdoor_run: {
    name: "Outdoor Run",
    bg: "bg-orange-500",
    text: "text-orange-600",
    iconBg: "bg-orange-500",
  },
  outdoor_bike: {
    name: "Outdoor Bike",
    bg: "bg-blue-500",
    text: "text-blue-600",
    iconBg: "bg-blue-500",
  },
  indoor_treadmill: {
    name: "Treadmill",
    bg: "bg-purple-500",
    text: "text-purple-600",
    iconBg: "bg-purple-500",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    bg: "bg-cyan-500",
    text: "text-cyan-600",
    iconBg: "bg-cyan-500",
  },
  indoor_strength: {
    name: "Strength Training",
    bg: "bg-purple-500",
    text: "text-purple-600",
    iconBg: "bg-purple-500",
  },
  indoor_swim: {
    name: "Swimming",
    bg: "bg-teal-500",
    text: "text-teal-600",
    iconBg: "bg-teal-500",
  },
  rest: {
    name: "Rest",
    bg: "bg-gray-400",
    text: "text-gray-600",
    iconBg: "bg-gray-400",
  },
  other: {
    name: "Other",
    bg: "bg-gray-400",
    text: "text-gray-600",
    iconBg: "bg-gray-400",
  },
};

/**
 * Intensity level color configurations
 */
export const INTENSITY_COLORS: Record<string, IntensityColorConfig> = {
  High: {
    text: "text-red-600",
    bg: "bg-red-50",
  },
  Moderate: {
    text: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  Low: {
    text: "text-green-600",
    bg: "bg-green-50",
  },
};

/**
 * Get color configuration for an activity type
 */
export function getActivityColor(
  type: string | undefined
): ActivityColorConfig {
  if (!type) return ACTIVITY_COLORS.other;
  return ACTIVITY_COLORS[type] || ACTIVITY_COLORS.other;
}

/**
 * Get color configuration for an intensity level
 */
export function getIntensityColor(
  intensity: string | undefined
): IntensityColorConfig {
  if (!intensity) {
    return {
      text: "text-gray-600",
      bg: "bg-gray-50",
    };
  }
  return (
    INTENSITY_COLORS[intensity] || {
      text: "text-gray-600",
      bg: "bg-gray-50",
    }
  );
}

/**
 * Get background class for activity type (for icons, cards, etc.)
 */
export function getActivityBgClass(type: string | undefined): string {
  return getActivityColor(type).bg;
}

/**
 * Get text class for activity type
 */
export function getActivityTextClass(type: string | undefined): string {
  return getActivityColor(type).text;
}

/**
 * Get formatted activity type name
 */
export function getActivityTypeName(type: string | undefined): string {
  if (!type) return "Other";
  return getActivityColor(type).name;
}
