import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/node", () => ({ captureException }));

describe("API telemetry", () => {
  beforeEach(() => {
    vi.resetModules();
    captureException.mockClear();
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

  it("captures a recognized diagnostic with procedure context but never raw cause text", async () => {
    const { captureApiError } = await import("./telemetry");
    const databaseCause = Object.assign(
      new Error("SELECT private_email FROM profiles WHERE id = $1"),
      {
        code: "42703",
        params: ["550e8400-e29b-41d4-a716-446655440000"],
      },
    );

    expect(
      captureApiError(new Error("failed", { cause: databaseCause }), {
        procedure: "profiles.get",
        procedure_type: "query",
        status: 207,
        body: { health: 170 },
      }),
    ).toBe(true);

    const [, options] = captureException.mock.calls.at(-1) as [unknown, { extra: unknown }];
    expect(options.extra).toEqual({
      procedure: "profiles.get",
      procedure_type: "query",
      status: 207,
      diagnostic_category: "database",
      diagnostic_reason: "missing_column",
      error_class: "Error",
      postgres_code: "42703",
      safe_summary: "Database schema is missing a column.",
    });
    expect(JSON.stringify(options.extra)).not.toMatch(/SELECT|private_email|\$1|550e8400|health/);
  });

  it("retains authoritative 5xx wrappers with expected-looking causes", async () => {
    const { isExpectedApiError } = await import("./telemetry");
    const cancellation = new DOMException("cancelled", "AbortError");

    expect(
      isExpectedApiError(new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: cancellation })),
    ).toBe(false);
    expect(
      isExpectedApiError(
        Object.assign(new Error("auth unavailable", { cause: cancellation }), {
          name: "APIError",
          statusCode: 503,
        }),
      ),
    ).toBe(false);
    expect(
      isExpectedApiError(
        Object.assign(new Error("server failed", { cause: cancellation }), {
          status: 503,
        }),
      ),
    ).toBe(false);
  });

  it("allows only bounded operational context and does not mutate cyclic input", async () => {
    const { sanitizeTelemetryContext } = await import("./telemetry");
    const circular: Record<string, unknown> = {
      token: "secret",
      nested: { email: "person@example.test" },
    };
    circular.self = circular;
    const context = {
      procedure_group: "activities",
      procedure_type: "query",
      outcome: "success",
      duration_bucket: "<50",
      count: 3,
      flags: { cached: true, secret: true },
      authorization: "Bearer synthetic-secret",
      error: "private database detail",
      url: "https://example.test/private?token=synthetic",
      nested: { one: { two: { three: { four: circular } } } },
      circular,
      extraEntries: Array.from({ length: 30 }, (_, index) => index),
    };

    expect(sanitizeTelemetryContext(context)).toEqual({
      procedure_group: "activities",
      procedure_type: "query",
      outcome: "success",
      duration_bucket: "<50",
      count: 3,
      flags: { cached: true },
    });
    expect(circular.self).toBe(circular);
  });

  it("redacts secret and PII canaries even in approved string fields", async () => {
    const { sanitizeTelemetryContext } = await import("./telemetry");

    expect(
      sanitizeTelemetryContext({
        release: "550e8400-e29b-41d4-a716-446655440000",
        environment: "production",
        provider: "https://example.test/?access_token=secret",
      }),
    ).toEqual({
      release: "[Redacted]",
      environment: "production",
      provider: "unknown",
    });
  });

  it("does not create a Sentry event for a routine procedure outcome", async () => {
    const { captureApiProcedureMetric } = await import("./telemetry");

    expect(() =>
      captureApiProcedureMetric({
        procedure_group: "activities",
        procedure_type: "query",
        outcome: "success",
        error_code: "INTERNAL_SERVER_ERROR",
        message: "person@example.test",
      }),
    ).not.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not create a Sentry event for routine error metrics", async () => {
    const { captureApiProcedureMetric } = await import("./telemetry");

    captureApiProcedureMetric({
      error_code: "private-token-550e8400-e29b-41d4-a716-446655440000",
      error: "person@example.test",
      error_message: "Bearer synthetic-secret",
    });

    expect(captureException).not.toHaveBeenCalled();
  });
});
