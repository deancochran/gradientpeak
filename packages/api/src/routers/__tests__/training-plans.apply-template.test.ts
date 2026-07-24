import { describe, expect, it, vi } from "vitest";
import { createQueryMapDbMock, type QueryMap, type QueryResult } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

const { drainDueWahooPlannedWorkoutJobs, enqueuePlannedWorkoutSyncAfterCalendarMutation } =
  vi.hoisted(() => ({
    drainDueWahooPlannedWorkoutJobs: vi.fn(),
    enqueuePlannedWorkoutSyncAfterCalendarMutation: vi.fn(),
  }));

vi.mock("../../lib/provider-sync/planned-workouts/calendar-mutation-sync", () => ({
  enqueuePlannedWorkoutSyncAfterCalendarMutation,
}));

vi.mock("../../lib/provider-sync/wahoo-planned-workout-drain", () => ({
  drainDueWahooPlannedWorkoutJobs,
}));

function createCaller(queryMap: QueryMap) {
  const trainingPlanResults = queryMap.training_plans;
  const canonicalizeResult = (result: QueryResult): QueryResult => {
    const row = result.data as { id?: string; structure?: Record<string, unknown> } | null;
    const sessions = Array.isArray(row?.structure?.sessions) ? row.structure.sessions : null;
    if (!row?.id || !sessions || row.structure?.version === 1) return result;
    return {
      ...result,
      data: {
        ...row,
        structure: {
          id: row.id,
          version: 1,
          sessions: sessions.map((session) => {
            const value = session as Record<string, unknown>;
            return {
              offset_days: value.offset_days,
              ...(value.activity_plan_id ? { activity_plan_id: value.activity_plan_id } : {}),
              ...(typeof value.title === "string"
                ? { event_overrides: { title: value.title } }
                : {}),
            };
          }),
        },
      },
    };
  };
  const { db, callLog } = createQueryMapDbMock({
    profiles: { data: { planningTimezone: "UTC" }, error: null },
    ...queryMap,
    ...(trainingPlanResults
      ? {
          training_plans: Array.isArray(trainingPlanResults)
            ? trainingPlanResults.map(canonicalizeResult)
            : canonicalizeResult(trainingPlanResults),
        }
      : {}),
  });

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
                  activity_plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                },
              ],
            },
          },
          error: null,
        },
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
      ],
      activity_plans: {
        data: [
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Endurance Builder" },
        ],
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

  it("creates planned events and schedule links with a shared schedule batch", async () => {
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
                  activity_plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                },
              ],
            },
          },
          error: null,
        },
      ],
      activity_plans: {
        data: [
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tempo Builder" },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Endurance Builder" },
        ],
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
    expect(insertedRows[0]?.title).toBe("Session A");
    expect(insertedRows[1]?.title).toBe("Session B");
    expect(insertedRows[0]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[1]?.schedule_batch_id).toBe(result.schedule_batch_id);
    expect(insertedRows[0]?.training_plan_id).toBe(result.applied_plan_id);
    expect(insertedRows[1]?.training_plan_id).toBe(result.applied_plan_id);
    expect(insertedRows.map((row) => row.id)).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(insertedRows[0]?.id).not.toBe(insertedRows[1]?.id);
    expect(insertedRows.map((row) => row.activity_plan_id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    const createdPlanInsert = callLog.find(
      (call) => call.table === "training_plans" && call.operation === "insert",
    );
    expect(createdPlanInsert).toBeUndefined();
  });

  it("returns explicit scheduled-session removal counts when abandoning an active scheduled set", async () => {
    const { caller } = createCaller({
      events: {
        data: [{ id: "removed-1" }, { id: "removed-2" }],
        error: null,
      },
    });

    const result = await caller.removeAppliedSchedule({
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
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
              id: "11111111-1111-4111-8111-111111111111",
              version: 1,
              sessions: [
                {
                  offset_days: 0,
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  event_overrides: {
                    title: "Race Simulation",
                    description: "Stay controlled through halfway.",
                    start_time: "07:30",
                  },
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
    expect(insertedRows[0]?.description).toBe("Stay controlled through halfway.");
    expect(insertedRows[0]?.scheduled_date).toBe("2026-03-10");
    expect(insertedRows[0]?.all_day).toBe(false);
    expect(insertedRows[0]?.starts_at).toEqual(new Date("2026-03-10T07:30:00.000Z"));
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
      "This training plan cannot be scheduled because a linked activity template is unavailable: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("rejects a plan with a schedulable session that has no linked activity plan", async () => {
    const { caller, callLog } = createCaller({
      training_plans: [
        {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Broken Template Plan",
            description: null,
            profile_id: "template-owner",
            is_system_template: false,
            template_visibility: "public",
            structure: {
              start_date: "2026-01-01",
              sessions: [{ offset_days: 0, title: "Unlinked planned session" }],
            },
          },
          error: null,
        },
      ],
    });

    await expect(
      caller.applyTemplate({
        template_type: "training_plan",
        template_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-03-10",
      }),
    ).rejects.toThrow(
      "This training plan cannot be scheduled because its structure is not canonical version 1.",
    );
    expect(callLog.some((call) => call.table === "events" && call.operation === "insert")).toBe(
      false,
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
      "This training plan cannot be scheduled because a linked activity template is unavailable: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
      "This training plan cannot be scheduled because linked activity templates are unavailable: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
      });

      const eventInsertCall = callLog.find(
        (call) => call.table === "events" && call.operation === "insert",
      );
      const insertedRows = (eventInsertCall?.payload as Array<Record<string, unknown>>) ?? [];

      expect(insertedRows[0]?.starts_at).toEqual(new Date("2026-03-15T00:00:00.000Z"));
      expect(insertedRows[1]?.starts_at).toEqual(new Date("2026-03-17T00:00:00.000Z"));
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
                  {
                    offset_days: 0,
                    title: "Session A",
                    activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  },
                  {
                    offset_days: 7,
                    title: "Session B",
                    activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  },
                  {
                    offset_days: 14,
                    title: "Session C",
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
      expect(insertedRows[0]?.starts_at).toEqual(new Date("2026-03-20T00:00:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes a grouped scheduled batch without touching completed history", async () => {
    const { caller } = createCaller({
      events: {
        data: [{ id: "event-1" }, { id: "event-2" }],
        error: null,
      },
    });

    const result = await caller.removeAppliedSchedule({
      schedule_batch_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.scheduled_sessions_removed).toBe(2);
  });

  it("does not delete a schedule batch when the transactional unsync enqueue fails", async () => {
    enqueuePlannedWorkoutSyncAfterCalendarMutation.mockResolvedValueOnce({
      error: "queue unavailable",
      queued: false,
      success: false,
    });
    const { caller, callLog } = createCaller({
      events: { data: [{ id: "event-1" }], error: null },
    });

    await expect(
      caller.removeAppliedSchedule({
        schedule_batch_id: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow("Failed to enqueue planned workout unsync jobs");

    expect(enqueuePlannedWorkoutSyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        drainDueJobs: false,
        eventIds: ["event-1"],
        operation: "unsync",
        transaction: expect.anything(),
      }),
    );
    expect(callLog.some((call) => call.table === "events" && call.operation === "delete")).toBe(
      false,
    );
  });

  it("preserves successful schedule removal when the post-commit drain rejects", async () => {
    drainDueWahooPlannedWorkoutJobs.mockRejectedValueOnce(new Error("worker unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { caller } = createCaller({
      events: { data: [{ id: "event-1" }], error: null },
    });

    await expect(
      caller.removeAppliedSchedule({
        schedule_batch_id: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toMatchObject({ scheduled_sessions_removed: 1, success: true });

    expect(console.error).toHaveBeenCalledWith(
      "Failed to drain planned workout unsync jobs after schedule removal",
      { category: "upstream", provider: "wahoo" },
    );
  });
});
