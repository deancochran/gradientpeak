import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/profile-estimation-state", () => ({
  bumpProfileEstimationState: vi.fn(async () => undefined),
}));

import { profileMetricsRouter } from "../profile-metrics";

type QueryPlan = {
  selectResult?: unknown[];
  insertResult?: unknown[];
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
    ...overrides,
  };
}

function createDbMock(plan: QueryPlan = {}) {
  const callLog: DbCall[] = [];

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
      Promise.resolve(plan.selectResult ?? []).then(onFulfilled),
  };

  const db = {
    select: () => selectBuilder,
    insert: (table: unknown) => {
      callLog.push({ operation: "insert.into", value: table });

      const insertBuilder: any = {
        values: (payload: unknown) => {
          callLog.push({ operation: "insert.values", payload });
          return insertBuilder;
        },
        returning: () => Promise.resolve(plan.insertResult ?? []),
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
  it("lists metrics and forwards pagination to the db query", async () => {
    const rows = [
      createProfileMetricRow(),
      createProfileMetricRow({
        id: "00000000-0000-4000-8000-000000000002",
        recorded_at: new Date("2026-03-09T07:00:00.000Z"),
        value: 71.9,
      }),
    ];
    const { caller, callLog } = createCaller({ selectResult: rows });

    const result = await caller.list({
      metric_type: "weight_kg",
      start_date: new Date("2026-03-01T00:00:00.000Z"),
      end_date: new Date("2026-03-31T23:59:59.000Z"),
      limit: 10,
      offset: 5,
    });

    expect(result.items).toEqual(rows);
    expect(result.total).toBe(2);
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
      unit: "kg",
      notes: "post-session weigh-in",
      value: 70.25,
    });

    const insertCall = callLog.find((call) => call.operation === "insert.values");
    expect(insertCall?.payload).toEqual(
      expect.objectContaining({
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_type: "weight_kg",
        value: 70.25,
        unit: "kg",
        notes: "post-session weigh-in",
        reference_activity_id: null,
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
        unit: "kg",
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
    const { caller, callLog } = createCaller({ updateResult: [updated] });

    const result = await caller.update({
      id: "00000000-0000-4000-8000-000000000005",
      value: 68.8,
      unit: "kg",
      notes: "cutback week",
      recorded_at: "2026-03-20T07:15:00.000Z",
    });

    const updateCall = callLog.find((call) => call.operation === "update.set");
    expect(updateCall?.payload).toEqual({
      value: 68.8,
      unit: "kg",
      notes: "cutback week",
      recorded_at: new Date("2026-03-20T07:15:00.000Z"),
      updated_at: expect.any(Date),
    });
    expect(result).toEqual(updated);
  });

  it("deletes an owned metric", async () => {
    const { caller, callLog } = createCaller();

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
});
