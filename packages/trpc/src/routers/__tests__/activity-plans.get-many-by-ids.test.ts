import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/estimation-helpers", () => ({
  addEstimationToPlan: vi.fn(),
  addEstimationToPlans: vi.fn(async (plans: any[]) =>
    plans.map((plan) => ({
      ...plan,
      estimated_tss: plan.estimated_tss ?? 0,
      estimated_duration: plan.estimated_duration ?? 0,
    })),
  ),
  computePlanMetrics: vi.fn(),
}));

import { activityPlansRouter } from "../activity-plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "select" | "filter";
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
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(nextResult(table)).then(onFulfilled),
      };

      return builder;
    },
  };

  return { client, callLog };
}

describe("activityPlansRouter.getManyByIds", () => {
  it("returns only requested accessible plans in input order", async () => {
    const { client, callLog } = createSupabaseMock({
      activity_plans: {
        data: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Second Plan",
            profile_id: null,
            template_visibility: "public",
            is_system_template: true,
            activity_category: "run",
            description: "",
            structure: {},
          },
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "First Plan",
            profile_id: "profile-123",
            template_visibility: "private",
            is_system_template: false,
            activity_category: "run",
            description: "",
            structure: {},
          },
        ],
        error: null,
      },
      likes: {
        data: [{ entity_id: "11111111-1111-4111-8111-111111111111" }],
        error: null,
      },
    });

    const caller = activityPlansRouter.createCaller({
      supabase: client as any,
      session: { user: { id: "profile-123" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any);

    const result = await caller.getManyByIds({
      ids: [
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
        "22222222-2222-4222-8222-222222222222",
      ],
    });

    const idFilter = callLog.find(
      (call) =>
        call.table === "activity_plans" &&
        call.operation === "filter" &&
        (call.payload as any)?.type === "in",
    );
    const accessFilter = callLog.find(
      (call) =>
        call.table === "activity_plans" &&
        call.operation === "filter" &&
        (call.payload as any)?.type === "or",
    );

    expect((idFilter?.payload as any)?.column).toBe("id");
    expect((idFilter?.payload as any)?.value).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect((accessFilter?.payload as any)?.value).toContain("is_system_template.eq.true");
    expect(result.items.map((item) => item.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(result.items[0]?.has_liked).toBe(true);
    expect(result.items[1]?.has_liked).toBe(false);
  });
});
