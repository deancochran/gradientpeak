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
const OUTCOMES = new Set(["success", "expected_error", "unexpected_error", "cancelled"]);
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
    if (SENSITIVE_KEY.test(key)) continue;
    switch (key) {
      case "procedure_group":
        result[key] = allowedEnum(value, PROCEDURE_GROUPS);
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
      case "category":
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
