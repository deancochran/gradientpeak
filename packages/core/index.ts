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
export * from "./athlete-inputs/calculation-trust";
export {
  calculateAge as calculateAgeFromDOB,
  getOnboardingBaselineProfile,
} from "./calculations/baseline-profiles";
export {
  calculateHRReserve,
  calculateTargetHR,
  calculateVO2MaxFromHR,
  estimateMaxHRFromAge,
} from "./calculations/heart-rate";
export { estimatePowerForDuration } from "./calculations/power-curve";
export {
  paceToSpeed,
  parsePace,
  speedToPace,
} from "./calculations/speed-curve";
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
export * from "./activity-quantification"; // Canonical prescription/observation quantification contracts
export * from "./activity-segments"; // Completed activity segment contracts
export * from "./athlete-capabilities"; // Evidence-qualified continuous capabilities and limiters
export * from "./athlete-intelligence"; // Deterministic athlete intelligence contracts and evaluation
// Athlete-state plan simulation is re-exported through the plan boundary below.
export * from "./bluetooth"; // Canonical BLE parsers
// ============================================================================
// Performance Metrics Calculations
export * from "./calculations/duration";
export * from "./calculations/training-quality";
export * from "./calculations/workload";
export * from "./coaching"; // Shared coaching roster adapters
export * from "./contracts"; // Shared API contracts
export * from "./cycling-performance"; // Evidence-first cycling duration-performance model
// Heart rate test detection
// Running test detection
// ============================================================================
// Test Effort Detection
// ============================================================================
// Power test detection
export * from "./duration"; // Canonical duration helpers
// Root names retain their canonical date-only and activity-plan meanings.
export { formatDuration } from "./duration/format";
export * from "./duration-performance"; // Evidence-first cross-category duration/session performance
export * from "./goals"; // Goal draft/payload helpers
export * from "./groups"; // Group contracts, permissions, and display state
export * from "./integrations"; // Provider capability registry and sync action helpers
export * from "./load"; // Canonical load-domain helpers
export * from "./messaging"; // Shared messaging adapters
export * from "./notifications"; // Shared notification normalization helpers
export * from "./organizations"; // Organization authorization contracts
export * from "./parity"; // Product parity registry and contracts
export * from "./performance-calibration"; // Activity-derived calibration registry and policies
export * from "./performance-model"; // Canonical as-of category models and narrow target facts
export * from "./plan"; // Training plan normalization/expansion helpers
export * from "./profile"; // Shared profile contracts and adapters
export * from "./profile-previews"; // Privacy-safe effort, structure, and session-count previews
export type {
  ProvisionalCommonLoadMethod,
  ProvisionalRecordingMetricsAccumulator,
  ProvisionalRecordingMetricsSnapshot,
  RecordingMetricSample,
  RecordingMetricsActivityCategory,
  RecordingMetricsConfig,
} from "./recording-metrics";
export {
  calculateProvisionalCommonLoad,
  calculateProvisionalRecordingMetrics,
  createProvisionalRecordingMetricsAccumulator,
  provisionalRecordingMetricsSnapshotSchema,
} from "./recording-metrics"; // Live/replay recording metrics accumulator
export * from "./recurrence"; // Supported recurrence semantics and deterministic serialization
export * from "./route-files"; // Route upload formats, limits, schemas, and filename helpers
export * from "./samples"; // Sample data for testing and development
export * from "./schemas"; // Shared Zod schemas and domain types
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
// and use as: Calculations.calculateTrainingEffect(...)

export * as ActivityCategories from "./activity-categories";
export * as AthleteInputs from "./athlete-inputs";
export * as Bluetooth from "./bluetooth";
export * as Calculations from "./calculations";
export * as Coaching from "./coaching";
export * as Duration from "./duration";
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
