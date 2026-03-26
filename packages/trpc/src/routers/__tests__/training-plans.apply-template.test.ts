import { describe, expect, it, vi } from "vitest";
import { trainingPlansRouter } from "../planning/training-plans";

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
      events: [
        {
          data: [],
          error: null,
        },
        {
          data: [{ id: "event-1" }, { id: "event-2" }],
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
            sessions_per_week_target: 4,
            duration_hours: 9,
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
    });

    const result = await caller.applyTemplate({
      template_type: "training_plan",
      template_id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-03-10",
    });

    const eventInsertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    const insertedRows = (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

    expect(result.applied_plan_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.created_event_count).toBe(2);
    expect(typeof result.schedule_batch_id).toBe("string");
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[1]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[0]?.training_plan_id).toBe(result.applied_plan_id);
    expect(insertedRows[1]?.training_plan_id).toBe(result.applied_plan_id);
    const createdPlanInsert = callLog.find(
      (call) => call.table === "training_plans" && call.operation === "insert",
    );
    expect(createdPlanInsert).toBeUndefined();
  });

  it("fails when no schedulable event rows can be created", async () => {
    const { caller } = createCaller({
      events: {
        data: [],
        error: null,
      },
      training_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Template Plan",
            description: null,
            profile_id: "template-owner",
            is_system_template: false,
            template_visibility: "public",
            sessions_per_week_target: 4,
            duration_hours: 9,
            structure: {
              start_date: "2026-01-01",
              sessions: [
                {
                  offset_days: 0,
                  title: "Session A",
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
              ],
            },
          },
          error: null,
        },
      ],
      activity_plans: {
        data: [],
        error: null,
      },
    });

    await expect(
      caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-03-10",
      }),
    ).rejects.toThrow(
      "This training plan could not be scheduled because its linked activities are not available to your account.",
    );
  });

  it("fails explicitly when a system template has some unresolved linked activity templates", async () => {
    const { caller, callLog } = createCaller({
      events: {
        data: [],
        error: null,
      },
      training_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "System Template Plan",
            description: null,
            profile_id: null,
            is_system_template: true,
            template_visibility: "public",
            sessions_per_week_target: 4,
            duration_hours: 9,
            structure: {
              start_date: "2026-01-01",
              sessions: [
                {
                  offset_days: 0,
                  title: "Resolved Session",
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                {
                  offset_days: 2,
                  title: "Missing Session",
                  activity_plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
    });

    await expect(
      caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-03-10",
      }),
    ).rejects.toThrow(
      "This system training plan cannot be scheduled because a linked activity template is unavailable: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );

    const eventInsertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    expect(eventInsertCall).toBeUndefined();
  });

  it("fails explicitly when a system template has no resolvable linked activity templates", async () => {
    const { caller, callLog } = createCaller({
      events: {
        data: [],
        error: null,
      },
      training_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "System Template Plan",
            description: null,
            profile_id: null,
            is_system_template: true,
            template_visibility: "public",
            sessions_per_week_target: 4,
            duration_hours: 9,
            structure: {
              start_date: "2026-01-01",
              sessions: [
                {
                  offset_days: 0,
                  title: "Missing Session A",
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                {
                  offset_days: 2,
                  title: "Missing Session B",
                  activity_plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                },
              ],
            },
          },
          error: null,
        },
      ],
      activity_plans: {
        data: [],
        error: null,
      },
    });

    await expect(
      caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-03-10",
      }),
    ).rejects.toThrow(
      "This system training plan cannot be scheduled because linked activity templates are unavailable: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );

    const eventInsertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    expect(eventInsertCall).toBeUndefined();
  });

  it("uses today as the fallback schedule anchor when no start or target date is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    try {
      const { caller, callLog } = createCaller({
        events: [
          {
            data: [],
            error: null,
          },
          {
            data: [{ id: "event-1" }, { id: "event-2" }],
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
              sessions_per_week_target: 4,
              duration_hours: 9,
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
      });

      await caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
      });

      const eventInsertCall = callLog.find(
        (call) => call.table === "events" && call.operation === "insert",
      );
      const insertedRows = (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

      expect(insertedRows[0]?.starts_at).toBe("2026-03-15T00:00:00.000Z");
      expect(insertedRows[1]?.starts_at).toBe("2026-03-17T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
