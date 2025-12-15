/**
 * @repo/core - Core types, schemas, and utilities
 *
 * Simplified export strategy with minimal manual maintenance.
 */

// ============================================================================
// Core Modules - Export everything except conflicts
// ============================================================================

export * from "./database-types";
export * from "./ftms-types";

// Export calculations with formatDuration renamed (conflicts with schemas)
export {
  formatDuration as formatDurationSeconds, // Renamed: takes number (seconds)
} from "./calculations";
// Export everything else from calculations
export type {
  AggregatedStream,
  ActivityProfilePoint,
  ActivityStats,
} from "./calculations";
export {
  calculateElapsedTime,
  calculateMovingTime,
  calculateNormalizedPower,
  calculateIntensityFactor,
  calculateTSS,
  calculateVariabilityIndex,
  calculateTotalWork,
  calculateHRZones,
  calculateMaxHRPercent,
  calculatePowerZones,
  calculateEfficiencyFactor,
  calculateDecoupling,
  calculatePowerHeartRateRatio,
  calculatePowerWeightRatio,
  calculateElevationChanges,
  calculateAverageGrade,
  calculateElevationGainPerKm,
  calculateCalories,
  calculateAge,
  calculateDistance,
  calculateTotalDistance,
  calculateAverageSpeed,
  calculateAveragePace,
  estimateCalories,
  calculatePercentageChange,
  calculateMovingAverage,
  parseDuration,
  addDays,
  startOfDay,
  endOfDay,
  metersPerSecondToKph,
  metersPerSecondToMph,
  kphToMps,
  mphToMps,
  kgToLbs,
  lbsToKg,
  metersToFeet,
  feetToMeters,
  kmToMiles,
  milesToKm,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatDistance,
  formatSpeed,
  formatPace,
  formatWeight,
  formatPower,
  formatHeartRate,
  formatCadence,
  formatTSS,
  clamp,
  lerp,
  metersToKm,
  msToKmh,
  formatAltitude,
  formatAccuracy,
  getIntensityZone,
  extractActivityProfile,
  calculateActivityStats,
  formatDurationCompact,
  formatDurationCompactMs,
  calculateCTL,
  calculateATL,
  calculateTSB,
  calculateTrainingLoadSeries,
  getFormStatus,
  getFormStatusColor,
  calculateTrainingIntensityFactor,
  getTrainingIntensityZone,
  calculateTrainingTSS,
  estimateTSS,
  calculateRampRate,
  isRampRateSafe,
  projectCTL,
  calculateTargetDailyTSS,
} from "./calculations";

// Export constants (exclude ActivityType - comes from schemas instead)
export {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_CONFIG,
  ACTIVITY_LOCATIONS,
  ACTIVITY_TYPE_CONFIG,
  BLE_SERVICE_UUIDS,
  CONVERSION_FACTORS,
  EARTH_RADIUS_METERS,
  FATIGUE_LEVEL_THRESHOLDS,
  FITNESS_LEVEL_THRESHOLDS,
  FTMS_CHARACTERISTICS,
  FTMS_FEATURE_BITS,
  FTMS_OPCODES,
  FTMS_RESULT_CODES,
  FTMS_TARGET_SETTING_BITS,
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

// ============================================================================
// Organized Modules - Use barrel files
// ============================================================================

export * from "./samples";
export * from "./schemas"; // Includes formatDuration(DurationV2)

// Utils - use new barrel file
export * from "./utils";

// ============================================================================
// Namespace Exports - For organized imports
// ============================================================================

export * as Schemas from "./schemas";
export * as Utils from "./utils";
export * as Samples from "./samples";
export * as Constants from "./constants";
export * as Calculations from "./calculations";
