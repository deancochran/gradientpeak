import type { ErrorEvent } from "@sentry/react-native";
import { describe, expect, it } from "vitest";
import {
  createRuntimeSentryConfig,
  isExpectedMobileSentryError,
  prepareMobileSentryEvent,
  sanitizeMobileSentryContext,
} from "./sentry-config";
import {
  createMobileSentryOptions,
  readSampleRate,
  shouldEnableReplay,
  shouldEnableSentry,
} from "./sentry-options.js";

function errorEvent(overrides: Omit<ErrorEvent, "type">): ErrorEvent {
  return { type: undefined, ...overrides };
}

describe("mobile Sentry configuration", () => {
  it("uses privacy-safe disabled defaults", () => {
    expect(createMobileSentryOptions({}, "development")).toMatchObject({
      enableAutoPerformanceTracing: false,
      enableLogs: false,
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
      sampleRate: 1,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it("requires replay opt-in in every environment", () => {
    const ratesOnly = { EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: "1" };
    const optedIn = { ...ratesOnly, EXPO_PUBLIC_ENABLE_SENTRY_REPLAY: "1" };

    expect(shouldEnableReplay(ratesOnly)).toBe(false);
    expect(createMobileSentryOptions(ratesOnly, "production").replaysOnErrorSampleRate).toBe(0);
    expect(shouldEnableReplay(optedIn)).toBe(true);
    expect(createMobileSentryOptions(optedIn, "production").replaysOnErrorSampleRate).toBe(1);
  });

  it("keeps configured ordinary development enabled but suppresses Maestro fixtures", () => {
    const configuredDevelopment = {
      EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV: "1",
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.test/1",
    };

    expect(shouldEnableSentry(configuredDevelopment, true)).toBe(true);
    expect(
      shouldEnableSentry({ ...configuredDevelopment, EXPO_PUBLIC_MAESTRO_E2E: "1" }, true),
    ).toBe(false);
  });

  it("rejects invalid sample rates", () => {
    expect(readSampleRate("NaN", 0)).toBe(0);
    expect(readSampleRate("-1", 0)).toBe(0);
    expect(readSampleRate("0.5", 0)).toBe(0.5);
  });

  it("allows only shared finite operational context", () => {
    expect(
      sanitizeMobileSentryContext({
        email: "private@example.test",
        procedure: "activities.create",
        diagnostic_reason: "missing_column",
        note: "private note",
      }),
    ).toEqual({
      procedure: "activities.create",
      diagnostic_reason: "missing_column",
    });
  });

  it("denies arbitrary nested and circular context without mutating it", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      sanitizeMobileSentryContext({ deep: { one: { two: { three: { four: true } } } }, circular }),
    ).toEqual({});
    expect(circular.self).toBe(circular);
  });

  it("removes development users and request data", () => {
    expect(
      prepareMobileSentryEvent(
        errorEvent({ user: { id: "private" }, request: { url: "app://route?token=secret" } }),
        "development",
      ),
    ).toEqual({ type: undefined });
  });

  it("removes explicit production user identifiers and request data", () => {
    expect(
      prepareMobileSentryEvent(
        errorEvent({
          user: { id: "user-1", email: "athlete@example.test", username: "athlete" },
          request: { url: "app://private-route" },
        }),
        "production",
      ),
    ).toEqual({ type: undefined });
  });

  it("sanitizes event extras through the runtime beforeSend hook", () => {
    const options = createRuntimeSentryConfig({}, "development");

    expect(
      options.beforeSend(errorEvent({ extra: { accessToken: "secret", operation: "sync" } })),
    ).toEqual({
      type: undefined,
      extra: { operation: "sync" },
    });
  });

  it("replaces raw exception text with a shared recognized diagnostic summary", () => {
    const cause = Object.assign(new Error("SELECT private FROM profiles"), { code: "42703" });
    const prepared = prepareMobileSentryEvent(
      errorEvent({
        exception: { values: [{ type: "PostgresError", value: "private@example.test" }] },
      }),
      "development",
      { originalException: new Error("failed", { cause }) },
    );

    expect(prepared?.exception?.values?.[0]?.value).toBe("Database schema is missing a column.");
    expect(JSON.stringify(prepared)).not.toMatch(/private@example\.test|SELECT/);
  });

  it("retains only symbolication-safe mobile frames and strips raw event text", () => {
    const prepared = prepareMobileSentryEvent(
      errorEvent({
        message: "private@example.test",
        exception: {
          values: [
            {
              type: "PostgresError",
              value: "Bearer synthetic-secret",
              stacktrace: {
                frames: [
                  {
                    filename: "https://example.test/app.js?token=secret",
                    function: "saveActivity",
                    vars: { token: "secret" },
                    lineno: 7,
                  },
                ],
              },
            },
          ],
        },
      }),
      "development",
      { originalException: Object.assign(new Error("failed"), { code: "42703" }) },
    );

    expect(prepared?.exception?.values?.[0]).toEqual({
      type: "Error",
      value: "Database schema is missing a column.",
      stacktrace: { frames: [{ filename: "app.js", function: "saveActivity", lineno: 7 }] },
    });
    expect(JSON.stringify(prepared)).not.toMatch(/example\.test|secret|private@example\.test/);
  });

  it("denies arbitrary extras and breadcrumb text including PII, SQL, causes, and coordinates", () => {
    const prepared = prepareMobileSentryEvent(
      errorEvent({
        extra: {
          note: "private note",
          cause: "person@example.test",
          sql: "SELECT * FROM profiles WHERE id = $1",
          coordinates: { latitude: 1, longitude: 2 },
          procedure: "activities.create",
        },
        breadcrumbs: [
          {
            message: "person@example.test",
            category: "private",
            data: { note: "private", coordinates: [1, 2], outcome: "success" },
          },
        ],
      }),
      "development",
    );

    expect(prepared).toEqual({
      type: undefined,
      extra: { procedure: "activities.create" },
      breadcrumbs: [{ data: { outcome: "success" } }],
    });
  });

  it("suppresses only explicitly identifiable API request timeouts", () => {
    expect(
      isExpectedMobileSentryError(
        Object.assign(new Error("API request timed out after 30000ms"), {
          name: "ApiRequestTimeoutError",
          code: "API_REQUEST_TIMEOUT",
        }),
      ),
    ).toBe(true);
    expect(isExpectedMobileSentryError(new TypeError("Network request timed out"))).toBe(true);
    expect(isExpectedMobileSentryError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(
      isExpectedMobileSentryError(
        new Error("unexpected", { cause: new TypeError("Network request timed out") }),
      ),
    ).toBe(false);
    expect(isExpectedMobileSentryError(new Error("unexpected"))).toBe(false);

    const options = createRuntimeSentryConfig({}, "development");
    expect(
      options.beforeSend(errorEvent({}), {
        originalException: new TypeError("Network request timed out"),
      }),
    ).toBeNull();
  });
});
