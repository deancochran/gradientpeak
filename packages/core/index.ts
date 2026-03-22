/**
 * @repo/core - Core types, schemas, and utilities
 *
 * This package serves as the main dependency for web, mobile, and tRPC packages.
 * It provides business logic, calculations, schemas, and utilities.
 *
 * Architecture:
 * - Prefer package-owned domain schemas and helper types at the public boundary
 * - Keep database-generated types behind adapters when possible
 * - Business logic, calculations, and utilities are defined here
 * - All exports are organized for easy consumption by consuming packages
 */

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

export type {
  AggregatedStream,
  PublicActivityMetric,
  PublicActivityMetricDataType,
} from "./calculations";
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
// Onboarding & Performance Estimation Functions
export {
  calculateAge as calculateAgeFromDOB,
  getBaselineProfile,
  mergeWithBaseline,
} from "./calculations/baseline-profiles";
export {
  calculateHRReserve,
  calculateTargetHR,
  calculateVO2MaxFromHR,
  estimateLTHR,
  estimateMaxHRFromAge,
} from "./calculations/heart-rate";
export {
  estimateCSSFromGender,
  estimateFTPFromWeight,
  estimateThresholdPaceFromGender,
} from "./calculations/performance-estimates";
export {
  derivePowerCurveFromFTP,
  estimatePowerForDuration,
  estimateWPrime,
} from "./calculations/power-curve";
export {
  deriveSpeedCurveFromThresholdPace,
  paceToSpeed,
  parsePace,
  speedToPace,
} from "./calculations/speed-curve";
export {
  deriveSwimPaceCurveFromCSS,
  estimateCSSFromSwimTests,
  pacePerHundredMetersToSpeed,
  speedToPacePerHundredMeters,
} from "./calculations/swim-pace-curve";
export type {
  ActivityProfilePointV2,
  ActivityStatsV2,
} from "./calculations_v2";
// V2 Calculations (for ActivityPlanStructureV2)
export {
  calculateActivityStatsV2,
  calculateTotalDurationSecondsV2,
  extractActivityProfileV2,
  getStepAtTimeV2,
} from "./calculations_v2";

// ============================================================================
// Constants Module
// ============================================================================
export * from "./constants";

// ============================================================================
// Barrel File Exports - Automatically export from subdirectories
// ============================================================================
// These barrel files (index.ts in each directory) handle their own exports
// and will automatically pick up new files added to their directories

export * from "./bluetooth"; // Canonical BLE parsers
export * from "./contracts"; // Shared API contracts
export * from "./duration"; // Canonical duration helpers
export * from "./estimation"; // TSS estimation system
export * from "./goals"; // Goal draft/payload helpers
export * from "./load"; // Canonical load-domain helpers
export * from "./notifications"; // Shared notification normalization helpers
export * from "./plan"; // Training plan normalization/expansion helpers
export * from "./samples"; // Sample data for testing and development
export * from "./schemas"; // Zod schemas and types (includes formatDuration for DurationV2)
export * from "./sports"; // Canonical sport registry and heuristics
export * from "./utils"; // Utility functions
export * from "./zones"; // Canonical zones and threshold metadata

// ============================================================================
// FIT File Parsing and Encoding Module
// ============================================================================

// Performance curves (power, pace, HR)
export * from "./calculations/curves";
// ============================================================================
// Performance Metrics Calculations
// Multi-modal TSS calculations (power, heart rate, pace)
export * from "./calculations/defaults";
export * from "./calculations/duration";
export * from "./calculations/training-quality";
export * from "./calculations/tss";
export * from "./calculations/workload";
// Heart rate test detection
export * from "./detection/hr-tests";
// Running test detection
export * from "./detection/pace-tests";
// ============================================================================
// Test Effort Detection
// ============================================================================
// Power test detection
export * from "./detection/power-tests";
export * from "./lib/fit-sdk-parser";
export { extractHeartRateZones, extractPowerZones } from "./lib/fit-sdk-parser";
export type { StandardActivity } from "./types/normalization";

// ============================================================================
// Namespace Exports - For organized imports
// ============================================================================
// Allows consumers to import as: import { Calculations } from '@repo/core'
// and use as: Calculations.calculateTSS(...)

export * as Bluetooth from "./bluetooth";
export * as Calculations from "./calculations";
export * as CalculationsV2 from "./calculations_v2";
export * as Constants from "./constants";
export * as Duration from "./duration";
export * as Estimation from "./estimation";
export * as Estimators from "./estimators";
export * as Load from "./load";
export * as Plan from "./plan";
export * as Samples from "./samples";
export * as Schemas from "./schemas";
export * as Sports from "./sports";
export * as Utils from "./utils";
export * as Zones from "./zones";
