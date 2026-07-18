const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_ENTRIES = 25;
const MAX_CONTEXT_ARRAY_LENGTH = 20;
const MAX_CONTEXT_STRING_LENGTH = 500;

const SENSITIVE_CONTEXT_KEY =
  /(?:authorization|cookie|password|passcode|secret|token|api[-_]?key|email|phone|username|user[-_]?id|session|credential)/i;

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

export function sanitizeSentryContext(value) {
  const seen = new WeakSet();

  function sanitize(current, depth) {
    if (current === null || typeof current === "boolean" || typeof current === "number") {
      return current;
    }
    if (typeof current === "string") {
      return current.slice(0, MAX_CONTEXT_STRING_LENGTH);
    }
    if (typeof current === "bigint" || typeof current === "symbol") {
      return String(current).slice(0, MAX_CONTEXT_STRING_LENGTH);
    }
    if (typeof current === "undefined" || typeof current === "function") {
      return undefined;
    }
    if (depth >= MAX_CONTEXT_DEPTH) {
      return "[Truncated]";
    }
    if (seen.has(current)) {
      return "[Circular]";
    }

    seen.add(current);
    if (Array.isArray(current)) {
      return current.slice(0, MAX_CONTEXT_ARRAY_LENGTH).map((entry) => sanitize(entry, depth + 1));
    }

    const sanitized = {};
    for (const [key, entry] of Object.entries(current).slice(0, MAX_CONTEXT_ENTRIES)) {
      sanitized[key] = SENSITIVE_CONTEXT_KEY.test(key) ? "[Redacted]" : sanitize(entry, depth + 1);
    }
    return sanitized;
  }

  return sanitize(value, 0);
}

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

export function prepareSentryEvent(event, hint) {
  if (isExpectedSentryError(hint?.originalException)) {
    return null;
  }

  delete event.user;
  delete event.request;
  if (event.extra) {
    event.extra = sanitizeSentryContext(event.extra);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data ? sanitizeSentryContext(breadcrumb.data) : breadcrumb.data,
    }));
  }
  return event;
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
    tracesSampleRate: readSentrySampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 0),
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
    tracesSampleRate: readSentrySampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0),
  };
}

export function shouldEnableBrowserReplay(env) {
  if (env.VITE_ENABLE_SENTRY_REPLAY !== "1") {
    return false;
  }
  const options = createBrowserSentryOptions(env);
  return options.replaysOnErrorSampleRate > 0 || options.replaysSessionSampleRate > 0;
}
