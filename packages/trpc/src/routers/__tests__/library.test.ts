import { describe, expect, it } from "vitest";
import { libraryRouter } from "../library";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert" | "filter";
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
        neq: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "neq", column, value },
          });
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        upsert: (payload: unknown, options?: unknown) => {
          callLog.push({
            table,
            operation: "upsert",
            payload: { payload, options },
          });
          return builder;
        },
        delete: () => {
          callLog.push({ table, operation: "delete" });
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

  const caller = libraryRouter.createCaller({
    supabase: client as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("libraryRouter", () => {
  it("add uses upsert conflict key for uniqueness", async () => {
    const { caller, callLog } = createCaller({
      training_plans: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      },
      library_items: {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          profile_id: "profile-123",
          item_type: "training_plan",
          item_id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-03-01T00:00:00.000Z",
        },
        error: null,
      },
    });

    const result = await caller.add({
      item_type: "training_plan",
      item_id: "11111111-1111-4111-8111-111111111111",
    });

    const upsertCall = callLog.find((call) => call.operation === "upsert");
    expect(upsertCall?.table).toBe("library_items");
    expect((upsertCall?.payload as any)?.options).toMatchObject({
      onConflict: "profile_id,item_type,item_id",
    });
    expect(result.cache_tags).toContain("library.listTrainingPlans");
  });

  it("listTrainingPlans returns normalized identity fields with raw payload", async () => {
    const { caller } = createCaller({
      library_items: {
        data: [
          {
            id: "aaaa1111-1111-4111-8111-111111111111",
            item_id: "11111111-1111-4111-8111-111111111111",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        error: null,
      },
      training_plans: {
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Public plan",
            profile_id: "template-owner-1",
            template_visibility: "public",
            is_system_template: false,
          },
        ],
        error: null,
      },
    });

    const result = await caller.listTrainingPlans({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      content_type: "training_plan",
      content_id: "11111111-1111-4111-8111-111111111111",
      owner_profile_id: "template-owner-1",
      visibility: "public",
      raw: {
        name: "Public plan",
      },
    });
  });
});
