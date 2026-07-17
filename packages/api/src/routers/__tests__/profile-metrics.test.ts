import { describe, expect, it } from "vitest";
import { profileMetricsRouter } from "../profile-metrics";

type QueryPlan = {
  selectResult?: unknown[];
  countResult?: unknown[];
  insertResult?: unknown[];
  insertResults?: unknown[][];
  updateResult?: unknown[];
  deleteResult?: unknown;
};

type DbCall = {
  operation: string;
  payload?: unknown;
  value?: unknown;
};

function createProfileMetricRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    idx: 1,
    created_at: new Date("2026-03-01T00:00:00.000Z"),
    updated_at: new Date("2026-03-01T00:00:00.000Z"),
    profile_id: "11111111-1111-4111-8111-111111111111",
    metric_type: "weight_kg",
    recorded_at: new Date("2026-03-10T07:00:00.000Z"),
    unit: "kg",
    notes: null,
    reference_activity_id: null,
    value: 72.4,
    source: "manual",
    method: "manual_entry",
    calculation_version: null,
    quality_score: null,
    provenance: { observation_type: "observed", trusted: true, entered_by: "athlete" },
    ...overrides,
  };
}

function createActivityEffortRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    created_at: new Date("2026-07-14T09:00:00.000Z"),
    updated_at: new Date("2026-07-14T09:00:00.000Z"),
    profile_id: "11111111-1111-4111-8111-111111111111",
    activity_id: null,
    segment_id: null,
    recorded_at: new Date("2026-07-14T09:00:00.000Z"),
    activity_category: "swim",
    effort_type: "speed",
    duration_seconds: 360,
    start_offset: null,
    unit: "meters_per_second",
    value: 400 / 360,
    source: "test",
    method: "css_400m_200m_test",
    calculation_version: "css_400m_200m_v1",
    quality_score: 1,
    provenance: { observation_type: "validated_test", trusted: true },
    ...overrides,
  };
}

function createDbMock(plan: QueryPlan = {}) {
  const callLog: DbCall[] = [];
  let insertIndex = 0;

  const createSelectBuilder = (isCountSelect = false) => {
    const selectBuilder: any = {
      from: (table: unknown) => {
        callLog.push({ operation: "select.from", value: table });
        return selectBuilder;
      },
      where: (payload: unknown) => {
        callLog.push({ operation: "select.where", payload });
        return selectBuilder;
      },
      orderBy: (...payload: unknown[]) => {
        callLog.push({ operation: "select.orderBy", payload });
        return selectBuilder;
      },
      limit: (value: number) => {
        callLog.push({ operation: "select.limit", value });
        return selectBuilder;
      },
      offset: (value: number) => {
        callLog.push({ operation: "select.offset", value });
        return selectBuilder;
      },
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(isCountSelect ? (plan.countResult ?? []) : (plan.selectResult ?? [])).then(
          onFulfilled,
        ),
    };

    return selectBuilder;
  };

  const db = {
    select: (selection?: Record<string, unknown>) => createSelectBuilder(Boolean(selection?.total)),
    insert: (table: unknown) => {
      callLog.push({ operation: "insert.into", value: table });

      const insertBuilder: any = {
        values: (payload: unknown) => {
          callLog.push({ operation: "insert.values", payload });
          return insertBuilder;
        },
        returning: () =>
          Promise.resolve(plan.insertResults?.[insertIndex++] ?? plan.insertResult ?? []),
      };

      return insertBuilder;
    },
    update: (table: unknown) => {
      callLog.push({ operation: "update.table", value: table });

      const updateBuilder: any = {
        set: (payload: unknown) => {
          callLog.push({ operation: "update.set", payload });
          return updateBuilder;
        },
        where: (payload: unknown) => {
          callLog.push({ operation: "update.where", payload });
          return updateBuilder;
        },
        returning: () => Promise.resolve(plan.updateResult ?? []),
      };

      return updateBuilder;
    },
    delete: (table: unknown) => {
      callLog.push({ operation: "delete.from", value: table });

      return {
        where: (payload: unknown) => {
          callLog.push({ operation: "delete.where", payload });
          return Promise.resolve(plan.deleteResult ?? { rowCount: 1 });
        },
      };
    },
    execute: (payload: unknown) => {
      callLog.push({ operation: "execute", payload });
      return Promise.resolve({ rows: [] });
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      callLog.push({ operation: "transaction.begin" });
      try {
        const result = await callback(db);
        callLog.push({ operation: "transaction.commit" });
        return result;
      } catch (error) {
        callLog.push({ operation: "transaction.rollback" });
        throw error;
      }
    },
  };

  return { db, callLog };
}

function createCaller(plan: QueryPlan = {}, userId = "11111111-1111-4111-8111-111111111111") {
  const { db, callLog } = createDbMock(plan);

  const caller = profileMetricsRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("profileMetricsRouter", () => {
  it("records a validated CSS test through one transaction and returns a bounded DTO", async () => {
    const efforts = [
      createActivityEffortRow(),
      createActivityEffortRow({
        id: "00000000-0000-4000-8000-000000000011",
        duration_seconds: 168,
        value: 200 / 168,
      }),
    ];
    const metric = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000012",
      metric_type: "css_seconds_per_100m",
      unit: "seconds_per_100m",
      value: 96,
      source: "test",
      method: "css_400m_200m_test",
      calculation_version: "css_400m_200m_v1",
      quality_score: 1,
      provenance: { observation_type: "validated_test", trusted: true },
    });
    const { caller, callLog } = createCaller({ insertResults: [efforts, [metric]] });

    const result = await caller.recordCssTest({
      operation_id: "22222222-2222-4222-8222-222222222222",
      time_400_seconds: 360,
      time_200_seconds: 168,
      recorded_at: new Date("2026-07-14T09:00:00.000Z"),
    });

    expect(result).toMatchObject({
      test_id: expect.any(String),
      css_seconds_per_100m: 96,
      recorded_at: new Date("2026-07-14T09:00:00.000Z"),
      source: "validated_test",
      calculation_version: "css_400m_200m_v1",
      efforts: [
        { distance_meters: 400, time_seconds: 360, speed_meters_per_second: 400 / 360 },
        { distance_meters: 200, time_seconds: 168, speed_meters_per_second: 200 / 168 },
      ],
    });
    expect(result).not.toHaveProperty("profile_metric");
    expect(result.efforts[0]).not.toHaveProperty("profile_id");
    expect(callLog.filter(({ operation }) => operation === "insert.values")).toHaveLength(2);
    expect(callLog.map(({ operation }) => operation)).toEqual(
      expect.arrayContaining(["transaction.begin", "transaction.commit"]),
    );
  });

  it("rejects an invalid CSS relationship before starting a transaction", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.recordCssTest({
        operation_id: "22222222-2222-4222-8222-222222222222",
        time_400_seconds: 336,
        time_200_seconds: 168,
        recorded_at: new Date("2026-07-14T09:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(callLog.some(({ operation }) => operation === "transaction.begin")).toBe(false);
  });

  it("lists metrics and forwards pagination to the db query", async () => {
    const rows = [
      createProfileMetricRow(),
      createProfileMetricRow({
        id: "00000000-0000-4000-8000-000000000002",
        recorded_at: new Date("2026-03-09T07:00:00.000Z"),
        value: 71.9,
      }),
    ];
    const { caller, callLog } = createCaller({ selectResult: rows, countResult: [{ total: 2 }] });

    const result = await caller.list({
      metric_type: "weight_kg",
      start_date: new Date("2026-03-01T00:00:00.000Z"),
      end_date: new Date("2026-03-31T23:59:59.000Z"),
      limit: 10,
      cursor: "index:5",
    });

    expect(result.items).toEqual(rows);
    expect(result.total).toBe(2);
    expect(result.nextCursor).toBeUndefined();
    expect(callLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "select.where" }),
        expect.objectContaining({ operation: "select.orderBy" }),
        expect.objectContaining({ operation: "select.limit", value: 10 }),
        expect.objectContaining({ operation: "select.offset", value: 5 }),
      ]),
    );
  });

  it("rejects unknown list input keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.list({
        limit: 10,
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("gets the latest metric at or before a requested date", async () => {
    const row = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000003",
      metric_type: "resting_hr",
      unit: "bpm",
      value: 49,
    });
    const { caller, callLog } = createCaller({ selectResult: [row] });

    const result = await caller.getAtDate({
      metric_type: "resting_hr",
      date: new Date("2026-03-15T00:00:00.000Z"),
    });

    expect(result).toEqual(row);
    expect(callLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "select.orderBy" }),
        expect.objectContaining({ operation: "select.limit", value: 1 }),
      ]),
    );
  });

  it("returns null when getById cannot find an owned metric", async () => {
    const { caller, callLog } = createCaller({ selectResult: [] });

    const result = await caller.getById({
      id: "00000000-0000-4000-8000-000000000099",
    });

    expect(result).toBeNull();
    expect(callLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "select.where" }),
        expect.objectContaining({ operation: "select.limit", value: 1 }),
      ]),
    );
  });

  it("creates a metric and persists numeric values with timestamps", async () => {
    const created = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000004",
      notes: "post-session weigh-in",
      value: 70.25,
    });
    const { caller, callLog } = createCaller({ insertResult: [created] });

    const result = await caller.create({
      profile_id: "11111111-1111-4111-8111-111111111111",
      metric_type: "weight_kg",
      recorded_at: "2026-03-18T06:30:00.000Z",
      reference_activity_id: undefined,
      notes: "post-session weigh-in",
      value: 70.25,
    });

    const insertCall = callLog.find((call) => call.operation === "insert.values");
    expect(insertCall?.payload).toEqual(
      expect.objectContaining({
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_type: "weight_kg",
        value: 70.3,
        unit: "kg",
        notes: "post-session weigh-in",
        reference_activity_id: null,
        source: "manual",
        method: "manual_entry",
        provenance: {
          observation_type: "observed",
          trusted: true,
          entered_by: "athlete",
        },
        recorded_at: new Date("2026-03-18T06:30:00.000Z"),
        updated_at: expect.any(Date),
      }),
    );
    expect(result).toEqual(created);
  });

  it("fails when a returned db row does not match the public metric shape", async () => {
    const { caller } = createCaller({
      insertResult: [
        createProfileMetricRow({
          value: "70.25",
        }),
      ],
    });

    await expect(
      caller.create({
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_type: "weight_kg",
        recorded_at: "2026-03-18T06:30:00.000Z",
        reference_activity_id: undefined,
        notes: "post-session weigh-in",
        value: 70.25,
      }),
    ).rejects.toThrow();
  });

  it("updates a metric with normalized payload values", async () => {
    const updated = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000005",
      value: 68.8,
      notes: "cutback week",
    });
    const { caller, callLog } = createCaller({ selectResult: [updated], updateResult: [updated] });

    const result = await caller.update({
      id: "00000000-0000-4000-8000-000000000005",
      value: 68.8,
      notes: "cutback week",
      recorded_at: "2026-03-20T07:15:00.000Z",
    });

    const updateCall = callLog.find((call) => call.operation === "update.set");
    expect(updateCall?.payload).toEqual({
      value: 68.8,
      unit: "kg",
      notes: "cutback week",
      source: "manual",
      method: "manual_entry",
      provenance: {
        observation_type: "observed",
        trusted: true,
        entered_by: "athlete",
      },
      recorded_at: new Date("2026-03-20T07:15:00.000Z"),
      updated_at: expect.any(Date),
    });
    expect(result).toEqual(updated);
  });

  it("creates a manual observation instead of mutating non-manual evidence", async () => {
    const providerMetric = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000007",
      source: "provider",
      method: "provider_profile_sync",
      provenance: { provider: "example" },
      value: 71.2,
    });
    const manualOverride = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000008",
      value: 70.1,
      notes: "corrected",
    });
    const { caller, callLog } = createCaller({
      selectResult: [providerMetric],
      insertResult: [manualOverride],
    });

    const result = await caller.update({
      id: providerMetric.id,
      value: 70.1,
      notes: "corrected",
    });

    expect(callLog.find((call) => call.operation === "insert.values")?.payload).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        profile_id: providerMetric.profile_id,
        metric_type: providerMetric.metric_type,
        value: 70.1,
        unit: "kg",
        notes: "corrected",
        recorded_at: providerMetric.recorded_at,
        reference_activity_id: null,
        source: "manual",
        method: "manual_entry",
        provenance: {
          observation_type: "observed",
          trusted: true,
          entered_by: "athlete",
        },
      }),
    );
    expect(callLog.some((call) => call.operation === "update.table")).toBe(false);
    expect(result).toEqual(manualOverride);
  });

  it("deletes an owned metric", async () => {
    const existing = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000006",
      recorded_at: new Date("2026-03-05T07:00:00.000Z"),
    });
    const { caller, callLog } = createCaller({ selectResult: [existing] });

    const result = await caller.delete({
      id: "00000000-0000-4000-8000-000000000006",
    });

    expect(result).toEqual({ success: true });
    expect(callLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "delete.from" }),
        expect.objectContaining({ operation: "delete.where" }),
      ]),
    );
  });

  it("rejects deletion of non-manual evidence", async () => {
    const providerMetric = createProfileMetricRow({
      id: "00000000-0000-4000-8000-000000000009",
      source: "provider",
      method: "provider_profile_sync",
    });
    const { caller, callLog } = createCaller({ selectResult: [providerMetric] });

    await expect(caller.delete({ id: providerMetric.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(callLog.some((call) => call.operation === "delete.from")).toBe(false);
  });
});
