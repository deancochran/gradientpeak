import { sanitizeTelemetryContext } from "@repo/api/telemetry-sanitizer";

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  queryParams: false,
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
  frameContextLines: 0,
};

export function readSentrySampleRate(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export { sanitizeTelemetryContext as sanitizeSentryContext } from "@repo/api/telemetry-sanitizer";

function getErrorStatus(value) {
  if (value instanceof Response) {
    return value.status;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const key of ["status", "statusCode"]) {
    const status = value[key];
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}

export function isExpectedSentryError(error) {
  let current = error;
  const seen = new Set();

  for (let depth = 0; depth < 5 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    const status = getErrorStatus(current);
    if (status !== undefined) {
      return status >= 300 && status < 400;
    }
    if (typeof current === "object") {
      current = current.cause;
    } else {
      break;
    }
  }
  return false;
}

/** @returns {any} The Sentry SDK validates the reconstructed event shape. */
export function prepareSentryEvent(event, hint) {
  if (isExpectedSentryError(hint?.originalException)) {
    return null;
  }

  const debugImages = sanitizeDebugImages(event.debug_meta?.images);
  const prepared = {
    ...(safeEventId(event.event_id) ? { event_id: safeEventId(event.event_id) } : {}),
    ...(safeTimestamp(event.timestamp) ? { timestamp: event.timestamp } : {}),
    ...(safeEnum(event.platform, PLATFORM_VALUES) ? { platform: event.platform } : {}),
    ...(safeEnum(event.level, LEVEL_VALUES) ? { level: event.level } : {}),
    ...(safeOperationalString(event.release) ? { release: event.release } : {}),
    ...(safeEnum(event.environment, ENVIRONMENT_VALUES) ? { environment: event.environment } : {}),
    ...(safeOperationalString(event.dist) ? { dist: event.dist } : {}),
    ...(safeEnum(event.message, EVENT_MESSAGE_VALUES) ? { message: event.message } : {}),
    ...(debugImages.length > 0 ? { debug_meta: { images: debugImages } } : {}),
    ...(event.exception?.values ? { exception: sanitizeException(event.exception) } : {}),
    ...(event.extra ? { extra: sanitizeTelemetryContext(event.extra) } : {}),
    ...(Array.isArray(event.breadcrumbs)
      ? { breadcrumbs: event.breadcrumbs.map(sanitizeBreadcrumb) }
      : {}),
  };
  return prepared;
}

const PLATFORM_VALUES = new Set(["javascript", "node", "browser", "other"]);
const LEVEL_VALUES = new Set(["debug", "info", "warning", "error", "fatal"]);
const ENVIRONMENT_VALUES = new Set(["development", "test", "staging", "production"]);
const EVENT_MESSAGE_VALUES = new Set(["api.procedure"]);
const BREADCRUMB_TYPES = new Set([
  "default",
  "http",
  "navigation",
  "error",
  "query",
  "ui",
  "user",
  "system",
]);
const BREADCRUMB_LEVELS = new Set(["debug", "info", "warning", "error", "fatal"]);
const BREADCRUMB_CATEGORIES = new Set([
  "navigation",
  "console",
  "fetch",
  "xhr",
  "ui.click",
  "sentry.event",
]);
const SENSITIVE_FRAME_VALUE =
  /(?:bearer\s+|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|token)\b|\b(?:cookie|session(?:_?id)?)\s*=|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\+\d[\d ().-]{7,}\d|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|https?:\/\/)/i;
const DEBUG_IMAGE_TYPE = "sourcemap";
const DEBUG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeException(exception) {
  return {
    values: exception.values.map(({ type, stacktrace }) => ({
      ...(safeFrameString(type) ? { type } : {}),
      value: "An unexpected error occurred.",
      ...(stacktrace
        ? {
            stacktrace: {
              frames: Array.isArray(stacktrace.frames)
                ? stacktrace.frames.map(sanitizeStackFrame)
                : [],
            },
          }
        : {}),
    })),
  };
}

function sanitizeStackFrame(frame) {
  const filename = sanitizeFramePath(frame.filename);
  const absPath = sanitizeFramePath(frame.abs_path);
  return {
    ...(filename ? { filename } : {}),
    ...(absPath ? { abs_path: absPath } : {}),
    ...(safeFrameString(frame.function) ? { function: frame.function } : {}),
    ...(safeFrameString(frame.module) ? { module: frame.module } : {}),
    ...(Number.isInteger(frame.lineno) ? { lineno: frame.lineno } : {}),
    ...(Number.isInteger(frame.colno) ? { colno: frame.colno } : {}),
    ...(typeof frame.in_app === "boolean" ? { in_app: frame.in_app } : {}),
  };
}

function sanitizeBreadcrumb(breadcrumb) {
  return {
    ...(safeEnum(breadcrumb.type, BREADCRUMB_TYPES) ? { type: breadcrumb.type } : {}),
    ...(safeEnum(breadcrumb.level, BREADCRUMB_LEVELS) ? { level: breadcrumb.level } : {}),
    ...(safeTimestamp(breadcrumb.timestamp) ? { timestamp: breadcrumb.timestamp } : {}),
    ...(safeEnum(breadcrumb.category, BREADCRUMB_CATEGORIES)
      ? { category: breadcrumb.category }
      : {}),
    data: sanitizeTelemetryContext(breadcrumb.data),
  };
}

function sanitizeDebugImages(images) {
  if (!Array.isArray(images)) return [];
  return images.flatMap((image) => {
    const codeFile = sanitizeFramePath(image?.code_file);
    return image?.type === DEBUG_IMAGE_TYPE &&
      typeof image.debug_id === "string" &&
      DEBUG_ID.test(image.debug_id) &&
      codeFile
      ? [{ type: DEBUG_IMAGE_TYPE, debug_id: image.debug_id, code_file: codeFile }]
      : [];
  });
}

function safeEventId(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/i.test(value) ? value : undefined;
}

function safeTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeEnum(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function safeOperationalString(value) {
  return safeFrameString(value);
}

function sanitizeFramePath(value) {
  if (typeof value !== "string") return undefined;
  const basename = value.split(/[?#]/, 1)[0]?.split(/[\\/]/).filter(Boolean).at(-1);
  return safeFrameString(basename);
}

function safeFrameString(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !SENSITIVE_FRAME_VALUE.test(value)
    ? value
    : undefined;
}

export function createServerSentryOptions(env) {
  return {
    beforeSend: prepareSentryEvent,
    dataCollection: SENTRY_DATA_COLLECTION,
    dsn: env.SENTRY_DSN,
    enableLogs: false,
    environment: env.APP_ENV ?? env.NODE_ENV ?? "development",
    includeLocalVariables: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

export function createBrowserSentryOptions(env) {
  const replayEnabled = env.VITE_ENABLE_SENTRY_REPLAY === "1";
  return {
    beforeSend: prepareSentryEvent,
    dataCollection: SENTRY_DATA_COLLECTION,
    dsn: env.VITE_SENTRY_DSN,
    enableLogs: false,
    environment: env.VITE_APP_ENV ?? env.MODE ?? "development",
    replaysOnErrorSampleRate: replayEnabled
      ? readSentrySampleRate(env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0)
      : 0,
    replaysSessionSampleRate: replayEnabled
      ? readSentrySampleRate(env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0)
      : 0,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

export function shouldEnableBrowserReplay(env) {
  if (env.VITE_ENABLE_SENTRY_REPLAY !== "1") {
    return false;
  }
  const options = createBrowserSentryOptions(env);
  return options.replaysOnErrorSampleRate > 0 || options.replaysSessionSampleRate > 0;
}
