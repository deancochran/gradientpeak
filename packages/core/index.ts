/**
 * @repo/core - Runtime-neutral domain contracts, schemas, and utilities.
 *
 * The root API is optimized for shared web, mobile, and server consumers. Prefer
 * explicit subpaths for new imports, especially `@repo/core/server` for Node-only
 * activity-file parsing and stream decompression helpers.
 *
 * Architecture:
 * - Prefer package-owned domain schemas and helper types at the public boundary
 * - Keep database-generated types behind adapters when possible
 * - Business logic, calculations, and utilities are defined here
 * - Keep server-only runtime dependencies behind explicit server subpaths
 */

export * from "./activity-plan-calculations";
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
} from "./calculations/power-curve";
export {
  deriveSpeedCurveFromThresholdPace,
  paceToSpeed,
  parsePace,
  speedToPace,
} from "./calculations/speed-curve";
export type {
  CssTestObservationInput,
  CssTestProtocolInput,
  CssTestProtocolResult,
  CssTestTimesInput,
} from "./calculations/swim-pace-curve";
export {
  CSS_TEST_PROTOCOL,
  calculateCssFrom400m200mTest,
  cssTestProtocolSchema,
  cssTestTimesSchema,
  deriveSwimPaceCurveFromCSS,
  estimateCSSFromSwimTests,
  pacePerHundredMetersToSpeed,
  speedToPacePerHundredMeters,
} from "./calculations/swim-pace-curve";
export * from "./recording";

// ============================================================================
// Barrel File Exports - Automatically export from subdirectories
// ============================================================================
// These barrel files (index.ts in each directory) handle their own exports
// and will automatically pick up new files added to their directories

export * from "./activity-analysis"; // Shared dynamic activity analysis contracts/helpers
export * from "./activity-artifacts"; // Thin decoded source-artifact contracts
export * from "./activity-categories"; // Canonical activity_category registry and heuristics
export * from "./activity-files"; // Runtime-neutral activity file ingestion contracts
export * from "./activity-plan"; // Strict activity-plan contracts and compiler
export * from "./activity-segments"; // Completed activity segment contracts
export {
  type ActivityEffortObservationKind,
  type CanonicalThresholdType,
  canonicalThresholdTypes,
  type DirectThresholdMetricObservation,
  getEligibleThresholdValue,
  type ResolveCanonicalThresholdsInput,
  type ResolvedCanonicalThreshold,
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
  type ThresholdConfidence,
  type ThresholdEligibilityReason,
  type ThresholdMetricSource,
} from "./athlete-inputs/canonical-thresholds";
export * from "./athlete-intelligence"; // Deterministic athlete intelligence contracts and evaluation
export * from "./bluetooth"; // Canonical BLE parsers
export * from "./calculations/critical-power";
// Performance curves (power, pace, HR)
export * from "./calculations/curves";
// ============================================================================
// Performance Metrics Calculations
// Multi-modal TSS calculations (power, heart rate, pace)
export * from "./calculations/defaults";
export * from "./calculations/duration";
export * from "./calculations/training-quality";
export * from "./calculations/workload";
export * from "./coaching"; // Shared coaching roster adapters
export * from "./contracts"; // Shared API contracts
// Heart rate test detection
export * from "./detection/hr-tests";
// Running test detection
export * from "./detection/pace-tests";
// ============================================================================
// Test Effort Detection
// ============================================================================
// Power test detection
export * from "./detection/power-tests";
export * from "./duration"; // Canonical duration helpers
// Root names retain their canonical date-only and activity-plan meanings.
export { formatDuration } from "./duration/format";
export * from "./estimation"; // TSS estimation system
export * from "./goals"; // Goal draft/payload helpers
export * from "./groups"; // Group contracts, permissions, and display state
export * from "./integrations"; // Provider capability registry and sync action helpers
export * from "./load"; // Canonical load-domain helpers
export { getTrainingIntensityZone } from "./load/tss";
export * from "./messaging"; // Shared messaging adapters
export * from "./notifications"; // Shared notification normalization helpers
export * from "./organizations"; // Organization authorization contracts
export * from "./parity"; // Product parity registry and contracts
export * from "./plan"; // Training plan normalization/expansion helpers
export * from "./profile"; // Shared profile contracts and adapters
export type {
  ActivityCategory as RecordingMetricsActivityCategory,
  RecordingMetricSample,
  RecordingMetricsAccumulator,
  RecordingMetricsConfig,
  RecordingMetricsSnapshot,
  TrainingStressScoreMethod,
} from "./recording-metrics";
export {
  calculateRecordingMetrics,
  createRecordingMetricsAccumulator,
} from "./recording-metrics"; // Live/replay recording metrics accumulator
export * from "./recurrence"; // Supported recurrence semantics and deterministic serialization
export * from "./route-files"; // Route upload formats, limits, schemas, and filename helpers
export * from "./samples"; // Sample data for testing and development
export * from "./schemas"; // Shared Zod schemas and domain types
export { addDays } from "./schemas/training-plan-structure/helpers";
export * from "./social"; // Social engagement entity taxonomy
export * from "./training-timeline"; // Canonical training timeline read model
export type {
  ActivityLap,
  ActivityLength,
  ActivityRecord,
  ActivitySegment,
  ActivitySession,
  StandardActivity,
} from "./types/normalization";
export * from "./utils"; // Utility functions
export * from "./zones"; // Canonical zones and threshold metadata

// ============================================================================
// Namespace Exports - For organized imports
// ============================================================================
// Allows consumers to import as: import { Calculations } from '@repo/core'
// and use as: Calculations.calculateTSS(...)

export * as ActivityCategories from "./activity-categories";
export * as AthleteInputs from "./athlete-inputs";
export * as Bluetooth from "./bluetooth";
export * as Calculations from "./calculations";
export * as Coaching from "./coaching";
export * as Duration from "./duration";
export * as Estimation from "./estimation";
export * as Estimators from "./estimators/index";
export * as Load from "./load";
export * as Messaging from "./messaging";
export * as Plan from "./plan";
export * as Profile from "./profile";
export * as RecordingMetrics from "./recording-metrics";
export * as Samples from "./samples";
export * as Schemas from "./schemas";
export * as TrainingTimeline from "./training-timeline";
export * as Utils from "./utils";
export * as Zones from "./zones";
