// Export everything from calculations
export * from "./calculations";

// Export from constants, excluding duplicates that exist in schemas
// (ActivityType and getIntensityZone come from schemas instead)
export {
  ACTIVITY_CATEGORIES,
  ACTIVITY_TYPE_CONFIG,
  BLE_SERVICE_UUIDS,
  CONVERSION_FACTORS,
  EARTH_RADIUS_METERS,
  FATIGUE_LEVEL_THRESHOLDS,
  FITNESS_LEVEL_THRESHOLDS,
  HR_ZONE_MAX_PERCENTAGES,
  HR_ZONE_NAMES,
  HR_ZONE_PERCENTAGES,
  INTENSITY_ZONES,
  MET_VALUES,
  NORMALIZED_POWER,
  PACE_ZONE_PERCENTAGES,
  PHYSIOLOGICAL_DEFAULTS,
  POWER_ZONE_NAMES,
  POWER_ZONE_PERCENTAGES,
  TIME_CONSTANTS,
  TRAINING_RECOMMENDATIONS,
  TSB_THRESHOLDS,
  TSS_CONSTANTS,
  VALIDATION_RANGES,
} from "./constants";

// Export everything from database-types
export * from "./database-types";

// Export everything from samples
export * from "./samples";

// Export everything from schemas (includes ActivityType and getIntensityZone)
export * from "./schemas";

// Export everything from utils
export * from "./utils/activity-defaults";
