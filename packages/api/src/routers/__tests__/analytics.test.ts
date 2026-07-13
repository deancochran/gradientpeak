import type { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouterCaller } from "../../test/router";
import { analyticsRouter } from "../analytics";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

type EffortRowOverrides = Partial<{
  id: string;
  profile_id: string;
  activity_id: string | null;
  recorded_at: Date;
  activity_category: "bike" | "run" | "swim";
  effort_type: "power" | "speed";
  duration_seconds: number;
  unit: string;
  value: number;
  source: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
  method: string | null;
  calculation_version: string | null;
  quality_score: null;
  provenance: Record<string, unknown> | null;
}>;

function createEffortRow(overrides: EffortRowOverrides = {}) {
  const activityId =
    overrides.activity_id === undefined ? crypto.randomUUID() : overrides.activity_id;
  return {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: null,
    profile_id: overrides.profile_id ?? OWNER_ID,
    activity_id: activityId,
    recorded_at: overrides.recorded_at ?? new Date("2026-03-10T00:00:00.000Z"),
    activity_category: overrides.activity_category ?? "bike",
    effort_type: overrides.effort_type ?? "power",
    duration_seconds: overrides.duration_seconds ?? 300,
    start_offset: null,
    unit: overrides.unit ?? "watts",
    value: overrides.value ?? 250,
    source: overrides.source === undefined ? "imported" : overrides.source,
    method: overrides.method === undefined ? "activity_file_best_effort" : overrides.method,
    calculation_version:
      overrides.calculation_version === undefined
        ? "activity-file-best-effort-v1"
        : overrides.calculation_version,
    quality_score: overrides.quality_score ?? null,
    provenance:
      overrides.provenance === undefined
        ? { activity_id: activityId, derived_from: "activity_file_stream" }
        : overrides.provenance,
  };
}

function collectSqlMetadata(
  node: unknown,
  state = { columns: [] as string[], params: [] as unknown[] },
) {
  if (!node || typeof node !== "object") return state;

  const value = node as {
    name?: unknown;
    value?: unknown;
    queryChunks?: unknown[];
    constructor?: { name?: string };
  };

  if (typeof value.name === "string") {
    state.columns.push(value.name);
  }

  if (value.constructor?.name === "Param") {
    state.params.push(value.value);
  }

  if (Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) {
      collectSqlMetadata(chunk, state);
    }
  }

  if (Array.isArray(value.value)) {
    for (const chunk of value.value) {
      collectSqlMetadata(chunk, state);
    }
  }

  return state;
}

function createCaller(rows: ReturnType<typeof createEffortRow>[], userId = OWNER_ID) {
  let whereArg: unknown;

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          whereArg = condition;
          return Promise.resolve(rows);
        }),
      })),
    })),
  };

  const caller = createRouterCaller(analyticsRouter, { db, userId });

  return { caller, getWhereArg: () => whereArg };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("analyticsRouter", () => {
  it("builds a user-scoped season-best query and returns the best effort per duration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const { caller, getWhereArg } = createCaller([
      createEffortRow({ duration_seconds: 60, value: 320 }),
      createEffortRow({ duration_seconds: 60, value: 340 }),
      createEffortRow({ duration_seconds: 300, value: 255 }),
    ]);

    const result = await caller.getSeasonBestCurve({
      activity_category: "bike",
      effort_type: "power",
      days: 30,
    });

    expect(result).toEqual([
      expect.objectContaining({ duration_seconds: 60, value: 340, unit: "watts" }),
      expect.objectContaining({ duration_seconds: 300, value: 255, unit: "watts" }),
    ]);

    const metadata = collectSqlMetadata(getWhereArg());
    expect(metadata.columns).toEqual(
      expect.arrayContaining(["profile_id", "activity_category", "effort_type", "recorded_at"]),
    );
    expect(metadata.params).toEqual(
      expect.arrayContaining([OWNER_ID, "bike", "power", new Date("2026-03-04T12:00:00.000Z")]),
    );
  });

  it("excludes modeled and provenance-free synthetic rows from season bests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const { caller } = createCaller([
      createEffortRow({ duration_seconds: 300, value: 300 }),
      createEffortRow({
        activity_id: null,
        duration_seconds: 300,
        value: 900,
        source: "derived",
        method: "onboarding_modeled_curve",
        provenance: { seed_source: "advanced" },
      }),
      createEffortRow({
        duration_seconds: 600,
        value: 500,
        source: null,
        method: null,
        provenance: null,
      }),
    ]);

    await expect(
      caller.getSeasonBestCurve({
        activity_category: "bike",
        effort_type: "power",
        days: 90,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        duration_seconds: 300,
        value: 300,
        source: "imported",
        method: "activity_file_best_effort",
      }),
    ]);
  });

  it("includes a normal manual-create row and canonicalizes its persisted unit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));
    const { caller } = createCaller([
      createEffortRow({
        activity_id: null,
        duration_seconds: 300,
        value: 300,
        unit: "W",
        source: "manual",
        method: "manual_activity_effort_entry",
        calculation_version: null,
        provenance: { trusted: true, observation_type: "observed", entered_by: "athlete" },
      }),
    ]);

    await expect(
      caller.getSeasonBestCurve({
        activity_category: "bike",
        effort_type: "power",
        days: 90,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        activity_id: null,
        source: "manual",
        value: 300,
        unit: "watts",
      }),
    ]);
  });

  it("predicts performance from the owned season-best curve", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const { caller } = createCaller([
      createEffortRow({ duration_seconds: 180, value: 250 + 15000 / 180 }),
      createEffortRow({ duration_seconds: 300, value: 250 + 15000 / 300 }),
      createEffortRow({ duration_seconds: 600, value: 250 + 15000 / 600 }),
      createEffortRow({ duration_seconds: 1200, value: 250 + 15000 / 1200 }),
    ]);

    const result = await caller.predictPerformance({
      activity_category: "bike",
      effort_type: "power",
      days: 90,
      duration: 900,
    });

    expect(result).toMatchObject({
      predicted_value: 267,
      unit: "watts",
      model: {
        cp: 250,
        wPrime: 15000,
        source: "observed-curve-fit",
        fitMinDurationSeconds: 180,
        fitMaxDurationSeconds: 1200,
        pointCount: 4,
      },
    });
    expect(result.model.error).toBeGreaterThan(0.99);
  });

  it("rejects extrapolated and non-power critical-power predictions", async () => {
    const { caller } = createCaller([
      createEffortRow({ duration_seconds: 180, value: 250 + 15000 / 180 }),
      createEffortRow({ duration_seconds: 300, value: 250 + 15000 / 300 }),
      createEffortRow({ duration_seconds: 1200, value: 250 + 15000 / 1200 }),
    ]);

    await expect(
      caller.predictPerformance({
        activity_category: "bike",
        effort_type: "power",
        days: 90,
        duration: 1500,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);

    await expect(
      caller.predictPerformance({
        activity_category: "run",
        effort_type: "speed",
        days: 90,
        duration: 900,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Critical-power prediction is only supported for bike power efforts.",
    } as Partial<TRPCError>);
  });

  it("rejects performance prediction when the curve lacks enough valid durations", async () => {
    const { caller } = createCaller([createEffortRow({ duration_seconds: 300, value: 300 })]);

    await expect(
      caller.predictPerformance({
        activity_category: "bike",
        effort_type: "power",
        days: 90,
        duration: 900,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Insufficient data to calculate performance model. Need at least 3 observed max efforts between 3 and 30 minutes, including short and long coverage.",
    } as Partial<TRPCError>);
  });
});
