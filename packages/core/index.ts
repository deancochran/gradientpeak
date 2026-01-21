/**
 * @repo/core - Core types, schemas, and utilities
 *
 * This package serves as the main dependency for web, mobile, and tRPC packages.
 * It re-exports database types from @repo/supabase and provides business logic,
 * calculations, schemas, and utilities.
 *
 * Architecture:
 * - Database types come from @repo/supabase (single source of truth)
 * - Business logic, calculations, and utilities are defined here
 * - All exports are organized for easy consumption by consuming packages
 */

// ============================================================================
// Database Layer - Re-export from @repo/supabase
// ============================================================================
// This provides a single import point for database types and schemas
// while maintaining the @repo/supabase package as the source of truth
export * from "@repo/supabase";

// ============================================================================
// FTMS (Fitness Machine Service) Types
// ============================================================================
export * from "./ftms-types";

// ============================================================================
// Calculations Module
// ============================================================================
// Note: This module exports ALL functions from calculations.ts, including
// formatDuration(seconds: number). There's also a formatDuration in schemas
// that works with DurationV2 objects. Both are exported - TypeScript will
// handle overload resolution based on the argument type.

// Export all calculations functions and types
export {
  addDays,
  calculateAge,
  calculateATL,
  calculateAverageGrade,
  calculateAveragePace,
  calculateAverageSpeed,
  calculateCalories,
  calculateCTL,
  calculateCTLProjection,
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
  fahrenheitToCelsius,
  feetToMeters,
  formatAccuracy,
  formatAltitude,
  formatCadence,
  formatDistance,
  formatDuration, // ⚠️ Works with number (seconds) - see note above
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
export type { AggregatedStream } from "./calculations";

// V2 Calculations (for ActivityPlanStructureV2)
export {
  extractActivityProfileV2,
  calculateActivityStatsV2,
  calculateTotalDurationSecondsV2,
  getStepAtTimeV2,
} from "./calculations_v2";
export type {
  ActivityProfilePointV2,
  ActivityStatsV2,
} from "./calculations_v2";

// ============================================================================
// Constants Module
// ============================================================================
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
// Barrel File Exports - Automatically export from subdirectories
// ============================================================================
// These barrel files (index.ts in each directory) handle their own exports
// and will automatically pick up new files added to their directories

export * from "./estimation"; // TSS estimation system
export * from "./samples"; // Sample data for testing and development
export * from "./schemas"; // Zod schemas and types (includes formatDuration for DurationV2)
export * from "./utils"; // Utility functions

// ============================================================================
// FIT File Parsing Module
// ============================================================================
export * from "./lib/fit-parser";
export * from "./lib/fit-sdk-parser";

// ============================================================================
// Performance Metrics Calculations
// ============================================================================
// Multi-modal TSS calculations (power, heart rate, pace)
export * from "./calculations/tss";

// Performance curves (power, pace, HR)
export * from "./calculations/curves";

// ============================================================================
// Test Effort Detection
// ============================================================================
// Power test detection
export * from "./detection/power-tests";

// Running test detection
export * from "./detection/pace-tests";

// Heart rate test detection
export * from "./detection/hr-tests";

// ============================================================================
// Namespace Exports - For organized imports
// ============================================================================
// Allows consumers to import as: import { Calculations } from '@repo/core'
// and use as: Calculations.calculateTSS(...)

export * as Calculations from "./calculations";
export * as CalculationsV2 from "./calculations_v2";
export * as Constants from "./constants";
export * as Estimation from "./estimation";
export * as Samples from "./samples";
export * as Schemas from "./schemas";
export * as Utils from "./utils";
