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

export function prepareMobileSentryEvent(event: ErrorEvent, environment: string): ErrorEvent {
  delete event.request;
  if (environment === "development") {
    delete event.user;
  }
  if (event.extra) {
    event.extra = sanitizeMobileSentryContext(event.extra) as Record<string, unknown>;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data
        ? (sanitizeMobileSentryContext(breadcrumb.data) as Record<string, unknown>)
        : breadcrumb.data,
    }));
  }
  return event;
}

export function createRuntimeSentryConfig(env: MobileSentryEnvironment, environment: string) {
  return {
    ...createMobileSentryOptions(env, environment),
    beforeSend: (event: ErrorEvent) => prepareMobileSentryEvent(event, environment),
  };
}

export { shouldEnableReplay };
