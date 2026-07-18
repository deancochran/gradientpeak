import type { ErrorEvent } from "@sentry/react-native";
import {
  createMobileSentryOptions,
  type MobileSentryEnvironment,
  shouldEnableReplay,
} from "./sentry-options.js";

const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_ENTRIES = 25;
const MAX_CONTEXT_ARRAY_LENGTH = 20;
const MAX_CONTEXT_STRING_LENGTH = 500;
const SENSITIVE_CONTEXT_KEY =
  /(?:authorization|cookie|password|passcode|secret|token|api[-_]?key|email|phone|username|user[-_]?id|session|credential)/i;

type MobileSentryHint = { originalException?: unknown };

function readErrorField(error: object, field: string): unknown {
  return field in error ? (error as Record<string, unknown>)[field] : undefined;
}

export function isExpectedMobileSentryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const name = readErrorField(error, "name");
  const code = readErrorField(error, "code");
  const message = readErrorField(error, "message");
  return (
    name === "ApiRequestTimeoutError" ||
    code === "API_REQUEST_TIMEOUT" ||
    (name === "TypeError" && message === "Network request timed out")
  );
}

export function sanitizeMobileSentryContext(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const sanitize = (current: unknown, depth: number): unknown => {
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

    return Object.fromEntries(
      Object.entries(current)
        .slice(0, MAX_CONTEXT_ENTRIES)
        .map(([key, entry]) => [
          key,
          SENSITIVE_CONTEXT_KEY.test(key) ? "[Redacted]" : sanitize(entry, depth + 1),
        ]),
    );
  };

  return sanitize(value, 0);
}

export function prepareMobileSentryEvent(
  event: ErrorEvent,
  _environment: string,
  hint?: MobileSentryHint,
): ErrorEvent | null {
  if (isExpectedMobileSentryError(hint?.originalException)) return null;

  delete event.request;
  delete event.user;
  if (event.extra) {
    const sanitizedExtra = sanitizeMobileSentryContext(event.extra);
    event.extra =
      sanitizedExtra && typeof sanitizedExtra === "object" && !Array.isArray(sanitizedExtra)
        ? Object.fromEntries(Object.entries(sanitizedExtra))
        : {};
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      if (!breadcrumb.data) return breadcrumb;
      const sanitizedData = sanitizeMobileSentryContext(breadcrumb.data);
      return {
        ...breadcrumb,
        ...(sanitizedData && typeof sanitizedData === "object" && !Array.isArray(sanitizedData)
          ? { data: Object.fromEntries(Object.entries(sanitizedData)) }
          : {}),
      };
    });
  }
  return event;
}

export function createRuntimeSentryConfig(env: MobileSentryEnvironment, environment: string) {
  return {
    ...createMobileSentryOptions(env, environment),
    beforeSend: (event: ErrorEvent, hint?: MobileSentryHint) =>
      prepareMobileSentryEvent(event, environment, hint),
  };
}

export { shouldEnableReplay };
