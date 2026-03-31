import { describe, expect, it } from "vitest";
import { activityPlansRouter } from "../activity-plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "select" | "insert" | "update" | "filter";
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
        maybeSingle: () => Promise.resolve(nextResult(table)),
        update: (payload: unknown) => {
          callLog.push({ table, operation: "update", payload });
          return builder;
        },
        insert: (payload: unknown) => {
          callLog.push({ table, operation: "insert", payload });
          return builder;
        },
        single: () => Promise.resolve(nextResult(table)),
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

  const caller = activityPlansRouter.createCaller({
    supabase: client as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

const sampleStructure = {
  version: 2,
  intervals: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Main Interval",
      repetitions: 1,
      steps: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Step 1",
          duration: { type: "untilFinished" },
          targets: [],
        },
      ],
    },
  ],
} as any;

describe("activityPlans import idempotency", () => {
  it("importFromFitTemplate updates existing imported plan by identity", async () => {
    const { caller, callLog } = createCaller({
      activity_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            profile_id: "profile-123",
            import_provider: "fit",
            import_external_id: "fit-template-1",
          },
          error: null,
        },
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Updated FIT",
            profile_id: "profile-123",
            template_visibility: "private",
          },
          error: null,
        },
      ],
    });

    const result = await caller.importFromFitTemplate({
      external_id: "fit-template-1",
      name: "Updated FIT",
      activity_category: "bike",
      structure: sampleStructure,
    });

    expect(result.action).toBe("updated");
    expect(result.item.visibility).toBe("private");
    expect(callLog.some((call) => call.operation === "update")).toBe(true);
  });

  it("importFromZwoTemplate creates when identity does not exist", async () => {
    const { caller, callLog } = createCaller({
      activity_plans: [
        {
          data: null,
          error: null,
        },
        {
          data: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Created ZWO",
            profile_id: "profile-123",
            template_visibility: "private",
          },
          error: null,
        },
      ],
    });

    const result = await caller.importFromZwoTemplate({
      external_id: "zwo-template-1",
      name: "Created ZWO",
      activity_category: "bike",
      structure: sampleStructure,
    });

    expect(result.action).toBe("created");
    expect(result.item.content_type).toBe("activity_plan");
    expect(callLog.some((call) => call.operation === "insert")).toBe(true);
  });
});
