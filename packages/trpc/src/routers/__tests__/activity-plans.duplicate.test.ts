import { describe, expect, it } from "vitest";
import { activityPlansRouter } from "../activity_plans";

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
        or: (value: string) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "or", value },
          });
          return builder;
        },
        gte: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "gte", column, value },
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
        order: () => builder,
        limit: () => builder,
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

describe("activityPlansRouter.duplicate", () => {
  it("allows public plans and creates a private owned copy", async () => {
    const { client, callLog } = createSupabaseMock({
      activity_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Shared Workout",
            description: "Public workout",
            notes: "Bring bottles",
            activity_category: "bike",
            structure: {
              version: 2,
              intervals: [
                {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  name: "Main Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      name: "Ride",
                      duration: { type: "untilFinished" },
                      targets: [],
                    },
                  ],
                },
              ],
            },
            route_id: null,
            version: "1.0",
            profile_id: "template-owner",
            template_visibility: "public",
            is_system_template: false,
          },
          error: null,
        },
        {
          data: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Shared Workout (Copy)",
            description: "Public workout",
            notes: "Bring bottles",
            activity_category: "bike",
            structure: {
              version: 2,
              intervals: [
                {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  name: "Main Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      name: "Ride",
                      duration: { type: "untilFinished" },
                      targets: [],
                    },
                  ],
                },
              ],
            },
            route_id: null,
            version: "1.0",
            profile_id: "profile-123",
            template_visibility: "private",
            is_system_template: false,
            estimated_duration: null,
            estimated_tss: null,
          },
          error: null,
        },
      ],
    });

    const caller = activityPlansRouter.createCaller({
      supabase: client as any,
      session: { user: { id: "profile-123" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any);

    const result = await caller.duplicate({
      id: "11111111-1111-4111-8111-111111111111",
    });

    const sourceFilter = callLog.find(
      (call) =>
        call.table === "activity_plans" &&
        call.operation === "filter" &&
        (call.payload as any)?.type === "or",
    );
    const insertCall = callLog.find(
      (call) => call.table === "activity_plans" && call.operation === "insert",
    );

    expect((sourceFilter?.payload as any)?.value).toContain(
      "template_visibility.eq.public",
    );
    expect(insertCall?.payload).toMatchObject({
      name: "Shared Workout (Copy)",
      profile_id: "profile-123",
      template_visibility: "private",
      import_provider: null,
      import_external_id: null,
    });
    expect(result.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.visibility).toBe("private");
  });
});
