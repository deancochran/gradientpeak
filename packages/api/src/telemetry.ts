import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

let serverTelemetryInitialized = false;
let posthogClient: PostHog | null = null;

const EXPECTED_TRPC_CODES = new Set([
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
]);
const CANCELLATION_CODES = new Set(["ABORT_ERR", "ERR_CANCELED", "CLIENT_CLOSED_REQUEST"]);
const SENSITIVE_CONTEXT_KEY =
  /(?:authorization|cookie|password|passcode|secret|token|api[-_]?key|email|phone|username|user[-_]?id|session|credential)/i;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_ENTRIES = 25;
const MAX_CONTEXT_ARRAY_LENGTH = 20;
const MAX_CONTEXT_STRING_LENGTH = 500;

export function initServerTelemetry() {
  if (serverTelemetryInitialized) {
    return;
  }

  serverTelemetryInitialized = true;

  const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  const posthogKey = process.env.POSTHOG_KEY;
  if (posthogKey) {
    posthogClient = new PostHog(posthogKey, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      secretKey: process.env.POSTHOG_SECRET_KEY ?? process.env.POSTHOG_PERSONAL_API_KEY,
    });

    posthogClient.capture({
      distinctId: "gradientpeak-server",
      event: "server_telemetry_initialized",
      properties: {
        app_surface: "api",
        environment,
        source: "local-dev-or-runtime",
      },
    });
  }
}

export function sanitizeTelemetryContext(
  context?: Record<string, unknown>,
): Record<string, unknown> {
  if (!context) {
    return {};
  }

  const seen = new WeakSet<object>();
  const sanitize = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return value.slice(0, MAX_CONTEXT_STRING_LENGTH);
    }
    if (typeof value === "bigint" || typeof value === "symbol") {
      return String(value).slice(0, MAX_CONTEXT_STRING_LENGTH);
    }
    if (typeof value === "undefined" || typeof value === "function") {
      return undefined;
    }
    if (depth >= MAX_CONTEXT_DEPTH) {
      return "[Truncated]";
    }
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, MAX_CONTEXT_ARRAY_LENGTH).map((entry) => sanitize(entry, depth + 1));
    }

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_CONTEXT_ENTRIES)
        .map(([key, entry]) => [
          key,
          SENSITIVE_CONTEXT_KEY.test(key) ? "[Redacted]" : sanitize(entry, depth + 1),
        ]),
    );
  };

  return sanitize(context, 0) as Record<string, unknown>;
}

function readErrorField(error: object, field: string): unknown {
  return field in error ? (error as Record<string, unknown>)[field] : undefined;
}

export function isExpectedApiError(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < 5 && current && !seen.has(current); depth += 1) {
    seen.add(current);

    if (current instanceof Response && current.status >= 300 && current.status < 400) {
      return true;
    }
    if (typeof current !== "object") {
      return false;
    }

    const name = readErrorField(current, "name");
    const code = readErrorField(current, "code");
    const status = readErrorField(current, "status");
    const statusCode = readErrorField(current, "statusCode");
    const authoritativeStatus =
      typeof statusCode === "number" ? statusCode : typeof status === "number" ? status : null;

    if (authoritativeStatus !== null) {
      return authoritativeStatus >= 300 && authoritativeStatus < 500;
    }

    if (name === "TRPCError" && typeof code === "string") {
      return EXPECTED_TRPC_CODES.has(code);
    }
    if (name === "APIError") {
      return false;
    }
    if (name === "AbortError" || (typeof code === "string" && CANCELLATION_CODES.has(code))) {
      return true;
    }

    current = readErrorField(current, "cause");
  }

  return false;
}

export function captureApiError(error: unknown, context?: Record<string, unknown>): boolean {
  initServerTelemetry();

  if (isExpectedApiError(error)) {
    return false;
  }

  Sentry.captureException(error, { extra: sanitizeTelemetryContext(context) });
  return true;
}

export function captureApiEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId = "gradientpeak-server",
) {
  initServerTelemetry();

  posthogClient?.capture({
    distinctId,
    event,
    properties,
  });
}

export function getPostHogClient() {
  initServerTelemetry();
  return posthogClient;
}

export { Sentry };
