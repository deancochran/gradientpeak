import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const posthogCapture = vi.fn();

vi.mock("@sentry/node", () => ({ captureException }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = posthogCapture;
  },
}));

describe("API telemetry", () => {
  beforeEach(() => {
    vi.resetModules();
    captureException.mockClear();
    posthogCapture.mockClear();
    delete process.env.POSTHOG_KEY;
  });

  it("suppresses expected tRPC control-flow failures", async () => {
    const { captureApiError } = await import("./telemetry");

    expect(captureApiError(new TRPCError({ code: "UNAUTHORIZED" }))).toBe(false);
    expect(captureApiError(new TRPCError({ code: "CLIENT_CLOSED_REQUEST" }))).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("suppresses redirects, auth 4xx responses, and upstream cancellation", async () => {
    const { isExpectedApiError } = await import("./telemetry");
    const authError = Object.assign(new Error("invalid credentials"), {
      name: "APIError",
      statusCode: 401,
    });

    expect(isExpectedApiError(new Response(null, { status: 303 }))).toBe(true);
    expect(isExpectedApiError(authError)).toBe(true);
    expect(isExpectedApiError(new DOMException("cancelled", "AbortError"))).toBe(true);
  });

  it("retains unknown, database, and 5xx failures", async () => {
    const { captureApiError, isExpectedApiError } = await import("./telemetry");
    const databaseError = Object.assign(new Error("unique constraint"), { code: "23505" });
    const authServerError = Object.assign(new Error("auth database unavailable"), {
      name: "APIError",
      statusCode: 503,
    });

    expect(isExpectedApiError(new Error("unknown"))).toBe(false);
    expect(isExpectedApiError(databaseError)).toBe(false);
    expect(isExpectedApiError(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }))).toBe(false);
    expect(captureApiError(authServerError, { surface: "auth" })).toBe(true);
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("redacts and bounds explicit error context", async () => {
    const { sanitizeTelemetryContext } = await import("./telemetry");
    const circular: Record<string, unknown> = { token: "secret" };
    circular.self = circular;

    expect(
      sanitizeTelemetryContext({
        authorization: "Bearer secret",
        safe: "x".repeat(600),
        nested: { one: { two: { three: { four: "too deep" } } } },
        circular,
        list: Array.from({ length: 30 }, (_, index) => index),
      }),
    ).toEqual({
      authorization: "[Redacted]",
      safe: "x".repeat(500),
      nested: { one: { two: { three: "[Truncated]" } } },
      circular: { token: "[Redacted]", self: "[Circular]" },
      list: Array.from({ length: 20 }, (_, index) => index),
    });
  });

  it("does not mirror raw exceptions to PostHog", async () => {
    process.env.POSTHOG_KEY = "synthetic-test-key";
    const { captureApiError } = await import("./telemetry");

    captureApiError(new Error("private database detail"), { surface: "trpc" });

    expect(posthogCapture).toHaveBeenCalledOnce();
    expect(posthogCapture.mock.calls[0]?.[0]).toMatchObject({
      event: "server_telemetry_initialized",
    });
  });
});
