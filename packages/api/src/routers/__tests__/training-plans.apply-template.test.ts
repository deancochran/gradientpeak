import { describe, expect, it, vi } from "vitest";
import { createQueryMapDbMock, type QueryMap } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

function createCaller(queryMap: QueryMap) {
  const { db, callLog } = createQueryMapDbMock(queryMap);

  const caller = trainingPlansRouter.createCaller({
    db: db as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("trainingPlansRouter.applyTemplate", () => {
  it("fails when another scheduled plan exists and replacement was not confirmed", async () => {
    const { caller, callLog } = createCaller({
      events: {
        data: [
          {
            training_plan_id: "22222222-2222-4222-8222-222222222222",
            schedule_batch_id: "33333333-3333-4333-8333-333333333333",
            starts_at: "2026-03-12T00:00:00.000Z",
          },
        ],
        error: null,
      },
      training_plans: {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Current Plan",
          description: null,
          profile_id: "profile-123",
          is_system_template: false,
          template_visibility: "private",
          sessions_per_week_target: 4,
          duration_hours: 9,
          structure: {},
        },
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
      "You already have scheduled sessions from another training plan. Replace them first.",
    );

    expect(
      callLog.find((call) => call.table === "events" && call.operation === "insert"),
    ).toBeUndefined();
  });

  it("replaces the active scheduled batch before creating the new schedule", async () => {
    const { caller, callLog } = createCaller({
      events: [
        {
          data: [
            {
              training_plan_id: "22222222-2222-4222-8222-222222222222",
              schedule_batch_id: "33333333-3333-4333-8333-333333333333",
              starts_at: "2026-03-12T00:00:00.000Z",
            },
          ],
          error: null,
        },
        {
          data: [{ id: "removed-1" }, { id: "removed-2" }],
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
            id: "22222222-2222-4222-8222-222222222222",
            name: "Current Plan",
            description: null,
            profile_id: "profile-123",
            is_system_template: false,
            template_visibility: "private",
            sessions_per_week_target: 4,
            duration_hours: 9,
            structure: {},
          },
          error: null,
        },
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
        data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" }],
        error: null,
      },
    });

    const result = await caller.applyTemplate({
      template_type: "training_plan",
      template_id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-03-10",
      replace_existing: true,
    });

    const insertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    const insertedRows = (insertCall?.payload as Array<Record<string, unknown>>) ?? [];

    expect(result.scheduled_sessions_replaced).toBe(2);
    expect(result.scheduled_sessions_created).toBe(2);
    expect(insertedRows).toHaveLength(2);
  });

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
        data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" }],
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
    expect(result.scheduled_sessions_created).toBe(2);
    expect(typeof result.schedule_batch_id).toBe("string");
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]?.title).toBe("Tempo Builder");
    expect(insertedRows[1]?.title).toBe("Session B");
    expect(insertedRows[0]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[1]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[0]?.training_plan_id).toBe(result.applied_plan_id);
    expect(insertedRows[1]?.training_plan_id).toBe(result.applied_plan_id);
    const createdPlanInsert = callLog.find(
      (call) => call.table === "training_plans" && call.operation === "insert",
    );
    expect(createdPlanInsert).toBeUndefined();
  });

  it("returns explicit scheduled-session removal counts when abandoning an active scheduled set", async () => {
    const { caller } = createCaller({
      events: [
        {
          data: [
            {
              training_plan_id: "11111111-1111-4111-8111-111111111111",
              schedule_batch_id: "33333333-3333-4333-8333-333333333333",
              starts_at: "2026-03-12T00:00:00.000Z",
            },
          ],
          error: null,
        },
        {
          data: [{ id: "future-1" }],
          error: null,
        },
        {
          data: [{ id: "removed-1" }, { id: "removed-2" }],
          error: null,
        },
      ],
      training_plans: {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Current Plan",
          description: null,
          profile_id: "profile-123",
          is_system_template: false,
          template_visibility: "private",
          sessions_per_week_target: 4,
          duration_hours: 9,
          structure: {},
        },
        error: null,
      },
    });

    const result = await caller.updateActivePlanStatus({
      id: "11111111-1111-4111-8111-111111111111",
      status: "abandoned",
    });

    expect(result.scheduled_sessions_removed).toBe(2);
  });

  it("prefers event_title_override over linked activity plan name when scheduling linked sessions", async () => {
    const { caller, callLog } = createCaller({
      events: [
        { data: [], error: null },
        { data: [{ id: "event-1" }], error: null },
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
                  event_title_override: "Race Simulation",
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
              ],
            },
          },
          error: null,
        },
      ],
      activity_plans: {
        data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" }],
        error: null,
      },
    });

    await caller.applyTemplate({
      template_type: "training_plan",
      template_id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-03-10",
    });

    const eventInsertCall = callLog.find(
      (call) => call.table === "events" && call.operation === "insert",
    );
    const insertedRows = (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

    expect(insertedRows[0]?.title).toBe("Race Simulation");
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
        data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Resolved Session" }],
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
          data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" }],
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

  it("supports scheduling only the remaining sessions toward a target date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    try {
      const { caller, callLog } = createCaller({
        events: [
          { data: [], error: null },
          { data: [{ id: "event-1" }], error: null },
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
                sessions: [
                  { offset_days: 0, title: "Session A" },
                  { offset_days: 7, title: "Session B" },
                  { offset_days: 14, title: "Session C" },
                ],
              },
            },
            error: null,
          },
        ],
      });

      const result = await caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
        application_mode: "remaining",
        target_date: "2026-03-20",
      });

      const eventInsertCall = callLog.find(
        (call) => call.table === "events" && call.operation === "insert",
      );
      const insertedRows = (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

      expect(result.scheduled_sessions_created).toBe(1);
      expect(result.scheduled_sessions_skipped).toBe(2);
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]?.starts_at).toBe("2026-03-20T00:00:00.000Z");
      expect(insertedRows[0]?.user_training_plan_id).toBe(result.user_training_plan_id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shifts a grouped scheduled application and updates the application dates", async () => {
    const { caller, callLog } = createCaller({
      user_training_plans: [
        {
          data: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              profile_id: "profile-123",
              training_plan_id: "11111111-1111-4111-8111-111111111111",
              status: "active",
              start_date: "2026-03-10",
              target_date: "2026-03-31",
              snapshot_structure: {},
              created_at: "2026-03-01T00:00:00.000Z",
              updated_at: "2026-03-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      events: {
        data: [
          {
            id: "event-1",
            starts_at: "2026-03-18T00:00:00.000Z",
            ends_at: "2026-03-19T00:00:00.000Z",
          },
          {
            id: "event-2",
            starts_at: "2026-03-20T00:00:00.000Z",
            ends_at: "2026-03-21T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await caller.shiftAppliedSchedule({
      user_training_plan_id: "44444444-4444-4444-8444-444444444444",
      days: 7,
    });

    const eventUpdates = callLog.filter(
      (call) => call.table === "events" && call.operation === "update",
    );
    const applicationUpdate = callLog.find(
      (call) => call.table === "user_training_plans" && call.operation === "update",
    );

    expect(result.affected_count).toBe(2);
    expect(eventUpdates).toHaveLength(2);
    expect((eventUpdates[0]?.payload as Record<string, unknown>)?.starts_at).toEqual(
      new Date("2026-03-25T00:00:00.000Z"),
    );
    expect((applicationUpdate?.payload as Record<string, unknown>)?.start_date).toBe("2026-03-17");
    expect((applicationUpdate?.payload as Record<string, unknown>)?.target_date).toBe("2026-04-07");
  });

  it("removes a grouped scheduled application without touching completed history", async () => {
    const { caller, callLog } = createCaller({
      user_training_plans: {
        data: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            profile_id: "profile-123",
            training_plan_id: "11111111-1111-4111-8111-111111111111",
            status: "active",
            start_date: "2026-03-10",
            target_date: null,
            snapshot_structure: {},
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        error: null,
      },
      events: {
        data: [{ id: "event-1" }, { id: "event-2" }],
        error: null,
      },
    });

    const result = await caller.removeAppliedSchedule({
      user_training_plan_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(result.scheduled_sessions_removed).toBe(2);
    expect(
      callLog.some((call) => call.table === "user_training_plans" && call.operation === "update"),
    ).toBe(true);
  });
});
