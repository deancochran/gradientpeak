import {
  groupEventActivityPlans,
  groupEventRsvps,
  groupEventSeriesRsvps,
  groupEvents,
  notifications,
} from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import {
  buildGroupEventActivityPlanRow,
  buildGroupEventRow,
  buildGroupEventRsvpRow,
  buildGroupRow,
  GROUP_TEST_IDS,
  GROUP_TEST_NOW,
} from "../../test/builders/groups";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

const VIEWER_ID = GROUP_TEST_IDS.viewerId;
const GROUP_ID = GROUP_TEST_IDS.groupId;
const EVENT_ID = GROUP_TEST_IDS.eventId;
const OPTION_ID = GROUP_TEST_IDS.optionId;
const OTHER_OPTION_ID = GROUP_TEST_IDS.otherOptionId;
const ACTIVITY_PLAN_ID = GROUP_TEST_IDS.activityPlanId;
const ROUTE_ID = "77777777-7777-4777-8777-777777777777";
const NOW = GROUP_TEST_NOW;

function buildActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVITY_PLAN_ID,
    idx: 0,
    created_at: NOW,
    updated_at: NOW,
    profile_id: VIEWER_ID,
    route_id: null,
    name: "Workout Option",
    description: null,
    notes: null,
    activity_category: "ride",
    structure: null,
    version: "1.0",
    template_visibility: "private",
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
    is_public: false,
    likes_count: null,
    ...overrides,
  };
}

function buildActivityRouteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTE_ID,
    idx: 0,
    created_at: NOW,
    updated_at: NOW,
    profile_id: VIEWER_ID,
    name: "Club Loop",
    description: null,
    file_path: "routes/club-loop.fit",
    total_distance: 42000,
    total_ascent: 500,
    total_descent: 500,
    elevation_polyline: null,
    polyline: "abc",
    is_system_template: false,
    is_public: false,
    likes_count: null,
    ...overrides,
  };
}

type DbPlan = {
  select?: unknown[][];
  insertReturning?: unknown[][];
  updateReturning?: unknown[][];
};

function createDbMock(plan: DbPlan = {}) {
  const selectQueue = [...(plan.select ?? [])];
  const insertReturningQueue = [...(plan.insertReturning ?? [])];
  const updateReturningQueue = [...(plan.updateReturning ?? [])];
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];
  const updateCalls: Array<{ table: unknown; values: unknown }> = [];
  const deleteCalls: Array<{ table: unknown }> = [];
  let transactionCount = 0;

  const db: any = {
    select: () => {
      const builder: any = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(selectQueue.shift() ?? []).then(resolve),
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        insertCalls.push({ table, values });
        return {
          returning: async () => insertReturningQueue.shift() ?? [],
          onConflictDoNothing: () => ({
            returning: async () => insertReturningQueue.shift() ?? [],
          }),
          onConflictDoUpdate: () => ({ returning: async () => insertReturningQueue.shift() ?? [] }),
        };
      },
    }),
    delete: (table: unknown) => {
      deleteCalls.push({ table });
      return { where: async () => [] };
    },
    update: (table: unknown) => ({
      set: (values: unknown) => {
        updateCalls.push({ table, values });
        return {
          where: () => ({ returning: async () => updateReturningQueue.shift() ?? [] }),
        };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => {
      transactionCount += 1;
      return callback(db);
    },
  };

  return {
    db,
    insertCalls,
    updateCalls,
    deleteCalls,
    get transactionCount() {
      return transactionCount;
    },
  };
}

function createCaller(db: unknown) {
  return createRouterCaller(groupsRouter, { db, userId: VIEWER_ID });
}

describe("groups.events router", () => {
  it("lists upcoming events from the viewer's active groups with group context", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow() }],
        [],
        [buildGroupEventRsvpRow()],
        [
          buildGroupEventRsvpRow(),
          buildGroupEventRsvpRow({ profile_id: "99999999-9999-4999-8999-999999999999" }),
        ],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.myUpcomingGroupEvents({ startsAfter: NOW.toISOString() });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: EVENT_ID,
      group: {
        id: GROUP_ID,
        name: "Gradient Peak Club",
        slug: "gradient-peak-club",
      },
      acceptedRsvpCount: 2,
      viewerRsvp: { status: "accepted" },
    });
  });

  it("blocks members-only event detail for non-members", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow({ access_level: "members_only" }) }],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.events.detail({ groupEventId: EVENT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view this group",
    } satisfies Partial<TRPCError>);
  });

  it("falls back to series activity plan options for unmodified occurrences", async () => {
    const seriesId = "88888888-8888-4888-8888-888888888888";
    const occurrence = buildGroupEventRow({
      series_id: seriesId,
      occurrence_key: "2026-05-21",
      title: null,
    });
    const series = buildGroupEventRow({ id: seriesId, recurrence_rule: "FREQ=WEEKLY;COUNT=3" });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: occurrence, group: buildGroupRow({ access_level: "members_only" }) }],
        [{ role: "member", status: "active" }],
        [series],
        [buildGroupEventActivityPlanRow({ group_event_id: seriesId })],
        [],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.detail({ groupEventId: EVENT_ID });

    expect(result.event).toMatchObject({
      id: EVENT_ID,
      group: {
        id: GROUP_ID,
        name: "Gradient Peak Club",
        slug: "gradient-peak-club",
      },
      is_recurring_occurrence: true,
      title: "Saturday Ride",
      activityPlanOptions: [{ id: OPTION_ID, activity_plan_id: ACTIVITY_PLAN_ID }],
    });
  });

  it("creates an event and attached activity plan options transactionally", async () => {
    const createdEvent = buildGroupEventRow();
    const createdOption = buildGroupEventActivityPlanRow();
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "admin", status: "active" }],
        [buildActivityPlanRow()],
        [createdOption],
        [],
      ],
      insertReturning: [[createdEvent]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.create({
      groupId: GROUP_ID,
      title: "Saturday Ride",
      startsAt: NOW.toISOString(),
      endsAt: "2026-05-21T14:00:00.000Z",
      timezone: "America/New_York",
      locationName: "Clubhouse",
      activityPlans: [{ activityPlanId: ACTIVITY_PLAN_ID, label: "A Group", sortOrder: 0 }],
    });

    expect(mock.transactionCount).toBe(1);
    expect(result.event).toMatchObject({
      id: EVENT_ID,
      title: "Saturday Ride",
      activityPlanOptions: [{ id: OPTION_ID }],
    });
    expect(mock.insertCalls[0]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      group_id: GROUP_ID,
      created_by_profile_id: VIEWER_ID,
      title: "Saturday Ride",
    });
    expect(mock.deleteCalls[0]).toMatchObject({ table: groupEventActivityPlans });
    expect(mock.insertCalls[1]).toMatchObject({ table: groupEventActivityPlans });
    expect(mock.insertCalls[1]?.values).toMatchObject([
      {
        group_event_id: EVENT_ID,
        activity_plan_id: ACTIVITY_PLAN_ID,
        label: "A Group",
        sort_order: 0,
      },
    ]);
  });

  it("rejects duplicate activity plan options before creating an event", async () => {
    const mock = createDbMock();
    const caller = createCaller(mock.db);

    await expect(
      caller.events.create({
        groupId: GROUP_ID,
        title: "Saturday Ride",
        startsAt: NOW.toISOString(),
        activityPlans: [
          { activityPlanId: ACTIVITY_PLAN_ID, sortOrder: 0 },
          { activityPlanId: ACTIVITY_PLAN_ID, sortOrder: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Activity plan options must be unique",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects group event creation from non-admin members", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "member", status: "active" }]],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.create({
        groupId: GROUP_ID,
        title: "Saturday Ride",
        startsAt: NOW.toISOString(),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group admin access required",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects event creation with activity plans the admin cannot use", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "admin", status: "active" }], []],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.create({
        groupId: GROUP_ID,
        title: "Saturday Ride",
        startsAt: NOW.toISOString(),
        activityPlans: [{ activityPlanId: ACTIVITY_PLAN_ID }],
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Activity plan is not available for this group event",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("allows event creation with public/system resources or resources owned by the admin", async () => {
    const createdEvent = buildGroupEventRow({ route_id: ROUTE_ID });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "admin", status: "active" }],
        [
          buildActivityPlanRow({
            profile_id: "99999999-9999-4999-8999-999999999999",
            template_visibility: "public",
          }),
        ],
        [
          buildActivityRouteRow({
            profile_id: "99999999-9999-4999-8999-999999999999",
            is_system_template: true,
          }),
        ],
        [buildGroupEventActivityPlanRow()],
        [],
      ],
      insertReturning: [[createdEvent]],
    });
    const caller = createCaller(mock.db);

    await caller.events.create({
      groupId: GROUP_ID,
      title: "Saturday Ride",
      startsAt: NOW.toISOString(),
      routeId: ROUTE_ID,
      activityPlans: [{ activityPlanId: ACTIVITY_PLAN_ID }],
    });

    expect(mock.insertCalls[0]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      route_id: ROUTE_ID,
    });
    expect(mock.insertCalls[1]).toMatchObject({ table: groupEventActivityPlans });
  });

  it("materializes bounded recurring event occurrences on series creation", async () => {
    const series = buildGroupEventRow({
      recurrence_rule: "FREQ=WEEKLY;COUNT=3",
      recurrence_timezone: "America/New_York",
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "owner", status: "active" }],
        [],
        [],
        [],
      ],
      insertReturning: [[series]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.createRecurringEventSeries({
      groupId: GROUP_ID,
      title: "Saturday Ride",
      startsAt: NOW.toISOString(),
      endsAt: "2026-05-21T14:00:00.000Z",
      timezone: "America/New_York",
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
    });

    expect(result.event).toMatchObject({ id: EVENT_ID, is_recurring_series: true });
    expect(mock.transactionCount).toBe(1);
    expect(mock.insertCalls[0]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[1]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[1]?.values).toMatchObject([
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-05-21" },
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-05-28" },
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-06-04" },
    ]);
  });

  it("materializes interval recurring event occurrences up to an UNTIL boundary", async () => {
    const series = buildGroupEventRow({
      recurrence_rule: "FREQ=MONTHLY;INTERVAL=2;UNTIL=20260921",
      recurrence_timezone: "America/New_York",
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "owner", status: "active" }],
        [],
        [],
        [],
      ],
      insertReturning: [[series]],
    });
    const caller = createCaller(mock.db);

    await caller.events.createRecurringEventSeries({
      groupId: GROUP_ID,
      title: "Saturday Ride",
      startsAt: NOW.toISOString(),
      endsAt: "2026-05-21T14:00:00.000Z",
      timezone: "America/New_York",
      recurrenceRule: "FREQ=MONTHLY;INTERVAL=2;UNTIL=20260921",
    });

    expect(mock.insertCalls[1]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[1]?.values).toMatchObject([
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-05-21" },
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-07-21" },
      { group_id: GROUP_ID, series_id: EVENT_ID, occurrence_key: "2026-09-21" },
    ]);
  });

  it("rejects unbounded recurring event series", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "owner", status: "active" }]],
      insertReturning: [[buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY" })]],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.createRecurringEventSeries({
        groupId: GROUP_ID,
        title: "Saturday Ride",
        startsAt: NOW.toISOString(),
        timezone: "America/New_York",
        recurrenceRule: "FREQ=WEEKLY",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Recurring events must have an end date",
    } satisfies Partial<TRPCError>);
  });

  it("rejects event detail access for member-only groups without active viewer membership", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow({ access_level: "members_only" }) }],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.events.detail({ groupEventId: EVENT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view this group",
    } satisfies Partial<TRPCError>);
  });

  it("rejects series occurrence listing for one-off events", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [{ event: buildGroupEventRow(), group: buildGroupRow() }]],
    });
    const caller = createCaller(mock.db);

    await expect(caller.events.seriesOccurrences({ groupEventId: EVENT_ID })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
        message: "Group event is not a recurring series",
      } satisfies Partial<TRPCError>,
    );
  });

  it("rejects recurring occurrence listing for non-members of member-only groups", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            event: buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" }),
            group: buildGroupRow({ access_level: "members_only" }),
          },
        ],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.events.seriesOccurrences({ groupEventId: EVENT_ID })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        message: "You don't have permission to view this group",
      } satisfies Partial<TRPCError>,
    );
  });

  it("rejects occurrence-only updates against series roots and one-off events", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            event: buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" }),
            group: buildGroupRow(),
          },
        ],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.updateEventOccurrence({ groupEventId: EVENT_ID, title: "New title" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Group event is not a recurring occurrence",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("returns not found when an occurrence override update has no target row", async () => {
    const occurrence = buildGroupEventRow({
      series_id: "88888888-8888-4888-8888-888888888888",
      occurrence_key: "2026-05-21",
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: occurrence, group: buildGroupRow() }],
        [{ role: "admin", status: "active" }],
      ],
      updateReturning: [[]],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.updateEventOccurrence({ groupEventId: EVENT_ID, title: "Moved ride" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Group event not found",
    } satisfies Partial<TRPCError>);
  });

  it("rejects copying series activity plans to an occurrence from another series", async () => {
    const otherSeriesId = "88888888-8888-4888-8888-888888888888";
    const occurrenceId = "99999999-9999-4999-8999-999999999999";
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            event: buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" }),
            group: buildGroupRow(),
          },
        ],
        [
          {
            event: buildGroupEventRow({
              id: occurrenceId,
              series_id: otherSeriesId,
              occurrence_key: "2026-05-21",
            }),
            group: buildGroupRow(),
          },
        ],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.copySeriesActivityPlansToOccurrence({
        groupEventSeriesId: EVENT_ID,
        groupEventOccurrenceId: occurrenceId,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Occurrence does not belong to the recurring series",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects RSVP selected activity plan options that are not attached to the event", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow() }],
        [{ role: "member", status: "active" }],
        [buildGroupEventActivityPlanRow({ id: OTHER_OPTION_ID })],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.rsvp({
        groupEventId: EVENT_ID,
        status: "accepted",
        selectedGroupEventActivityPlanId: OPTION_ID,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Selected activity plan option is not part of this event",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects public group RSVPs from viewers who are not active members", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [{ event: buildGroupEventRow(), group: buildGroupRow() }], []],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.rsvp({ groupEventId: EVENT_ID, status: "accepted" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Active group membership required to RSVP",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("defaults accepted RSVP to the only attached activity plan option", async () => {
    const option = buildGroupEventActivityPlanRow();
    const acceptedRsvp = buildGroupEventRsvpRow();
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow() }],
        [{ role: "member", status: "active" }],
        [option],
        [option],
        [acceptedRsvp],
      ],
      insertReturning: [[acceptedRsvp]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.rsvp({ groupEventId: EVENT_ID, status: "accepted" });

    expect(result.rsvp).toMatchObject({
      group_event_id: EVENT_ID,
      profile_id: VIEWER_ID,
      status: "accepted",
      selected_group_event_activity_plan_id: OPTION_ID,
    });
    expect(mock.insertCalls[0]).toMatchObject({ table: groupEventRsvps });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      group_event_id: EVENT_ID,
      profile_id: VIEWER_ID,
      status: "accepted",
      selected_group_event_activity_plan_id: OPTION_ID,
    });
  });

  it("denies private group event detail to non-members", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow({ access_level: "members_only" }) }],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.events.detail({ groupEventId: EVENT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view this group",
    } satisfies Partial<TRPCError>);
  });

  it("resolves recurring occurrence fields and activity plans from the series until overridden", async () => {
    const seriesId = "88888888-8888-4888-8888-888888888888";
    const series = buildGroupEventRow({
      id: seriesId,
      title: "Series Ride",
      description: "Series default details",
      recurrence_rule: "FREQ=WEEKLY;COUNT=3",
      route_id: "99999999-9999-4999-8999-999999999999",
    });
    const occurrence = buildGroupEventRow({
      title: "Occurrence Override",
      description: null,
      location_name: "Occurrence Lot",
      route_id: null,
      series_id: seriesId,
      occurrence_key: "2026-05-28",
    });
    const seriesOption = buildGroupEventActivityPlanRow({ group_event_id: seriesId });
    const seriesRsvp = { ...buildGroupEventRsvpRow(), group_event_series_id: seriesId };
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: occurrence, group: buildGroupRow() }],
        [],
        [series],
        [seriesOption],
        [],
        [seriesRsvp],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.detail({ groupEventId: EVENT_ID });

    expect(result.event).toMatchObject({
      id: EVENT_ID,
      title: "Occurrence Override",
      description: "Series default details",
      location_name: "Occurrence Lot",
      route_id: "99999999-9999-4999-8999-999999999999",
      is_recurring_occurrence: true,
      activityPlanOptions: [{ id: OPTION_ID, group_event_id: seriesId }],
      viewerSeriesRsvp: { group_event_series_id: seriesId, status: "accepted" },
    });
  });

  it("clears selected activity plan options when declining an event", async () => {
    const declinedRsvp = buildGroupEventRsvpRow({
      status: "declined",
      selected_group_event_activity_plan_id: null,
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow() }],
        [{ role: "member", status: "active" }],
        [buildGroupEventActivityPlanRow()],
        [buildGroupEventActivityPlanRow()],
        [declinedRsvp],
      ],
      insertReturning: [[declinedRsvp]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.rsvp({
      groupEventId: EVENT_ID,
      status: "declined",
      selectedGroupEventActivityPlanId: OPTION_ID,
    });

    expect(result.rsvp).toMatchObject({
      status: "declined",
      selected_group_event_activity_plan_id: null,
    });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      status: "declined",
      selected_group_event_activity_plan_id: null,
    });
  });

  it("clears an occurrence RSVP when status is null", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: buildGroupEventRow(), group: buildGroupRow() }],
        [{ role: "member", status: "active" }],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.rsvp({ groupEventId: EVENT_ID, status: null });

    expect(result.rsvp).toBeNull();
    expect(result.event).toBeDefined();
    expect(result.event?.viewerRsvp).toBeNull();
    expect(mock.deleteCalls[0]).toMatchObject({ table: groupEventRsvps });
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("clears a series RSVP when status is null", async () => {
    const series = buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: series, group: buildGroupRow() }],
        [{ role: "member", status: "active" }],
        [],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.rsvpEventSeries({
      groupEventSeriesId: EVENT_ID,
      status: null,
    });

    expect(result.rsvp).toBeNull();
    expect(result.event.viewerSeriesRsvp).toBeNull();
    expect(mock.deleteCalls[0]).toMatchObject({ table: groupEventSeriesRsvps });
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects series RSVP attempts against concrete occurrences", async () => {
    const occurrence = buildGroupEventRow({
      series_id: "88888888-8888-4888-8888-888888888888",
      occurrence_key: "2026-05-21",
    });
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [{ event: occurrence, group: buildGroupRow() }]],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.rsvpEventSeries({ groupEventSeriesId: EVENT_ID, status: "accepted" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Group event is not a recurring series",
    } satisfies Partial<TRPCError>);
  });

  it("updates only the selected recurring occurrence as an override", async () => {
    const seriesId = "88888888-8888-4888-8888-888888888888";
    const occurrence = buildGroupEventRow({ series_id: seriesId, occurrence_key: "2026-05-21" });
    const updatedOccurrence = buildGroupEventRow({
      series_id: seriesId,
      occurrence_key: "2026-05-21",
      title: "Saturday Ride - Short Route",
      starts_at: new Date("2026-05-21T13:00:00.000Z"),
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: occurrence, group: buildGroupRow() }],
        [{ role: "admin", status: "active" }],
        [buildGroupEventRow({ id: seriesId, recurrence_rule: "FREQ=WEEKLY;COUNT=3" })],
        [],
        [],
        [],
      ],
      updateReturning: [[updatedOccurrence]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.updateEventOccurrence({
      groupEventId: EVENT_ID,
      title: "Saturday Ride - Short Route",
      startsAt: "2026-05-21T13:00:00.000Z",
    });

    expect(result.event).toMatchObject({
      id: EVENT_ID,
      is_recurring_occurrence: true,
      series_id: seriesId,
      title: "Saturday Ride - Short Route",
    });
    expect(mock.updateCalls).toHaveLength(1);
    expect(mock.updateCalls[0]).toMatchObject({ table: groupEvents });
    expect(mock.updateCalls[0]?.values).toMatchObject({
      starts_at: new Date("2026-05-21T13:00:00.000Z"),
      title: "Saturday Ride - Short Route",
    });
  });

  it("copies series activity plan options to an occurrence without leaking across unrelated series", async () => {
    const seriesId = "88888888-8888-4888-8888-888888888888";
    const occurrenceId = "99999999-9999-4999-8999-999999999999";
    const seriesOption = buildGroupEventActivityPlanRow({ group_event_id: seriesId });
    const copiedOption = buildGroupEventActivityPlanRow({
      id: OTHER_OPTION_ID,
      group_event_id: occurrenceId,
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            event: buildGroupEventRow({ id: seriesId, recurrence_rule: "FREQ=WEEKLY;COUNT=3" }),
            group: buildGroupRow(),
          },
        ],
        [
          {
            event: buildGroupEventRow({
              id: occurrenceId,
              series_id: seriesId,
              occurrence_key: "2026-05-21",
            }),
            group: buildGroupRow(),
          },
        ],
        [{ role: "admin", status: "active" }],
        [seriesOption],
        [copiedOption],
      ],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.copySeriesActivityPlansToOccurrence({
      groupEventOccurrenceId: occurrenceId,
      groupEventSeriesId: seriesId,
    });

    expect(result.activityPlanOptions).toEqual([expect.objectContaining({ id: OTHER_OPTION_ID })]);
    expect(mock.insertCalls[0]).toMatchObject({ table: groupEventActivityPlans });
    expect(mock.insertCalls[0]?.values).toEqual([
      expect.objectContaining({
        activity_plan_id: ACTIVITY_PLAN_ID,
        group_event_id: occurrenceId,
      }),
    ]);
  });

  it("cancels an entire recurring series when requested", async () => {
    const series = buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" });
    const cancelledSeries = buildGroupEventRow({
      recurrence_rule: "FREQ=WEEKLY;COUNT=3",
      cancelled_at: NOW,
    });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ event: series, group: buildGroupRow() }],
        [{ role: "admin", status: "active" }],
        [{ profile_id: VIEWER_ID }, { profile_id: "99999999-9999-4999-8999-999999999999" }],
        [],
        [],
      ],
      updateReturning: [[cancelledSeries]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.events.cancel({ groupEventId: EVENT_ID, scope: "series" });

    expect(result.event).toMatchObject({ id: EVENT_ID, cancelled_at: NOW.toISOString() });
    expect(mock.transactionCount).toBe(1);
    expect(mock.updateCalls).toHaveLength(2);
    expect(mock.updateCalls[0]).toMatchObject({ table: groupEvents });
    expect(mock.updateCalls[1]).toMatchObject({ table: groupEvents });
    expect(mock.insertCalls[0]).toMatchObject({ table: notifications });
    expect(mock.insertCalls[0]?.values).toEqual([
      expect.objectContaining({
        actor_id: VIEWER_ID,
        entity_id: EVENT_ID,
        type: "group_event_cancelled",
        user_id: "99999999-9999-4999-8999-999999999999",
      }),
    ]);
  });

  it("rejects occurrence override updates against recurring series roots", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            event: buildGroupEventRow({ recurrence_rule: "FREQ=WEEKLY;COUNT=3" }),
            group: buildGroupRow(),
          },
        ],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.events.updateEventOccurrence({
        groupEventId: EVENT_ID,
        title: "Single date override",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Group event is not a recurring occurrence",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });
});
