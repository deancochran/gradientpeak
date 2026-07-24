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

  it("keeps tracing disabled even when trace-rate environment values are configured", () => {
    expect(createServerSentryOptions({ SENTRY_TRACES_SAMPLE_RATE: "1" }).tracesSampleRate).toBe(0);
    expect(
      createBrowserSentryOptions({ VITE_SENTRY_TRACES_SAMPLE_RATE: "1" }).tracesSampleRate,
    ).toBe(0);
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

  it("allows only bounded operational context", () => {
    expect(
      sanitizeSentryContext({
        procedure_group: "activities",
        outcome: "success",
        authToken: "secret",
        detail: "x".repeat(600),
        list: Array.from({ length: 30 }, (_, index) => index),
      }),
    ).toEqual({
      procedure_group: "activities",
      outcome: "success",
    });
  });

  it("denies nested and circular context without mutating it", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      sanitizeSentryContext({ deep: { one: { two: { three: { four: true } } } }, circular }),
    ).toEqual({});
    expect(circular.self).toBe(circular);
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

  it("retains an authoritative 5xx even when its cause is a redirect", () => {
    const error = Object.assign(
      new Error("server failed", { cause: new Response(null, { status: 303 }) }),
      { status: 500 },
    );

    expect(isExpectedSentryError(error)).toBe(false);
  });

  it("removes user, request, and unbounded event fields", () => {
    const event = {
      user: { id: "1" },
      request: { headers: { cookie: "secret" } },
      contexts: { device: { name: "private" } },
      tags: { email: "person@example.test" },
      message: "private message",
      logentry: { message: "private log entry" },
      fingerprint: ["private"],
    };

    expect(prepareSentryEvent(event)).toEqual({});
  });

  it("retains the finite API procedure metric identity while denying arbitrary messages", () => {
    expect(prepareSentryEvent({ message: "api.procedure", level: "info" })).toEqual({
      level: "info",
      message: "api.procedure",
    });
    expect(prepareSentryEvent({ message: "private procedure detail" })).toEqual({});
  });

  it("sanitizes extras and breadcrumb data through the shared boundary", () => {
    const event = {
      extra: { password: "secret", procedure_group: "activities", operation: "save" },
      breadcrumbs: [
        {
          message: "token=synthetic-secret",
          data: { authorization: "secret", outcome: "success", stage: "submit" },
        },
      ],
    };

    expect(prepareSentryEvent(event)).toEqual({
      extra: { procedure_group: "activities" },
      breadcrumbs: [{ data: { outcome: "success" } }],
    });
  });

  it("retains only symbolication-safe exception frames", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const event = {
      request: { url: "https://example.test/private?token=synthetic" },
      extra: { email: "person@example.test", nested: circular },
      exception: {
        values: [
          {
            type: "DatabaseError",
            value: "raw token synthetic-secret and person@example.test",
            mechanism: { data: { password: "secret" } },
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/assets/app.js?token=synthetic",
                  function: "saveActivity",
                  lineno: 42,
                  colno: 7,
                  vars: { email: "person@example.test" },
                  context_line: "token=synthetic",
                  pre_context: ["private"],
                  post_context: ["private"],
                },
              ],
            },
          },
        ],
      },
    };

    const prepared = prepareSentryEvent(event);
    const serialized = JSON.stringify(prepared);

    expect(prepared).toEqual({
      extra: {},
      exception: {
        values: [
          {
            type: "DatabaseError",
            value: "An unexpected error occurred.",
            stacktrace: {
              frames: [{ filename: "app.js", function: "saveActivity", lineno: 42, colno: 7 }],
            },
          },
        ],
      },
    });
    expect(serialized).not.toMatch(/example\.test|person@example\.test|synthetic-secret|token=/);
  });

  it("rebuilds events from a top-level allowlist and normalizes breadcrumb categories", () => {
    const event = {
      event_id: "0123456789abcdef0123456789abcdef",
      timestamp: 1_700_000_000,
      platform: "node",
      level: "error",
      release: "web-2026.07.24",
      environment: "production",
      dist: "server",
      transaction: "/private/550e8400-e29b-41d4-a716-446655440000",
      culprit: "person@example.test",
      modules: { private: "token=synthetic-secret" },
      server_name: "private-host",
      arbitrary_canary: "Bearer synthetic-secret",
      breadcrumbs: [
        {
          type: "navigation",
          level: "info",
          timestamp: 1_700_000_001,
          category: "private.category",
          message: "person@example.test",
          data: { outcome: "success", token: "synthetic-secret" },
          unknown: "https://example.test/private",
        },
      ],
    };

    expect(prepareSentryEvent(event)).toEqual({
      event_id: "0123456789abcdef0123456789abcdef",
      timestamp: 1_700_000_000,
      platform: "node",
      level: "error",
      release: "web-2026.07.24",
      environment: "production",
      dist: "server",
      breadcrumbs: [
        {
          type: "navigation",
          level: "info",
          timestamp: 1_700_000_001,
          data: { outcome: "success" },
        },
      ],
    });
  });

  it("drops frame strings containing URL, UUID, email, token, phone, or session canaries", () => {
    const prepared = prepareSentryEvent({
      exception: {
        values: [
          {
            type: "Error",
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/token=synthetic",
                  abs_path: "/private/550e8400-e29b-41d4-a716-446655440000.js",
                  function: "person@example.test",
                  module: "access_token=synthetic",
                  instruction_addr: "ignored",
                  lineno: 4,
                  colno: 2,
                  in_app: true,
                  vars: { token: "synthetic" },
                },
              ],
            },
          },
        ],
      },
    });

    expect(prepared).toEqual({
      exception: {
        values: [
          {
            type: "Error",
            value: "An unexpected error occurred.",
            stacktrace: { frames: [{ lineno: 4, colno: 2, in_app: true }] },
          },
        ],
      },
    });
  });

  it("keeps only valid JavaScript source-map debug metadata", () => {
    const prepared = prepareSentryEvent({
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "550e8400-e29b-41d4-a716-446655440000",
            code_file: "https://example.test/assets/app.js?token=synthetic",
            private: "person@example.test",
          },
          { type: "elf", debug_id: "550e8400-e29b-41d4-a716-446655440000", code_file: "server" },
          { type: "sourcemap", debug_id: "not-a-debug-id", code_file: "app.js" },
          {
            type: "sourcemap",
            debug_id: "550e8400-e29b-41d4-a716-446655440000",
            code_file: "cookie=secret",
          },
        ],
        arbitrary: "Bearer synthetic-secret",
      },
      release: "session=private",
      dist: "+1 (555) 123-4567",
      exception: {
        values: [
          {
            type: "session=private",
            stacktrace: {
              frames: [
                {
                  function: "+1 (555) 123-4567",
                  module: "cookie=private",
                  filename: "app.js",
                  abs_path: "/private/session=private",
                },
              ],
            },
          },
        ],
      },
    });

    expect(prepared).toEqual({
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "550e8400-e29b-41d4-a716-446655440000",
            code_file: "app.js",
          },
        ],
      },
      exception: {
        values: [
          {
            value: "An unexpected error occurred.",
            stacktrace: { frames: [{ filename: "app.js" }] },
          },
        ],
      },
    });
  });
});
