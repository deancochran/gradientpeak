import { z } from "zod";
import type { RecordingServiceActivityPlan } from "./index";

// ==============================
// V2 EXPORTS
// ==============================
export {
  activityPlanStructureSchemaV2,
  durationSchemaV2,
  formatIntensityTarget,
  formatStepTargets,
  getStepIntensityColor,
  groupStepsBySegment,
  intensityTargetSchemaV2,
  planStepSchemaV2,
  validateActivityPlanStructureV2,
} from "./activity_plan_v2";
export type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  PlanStepV2,
} from "./activity_plan_v2";
export {
  calculateTotalDurationV2,
  Duration,
  formatDuration,
  getDurationSeconds,
} from "./duration_helpers";
export {
  createEnduranceRidePlan,
  createPlan,
  createStrengthPlan,
  createTempoRunPlan,
  createThresholdPlan,
  createVO2MaxPlan,
  PlanBuilderV2,
} from "./plan_builder_v2";
export {
  convertTargetToAbsolute,
  formatTargetValue,
  getPrimaryTarget,
  getTargetByType,
  getTargetDisplayName,
  getTargetGuidance,
  getTargetRange,
  getTargetUnit,
  hasTargetType,
  isInTargetRange,
  Target,
} from "./target_helpers";

// ==============================
// ACTIVITY METRICS SCHEMA (for JSONB storage)
// ==============================

/**
 * Schema for activity metrics stored in JSONB
 * Includes all performance, environmental, and analysis metrics
 */
export const ActivityMetricsSchema = z.object({
  // Power metrics
  avg_power: z.number().optional(),
  max_power: z.number().optional(),
  normalized_power: z.number().optional(),

  // Heart rate metrics
  avg_hr: z.number().optional(),
  max_hr: z.number().optional(),
  max_hr_pct_threshold: z.number().optional(),

  // Cadence metrics
  avg_cadence: z.number().optional(),
  max_cadence: z.number().optional(),

  // Speed metrics
  avg_speed: z.number().optional(),
  max_speed: z.number().optional(),

  // Work and calories
  total_work: z.number().optional(),
  calories: z.number().optional(),

  // Elevation metrics
  total_ascent: z.number().optional(),
  total_descent: z.number().optional(),
  avg_grade: z.number().optional(),
  elevation_gain_per_km: z.number().optional(),

  // Environmental metrics
  avg_temperature: z.number().optional(),
  max_temperature: z.number().optional(),
  weather_condition: z.string().optional(),

  // Analysis metrics
  tss: z.number().optional(), // Training Stress Score
  if: z.number().optional(), // Intensity Factor
  vi: z.number().optional(), // Variability Index
  ef: z.number().optional(), // Efficiency Factor
  power_weight_ratio: z.number().optional(),
  power_hr_ratio: z.number().optional(),
  decoupling: z.number().optional(),
});

export type ActivityMetrics = z.infer<typeof ActivityMetricsSchema>;

// ==============================
// PROFILE SNAPSHOT SCHEMA (for JSONB storage)
// ==============================

/**
 * Schema for profile snapshot stored with activity
 * Captures athlete's profile data at time of activity
 */
export const ProfileSnapshotSchema = z.object({
  ftp: z.number().optional(),
  weight_kg: z.number().optional(),
  threshold_hr: z.number().optional(),
  age: z.number().optional(),
  recovery_time: z.number().optional(),
  training_load: z.number().optional(),
});

export type ProfileSnapshot = z.infer<typeof ProfileSnapshotSchema>;

// ==============================
// ACTIVITY UPLOAD SCHEMA
// ==============================

/**
 * Complete schema for uploading an activity with all data
 * Used by mobile app when finishing a recording
 */
export const ActivityUploadSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional().nullable(),
  type: z.enum(["bike", "run", "swim", "strength", "other"]),
  location: z.enum(["indoor", "outdoor"]).optional().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationSeconds: z.number().int().min(0),
  movingSeconds: z.number().int().min(0),
  distanceMeters: z.number().int().min(0),
  metrics: ActivityMetricsSchema,
  hrZoneSeconds: z.array(z.number().int()).length(5).optional().nullable(),
  powerZoneSeconds: z.array(z.number().int()).length(7).optional().nullable(),
  profileSnapshot: ProfileSnapshotSchema.optional().nullable(),
  plannedActivityId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
});

export type ActivityUpload = z.infer<typeof ActivityUploadSchema>;

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
 * Get activity type category (for general categorization)
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
 * Map ActivityType to database activity_category enum
 */
export const mapActivityTypeToCategory = (
  type: ActivityType,
): "run" | "bike" | "swim" | "strength" | "other" => {
  switch (type) {
    case "outdoor_run":
    case "indoor_treadmill":
      return "run";
    case "outdoor_bike":
    case "indoor_bike_trainer":
      return "bike";
    case "indoor_swim":
      return "swim";
    case "indoor_strength":
      return "strength";
    case "other":
    default:
      return "other";
  }
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
