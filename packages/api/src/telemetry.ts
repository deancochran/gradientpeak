import * as Sentry from "@sentry/node";
import { sanitizeTelemetryContext } from "./telemetry-sanitizer.mjs";

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

export { sanitizeTelemetryContext } from "./telemetry-sanitizer.mjs";

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
  if (isExpectedApiError(error)) {
    return false;
  }

  Sentry.captureException(error, { extra: sanitizeTelemetryContext(context) });
  return true;
}

export function captureApiProcedureMetric(context: Record<string, unknown>) {
  try {
    Sentry.captureMessage("api.procedure", {
      level: "info",
      extra: sanitizeTelemetryContext(context),
    });
  } catch {
    // Observability transport must not affect a procedure result or error.
  }
}
