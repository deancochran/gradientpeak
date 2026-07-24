// packages/api/src/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import z, { ZodError } from "zod";
import type { Context } from "./context";
import { checkApiRateLimit } from "./lib/rate-limit";
import { captureApiProcedureMetric } from "./telemetry";

const TELEMETRY_PROCEDURE_GROUPS = new Set([
  "profiles",
  "athleteIntelligence",
  "onboarding",
  "profileMetrics",
  "activities",
  "activityEfforts",
  "activityPlans",
  "events",
  "goals",
  "activityFiles",
  "integrations",
  "messaging",
  "notifications",
  "trainingPlans",
  "routes",
  "social",
  "trends",
  "storage",
  "home",
  "feed",
  "profileSettings",
  "groups",
  "publicShare",
  "organizations",
]);
const EXPECTED_ERROR_CODES = new Set([
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
]);
const CANCELLATION_CODES = new Set(["ABORT_ERR", "ERR_CANCELED", "CLIENT_CLOSED_REQUEST"]);

export function normalizeTelemetryProcedureGroup(path: string | undefined) {
  const group = path?.split(".", 1)[0];
  return group && TELEMETRY_PROCEDURE_GROUPS.has(group) ? group : "unknown";
}

export function normalizeTelemetryProcedureType(type: string | undefined) {
  return type === "query" || type === "mutation" || type === "subscription" ? type : "unknown";
}

export function bucketTelemetryDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 50) return "<50";
  if (durationMs < 200) return "<200";
  if (durationMs < 1_000) return "<1000";
  if (durationMs < 5_000) return "<5000";
  return ">=5000";
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "UNKNOWN";
}

export function normalizeTelemetryOutcome(error: unknown) {
  const code = getErrorCode(error);
  if (CANCELLATION_CODES.has(code) || (error instanceof Error && error.name === "AbortError")) {
    return "cancelled";
  }
  return EXPECTED_ERROR_CODES.has(code) ? "expected_error" : "unexpected_error";
}

const t = initTRPC.context<Context>().create({
  sse: {
    maxDurationMs: 5_000,
    ping: { enabled: false },
  },
  transformer: superjson,
  isServer: true,
  allowOutsideOfServer: false,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
    },
  }),
});

export const createTRPCRouter = t.router;
const telemetryProcedure = t.procedure.use(async ({ path, type, next }) => {
  const startedAt = Date.now();
  try {
    const result = await next();
    const error = result.ok ? undefined : result.error;
    captureApiProcedureMetric({
      procedure_group: normalizeTelemetryProcedureGroup(path),
      procedure_type: normalizeTelemetryProcedureType(type),
      outcome: result.ok ? "success" : normalizeTelemetryOutcome(error),
      error_code: error ? getErrorCode(error) : "UNKNOWN",
      duration_bucket: bucketTelemetryDuration(Date.now() - startedAt),
    });
    return result;
  } catch (error) {
    captureApiProcedureMetric({
      procedure_group: normalizeTelemetryProcedureGroup(path),
      procedure_type: normalizeTelemetryProcedureType(type),
      outcome: normalizeTelemetryOutcome(error),
      error_code: getErrorCode(error),
      duration_bucket: bucketTelemetryDuration(Date.now() - startedAt),
    });
    throw error;
  }
});

export const publicProcedure = telemetryProcedure.use(async ({ ctx, next }) => {
  const rateLimit = checkApiRateLimit(ctx);

  if (!rateLimit.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Retry after ${rateLimit.retryAfterSeconds} seconds.`,
    });
  }

  return next();
});

export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
