import { z } from "zod";
import type { RecordingServiceActivityPlan } from "./index";

// ==============================
// ACTIVITY TYPE SCHEMA
// ==============================

export const ActivityTypeSchema = z.enum([
  "outdoor_run",
  "outdoor_bike",
  "indoor_bike_trainer",
  "indoor_treadmill",
  "indoor_strength",
  "indoor_swim",
  "other",
]);

export type ActivityType = z.infer<typeof ActivityTypeSchema>;

// ==============================
// ACTIVITY PAYLOAD SCHEMA
// ==============================

export const ActivityPayloadSchema = z.object({
  type: ActivityTypeSchema,
  plannedActivityId: z.string().optional(),
  plan: z.custom<RecordingServiceActivityPlan>().optional(),
});

export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

// ==============================
// ACTIVITY TYPE HELPERS
// ==============================

/**
 * Check if activity type is continuous (time/distance based)
 */
export const isContinuousActivity = (type: ActivityType): boolean => {
  return [
    "outdoor_run",
    "outdoor_bike",
    "indoor_bike_trainer",
    "indoor_treadmill",
  ].includes(type);
};

/**
 * Check if activity type is step-based (reps/sets based)
 */
export const isStepBasedActivity = (type: ActivityType): boolean => {
  return ["indoor_strength"].includes(type);
};

/**
 * Check if activity type is outdoor (requires GPS)
 */
export const isOutdoorActivity = (type: ActivityType): boolean => {
  return ["outdoor_run", "outdoor_bike"].includes(type);
};

/**
 * Get display name for activity type
 */
export const getActivityDisplayName = (type: ActivityType): string => {
  const names: Record<ActivityType, string> = {
    outdoor_run: "Outdoor Run",
    outdoor_bike: "Outdoor Bike",
    indoor_bike_trainer: "Indoor Bike Trainer",
    indoor_treadmill: "Treadmill",
    indoor_strength: "Strength Training",
    indoor_swim: "Swimming",
    other: "Other Activity",
  };
  return names[type];
};

/**
 * Get activity type category
 */
export const getActivityCategory = (
  type: ActivityType,
): "cardio" | "strength" | "other" => {
  if (
    [
      "outdoor_run",
      "outdoor_bike",
      "indoor_bike_trainer",
      "indoor_treadmill",
      "indoor_swim",
    ].includes(type)
  ) {
    return "cardio";
  }
  if (type === "indoor_strength") {
    return "strength";
  }
  return "other";
};

/**
 * Check if activity type supports structured activities
 */
export const supportsStructuredActivities = (type: ActivityType): boolean => {
  return [
    "outdoor_run",
    "outdoor_bike",
    "indoor_bike_trainer",
    "indoor_treadmill",
    "indoor_strength",
  ].includes(type);
};

/**
 * Get primary metrics for activity type
 */
export const getPrimaryMetrics = (type: ActivityType): string[] => {
  const metrics: Record<ActivityType, string[]> = {
    outdoor_run: ["pace", "heartRate", "distance", "elevation"],
    outdoor_bike: ["power", "speed", "heartRate", "cadence", "elevation"],
    indoor_bike_trainer: ["power", "heartRate", "cadence"],
    indoor_treadmill: ["pace", "heartRate", "incline"],
    indoor_strength: ["weight", "reps", "sets", "restTime"],
    indoor_swim: ["pace", "distance", "strokes"],
    other: ["heartRate", "time"],
  };
  return metrics[type];
};

/**
 * Check if activity type typically uses power data
 */
export const usesPowerData = (type: ActivityType): boolean => {
  return ["outdoor_bike", "indoor_bike_trainer"].includes(type);
};

/**
 * Check if activity type typically uses pace data
 */
export const usesPaceData = (type: ActivityType): boolean => {
  return ["outdoor_run", "indoor_treadmill", "indoor_swim"].includes(type);
};

/**
 * Check if activity type should use follow-along screen
 * Swim and other activities are mandatory to use follow-along
 */
export const shouldUseFollowAlong = (type: ActivityType): boolean => {
  return ["indoor_swim", "other"].includes(type);
};

/**
 * Check if activity type can be recorded on the phone
 * These activities support live metric tracking during recording
 */
export const canRecordActivity = (type: ActivityType): boolean => {
  return [
    "indoor_treadmill",
    "indoor_bike_trainer",
    "outdoor_run",
    "outdoor_bike",
    "indoor_strength",
  ].includes(type);
};
