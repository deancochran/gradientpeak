import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { athleteIntelligenceReadLimits } from "../../application/athlete-intelligence/read-model";
import { athleteIntelligenceRouter } from "../athlete-intelligence";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type QueryCall = {
  fields: string[];
  limit?: number;
  table?: string;
  where?: unknown;
  whereCalls: number;
};

function collectSqlMetadata(
  node: unknown,
  state = { columns: [] as string[], params: [] as unknown[] },
) {
  if (!node || typeof node !== "object") return state;

  const value = node as {
    constructor?: { name?: string };
    name?: unknown;
    queryChunks?: unknown[];
    value?: unknown;
  };
  if (typeof value.name === "string") state.columns.push(value.name);
  if (value.constructor?.name === "Param") state.params.push(value.value);
  if (Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) collectSqlMetadata(chunk, state);
  }
  if (Array.isArray(value.value)) {
    for (const chunk of value.value) collectSqlMetadata(chunk, state);
  }

  return state;
}

function tableName(table: unknown) {
  const tableLike = table as { _?: { name?: unknown } };
  return String(
    (table as Record<symbol, unknown> | undefined)?.[Symbol.for("drizzle:Name")] ??
      tableLike._?.name ??
      "",
  );
}

function goalRow(profileId = OWNER_ID) {
  return {
    id: GOAL_ID,
    profile_id: profileId,
    target_date: "2026-12-01",
    title: "10K",
    priority: 8,
    activity_category: "run",
    target_payload: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 10000,
      target_time_s: 3000,
    },
  };
}

function createDb(rows: Record<string, unknown[]> = {}) {
  const calls: QueryCall[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a partial test double.
  const db: any = {
    select: vi.fn((selection: Record<string, unknown>) => {
      const call: QueryCall = { fields: Object.keys(selection), whereCalls: 0 };
      calls.push(call);
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle's fluent builder is intentionally a partial test double.
      const builder: any = {
        from: (table: unknown) => {
          call.table = tableName(table);
          return builder;
        },
        where: (condition: unknown) => {
          call.whereCalls += 1;
          call.where = condition;
          return builder;
        },
        orderBy: () => builder,
        limit: (value: number) => {
          call.limit = value;
          return builder;
        },
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(rows[call.table ?? ""] ?? []).then(resolve),
      };
      return builder;
    }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { calls, db };
}

// biome-ignore lint/suspicious/noExplicitAny: Context accepts a Drizzle client; this test supplies a bounded double.
function createCaller(db: any, userId = OWNER_ID) {
  return athleteIntelligenceRouter.createCaller({
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "athlete@example.com", emailVerified: true } },
    clientType: "test",
    trpcSource: "vitest",
    // biome-ignore lint/suspicious/noExplicitAny: Only the router's context dependencies are present in this test double.
  } as any);
}

describe("athleteIntelligenceRouter.evaluate", () => {
  it("scopes the goal to the authenticated athlete and reports absent ownership as not found", async () => {
    const { db } = createDb({ profile_goals: [] });

    await expect(createCaller(db, OTHER_ID).evaluate({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });

  it("uses exactly one owned-goal read plus bounded narrow activity and metric reads without writes", async () => {
    const { calls, db } = createDb({
      profile_goals: [goalRow()],
      activities: [
        {
          type: "run",
          started_at: new Date("2026-07-01T00:00:00.000Z"),
          duration_seconds: 3600,
          distance_meters: 10000,
          max_power: 300,
          max_speed_mps: 5,
          avg_swolf: null,
        },
      ],
      profile_metrics: [
        { metric_type: "ftp", recorded_at: new Date("2026-07-01T00:00:00.000Z"), value: 250 },
      ],
    });

    const result = await createCaller(db).evaluate({ goalId: GOAL_ID });

    expect(calls).toHaveLength(3);
    const goalCall = calls[0];
    const activityCall = calls[1];
    const metricCall = calls[2];
    if (!goalCall || !activityCall || !metricCall) {
      throw new Error("Expected exactly three intelligence read calls");
    }
    expect(calls.map((call) => call.table)).toEqual([
      "profile_goals",
      "activities",
      "profile_metrics",
    ]);
    expect(calls.every((call) => call.whereCalls === 1)).toBe(true);
    expect(collectSqlMetadata(goalCall.where).columns).toEqual(
      expect.arrayContaining(["id", "profile_id"]),
    );
    expect(collectSqlMetadata(goalCall.where).params).toEqual(
      expect.arrayContaining([GOAL_ID, OWNER_ID]),
    );
    expect(collectSqlMetadata(activityCall.where).columns).toEqual(
      expect.arrayContaining(["profile_id", "started_at"]),
    );
    expect(collectSqlMetadata(metricCall.where).columns).toEqual(
      expect.arrayContaining(["profile_id", "metric_type"]),
    );
    expect(goalCall).toMatchObject({
      fields: [
        "id",
        "profile_id",
        "target_date",
        "title",
        "priority",
        "activity_category",
        "target_payload",
      ],
      limit: 1,
    });
    expect(activityCall.fields).toEqual([
      "type",
      "started_at",
      "duration_seconds",
      "distance_meters",
      "max_power",
      "max_speed_mps",
      "avg_swolf",
    ]);
    expect(activityCall.limit).toBe(athleteIntelligenceReadLimits.activityLimit);
    expect(metricCall.fields).toEqual(["metric_type", "recorded_at", "value"]);
    expect(metricCall.limit).toBe(athleteIntelligenceReadLimits.metricLimit);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(result.gaps.dimensions.technical.status).toBe("missing_evidence");
  });

  it("does not query schedule data and reports the explicit lazy schedule state", async () => {
    const { calls, db } = createDb({
      profile_goals: [goalRow()],
      activities: [],
      profile_metrics: [],
    });

    const notRequested = await createCaller(db).evaluate({ goalId: GOAL_ID });
    const unsupported = await createCaller(db).evaluate({
      goalId: GOAL_ID,
      includeScheduleContext: true,
    });

    expect(notRequested.schedule).toEqual({ state: "not_requested" });
    expect(unsupported.schedule).toEqual({ state: "unsupported" });
    expect(calls.some((call) => call.table === "events")).toBe(false);
  });
});
