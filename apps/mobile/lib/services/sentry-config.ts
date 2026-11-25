import {
  extractSafeErrorDiagnostic,
  sanitizeTelemetryContext,
} from "@repo/api/telemetry-sanitizer";
import type { ErrorEvent } from "@sentry/react-native";
import {
  createMobileSentryOptions,
  type MobileSentryEnvironment,
  shouldEnableReplay,
} from "./sentry-options.js";

const SENSITIVE_FRAME_VALUE =
  /(?:bearer\s+|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|token)\b|\b(?:cookie|session(?:_?id)?)\s*=|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|https?:\/\/)/i;

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

export const sanitizeMobileSentryContext = sanitizeTelemetryContext;

function safeFrameString(value: unknown) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !SENSITIVE_FRAME_VALUE.test(value)
    ? value
    : undefined;
}

function sanitizeFramePath(value: unknown) {
  if (typeof value !== "string") return undefined;
  const basename = value.split(/[?#]/, 1)[0]?.split(/[\\/]/).filter(Boolean).at(-1);
  return safeFrameString(basename);
}

function sanitizeBreadcrumb(breadcrumb: NonNullable<ErrorEvent["breadcrumbs"]>[number]) {
  const data = sanitizeTelemetryContext(breadcrumb.data);
  return {
    ...(breadcrumb.type === "navigation" ||
    breadcrumb.type === "error" ||
    breadcrumb.type === "default"
      ? { type: breadcrumb.type }
      : {}),
    ...(breadcrumb.level === "debug" ||
    breadcrumb.level === "info" ||
    breadcrumb.level === "warning" ||
    breadcrumb.level === "error"
      ? { level: breadcrumb.level }
      : {}),
    ...(typeof breadcrumb.timestamp === "number" && Number.isFinite(breadcrumb.timestamp)
      ? { timestamp: breadcrumb.timestamp }
      : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };
}

export function prepareMobileSentryEvent(
  event: ErrorEvent,
  _environment: string,
  hint?: MobileSentryHint,
): ErrorEvent | null {
  if (isExpectedMobileSentryError(hint?.originalException)) return null;
  const diagnostic = extractSafeErrorDiagnostic(hint?.originalException);
  const extra = sanitizeTelemetryContext(event.extra);

  return {
    type: event.type,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
    ...(event.breadcrumbs ? { breadcrumbs: event.breadcrumbs.map(sanitizeBreadcrumb) } : {}),
    ...(event.exception?.values
      ? {
          exception: {
            values: event.exception.values.map((exception) => ({
              type: diagnostic.error_class === "unknown" ? "Error" : diagnostic.error_class,
              value: diagnostic.safe_summary,
              ...(exception.stacktrace
                ? {
                    stacktrace: {
                      ...(exception.stacktrace.frames
                        ? {
                            frames: exception.stacktrace.frames.map((frame) => {
                              const filename = sanitizeFramePath(frame.filename);
                              const absPath = sanitizeFramePath(frame.abs_path);
                              const functionName = safeFrameString(frame.function);
                              const moduleName = safeFrameString(frame.module);
                              return {
                                ...(filename ? { filename } : {}),
                                ...(absPath ? { abs_path: absPath } : {}),
                                ...(functionName ? { function: functionName } : {}),
                                ...(moduleName ? { module: moduleName } : {}),
                                ...(typeof frame.lineno === "number" &&
                                Number.isInteger(frame.lineno)
                                  ? { lineno: frame.lineno }
                                  : {}),
                                ...(typeof frame.colno === "number" && Number.isInteger(frame.colno)
                                  ? { colno: frame.colno }
                                  : {}),
                                ...(typeof frame.in_app === "boolean"
                                  ? { in_app: frame.in_app }
                                  : {}),
                              };
                            }),
                          }
                        : {}),
                    },
                  }
                : {}),
            })),
          },
        }
      : {}),
  };
}

export function createRuntimeSentryConfig(env: MobileSentryEnvironment, environment: string) {
  return {
    ...createMobileSentryOptions(env, environment),
    beforeSend: (event: ErrorEvent, hint?: MobileSentryHint) =>
      prepareMobileSentryEvent(event, environment, hint),
  };
}

export { shouldEnableReplay };
