const MAX_STRING_LENGTH = 64;
const MAX_ENTRY_COUNT = 25;

const PROCEDURE_GROUPS = new Set([
  "profiles",
  "athleteIntelligence",
  "onboarding",
  "profileMetrics",
  "activities",
  "activityEfforts",
  "activityPlans",
  "events",
  "goals",
  "activityFiles",
  "integrations",
  "messaging",
  "notifications",
  "trainingPlans",
  "routes",
  "social",
  "trends",
  "storage",
  "home",
  "feed",
  "profileSettings",
  "groups",
  "publicShare",
  "organizations",
  "unknown",
]);
const PROCEDURE_TYPES = new Set(["query", "mutation", "subscription", "unknown"]);
const OUTCOMES = new Set([
  "success",
  "expected_error",
  "unexpected_error",
  "cancelled",
  "unsupported_activity_file",
]);
const DURATION_BUCKETS = new Set(["<50", "<200", "<1000", "<5000", ">=5000"]);
const ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "PAYMENT_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNPROCESSABLE_CONTENT",
  "PRECONDITION_REQUIRED",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
  "INTERNAL_SERVER_ERROR",
  "UNKNOWN",
]);
const PROVIDERS = new Set(["strava", "wahoo", "garmin", "polar", "coros", "fitbit", "unknown"]);
const CATEGORIES = new Set(["auth", "validation", "database", "upstream", "rate_limit", "unknown"]);
const ENVIRONMENTS = new Set(["development", "test", "staging", "production"]);
const FLAG_KEYS = new Set(["cached", "partial", "retryable"]);
const SAFE_APPLICATION_CODES = new Set([
  "activity_analysis_initial_segments_invalid",
  "activity_analysis_failed",
  "activity_analysis_persisted_segments_invalid",
  "activity_analysis_segments_invalid",
  "activity_artifact_lifecycle_pending",
  "activity_artifact_persistence_failed",
  "activity_athlete_state_evidence_invalid",
  "activity_calibration_evidence_invalid",
  "activity_effort_segment_mismatch",
  "activity_effort_reconciliation_invalid",
  "activity_import_failed",
  "activity_ingestion_conflict",
  "activity_ingestion_persistence_failed",
  "activity_material_evidence_marker_failed",
  "activity_parent_persistence_failed",
  "activity_laps_invalid",
  "activity_performance_snapshot_invalid",
  "activity_persistence_invariant_failed",
  "activity_persistence_failed",
  "activity_segments_invalid",
  "activity_segment_persistence_failed",
  "activity_source_reference_failed",
  "activity_validation_failed",
  "invalid_started_at",
  "missing_started_at",
  "unsupported_persisted_version",
]);
const SAFE_ERROR_CLASSES = new Set([
  "ActivityAnalysisValidationError",
  "AbortError",
  "ActivityArtifactLifecycleRetryableError",
  "ActivityArtifactPersistenceError",
  "ActivityAthleteStateEvidenceError",
  "ActivityCalibrationEvidenceError",
  "ActivityMaterialEvidenceMarkerError",
  "ActivityFileIngestionPersistenceError",
  "ActivityFileParseError",
  "ActivityParentPersistenceError",
  "ActivitySegmentPersistenceError",
  "ActivitySubmissionValidationError",
  "ActivitySourceReferenceError",
  "DrizzleQueryError",
  "Error",
  "ImportedActivityAnalysisError",
  "PostgresError",
  "TRPCError",
  "UnsupportedPersistedActivityVersionError",
  "ZodError",
  "unknown",
]);
const SAFE_POSTGRES_CONSTRAINTS = new Set([
  "activities_active_ms_check",
  "activities_distance_meters_check",
  "activities_elapsed_ms_check",
  "activities_laps_array_check",
  "activities_laps_count_check",
  "activities_laps_size_check",
  "activities_moving_ms_check",
  "activities_moving_time_check",
  "activities_segments_revision_check",
  "activities_timing_coverage_values_check",
  "activity_efforts_bike_power_max_check",
  "activity_efforts_distance_meters_bounds_check",
  "activity_efforts_duration_seconds_bounds_check",
  "activity_efforts_heart_rate_bounds_check",
  "activity_efforts_run_speed_bounds_check",
  "activity_efforts_supported_combination_check",
  "activity_efforts_swim_speed_bounds_check",
  "activity_efforts_unit_compatibility_check",
  "activity_efforts_value_finite_positive_check",
  "activity_segments_offset_check",
  "activity_segments_role_category_check",
  "activity_segments_timing_check",
  "activity_segments_timing_coverage_values_check",
  "activity_source_references_artifact_unique",
  "activity_source_references_provider_unique",
  "performance_calibration_evidence_value_check",
  "performance_calibration_model_inputs_value_check",
]);
const SENSITIVE_KEY =
  /(?:authorization|cookie|password|passcode|secret|token|api[-_]?key|email|phone|username|user[-_]?id|session|credential|url|query|body|payload|coordinate|latitude|longitude|health|heart|error|message)/i;
const SENSITIVE_VALUE =
  /(?:bearer\s+|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|https?:\/\/|\+?\d[\d ().-]{7,}\d)/i;

export const TELEMETRY_LIMITS = Object.freeze({
  maxEntries: MAX_ENTRY_COUNT,
  maxStringLength: MAX_STRING_LENGTH,
});

function safeString(value) {
  if (
    typeof value !== "string" ||
    value.length > MAX_STRING_LENGTH ||
    SENSITIVE_VALUE.test(value)
  ) {
    return "[Redacted]";
  }
  return value;
}

function allowedEnum(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

function safeRelease(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(value)) return "[Redacted]";
  return safeString(value);
}

/**
 * Produces the only object shape allowed to leave an API logging or telemetry boundary.
 * It deliberately does not recurse through unknown values, making cyclic and deeply nested
 * input safe without retaining it.
 */
export function sanitizeTelemetryContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};

  const result = {};
  for (const [key, value] of Object.entries(context).slice(0, MAX_ENTRY_COUNT)) {
    // `error_code` is an approved finite operational dimension despite its name.
    // Raw `error`, `error_message`, and every other sensitive key remain denied below.
    if (key === "error_code") {
      result[key] = allowedEnum(value, ERROR_CODES);
      continue;
    }
    if (key === "application_code") {
      result[key] = allowedEnum(value, SAFE_APPLICATION_CODES);
      continue;
    }
    if (key === "error_class") {
      result[key] = allowedEnum(value, SAFE_ERROR_CLASSES);
      continue;
    }
    if (key === "postgres_code") {
      result[key] = typeof value === "string" && /^[0-9A-Z]{5}$/.test(value) ? value : "unknown";
      continue;
    }
    if (key === "postgres_constraint") {
      result[key] = allowedEnum(value, SAFE_POSTGRES_CONSTRAINTS);
      continue;
    }
    if (SENSITIVE_KEY.test(key)) continue;
    switch (key) {
      case "procedure_group":
        result[key] = allowedEnum(value, PROCEDURE_GROUPS);
        break;
      case "operation":
        result[key] = safeString(value);
        break;
      case "procedure_type":
        result[key] = allowedEnum(value, PROCEDURE_TYPES);
        break;
      case "outcome":
        result[key] = allowedEnum(value, OUTCOMES);
        break;
      case "duration_bucket":
        result[key] = allowedEnum(value, DURATION_BUCKETS);
        break;
      case "provider":
        result[key] = allowedEnum(value, PROVIDERS);
        break;
      case "activity_category":
        result[key] = allowedEnum(value, CATEGORIES);
        break;
      case "status":
        if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
          result[key] = value;
        }
        break;
      case "count":
        if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000) {
          result[key] = value;
        }
        break;
      case "environment":
        result[key] = allowedEnum(value, ENVIRONMENTS);
        break;
      case "release":
        result[key] = safeRelease(value);
        break;
      case "flags":
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const flags = {};
          for (const [flag, enabled] of Object.entries(value).slice(0, MAX_ENTRY_COUNT)) {
            if (FLAG_KEYS.has(flag) && typeof enabled === "boolean") flags[flag] = enabled;
          }
          if (Object.keys(flags).length > 0) result[key] = flags;
        }
        break;
    }
  }
  return result;
}
