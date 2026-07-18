import type { ErrorEvent } from "@sentry/react-native";
import { describe, expect, it } from "vitest";
import {
  createRuntimeSentryConfig,
  prepareMobileSentryEvent,
  sanitizeMobileSentryContext,
} from "./sentry-config";
import { createMobileSentryOptions, readSampleRate, shouldEnableReplay } from "./sentry-options.js";

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

  it("rejects invalid sample rates", () => {
    expect(readSampleRate("NaN", 0)).toBe(0);
    expect(readSampleRate("-1", 0)).toBe(0);
    expect(readSampleRate("0.5", 0)).toBe(0.5);
  });

  it("redacts sensitive explicit context and bounds collections", () => {
    expect(
      sanitizeMobileSentryContext({
        email: "private@example.test",
        safe: "x".repeat(600),
        list: Array.from({ length: 30 }, (_, index) => index),
      }),
    ).toEqual({
      email: "[Redacted]",
      safe: "x".repeat(500),
      list: Array.from({ length: 20 }, (_, index) => index),
    });
  });

  it("bounds recursion and circular references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      sanitizeMobileSentryContext({ deep: { one: { two: { three: { four: true } } } }, circular }),
    ).toEqual({
      deep: { one: { two: { three: "[Truncated]" } } },
      circular: { self: "[Circular]" },
    });
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
      extra: { accessToken: "[Redacted]", operation: "sync" },
    });
  });
});
