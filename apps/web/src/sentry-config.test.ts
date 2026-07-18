import { describe, expect, it } from "vitest";
import {
  createBrowserSentryOptions,
  createServerSentryOptions,
  isExpectedSentryError,
  prepareSentryEvent,
  readSentrySampleRate,
  sanitizeSentryContext,
  shouldEnableBrowserReplay,
} from "../sentry-config.mjs";

describe("web Sentry configuration", () => {
  it("uses explicit privacy-safe server defaults", () => {
    const options = createServerSentryOptions({ SENTRY_DSN: "https://public@example.test/1" });

    expect(options).toMatchObject({
      enableLogs: false,
      includeLocalVariables: false,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        queryParams: false,
        genAI: { inputs: false, outputs: false },
        stackFrameVariables: false,
        frameContextLines: 0,
      },
    });
  });

  it("uses privacy-safe browser defaults", () => {
    expect(createBrowserSentryOptions({})).toMatchObject({
      enableLogs: false,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
    });
  });

  it("requires a separate replay opt-in and a nonzero valid rate", () => {
    const ratesOnly = { VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: "1" };
    const optedIn = { ...ratesOnly, VITE_ENABLE_SENTRY_REPLAY: "1" };

    expect(shouldEnableBrowserReplay(ratesOnly)).toBe(false);
    expect(createBrowserSentryOptions(ratesOnly).replaysOnErrorSampleRate).toBe(0);
    expect(shouldEnableBrowserReplay(optedIn)).toBe(true);
    expect(createBrowserSentryOptions(optedIn).replaysOnErrorSampleRate).toBe(1);
  });

  it("rejects invalid or out-of-range sample rates", () => {
    expect(readSentrySampleRate("invalid", 0)).toBe(0);
    expect(readSentrySampleRate("2", 0)).toBe(0);
    expect(readSentrySampleRate("0.25", 0)).toBe(0.25);
  });

  it("redacts sensitive context keys and bounds strings and arrays", () => {
    expect(
      sanitizeSentryContext({
        authToken: "secret",
        detail: "x".repeat(600),
        list: Array.from({ length: 30 }, (_, index) => index),
      }),
    ).toEqual({
      authToken: "[Redacted]",
      detail: "x".repeat(500),
      list: Array.from({ length: 20 }, (_, index) => index),
    });
  });

  it("bounds recursion and handles circular context", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      sanitizeSentryContext({ deep: { one: { two: { three: { four: true } } } }, circular }),
    ).toEqual({
      deep: { one: { two: { three: "[Truncated]" } } },
      circular: { self: "[Circular]" },
    });
  });

  it("suppresses redirect responses by status", () => {
    expect(isExpectedSentryError(new Response(null, { status: 302 }))).toBe(true);
    expect(
      prepareSentryEvent({}, { originalException: new Response(null, { status: 303 }) }),
    ).toBeNull();
  });

  it("retains 4xx, 5xx, and unknown exceptions", () => {
    expect(isExpectedSentryError(new Response(null, { status: 401 }))).toBe(false);
    expect(isExpectedSentryError(new Response(null, { status: 503 }))).toBe(false);
    expect(isExpectedSentryError(new Error("unknown"))).toBe(false);
  });

  it("removes user and request data from events", () => {
    const event = { user: { id: "1" }, request: { headers: { cookie: "secret" } } };

    expect(prepareSentryEvent(event)).toEqual({});
  });

  it("sanitizes explicit extras and breadcrumb data", () => {
    const event = {
      extra: { password: "secret", operation: "save" },
      breadcrumbs: [{ data: { authorization: "secret", stage: "submit" } }],
    };

    expect(prepareSentryEvent(event)).toEqual({
      extra: { password: "[Redacted]", operation: "save" },
      breadcrumbs: [{ data: { authorization: "[Redacted]", stage: "submit" } }],
    });
  });
});
