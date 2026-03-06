import { describe, expect, it } from "vitest";
import { trainingPlansRouter } from "../training_plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "select" | "insert" | "filter";
  payload?: unknown;
};

function createSupabaseMock(queryMap: QueryMap) {
  const callLog: QueryCall[] = [];
  const counters = new Map<string, number>();

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: [], error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);
    return entry[index] ?? entry[entry.length - 1] ?? { data: [], error: null };
  };

  const client = {
    from: (table: string) => {
      const builder: any = {
        select: (payload?: unknown) => {
          callLog.push({ table, operation: "select", payload });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "eq", column, value },
          });
          return builder;
        },
        in: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "in", column, value },
          });
          return builder;
        },
        or: (value: string) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "or", value },
          });
          return builder;
        },
        insert: (payload: unknown) => {
          callLog.push({ table, operation: "insert", payload });
          return builder;
        },
        single: () => Promise.resolve(nextResult(table)),
        maybeSingle: () => Promise.resolve(nextResult(table)),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(nextResult(table)).then(onFulfilled),
      };

      return builder;
    },
  };

  return { client, callLog };
}

function createCaller(queryMap: QueryMap) {
  const { client, callLog } = createSupabaseMock(queryMap);

  const caller = trainingPlansRouter.createCaller({
    supabase: client as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("trainingPlansRouter.applyTemplate", () => {
  it("creates planned events with shared schedule_batch_id", async () => {
    const { caller, callLog } = createCaller({
      user_training_plans: [
        { data: [], error: null }, // Concurrency check returns empty
        {
          data: { id: "22222222-2222-4222-8222-222222222222" }, // Insert returns this ID
          error: null,
        },
      ],
      training_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Template Plan",
            description: null,
            profile_id: "template-owner",
            is_system_template: false,
            template_visibility: "public",
            structure: {
              start_date: "2026-01-01",
              sessions: [
                {
                  offset_days: 0,
                  title: "Session A",
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                {
                  offset_days: 2,
                  title: "Session B",
                },
              ],
            },
          },
          error: null,
        },
      ],
      activity_plans: {
        data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
        error: null,
      },
      events: {
        data: [{ id: "event-1" }, { id: "event-2" }],
        error: null,
      },
    });

    const result = await caller.applyTemplate({
      template_type: "training_plan",
      template_id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-03-10",
    });

    const eventInsertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    const insertedRows =
      (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

    expect(result.applied_plan_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.created_event_count).toBe(2);
    expect(typeof result.schedule_batch_id).toBe("string");
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[1]?.schedule_batch_id).toBe(result.schedule_batch_id);
  });
});
