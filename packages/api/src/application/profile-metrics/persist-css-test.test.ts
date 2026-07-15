import { activityEfforts, profileMetrics } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import { CSS_TEST_METHOD, CssTestOperationConflictError, persistCssTest } from "./persist-css-test";

type DbClient = ReturnType<typeof getRequiredDb>;

function createDb(options: { failMetricInsert?: boolean } = {}) {
  const committed: Array<{ table: unknown; values: unknown }> = [];
  const attempted: Array<{ table: unknown; values: unknown }> = [];
  let lock = Promise.resolve();
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const staged: Array<{ table: unknown; values: unknown }> = [];
    let releaseLock: () => void = () => {};
    const tx = {
      execute: vi.fn(async () => {
        const previousLock = lock;
        lock = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        await previousLock;
        return { rows: [] };
      }),
      select: vi.fn(() => {
        const existingMetric = committed.find(({ table }) => table === profileMetrics)?.values;
        const builder = {
          from: vi.fn(() => builder),
          where: vi.fn(() => builder),
          limit: vi.fn(() => Promise.resolve(existingMetric ? [existingMetric] : [])),
        };
        return builder;
      }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          attempted.push({ table, values });
          return {
            returning: vi.fn(async () => {
              if (table === profileMetrics && options.failMetricInsert) {
                throw new Error("metric insert failed");
              }
              if (table === activityEfforts) {
                staged.push({ table, values });
                return values;
              }
              const returnedValues = { ...(values as Record<string, unknown>), idx: 1 };
              staged.push({ table, values: returnedValues });
              return [returnedValues];
            }),
          };
        }),
      })),
      update: vi.fn(() => {
        throw new Error("CSS persistence must not update prior evidence");
      }),
      delete: vi.fn(() => {
        throw new Error("CSS persistence must not delete prior evidence");
      }),
    };
    try {
      const result = await callback(tx);
      committed.push(...staged);
      return result;
    } finally {
      releaseLock();
    }
  });

  return { db: { transaction } as unknown as DbClient, attempted, committed, transaction };
}

const input = {
  operationId: "22222222-2222-4222-8222-222222222222",
  profileId: "11111111-1111-4111-8111-111111111111",
  recordedAt: new Date("2026-07-14T09:00:00.000Z"),
  time400Seconds: 360,
  time200Seconds: 168,
};

describe("persistCssTest", () => {
  it("atomically inserts two test efforts and one CSS metric without activity-stream provenance", async () => {
    const { db, committed, attempted, transaction } = createDb();

    const result = await persistCssTest(db, input);

    expect(transaction).toHaveBeenCalledOnce();
    expect(committed.map(({ table }) => table)).toEqual([activityEfforts, profileMetrics]);
    expect(result.cssSecondsPer100m).toBe(96);
    expect(result.efforts).toHaveLength(2);
    expect(result.profileMetric).toMatchObject({
      metric_type: "css_seconds_per_100m",
      source: "test",
      method: CSS_TEST_METHOD,
      value: 96,
    });

    const effortValues = attempted.find(({ table }) => table === activityEfforts)?.values;
    expect(effortValues).toEqual([
      expect.objectContaining({
        activity_id: null,
        duration_seconds: 360,
        source: "test",
        method: CSS_TEST_METHOD,
        provenance: expect.objectContaining({
          operation_id: input.operationId,
          test_id: result.testId,
          distance_meters: 400,
          derived_from: "manual_test_result",
        }),
      }),
      expect.objectContaining({
        activity_id: null,
        duration_seconds: 168,
        source: "test",
        method: CSS_TEST_METHOD,
        provenance: expect.objectContaining({
          operation_id: input.operationId,
          test_id: result.testId,
          distance_meters: 200,
          derived_from: "manual_test_result",
        }),
      }),
    ]);
    expect(JSON.stringify(attempted.map(({ values }) => values))).not.toContain(
      "activity_file_stream",
    );
  });

  it("rolls back both effort inserts when the CSS metric insert fails", async () => {
    const { db, attempted, committed } = createDb({ failMetricInsert: true });

    await expect(persistCssTest(db, input)).rejects.toThrow("metric insert failed");

    expect(attempted.map(({ table }) => table)).toEqual([activityEfforts, profileMetrics]);
    expect(committed).toEqual([]);
  });

  it("rejects invalid test input before opening a transaction", async () => {
    const { db, transaction } = createDb();

    await expect(persistCssTest(db, { ...input, time400Seconds: 336 })).rejects.toThrow(
      "400m time must be greater than twice the 200m time",
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns the original test for sequential retries without reinserting", async () => {
    const { db, attempted, transaction } = createDb();

    const first = await persistCssTest(db, input);
    const retry = await persistCssTest(db, input);

    expect(retry).toEqual(first);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(attempted).toHaveLength(2);
  });

  it("serializes concurrent retries and inserts one test", async () => {
    const { db, attempted } = createDb();

    const [first, retry] = await Promise.all([
      persistCssTest(db, input),
      persistCssTest(db, input),
    ]);

    expect(retry).toEqual(first);
    expect(attempted).toHaveLength(2);
  });

  it.each([
    { recordedAt: new Date("2026-07-14T09:00:01.000Z") },
    { time400Seconds: 361 },
    { time200Seconds: 169 },
  ])("rejects operation ID reuse with conflicting input: $input", async (conflict) => {
    const { db, attempted } = createDb();
    await persistCssTest(db, input);

    await expect(persistCssTest(db, { ...input, ...conflict })).rejects.toBeInstanceOf(
      CssTestOperationConflictError,
    );
    expect(attempted).toHaveLength(2);
  });
});
