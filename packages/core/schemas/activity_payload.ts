import { z } from "zod";
import type { RecordingServiceActivityPlan } from "./index";

export type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  PlanStepV2,
} from "./activity_plan_v2";
// ==============================
// V2 EXPORTS
// ==============================
export {
  activityPlanStructureSchemaV2,
  durationSchemaV2,
  formatIntensityTarget,
  formatStepTargets,
  getStepIntensityColor,
  intensityTargetSchemaV2,
  planStepSchemaV2,
  validateActivityPlanStructureV2,
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
  normalized_speed_mps: z.number().optional(),
  normalized_graded_speed_mps: z.number().optional(),

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
  efficiency_factor: z.number().optional(),
  aerobic_decoupling: z.number().optional(),
  training_effect: z.enum(["recovery", "base", "tempo", "threshold", "vo2max"]).optional(),

  // Swim metrics
  total_strokes: z.number().optional(),
  avg_swolf: z.number().optional(),
  pool_length: z.number().optional(),
  pool_length_unit: z.string().optional(),
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
export const ActivityUploadSchema = z
  .object({
    name: z.string().min(1),
    notes: z.string().optional().nullable(),
    type: z.enum(["bike", "run", "swim", "strength", "other"]),
    startedAt: z.string(),
    finishedAt: z.string(),
    durationSeconds: z.number().int().min(0),
    movingSeconds: z.number().int().min(0),
    distanceMeters: z.number().int().min(0),
    metrics: ActivityMetricsSchema,
    hrZoneSeconds: z.array(z.number().int()).length(5).optional().nullable(),
    powerZoneSeconds: z.array(z.number().int()).length(7).optional().nullable(),
    profileSnapshot: ProfileSnapshotSchema.optional().nullable(),
    eventId: z.string().uuid().optional().nullable(),
    routeId: z.string().uuid().optional().nullable(),
    polyline: z.string().optional().nullable(),
    mapBounds: z
      .object({
        minLat: z.number(),
        maxLat: z.number(),
        minLng: z.number(),
        maxLng: z.number(),
      })
      .optional()
      .nullable(),
    laps: z.array(z.record(z.string(), z.any())).optional().nullable(),
    powerCurve: z.record(z.string(), z.number()).optional().nullable(),
    deviceName: z.string().optional().nullable(),
  })
  .strict();

export type ActivityUpload = z.infer<typeof ActivityUploadSchema>;

// ==============================
// ACTIVITY TYPE SCHEMA
// ==============================

// Import database types
import type { CanonicalSport } from "./sport";

export type ActivityCategory = CanonicalSport;

// ==============================
// ACTIVITY PAYLOAD SCHEMA
// ==============================

export const ActivityPayloadSchema = z
  .object({
    category: z.enum(["run", "bike", "swim", "strength", "other"]),
    gpsRecordingEnabled: z.boolean(),
    eventId: z.string().optional(),
    plan: z.custom<RecordingServiceActivityPlan>().optional(),
  })
  .strict();

export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

// ==============================
// ACTIVITY TYPE HELPERS
// ==============================

/**
 * Check if activity is continuous (time/distance based)
 */
export const isContinuousActivity = (category: ActivityCategory): boolean => {
  return category === "run" || category === "bike";
};

/**
 * Check if activity is step-based (reps/sets based)
 */
export const isStepBasedActivity = (category: ActivityCategory): boolean => {
  return category === "strength";
};

/**
 * Check if activity is configured to record GPS
 */
export const isGpsRecordingEnabled = (gpsRecordingEnabled: boolean): boolean => {
  return gpsRecordingEnabled;
};

/**
 * Get display name for activity
 */
export const getActivityDisplayName = (
  category: ActivityCategory,
  _gpsRecordingEnabled: boolean,
): string => {
  if (category === "strength") return "Strength Training";
  if (category === "swim") return "Swimming";
  if (category === "other") return "Other Activity";

  const categoryStr = category.charAt(0).toUpperCase() + category.slice(1);
  return categoryStr;
};

/**
 * Get activity general category (for general categorization)
 */
export const getActivityGeneralCategory = (
  category: ActivityCategory,
): "cardio" | "strength" | "other" => {
  if (["run", "bike", "swim"].includes(category)) {
    return "cardio";
  }
  if (category === "strength") {
    return "strength";
  }
  return "other";
};

/**
 * Check if activity supports structured activities
 */
export const supportsStructuredActivities = (category: ActivityCategory): boolean => {
  return category === "run" || category === "bike" || category === "strength";
};

/**
 * Get primary metrics for activity
 */
export const getPrimaryMetrics = (
  category: ActivityCategory,
  gpsRecordingEnabled: boolean,
): string[] => {
  if (category === "run" && gpsRecordingEnabled) {
    return ["pace", "heartRate", "distance", "elevation"];
  }
  if (category === "run" && !gpsRecordingEnabled) {
    return ["pace", "heartRate", "incline"];
  }
  if (category === "bike" && gpsRecordingEnabled) {
    return ["power", "speed", "heartRate", "cadence", "elevation"];
  }
  if (category === "bike" && !gpsRecordingEnabled) {
    return ["power", "heartRate", "cadence"];
  }
  if (category === "strength") {
    return ["weight", "reps", "sets", "restTime"];
  }
  if (category === "swim") {
    return ["pace", "distance", "strokes"];
  }
  return ["heartRate", "time"];
};

/**
 * Check if activity typically uses power data
 */
export const usesPowerData = (category: ActivityCategory): boolean => {
  return category === "bike";
};

/**
 * Check if activity typically uses pace data
 */
export const usesPaceData = (category: ActivityCategory): boolean => {
  return category === "run" || category === "swim";
};

/**
 * Check if activity should use follow-along screen
 * Swim and other activities are mandatory to use follow-along
 */
export const shouldUseFollowAlong = (category: ActivityCategory): boolean => {
  return category === "swim" || category === "other";
};

/**
 * Map old combined activityType to category
 * @deprecated Migration helper
 */
export const mapActivityTypeToCategory = (activityType: string): ActivityCategory => {
  if (activityType.includes("run")) return "run";
  if (activityType.includes("bike")) return "bike";
  if (activityType.includes("swim")) return "swim";
  if (activityType.includes("strength")) return "strength";
  return "other";
};

/**
 * Check if activity can be recorded on the phone
 * These activities support live metric tracking during recording
 */
export const canRecordActivity = (category: ActivityCategory): boolean => {
  return category === "run" || category === "bike" || category === "strength";
};
