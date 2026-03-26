import { describe, expect, it } from "vitest";
import { eventsRouter } from "../events";

type QueryResult = {
  data: any;
  error: { message: string } | null;
  count?: number | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "insert" | "update" | "delete" | "filter";
  payload?: unknown;
};

function createEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    idx: 1,
    profile_id: "profile-123",
    event_type: "planned_activity",
    title: "Planned Activity",
    description: null,
    all_day: true,
    timezone: "UTC",
    activity_plan_id: null,
    training_plan_id: null,
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    source_provider: null,
    linked_activity_id: null,
    occurrence_key: "occurrence-1",
    original_starts_at: null,
    notes: null,
    status: "scheduled",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    starts_at: "2026-03-02T00:00:00.000Z",
    ends_at: "2026-03-03T00:00:00.000Z",
    activity_plan: null,
    ...overrides,
  };
}

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
        select: () => builder,
        eq: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "eq", column, value },
          });
          return builder;
        },
        is: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "is", column, value },
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
        in: () => builder,
        not: () => builder,
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
        lte: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "lte", column, value },
          });
          return builder;
        },
        lt: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "lt", column, value },
          });
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        update: (payload: unknown) => {
          callLog.push({ table, operation: "update", payload });
          return builder;
        },
        insert: (payload: unknown) => {
          callLog.push({ table, operation: "insert", payload });
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

  const caller = eventsRouter.createCaller({
    supabase: client as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("eventsRouter generalization", () => {
  it("list returns mixed event types with normalized event_type values", async () => {
    const { caller } = createCaller({
      events: {
        data: [
          createEventRow({ id: "a", event_type: "planned_activity" }),
          createEventRow({ id: "b", event_type: "race" }),
          createEventRow({ id: "c", event_type: "imported" }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await caller.list({ limit: 20, include_adhoc: true });

    expect(result.items.map((item) => item.event_type)).toEqual([
      "planned",
      "race_target",
      "imported",
    ]);
  });

  it("getById returns non-planned events", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000010",
          event_type: "custom",
          title: "Yoga Class",
        }),
        error: null,
      },
    });

    const result = await caller.getById({
      id: "00000000-0000-4000-8000-000000000010",
    });

    expect(result.event_type).toBe("custom");
  });

  it("create keeps legacy planned-workout input behavior", async () => {
    const { caller, callLog } = createCaller({
      activity_plans: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      },
      training_plans: {
        data: null,
        error: null,
      },
      events: {
        data: createEventRow({
          event_type: "planned_activity",
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
        }),
        error: null,
      },
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.create({
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
      scheduled_date: "2026-03-12",
      notes: "steady endurance",
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.table).toBe("events");
    expect((insertCall?.payload as any).event_type).toBe("planned_activity");
    expect(result.event_type).toBe("planned");
    expect(result.legacy_event_type).toBe("planned_activity");
  });

  it("create maps scheduled_date from starts_at using UTC date key", async () => {
    const { caller } = createCaller({
      activity_plans: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      },
      training_plans: {
        data: null,
        error: null,
      },
      events: {
        data: createEventRow({
          starts_at: "2026-03-12T23:30:00-05:00",
          event_type: "planned_activity",
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
        }),
        error: null,
      },
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.create({
      event_type: "planned",
      title: "Evening Run",
      starts_at: "2026-03-12T23:30:00-05:00",
      all_day: false,
      timezone: "America/New_York",
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.scheduled_date).toBe("2026-03-13");
  });

  it("create enforces type-specific rest day rules", async () => {
    const { caller } = createCaller({});

    await expect(
      caller.create({
        event_type: "rest_day",
        title: "Rest",
        starts_at: "2026-04-10T00:00:00.000Z",
        all_day: true,
        timezone: "UTC",
        activity_plan_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow(/activity_plan_id must be omitted when event_type is/);
  });

  it("update supports scoped future mutations", async () => {
    const { caller } = createCaller({
      events: [
        {
          data: createEventRow({
            id: "00000000-0000-4000-8000-000000000020",
            event_type: "custom",
            series_id: "series-1",
            starts_at: "2026-05-01T00:00:00.000Z",
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: "00000000-0000-4000-8000-000000000020",
              event_type: "custom",
              series_id: "series-1",
            }),
            createEventRow({
              id: "00000000-0000-4000-8000-000000000021",
              event_type: "custom",
              series_id: "series-1",
            }),
          ],
          error: null,
        },
      ],
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.update({
      id: "00000000-0000-4000-8000-000000000020",
      scope: "future",
      patch: {
        notes: "move this week",
      },
    });

    expect(result.mutation_scope).toBe("future");
    expect(result.affected_count).toBe(2);
    expect(result.affected_event_ids).toEqual([
      "00000000-0000-4000-8000-000000000020",
      "00000000-0000-4000-8000-000000000021",
    ]);
  });

  it("moving a linked completed planned event clears stale completion linkage", async () => {
    const eventId = "00000000-0000-4000-8000-000000000022";
    const linkedActivityId = "11111111-1111-4111-8111-111111111122";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "planned_activity",
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
            status: "completed",
            linked_activity_id: linkedActivityId,
            starts_at: "2026-05-01T00:00:00.000Z",
            ends_at: "2026-05-02T00:00:00.000Z",
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: eventId,
              event_type: "planned_activity",
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              status: "scheduled",
              linked_activity_id: null,
              starts_at: "2026-05-03T00:00:00.000Z",
              ends_at: "2026-05-04T00:00:00.000Z",
            }),
          ],
          error: null,
        },
      ],
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.update({
      id: eventId,
      scheduled_date: "2026-05-03",
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).starts_at).toBe("2026-05-03T00:00:00.000Z");
    expect((updateCall?.payload as any).ends_at).toBe("2026-05-04T00:00:00.000Z");
    expect((updateCall?.payload as any).linked_activity_id).toBeNull();
    expect((updateCall?.payload as any).status).toBe("scheduled");
    expect((updateCall?.payload as any).activity_plan_id).toBeUndefined();
    expect(result.linked_activity_id).toBeNull();
    expect(result.status).toBe("scheduled");
    expect(result.activity_plan_id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("non-move updates keep completion linkage and status unchanged", async () => {
    const eventId = "00000000-0000-4000-8000-000000000023";
    const linkedActivityId = "11111111-1111-4111-8111-111111111123";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "planned_activity",
            activity_plan_id: "33333333-3333-4333-8333-333333333333",
            status: "completed",
            linked_activity_id: linkedActivityId,
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: eventId,
              event_type: "planned_activity",
              activity_plan_id: "33333333-3333-4333-8333-333333333333",
              notes: "updated note",
              status: "completed",
              linked_activity_id: linkedActivityId,
            }),
          ],
          error: null,
        },
      ],
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.update({
      id: eventId,
      patch: {
        notes: "updated note",
      },
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).notes).toBe("updated note");
    expect((updateCall?.payload as any).linked_activity_id).toBeUndefined();
    expect((updateCall?.payload as any).status).toBeUndefined();
    expect(result.linked_activity_id).toBe(linkedActivityId);
    expect(result.status).toBe("completed");
  });

  it("derives next-day ends_at for all-day updates when only starts_at changes", async () => {
    const eventId = "00000000-0000-4000-8000-000000000024";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "custom",
            all_day: true,
            starts_at: "2026-05-01T00:00:00.000Z",
            ends_at: "2026-05-02T00:00:00.000Z",
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: eventId,
              event_type: "custom",
              all_day: true,
              starts_at: "2026-05-03T00:00:00.000Z",
              ends_at: "2026-05-04T00:00:00.000Z",
            }),
          ],
          error: null,
        },
      ],
      integrations: {
        data: null,
        error: null,
      },
    });

    await caller.update({
      id: eventId,
      scope: "single",
      patch: {
        title: "Planned Activity",
        notes: null,
        all_day: true,
        timezone: "UTC",
        starts_at: "2026-05-03T00:00:00.000Z",
      },
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).starts_at).toBe("2026-05-03T00:00:00.000Z");
    expect((updateCall?.payload as any).ends_at).toBe("2026-05-04T00:00:00.000Z");
  });

  it("delete supports scoped series mutations", async () => {
    const { caller } = createCaller({
      events: [
        {
          data: createEventRow({
            id: "00000000-0000-4000-8000-000000000030",
            event_type: "custom",
            series_id: "series-2",
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: "00000000-0000-4000-8000-000000000030",
              event_type: "custom",
              series_id: "series-2",
            }),
            createEventRow({
              id: "00000000-0000-4000-8000-000000000031",
              event_type: "custom",
              series_id: "series-2",
            }),
          ],
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
      integrations: {
        data: null,
        error: null,
      },
    });

    const result = await caller.delete({
      id: "00000000-0000-4000-8000-000000000030",
      scope: "series",
    });

    expect(result.success).toBe(true);
    expect(result.mutation_scope).toBe("series");
    expect(result.affected_count).toBe(2);
  });

  it("blocks mutable update for imported events", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000040",
          event_type: "imported",
        }),
        error: null,
      },
    });

    await expect(
      caller.update({
        id: "00000000-0000-4000-8000-000000000040",
        patch: { notes: "should fail" },
      }),
    ).rejects.toThrow("Imported events are read-only");
  });

  it("links an event to a completed activity", async () => {
    const eventId = "00000000-0000-4000-8000-000000000050";
    const activityId = "11111111-1111-4111-8111-111111111150";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            status: "scheduled",
            linked_activity_id: null,
          }),
          error: null,
        },
        {
          data: createEventRow({
            id: eventId,
            status: "completed",
            linked_activity_id: activityId,
          }),
          error: null,
        },
      ],
      activities: {
        data: { id: activityId },
        error: null,
      },
    });

    const result = await caller.linkCompletion({
      event_id: eventId,
      activity_id: activityId,
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).linked_activity_id).toBe(activityId);
    expect((updateCall?.payload as any).status).toBe("completed");
    expect(result.linked_activity_id).toBe(activityId);
  });

  it("unlinks a previously linked completion", async () => {
    const eventId = "00000000-0000-4000-8000-000000000051";
    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            status: "completed",
            linked_activity_id: "11111111-1111-4111-8111-111111111151",
          }),
          error: null,
        },
        {
          data: createEventRow({
            id: eventId,
            status: "scheduled",
            linked_activity_id: null,
          }),
          error: null,
        },
      ],
    });

    const result = await caller.unlinkCompletion({ event_id: eventId });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).linked_activity_id).toBeNull();
    expect((updateCall?.payload as any).status).toBe("scheduled");
    expect(result.linked_activity_id).toBeNull();
  });

  it("linkCompletion returns not found when event does not exist", async () => {
    const { caller } = createCaller({
      events: { data: null, error: { message: "missing" } },
    });

    await expect(
      caller.linkCompletion({
        event_id: "00000000-0000-4000-8000-000000000052",
        activity_id: "11111111-1111-4111-8111-111111111152",
      }),
    ).rejects.toThrow("Event not found");
  });

  it("unlinkCompletion returns not found when event does not exist", async () => {
    const { caller } = createCaller({
      events: { data: null, error: { message: "missing" } },
    });

    await expect(
      caller.unlinkCompletion({
        event_id: "00000000-0000-4000-8000-000000000056",
      }),
    ).rejects.toThrow("Event not found");
  });

  it("blocks completion linking for imported events", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000053",
          event_type: "imported",
        }),
        error: null,
      },
    });

    await expect(
      caller.linkCompletion({
        event_id: "00000000-0000-4000-8000-000000000053",
        activity_id: "11111111-1111-4111-8111-111111111153",
      }),
    ).rejects.toThrow("Imported events are read-only");
  });

  it("blocks completion unlinking for imported events", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000055",
          event_type: "imported",
        }),
        error: null,
      },
    });

    await expect(
      caller.unlinkCompletion({
        event_id: "00000000-0000-4000-8000-000000000055",
      }),
    ).rejects.toThrow("Imported events are read-only");
  });

  it("status resolution prefers explicit linkage when present", async () => {
    const { caller } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "00000000-0000-4000-8000-000000000054",
            status: "scheduled",
            linked_activity_id: "11111111-1111-4111-8111-111111111154",
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await caller.list({ limit: 20, include_adhoc: true });
    expect(result.items[0]?.status).toBe("completed");
  });

  it("list applies UTC-safe date boundaries for timestamp inputs", async () => {
    const { caller, callLog } = createCaller({
      events: { data: [], error: null },
      activities: { data: [], error: null },
    });

    await caller.list({
      limit: 20,
      include_adhoc: true,
      date_from: "2026-03-10T23:30:00-05:00",
      date_to: "2026-03-12T01:00:00+09:00",
    });

    const rangeFilters = callLog
      .filter((call) => call.table === "events" && call.operation === "filter")
      .map((call) => call.payload as { type?: string; column?: string; value?: unknown });

    expect(rangeFilters).toContainEqual({
      type: "gte",
      column: "starts_at",
      value: "2026-03-11T00:00:00.000Z",
    });
    expect(rangeFilters).toContainEqual({
      type: "lt",
      column: "starts_at",
      value: "2026-03-12T00:00:00.000Z",
    });
  });

  it("rejects recurrence exceptions until persistence supports them", async () => {
    const { caller } = createCaller({
      activity_plans: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      },
    });

    await expect(
      caller.create({
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        scheduled_date: "2026-06-01",
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1",
          timezone: "UTC",
          exdates: ["2026-06-08"],
        },
      }),
    ).rejects.toThrow("Recurrence exdates/exceptions are not yet supported");
  });

  it("reconcileHistoricalCompletions dry-run reports matches without persisting", async () => {
    const eventId = "00000000-0000-4000-8000-000000000060";
    const activityId = "11111111-1111-4111-8111-111111111160";

    const { caller, callLog } = createCaller({
      events: {
        data: [
          createEventRow({
            id: eventId,
            starts_at: "2026-01-05T00:00:00.000Z",
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
            linked_activity_id: null,
            status: "scheduled",
          }),
        ],
        error: null,
      },
      activities: {
        data: [
          {
            id: activityId,
            started_at: "2026-01-05T18:00:00.000Z",
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
        error: null,
      },
    });

    const result = await caller.reconcileHistoricalCompletions({
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      limit: 50,
      dry_run: true,
    });

    expect(result.counts).toEqual({
      scanned: 1,
      matched: 1,
      updated: 0,
      skipped: 0,
    });
    expect(result.sample_ids.matched_event_ids).toContain(eventId);
    expect(result.sample_ids.updated_event_ids).toEqual([]);
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("reconcileHistoricalCompletions update mode writes linked_activity_id and completed status", async () => {
    const eventId = "00000000-0000-4000-8000-000000000061";
    const activityId = "11111111-1111-4111-8111-111111111161";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: [
            createEventRow({
              id: eventId,
              starts_at: "2026-01-06T00:00:00.000Z",
              activity_plan_id: "33333333-3333-4333-8333-333333333333",
              linked_activity_id: null,
              status: "scheduled",
            }),
          ],
          error: null,
        },
        {
          data: {
            id: eventId,
            training_plan_id: null,
            starts_at: "2026-01-06T00:00:00.000Z",
            updated_at: "2026-01-06T20:00:00.000Z",
          },
          error: null,
        },
      ],
      activities: {
        data: [
          {
            id: activityId,
            started_at: "2026-01-06T20:00:00.000Z",
            activity_plan_id: "33333333-3333-4333-8333-333333333333",
          },
        ],
        error: null,
      },
    });

    const result = await caller.reconcileHistoricalCompletions({
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      limit: 50,
      dry_run: false,
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).linked_activity_id).toBe(activityId);
    expect((updateCall?.payload as any).status).toBe("completed");
    expect(result.counts).toEqual({
      scanned: 1,
      matched: 1,
      updated: 1,
      skipped: 0,
    });
    expect(result.sample_ids.updated_event_ids).toContain(eventId);
  });

  it("reconcileHistoricalCompletions leaves already-linked events untouched", async () => {
    const { caller, callLog } = createCaller({
      events: {
        data: [],
        error: null,
      },
      activities: {
        data: [
          {
            id: "11111111-1111-4111-8111-111111111163",
            started_at: "2026-01-07T07:00:00.000Z",
            activity_plan_id: null,
          },
        ],
        error: null,
      },
    });

    const result = await caller.reconcileHistoricalCompletions({
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      limit: 50,
      dry_run: false,
    });

    expect(result.counts).toEqual({
      scanned: 0,
      matched: 0,
      updated: 0,
      skipped: 0,
    });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);

    const linkedFilter = callLog.some(
      (call) =>
        call.table === "events" &&
        call.operation === "filter" &&
        (call.payload as any)?.type === "is" &&
        (call.payload as any)?.column === "linked_activity_id" &&
        (call.payload as any)?.value === null,
    );
    expect(linkedFilter).toBe(true);
  });
});
