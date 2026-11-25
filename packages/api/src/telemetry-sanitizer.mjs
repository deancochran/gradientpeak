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
const SAFE_DIAGNOSTIC_CATEGORIES = new Set([
  "database",
  "validation",
  "transport",
  "runtime",
  "unknown",
]);
const SAFE_DIAGNOSTIC_REASONS = new Set([
  "missing_column",
  "missing_table",
  "unique_conflict",
  "foreign_key_conflict",
  "invalid_input",
  "database_failure",
  "validation_failure",
  "transport_failure",
  "unexpected",
]);
const SAFE_SUMMARIES = new Set([
  "Database schema is missing a column.",
  "Database schema is missing a table.",
  "A database uniqueness constraint was violated.",
  "A database relationship constraint was violated.",
  "The database rejected invalid input.",
  "The database operation failed.",
  "Data validation failed.",
  "The network request failed.",
  "An unexpected error occurred.",
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

function readField(value, field) {
  try {
    return value && typeof value === "object" ? value[field] : undefined;
  } catch {
    return undefined;
  }
}

function safeErrorClass(value) {
  return typeof value === "string" && SAFE_ERROR_CLASSES.has(value) ? value : "unknown";
}

function safeStack(error) {
  if (!(error instanceof Error) || typeof error.stack !== "string") return [];

  return error.stack
    .split("\n")
    .slice(1, 9)
    .flatMap((line) => {
      const match = line.match(/([A-Za-z0-9._-]+\.(?:[cm]?[jt]sx?|mjs)):(\d+)(?::(\d+))?/);
      if (!match || SENSITIVE_VALUE.test(match[1])) return [];
      return [match.slice(1).filter(Boolean).join(":")];
    })
    .slice(0, 5);
}

/**
 * Extracts a finite operational diagnosis without reading arbitrary error messages,
 * SQL text, parameters, request bodies, or other untrusted values.
 */
export function extractSafeErrorDiagnostic(error) {
  let current = error;
  const seen = new Set();
  let errorClass = "unknown";
  let postgresCode = "unknown";

  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object" && !seen.has(current);
    depth += 1
  ) {
    seen.add(current);
    if (errorClass === "unknown") errorClass = safeErrorClass(readField(current, "name"));

    const code = readField(current, "code");
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) postgresCode = code;
    current = readField(current, "cause");
  }

  const databaseReasons = {
    42703: ["missing_column", "Database schema is missing a column."],
    "42P01": ["missing_table", "Database schema is missing a table."],
    23505: ["unique_conflict", "A database uniqueness constraint was violated."],
    23503: ["foreign_key_conflict", "A database relationship constraint was violated."],
    "22P02": ["invalid_input", "The database rejected invalid input."],
  };
  const recognized = databaseReasons[postgresCode];
  const category =
    postgresCode !== "unknown" ? "database" : errorClass === "ZodError" ? "validation" : "unknown";
  const reason =
    recognized?.[0] ??
    (category === "database"
      ? "database_failure"
      : category === "validation"
        ? "validation_failure"
        : "unexpected");
  const summary =
    recognized?.[1] ??
    (category === "database"
      ? "The database operation failed."
      : category === "validation"
        ? "Data validation failed."
        : "An unexpected error occurred.");

  return {
    diagnostic_category: category,
    diagnostic_reason: reason,
    error_class: errorClass,
    postgres_code: postgresCode,
    safe_summary: summary,
    stack: safeStack(error),
  };
}

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
    if (key === "diagnostic_category") {
      result[key] = allowedEnum(value, SAFE_DIAGNOSTIC_CATEGORIES);
      continue;
    }
    if (key === "diagnostic_reason") {
      result[key] = allowedEnum(value, SAFE_DIAGNOSTIC_REASONS);
      continue;
    }
    if (key === "safe_summary") {
      result[key] =
        typeof value === "string" && SAFE_SUMMARIES.has(value)
          ? value
          : "An unexpected error occurred.";
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
      case "procedure":
        if (
          typeof value === "string" &&
          /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){1,4}$/.test(value)
        ) {
          result[key] = value;
        }
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
      case "dropped_count":
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
