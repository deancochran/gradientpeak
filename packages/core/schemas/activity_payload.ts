import { z } from "zod";
import { activityPlanStructureSchema } from "../activity-plan";
import {
  type CanonicalActivityCategory,
  canonicalActivityCategorySchema,
} from "./activity-category";

export { Duration } from "./duration_helpers";
export {
  activityPlanSpeedKphToMetersPerSecond,
  activityPlanSpeedMetersPerSecondToKph,
  formatIntensityTarget,
  formatStepTargets,
  formatTargetValue,
  getPrimaryTarget,
  getStepIntensityColor,
  getTargetByType,
  getTargetDisplayName,
  getTargetGuidance,
  getTargetRange,
  getTargetUnit,
  hasTargetType,
  isInTargetRange,
  Target,
} from "./target_helpers";

/** Strict modern activity-plan domain input. ActivityCategory authority lives in segments. */
export const activityPlanInputSchema = z
  .object({
    name: z.string().min(1, "Plan name is required"),
    description: z.string().max(1000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    structure: activityPlanStructureSchema,
  })
  .strict();
export type ActivityPlanInput = z.infer<typeof activityPlanInputSchema>;

export const activityPlanSchema = activityPlanInputSchema.safeExtend({
  id: z.string().uuid(),
});
export type ActivityPlan = z.infer<typeof activityPlanSchema>;

/** Recorded-session plan contract using the canonical structure. */
export const recordingServiceActivityPlanSchema = z
  .object({
    name: z.string().min(1, "Plan name is required"),
    description: z.string().max(1000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    structure: activityPlanStructureSchema,
  })
  .strict()
  .safeExtend({
    id: z.string().uuid().optional(),
    gps_recording_enabled: z.boolean().optional(),
    import_external_id: z.string().nullable().optional(),
    import_provider: z.string().nullable().optional(),
    is_system_template: z.boolean().optional(),
  });
export type RecordingServiceActivityPlan = z.infer<typeof recordingServiceActivityPlanSchema>;

// ==============================
// ACTIVITY METRICS SCHEMA (for JSONB storage)
// ==============================

/**
 * Schema for activity metrics stored in JSONB
 * Includes all performance, environmental, and analysis metrics
 */
export const ActivityMetricsSchema = z
  .object({
    // Power metrics
    avg_power: z.number().optional(),
    max_power: z.number().optional(),

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

    // Work and calories
    total_work: z.number().optional(),
    calories: z.number().optional(),

    // Elevation metrics
    total_ascent: z.number().optional(),
    total_descent: z.number().optional(),
    avg_grade: z.number().optional(),
    elevation_gain_per_km: z.number().optional(),

    // Environmental metrics. Temperatures are canonical Celsius values.
    avg_temperature: z.number().optional(),
    weather_condition: z.string().optional(),

    // Analysis metrics
    common_load: z.number().optional(),
    vi: z.number().optional(), // Variability Index
    power_weight_ratio: z.number().optional(),
    power_hr_ratio: z.number().optional(),
    training_effect: z.enum(["recovery", "base", "tempo", "threshold", "vo2max"]).optional(),

    // Swim metrics. Pool lengths are canonical metres; provider aliases must be normalized upstream.
    total_strokes: z.number().optional(),
    avg_swolf: z.number().optional(),
    pool_length_meters: z.number().optional(),
  })
  .strict();

export type ActivityMetrics = z.infer<typeof ActivityMetricsSchema>;

// ==============================
// PROFILE SNAPSHOT SCHEMA (for JSONB storage)
// ==============================

/**
 * Schema for profile snapshot stored with activity
 * Captures athlete's profile data at time of activity
 */
export const ProfileSnapshotSchema = z
  .object({
    weight_kg: z.number().optional(),
    age: z.number().optional(),
    recovery_time: z.number().optional(),
    training_load: z.number().optional(),
  })
  .strict();

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
    type: canonicalActivityCategorySchema,
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
// ACTIVITY CATEGORY SCHEMA
// ==============================

export type ActivityCategory = CanonicalActivityCategory;

// ==============================
// ACTIVITY PAYLOAD SCHEMA
// ==============================

export const ActivityPayloadSchema = z
  .object({
    activity_category: canonicalActivityCategorySchema,
    gpsRecordingEnabled: z.literal(false),
    eventId: z.string().optional(),
    plan: recordingServiceActivityPlanSchema.optional(),
  })
  .strict();

export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

// ==============================
// ACTIVITY CATEGORY HELPERS
// ==============================

/**
 * Check if activity is continuous (time/distance based)
 */
export const isContinuousActivity = (activity_category: ActivityCategory): boolean => {
  return activity_category === "run" || activity_category === "bike";
};

/**
 * Check if activity is step-based (reps/sets based)
 */
export const isStepBasedActivity = (activity_category: ActivityCategory): boolean => {
  return activity_category === "strength";
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
  activity_category: ActivityCategory,
  _gpsRecordingEnabled: boolean,
): string => {
  if (activity_category === "strength") return "Strength Training";
  if (activity_category === "swim") return "Swimming";
  if (activity_category === "other") return "Other Activity";

  const categoryStr = activity_category.charAt(0).toUpperCase() + activity_category.slice(1);
  return categoryStr;
};

/**
 * Get activity general activity_category (for general categorization)
 */
export const getActivityGeneralCategory = (
  activity_category: ActivityCategory,
): "cardio" | "strength" | "other" => {
  if (["run", "bike", "swim"].includes(activity_category)) {
    return "cardio";
  }
  if (activity_category === "strength") {
    return "strength";
  }
  return "other";
};

/**
 * Check if activity supports structured activities
 */
export const supportsStructuredActivities = (activity_category: ActivityCategory): boolean => {
  return (
    activity_category === "run" || activity_category === "bike" || activity_category === "strength"
  );
};

/**
 * Get primary metrics for activity
 */
export const getPrimaryMetrics = (
  activity_category: ActivityCategory,
  gpsRecordingEnabled: boolean,
): string[] => {
  if (activity_category === "run" && gpsRecordingEnabled) {
    return ["pace", "heartRate", "distance", "elevation"];
  }
  if (activity_category === "run" && !gpsRecordingEnabled) {
    return ["pace", "heartRate", "incline"];
  }
  if (activity_category === "bike" && gpsRecordingEnabled) {
    return ["power", "speed", "heartRate", "cadence", "elevation"];
  }
  if (activity_category === "bike" && !gpsRecordingEnabled) {
    return ["power", "heartRate", "cadence"];
  }
  if (activity_category === "strength") {
    return ["weight", "reps", "sets", "restTime"];
  }
  if (activity_category === "swim") {
    return ["pace", "distance", "strokes"];
  }
  return ["heartRate", "time"];
};

/**
 * Check if activity typically uses power data
 */
export const usesPowerData = (activity_category: ActivityCategory): boolean => {
  return activity_category === "bike";
};

/**
 * Check if activity typically uses pace data
 */
export const usesPaceData = (activity_category: ActivityCategory): boolean => {
  return activity_category === "run" || activity_category === "swim";
};

/**
 * Check if activity should use follow-along screen
 * Swim and other activities are mandatory to use follow-along
 */
export const shouldUseFollowAlong = (activity_category: ActivityCategory): boolean => {
  return activity_category === "swim" || activity_category === "other";
};

/**
 * Check if activity can be recorded on the phone
 * These activities support live metric tracking during recording
 */
export const canRecordActivity = (activity_category: ActivityCategory): boolean => {
  return (
    activity_category === "run" || activity_category === "bike" || activity_category === "strength"
  );
};
