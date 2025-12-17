/**
 * @repo/core - Core types, schemas, and utilities
 *
 * Simplified export strategy with minimal manual maintenance.
 */

// ============================================================================
// Core Modules - Export everything except conflicts
// ============================================================================

export * from "./ftms-types";

// Export calculations with formatDuration renamed (conflicts with schemas)
export { formatDuration as formatDurationSeconds } from "./calculations";
// Export everything else from calculations
export {
  addDays,
  calculateActivityStats,
  calculateAge,
  calculateATL,
  calculateAverageGrade,
  calculateAveragePace,
  calculateAverageSpeed,
  calculateCalories,
  calculateCTL,
  calculateDecoupling,
  calculateDistance,
  calculateEfficiencyFactor,
  calculateElapsedTime,
  calculateElevationChanges,
  calculateElevationGainPerKm,
  calculateHRZones,
  calculateIntensityFactor,
  calculateMaxHRPercent,
  calculateMovingAverage,
  calculateMovingTime,
  calculateNormalizedPower,
  calculatePercentageChange,
  calculatePowerHeartRateRatio,
  calculatePowerWeightRatio,
  calculatePowerZones,
  calculateRampRate,
  calculateTargetDailyTSS,
  calculateTotalDistance,
  calculateTotalWork,
  calculateTrainingIntensityFactor,
  calculateTrainingLoadSeries,
  calculateTrainingTSS,
  calculateTSB,
  calculateTSS,
  calculateVariabilityIndex,
  celsiusToFahrenheit,
  clamp,
  endOfDay,
  estimateCalories,
  estimateTSS,
  extractActivityProfile,
  fahrenheitToCelsius,
  feetToMeters,
  formatAccuracy,
  formatAltitude,
  formatCadence,
  formatDistance,
  formatDurationCompact,
  formatDurationCompactMs,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatTSS,
  formatWeight,
  getFormStatus,
  getFormStatusColor,
  getIntensityZone,
  getTrainingIntensityZone,
  isRampRateSafe,
  kgToLbs,
  kmToMiles,
  kphToMps,
  lbsToKg,
  lerp,
  metersPerSecondToKph,
  metersPerSecondToMph,
  metersToFeet,
  metersToKm,
  milesToKm,
  mphToMps,
  msToKmh,
  parseDuration,
  projectCTL,
  startOfDay,
} from "./calculations";
export type {
  ActivityProfilePoint,
  ActivityStats,
  AggregatedStream,
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

export * as Calculations from "./calculations";
export * as Constants from "./constants";
export * as Samples from "./samples";
export * as Schemas from "./schemas";
export * as Utils from "./utils";
