import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "./context";

const { captureApiProcedureMetric } = vi.hoisted(() => ({ captureApiProcedureMetric: vi.fn() }));

vi.mock("./telemetry", () => ({ captureApiProcedureMetric }));

import {
  bucketTelemetryDuration,
  createTRPCRouter,
  normalizeTelemetryOutcome,
  normalizeTelemetryProcedureGroup,
  normalizeTelemetryProcedureType,
  publicProcedure,
} from "./trpc";

describe("tRPC telemetry normalization", () => {
  beforeEach(() => {
    captureApiProcedureMetric.mockClear();
  });

  it("keeps procedure metrics finite and omits the leaf procedure name", () => {
    expect(normalizeTelemetryProcedureGroup("activities.privateLeafProcedure")).toBe("activities");
    expect(normalizeTelemetryProcedureGroup("unknown.privateLeafProcedure")).toBe("unknown");
    expect(normalizeTelemetryProcedureType("mutation")).toBe("mutation");
    expect(normalizeTelemetryProcedureType("batch")).toBe("unknown");
  });

  it("uses coarse duration buckets", () => {
    expect([0, 49, Number.NaN].map(bucketTelemetryDuration)).toEqual(["<50", "<50", "<50"]);
    expect([50, 199, 200, 999, 1_000, 4_999, 5_000].map(bucketTelemetryDuration)).toEqual([
      "<200",
      "<200",
      "<1000",
      "<1000",
      "<5000",
      "<5000",
      ">=5000",
    ]);
  });

  it("classifies cancellation and expected tRPC errors without retaining their messages", () => {
    expect(
      normalizeTelemetryOutcome({ code: "UNAUTHORIZED", message: "person@example.test" }),
    ).toBe("expected_error");
    expect(normalizeTelemetryOutcome({ code: "CLIENT_CLOSED_REQUEST" })).toBe("cancelled");
    expect(normalizeTelemetryOutcome(new Error("private database detail"))).toBe(
      "unexpected_error",
    );
  });

  it("records one coarse metric without changing a procedure result or error", async () => {
    const router = createTRPCRouter({
      activities: createTRPCRouter({
        complete: publicProcedure.query(() => ({ privateOutput: "never captured" })),
        fail: publicProcedure.query(() => {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "person@example.test" });
        }),
      }),
    });
    const caller = router.createCaller({
      headers: new Headers(),
      session: null,
      trpcSource: "vitest",
    } as Context);

    await expect(caller.activities.complete()).resolves.toEqual({
      privateOutput: "never captured",
    });
    await expect(caller.activities.fail()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(captureApiProcedureMetric).toHaveBeenNthCalledWith(1, {
      procedure_group: "activities",
      procedure_type: "query",
      outcome: "success",
      error_code: "UNKNOWN",
      duration_bucket: "<50",
    });
    expect(captureApiProcedureMetric).toHaveBeenNthCalledWith(2, {
      procedure_group: "activities",
      procedure_type: "query",
      outcome: "expected_error",
      error_code: "UNAUTHORIZED",
      duration_bucket: "<50",
    });
  });
});
