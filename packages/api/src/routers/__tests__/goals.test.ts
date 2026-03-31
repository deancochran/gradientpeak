import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { goalsRouter } from "../goals";

type QueryResult = {
  data: any;
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

function createSupabaseMock(queryMap: QueryMap) {
  const counters = new Map<string, number>();
  const callLog: Array<{
    table: string;
    operation: string;
    payload?: unknown;
  }> = [];

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: null, error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);

    return entry[index] ?? entry[entry.length - 1] ?? { data: null, error: null };
  };

  const client = {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: () => builder,
        insert: (payload: unknown) => {
          callLog.push({ table, operation: "insert", payload });
          return builder;
        },
        update: (payload: unknown) => {
          callLog.push({ table, operation: "update", payload });
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

function createCaller(params?: { userId?: string; queryMap?: QueryMap }) {
  const { userId, queryMap = {} } = params ?? {};
  const { client, callLog } = createSupabaseMock(queryMap);

  const caller = goalsRouter.createCaller({
    supabase: client as any,
    session: { user: { id: userId ?? "11111111-1111-4111-8111-111111111111" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("goalsRouter", () => {
  it("allows profile owner to list goals", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      userId: profileId,
      queryMap: {
        profile_goals: {
          data: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              profile_id: profileId,
              milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              title: "10K Goal",
              priority: 7,
              activity_category: "run",
              target_payload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 3000,
              },
            },
          ],
          error: null,
        },
      },
    });

    const result = await caller.list({
      profile_id: profileId,
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(1);
  });

  it("allows authorized coach to list goals", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      userId: "22222222-2222-4222-8222-222222222222",
      queryMap: {
        coaches_athletes: {
          data: { coach_id: "22222222-2222-4222-8222-222222222222" },
          error: null,
        },
        profile_goals: {
          data: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              profile_id: profileId,
              milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              title: "Coach Goal",
              priority: 5,
              activity_category: "bike",
              target_payload: {
                type: "threshold",
                metric: "power",
                activity_category: "bike",
                value: 280,
                test_duration_s: 1200,
              },
            },
          ],
          error: null,
        },
      },
    });

    const result = await caller.list({
      profile_id: profileId,
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(1);
  });

  it("rejects unauthorized profile goal reads", async () => {
    const { caller } = createCaller({
      userId: "33333333-3333-4333-8333-333333333333",
      queryMap: {
        coaches_athletes: { data: null, error: null },
      },
    });

    await expect(
      caller.list({
        profile_id: "11111111-1111-4111-8111-111111111111",
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });

  it("updates an existing goal and returns cache tags", async () => {
    const { caller } = createCaller({
      userId: "11111111-1111-4111-8111-111111111111",
      queryMap: {
        profile_goals: [
          {
            data: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              profile_id: "11111111-1111-4111-8111-111111111111",
              milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              title: "Original Goal",
              priority: 5,
              activity_category: "run",
              target_payload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 3300,
              },
            },
            error: null,
          },
          {
            data: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              profile_id: "11111111-1111-4111-8111-111111111111",
              title: "Updated Goal",
              milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              priority: 5,
              activity_category: "run",
              target_payload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 3150,
              },
            },
            error: null,
          },
        ],
      },
    });

    const result = await caller.update({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      data: {
        title: "Updated Goal",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10000,
          target_time_s: 3150,
        },
      },
    });

    expect(result.title).toBe("Updated Goal");
    expect(result.cache_tags).toContain("goals.list");
  });

  it("surfaces database error context when goal create fails", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      userId: profileId,
      queryMap: {
        profile_goals: {
          data: null,
          error: {
            code: "PGRST204",
            message:
              "Could not find the 'target_date' column of 'profile_goals' in the schema cache",
          },
        },
      },
    });

    await expect(
      caller.create({
        profile_id: profileId,
        milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        title: "A Goal",
        priority: 5,
        activity_category: "run",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1500,
        },
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Failed to create goal: [PGRST204] Could not find the 'target_date' column of 'profile_goals' in the schema cache",
    } as Partial<TRPCError>);
  });

  it("writes canonical goal fields on create", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller, callLog } = createCaller({
      userId: profileId,
      queryMap: {
        profile_goals: {
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            profile_id: profileId,
            milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            title: "Canonical Goal",
            priority: 6,
            activity_category: "run",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          },
          error: null,
        },
      },
    });

    await caller.create({
      profile_id: profileId,
      milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      title: "Canonical Goal",
      priority: 6,
      activity_category: "run",
      target_payload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
      },
    });

    expect(callLog).toContainEqual({
      table: "profile_goals",
      operation: "insert",
      payload: {
        profile_id: profileId,
        milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        title: "Canonical Goal",
        priority: 6,
        activity_category: "run",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1500,
        },
      },
    });
  });
});
