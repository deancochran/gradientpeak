import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
}>;

function createEffortRow(overrides: EffortRowOverrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: null,
    profile_id: overrides.profile_id ?? OWNER_ID,
    activity_id: overrides.activity_id ?? crypto.randomUUID(),
    recorded_at: overrides.recorded_at ?? new Date("2026-03-10T00:00:00.000Z"),
    activity_category: overrides.activity_category ?? "bike",
    effort_type: overrides.effort_type ?? "power",
    duration_seconds: overrides.duration_seconds ?? 300,
    start_offset: null,
    unit: overrides.unit ?? "watts",
    value: overrides.value ?? 250,
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

  const caller = analyticsRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

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
      expect.arrayContaining([
        "profile_id",
        "activity_category",
        "effort_type",
        "recorded_at",
        "activity_id",
      ]),
    );
    expect(metadata.params).toEqual(
      expect.arrayContaining([OWNER_ID, "bike", "power", new Date("2026-03-04T12:00:00.000Z")]),
    );
  });

  it("predicts performance from the owned season-best curve", async () => {
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
      },
    });
    expect(result.model.error).toBeGreaterThan(0.99);
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
        "Insufficient data to calculate performance model. Need at least 2 max efforts between 3 and 30 minutes.",
    } as Partial<TRPCError>);
  });
});
