import { activityPlanStructureSchema, SYSTEM_TEMPLATES } from "@repo/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateActivityPlan,
  estimateActivityPlans,
} from "../../application/activity-plans/estimate-activity-plans";
import { deleteEventUseCase } from "../../application/events/deleteEventUseCase";
import { readSelectedGroupEventsForCalendar } from "../../application/groups/groupEventViews";
import {
  EventCurrentPlanUpdateConflict,
  EventPlanReplacementCompletionConflict,
} from "../../infrastructure/repositories/drizzle-event-write-repository";

const { drainDueWahooPlannedActivityJobs, enqueueWahooPlannedActivitySyncAfterCalendarMutation } =
  vi.hoisted(() => ({
    drainDueWahooPlannedActivityJobs: vi.fn(),
    enqueueWahooPlannedActivitySyncAfterCalendarMutation: vi.fn(),
  }));

vi.mock("../../lib/provider-sync/planned-activities/wahoo-calendar-mutation-sync", () => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation,
}));

vi.mock("../../lib/provider-sync/wahoo-planned-activity-drain", () => ({
  drainDueWahooPlannedActivityJobs,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createEventReadRepository: vi.fn((db: MockDb) => db.readRepository),
  createEventWriteRepository: vi.fn((db: MockDb) => db.writeRepository),
  createEventCompletionRepository: vi.fn((db: MockDb) => db.completionRepository),
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      listByProfileId: vi.fn(async () => []),
    },
  })),
  createWahooSyncRepository: vi.fn(() => ({
    enqueueJob: vi.fn(async () => ({ id: "job-1", status: "queued" })),
    touchSyncState: vi.fn(async () => undefined),
  })),
  createWahooRepository: vi.fn(() => ({
    createEventResourceLink: vi.fn(async () => undefined),
    deleteEventResourceLink: vi.fn(async () => undefined),
    findWahooIntegrationByProfileId: vi.fn(async () => null),
    getPlannedEventForSync: vi.fn(async () => null),
    getRouteForSync: vi.fn(async () => null),
    getEventResourceLink: vi.fn(async () => null),
    listEventResourceLinks: vi.fn(async () => []),
    updateEventResourceLink: vi.fn(async () => undefined),
  })),
}));

vi.mock("../../application/activity-plans/estimate-activity-plans", () => ({
  estimateActivityPlan: vi.fn(async (plan: any) => ({
    ...plan,
    prescriptionQuantification: plan.prescriptionQuantification ?? null,
    route: plan.route ?? null,
  })),
  estimateActivityPlans: vi.fn(async (plans: any[]) =>
    plans.map((plan) => ({
      ...plan,
      prescriptionQuantification: plan.prescriptionQuantification ?? null,
      route: plan.route ?? null,
    })),
  ),
}));

vi.mock("../../application/groups/groupEventViews", () => ({
  readSelectedGroupEventsForCalendar: vi.fn(async () => ({ items: [], truncated: false })),
}));

vi.mock("../../utils/profile-identity", () => ({
  loadProfileIdentityMap: vi.fn(
    async (_db: any, profileIds: Array<string | null | undefined>) =>
      new Map(
        profileIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => [id, { id, username: `user-${id.slice(0, 4)}`, avatar_url: null }]),
      ),
  ),
}));

import { calendarRouter, eventsRouter } from "../events";

type QueryResult = {
  data: any;
  error: { message: string } | null;
  count?: number | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

function constraintQueryMap(): QueryMap {
  return {
    training_plans: {
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        structure: {
          target_weekly_load_max: 100,
          target_activities_per_week: 7,
          max_consecutive_days: 7,
          min_rest_days_per_week: 0,
        },
      },
      error: null,
    },
    activity_plans: {
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        activity_category: "bike",
        structure: createActivityPlanStructure("bike"),
        route_id: null,
      },
      error: null,
    },
    profiles: { data: { id: "profile-123", dob: null }, error: null },
    activity_efforts: { data: null, error: null },
    profile_metrics: [
      { data: null, error: null },
      { data: null, error: null },
    ],
    events: [
      { data: [], error: null },
      { data: [], error: null },
    ],
  };
}

type QueryCall = {
  table: string;
  operation: "batch" | "insert" | "update" | "delete" | "filter";
  payload?: unknown;
};

type MockDb = {
  callLog: QueryCall[];
  completionRepository: ReturnType<typeof createCompletionRepository>;
  counters: Map<string, number>;
  queryMap: QueryMap;
  readRepository: ReturnType<typeof createReadRepository>;
  select: () => {
    from: () => {
      where: () => { limit: () => Promise<Array<{ planningTimezone: string | null }>> };
    };
  };
  writeRepository: ReturnType<typeof createWriteRepository>;
};

function createEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    profile_id: "profile-123",
    event_type: "planned",
    title: "Planned Activity",
    description: null,
    all_day: true,
    timezone: "UTC",
    activity_plan_id: null,
    route_id: null,
    training_plan_id: null,
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    linked_activity_id: null,
    occurrence_key: "occurrence-1",
    original_starts_at: null,
    notes: null,
    status: "scheduled",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    starts_at: "2026-03-02T00:00:00.000Z",
    ends_at: "2026-03-03T00:00:00.000Z",
    scheduled_date: "2026-03-02",
    activity_plan: null,
    ...overrides,
  };
}

function createActivityPlanStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 3,
    activity_category,
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
      name: `${activity_category} segment`,
      intervals: [
        {
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    })),
  };
}

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "profile-1",
    name: "Activity plan",
    description: null,
    notes: null,
    structure: createActivityPlanStructure("run"),
    structure_hash: "test-structure-hash",
    revision: 1,
    gps_recording_enabled: true,
    content_visibility: "private",
    is_system_template: false,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function createLegacyCompositionStructure() {
  return {
    version: 3,
    segments: createActivityPlanStructure("bike", 2).segments.map((segment, index) => ({
      ...segment,
      activity_category: index === 0 ? "bike" : "run",
    })),
  };
}

function createMockDb(queryMap: QueryMap): MockDb {
  const callLog: QueryCall[] = [];
  const counters = new Map<string, number>();
  const profile =
    queryMap.profiles && !Array.isArray(queryMap.profiles) ? queryMap.profiles.data : null;
  const planningTimezone =
    profile && typeof profile === "object" && "planningTimezone" in profile
      ? ((profile as { planningTimezone?: string | null }).planningTimezone ?? null)
      : "America/New_York";

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: [], error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);
    return entry[index] ?? entry[entry.length - 1] ?? { data: [], error: null };
  };

  const logFilter = (table: string, type: string, column: string, value: unknown) => {
    callLog.push({ table, operation: "filter", payload: { type, column, value } });
  };

  const readRepository = createReadRepository({ nextResult, logFilter, callLog });
  const writeRepository = createWriteRepository({ nextResult, callLog });
  const completionRepository = createCompletionRepository({ nextResult, callLog, logFilter });

  return {
    queryMap,
    callLog,
    counters,
    readRepository,
    writeRepository,
    completionRepository,
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ planningTimezone }] }),
      }),
    }),
  };
}

function createCaller(queryMap: QueryMap) {
  const db = createMockDb(queryMap);
  const context = {
    db: db as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any;
  const eventCaller = eventsRouter.createCaller(context);
  const calendarCaller = calendarRouter.createCaller(context);

  return { caller: eventCaller, calendarCaller, callLog: db.callLog };
}

function createReadRepository(params: {
  callLog: QueryCall[];
  nextResult: (table: string) => QueryResult;
  logFilter: (table: string, type: string, column: string, value: unknown) => void;
}) {
  return {
    async countOwnedEventsInRange(input: { startsAtGte: string; startsAtLt: string }) {
      params.logFilter("events", "gte", "starts_at", input.startsAtGte);
      params.logFilter("events", "lt", "starts_at", input.startsAtLt);
      return params.nextResult("events").count ?? 0;
    },
    async getOwnedEventById() {
      return params.nextResult("events").data ?? null;
    },
    async getValidateConstraintsInputs() {
      return {
        trainingPlan: params.nextResult("training_plans").data ?? null,
        activityPlan: params.nextResult("activity_plans").data ?? null,
        profile: params.nextResult("profiles").data ?? null,
        best20mPower: params.nextResult("activity_efforts").data ?? null,
        lthrMetric: params.nextResult("profile_metrics").data ?? null,
        weightMetric: params.nextResult("profile_metrics").data ?? null,
      };
    },
    async getAccessibleTrainingPlanProjection() {
      return {
        actualActivities: [],
        plannedActivities: [],
        trainingPlan: null,
      };
    },
    async listCompletedActivitiesInRange() {
      return params.nextResult("activities").data ?? [];
    },
    async listCalendarCompletedActivities(input: { startedAtGte: string; startedAtLt: string }) {
      params.callLog.push({
        table: "calendar_activities",
        operation: "batch",
        payload: input,
      });
      return params.nextResult("calendar_activities").data ?? [];
    },
    async listCalendarCompletedActivitiesByIds(input: { activityIds: string[] }) {
      params.callLog.push({
        table: "calendar_linked_activities",
        operation: "batch",
        payload: input,
      });
      return params.nextResult("calendar_linked_activities").data ?? [];
    },
    async listCalendarGoals() {
      return params.nextResult("calendar_goals").data ?? [];
    },
    async listCalendarGroupActivityPlans() {
      return params.nextResult("calendar_group_activity_plans").data ?? [];
    },
    async listOwnedEvents(input: {
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      planningTimezone?: string;
    }) {
      params.callLog.push({ table: "events", operation: "batch", payload: input });
      if (input.limit) {
        params.logFilter("events", "limit", "limit", input.limit);
      }
      if (input.dateFrom) {
        params.logFilter("events", "gte", "starts_at", input.dateFrom);
      }
      if (input.dateTo) {
        params.logFilter("events", "lt", "starts_at", input.dateTo);
      }
      return params.nextResult("events").data ?? [];
    },
    async listPlannedEventDatesInRange() {
      return params.nextResult("events").data ?? [];
    },
    async listOwnedPlannedEventsForDay(input: { date: string; limit: number; profileId: string }) {
      params.logFilter("events", "eq", "scheduled_date", input.date);
      params.logFilter("events", "eq", "profile_id", input.profileId);
      params.logFilter("events", "limit", "limit", input.limit);
      return params.nextResult("events").data ?? [];
    },
  };
}

function createWriteRepository(params: {
  nextResult: (table: string) => QueryResult;
  callLog: QueryCall[];
}) {
  const createEvent = (input: Record<string, unknown>) => ({
    table: "events",
    operation: "insert" as const,
    payload: {
      event_type: input.eventType,
      title: input.title,
      all_day: input.allDay,
      timezone: input.timezone,
      starts_at: input.startsAt,
      scheduled_date: input.scheduledDate,
      ends_at: input.endsAt,
      status: input.status,
      activity_plan_id: input.activityPlanId,
      route_id: input.routeId,
      training_plan_id: input.trainingPlanId,
      notes: input.notes,
      description: input.description,
      recurrence_rule: input.recurrenceRule,
      recurrence_timezone: input.recurrenceTimezone,
      series_id: input.seriesId,
      occurrence_key: input.occurrenceKey,
      original_starts_at: input.originalStartsAt,
    },
  });

  return {
    async createOwnedEvent(input: Record<string, unknown>) {
      params.callLog.push(createEvent(input));
      return params.nextResult("events").data;
    },
    async createOwnedEvents(input: {
      anchor: Record<string, unknown>;
      occurrences: Record<string, unknown>[];
    }) {
      params.callLog.push({ table: "events", operation: "batch" });
      const stagedCalls: QueryCall[] = [];
      const createdEvents: Record<string, unknown>[] = [];

      for (const [index, eventInput] of [input.anchor, ...input.occurrences].entries()) {
        const result = params.nextResult("events");
        if (result.error) throw new Error(result.error.message);

        const resolvedInput =
          index === 0 ? eventInput : { ...eventInput, seriesId: createdEvents[0]?.id };
        stagedCalls.push(createEvent(resolvedInput));
        createdEvents.push(result.data);
      }

      params.callLog.push(...stagedCalls);
      return createdEvents;
    },
    async getAccessibleActivityPlan() {
      const plan = params.nextResult("activity_plans").data as { structure?: unknown } | null;
      return plan ? { ...plan, structure: plan.structure ?? SYSTEM_TEMPLATES[0]?.structure } : null;
    },
    async getActivityPlanById() {
      const plan = params.nextResult("activity_plans").data as { structure?: unknown } | null;
      return plan ? { ...plan, structure: plan.structure ?? SYSTEM_TEMPLATES[0]?.structure } : null;
    },
    async getAccessibleActivityRoute() {
      return params.nextResult("activity_routes").data ?? null;
    },
    async getOwnedTrainingPlan() {
      return params.nextResult("training_plans").data ?? null;
    },
    async listOwnedEventsForSeries() {
      return params.nextResult("event_series").data ?? [];
    },
    async updateOwnedEventsForScope(input: {
      eventUpdates: Record<string, unknown>;
      rejectPlanReplacementWithCompletion?: boolean;
      scope: "single" | "future" | "series";
    }) {
      const scopedEvents = params.nextResult("scoped_events").data as Array<
        Record<string, unknown>
      >;
      if (
        input.rejectPlanReplacementWithCompletion &&
        scopedEvents.some(
          (event) =>
            event.activity_plan_id !== input.eventUpdates.activity_plan_id &&
            (event.linked_activity_id !== null || event.status === "completed"),
        )
      ) {
        throw new EventPlanReplacementCompletionConflict();
      }
      if (
        scopedEvents.some(
          (event) =>
            event.activity_plan_id !== null &&
            (("activity_plan_structure" in event &&
              !activityPlanStructureSchema.safeParse(event.activity_plan_structure).success) ||
              event.activity_plan_unavailable === true),
        )
      ) {
        throw new EventCurrentPlanUpdateConflict();
      }
      params.callLog.push({
        table: "events",
        operation: "update",
        payload: input.eventUpdates,
      });
      if (scopedEvents.length > 0) {
        for (const event of scopedEvents) {
          Object.assign(event, input.eventUpdates);
        }
        return scopedEvents;
      }
      return params.nextResult("events").data ?? [];
    },
  };
}

function createCompletionRepository(params: {
  nextResult: (table: string) => QueryResult;
  callLog: QueryCall[];
  logFilter: (table: string, type: string, column: string, value: unknown) => void;
}) {
  return {
    async deleteOwnedEventsForScope(input: {
      beforeDelete?: (input: {
        candidates: Array<Record<string, unknown>>;
        tx: unknown;
      }) => Promise<void>;
    }) {
      const candidates = params.nextResult("events").data ?? [];
      await input.beforeDelete?.({ candidates, tx: {} });
      params.callLog.push({ table: "events", operation: "delete" });
      return candidates;
    },
    async getOwnedActivityForCompletion() {
      return params.nextResult("activities").data ?? null;
    },
    async getOwnedEventForCompletion() {
      return params.nextResult("events").data ?? null;
    },
    async linkHistoricalCompletionIfEligible(input: { activityId: string }) {
      params.callLog.push({
        table: "events",
        operation: "update",
        payload: { linked_activity_id: input.activityId, status: "completed" },
      });
      return params.nextResult("events").data ?? null;
    },
    async listHistoricalActivitiesForReconciliation() {
      return params.nextResult("activities").data ?? [];
    },
    async listHistoricalEventsForReconciliation() {
      params.logFilter("events", "is", "linked_activity_id", null);
      return params.nextResult("events").data ?? [];
    },
    async listOwnedEventsForDeleteScope() {
      return params.nextResult("events").data ?? [];
    },
    async updateEventCompletionLink(input: { linkedActivityId: string | null; status: string }) {
      params.callLog.push({
        table: "events",
        operation: "update",
        payload: {
          linked_activity_id: input.linkedActivityId,
          status: input.status,
        },
      });
      return params.nextResult("events").data ?? null;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("eventsRouter generalization", () => {
  it("keeps a persisted route-only planned event on an unrelated update without publishing", async () => {
    const event = createEventRow({ route_id: "route-1" });
    const { caller, callLog } = createCaller({
      events: [
        { data: event, error: null },
        { data: [event], error: null },
      ],
    });

    await expect(
      caller.update({ id: event.id, patch: { notes: "steady" } }),
    ).resolves.toMatchObject({ event_type: "planned" });
    expect(callLog.find((call) => call.operation === "update")?.payload).toMatchObject({
      notes: "steady",
    });
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });

  it("unsyncs when a combined planned event detaches its plan but retains its route", async () => {
    const existing = createEventRow({ activity_plan_id: "plan-1", route_id: "route-1" });
    const updated = createEventRow({ activity_plan_id: null, route_id: "route-1" });
    const { caller, callLog } = createCaller({
      events: [
        { data: existing, error: null },
        { data: [updated], error: null },
      ],
    });

    await caller.update({ id: existing.id, patch: { activity_plan_id: null } });
    expect(callLog.find((call) => call.operation === "update")?.payload).toMatchObject({
      activity_plan_id: null,
    });
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: [existing.id], operation: "unsync" }),
    );
  });

  it("does not publish when a route-only planned event receives a plan", async () => {
    const existing = createEventRow({ route_id: "route-1" });
    const planId = "11111111-1111-4111-8111-111111111111";
    const updated = createEventRow({ activity_plan_id: planId, route_id: "route-1" });
    const { caller } = createCaller({
      events: [
        { data: existing, error: null },
        { data: [updated], error: null },
      ],
      activity_plans: { data: { id: planId }, error: null },
    });

    await caller.update({ id: existing.id, patch: { activity_plan_id: planId } });
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });

  it("unsyncs an existing plan-only delivery when a route is attached", async () => {
    const routeId = "22222222-2222-4222-8222-222222222222";
    const existing = createEventRow({ activity_plan_id: "plan-1", route_id: null });
    const updated = createEventRow({ activity_plan_id: "plan-1", route_id: routeId });
    const { caller } = createCaller({
      events: [
        { data: existing, error: null },
        { data: [updated], error: null },
      ],
      activity_routes: { data: { id: routeId }, error: null },
    });

    await caller.update({ id: existing.id, patch: { route_id: routeId } });
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: [existing.id], operation: "unsync" }),
    );
  });

  it("rejects clearing the final planned route or plan link", async () => {
    const routeOnly = createEventRow({ route_id: "route-1" });
    const routeCaller = createCaller({ events: { data: routeOnly, error: null } });
    await expect(
      routeCaller.caller.update({ id: routeOnly.id, patch: { route_id: null } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const planOnly = createEventRow({ activity_plan_id: "plan-1" });
    const planCaller = createCaller({ events: { data: planOnly, error: null } });
    await expect(
      planCaller.caller.update({ id: planOnly.id, patch: { activity_plan_id: null } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("revokes grants and queues only planned candidates with activity plans in the delete callback", async () => {
    const beforeDeleteCalls: Array<(input: { candidates: any[]; tx: any }) => Promise<void>> = [];
    const revokeEventGrants = vi.fn(async () => undefined);
    const candidates = [
      { activity_plan_id: "plan-1", event_type: "planned", id: "planned-1" },
      { activity_plan_id: null, event_type: "planned", id: "unplanned-1" },
      { activity_plan_id: "plan-2", event_type: "custom", id: "custom-1" },
    ];
    const completionRepository = {
      getOwnedEventForCompletion: vi.fn(async () =>
        createEventRow({ id: "anchor-1", event_type: "planned" }),
      ),
      deleteOwnedEventsForScope: vi.fn(async ({ beforeDelete }) => {
        beforeDeleteCalls.push(beforeDelete);
        await beforeDelete({ candidates, tx: { id: "tx-1" } });
        return candidates;
      }),
    };
    const enqueueWahooPlannedActivityJobs = vi.fn(async () => ({
      affectedCount: 1,
      jobId: "job-1",
      operation: "unsync" as const,
      queued: true,
      success: true,
    }));

    await expect(
      deleteEventUseCase({
        ctx: { db: {}, session: { user: { id: "profile-123" } } } as any,
        input: { id: "anchor-1" },
        dependencies: {
          buildInsightRefreshHint: () => null,
          enqueueWahooPlannedActivityJobs,
          getContentPermissions: (_ctx, tx) => (tx ? ({ revokeEventGrants } as any) : null),
          getEventCompletionRepository: () => completionRepository as any,
          toDateKey: (value) => value.slice(0, 10),
        },
      }),
    ).resolves.toMatchObject({ affected_event_ids: candidates.map((candidate) => candidate.id) });

    expect(beforeDeleteCalls).toHaveLength(1);
    expect(enqueueWahooPlannedActivityJobs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventIds: ["planned-1"],
        operation: "unsync",
        transaction: { id: "tx-1" },
      }),
    );
    expect(revokeEventGrants).toHaveBeenCalledTimes(3);
    expect(revokeEventGrants).toHaveBeenNthCalledWith(1, "planned-1");
    expect(revokeEventGrants).toHaveBeenNthCalledWith(2, "unplanned-1");
    expect(revokeEventGrants).toHaveBeenNthCalledWith(3, "custom-1");
  });

  it("calendar range returns mixed event types with normalized event_type values", async () => {
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({ id: "a", event_type: "planned" }),
          createEventRow({ id: "b", event_type: "race_target" }),
          createEventRow({ id: "c", event_type: "custom" }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
      limit: 20,
      includeAdhoc: true,
    });

    expect(result.items.map((item) => item.event?.type)).toEqual([
      "planned",
      "race_target",
      "custom",
    ]);
    expect(result).not.toHaveProperty("plannedLoadSummaries");
  });

  it("calendar page reads the exact fixed date window", async () => {
    const { calendarCaller, callLog } = createCaller({
      events: { data: [], error: null },
      activities: { data: [], error: null },
    });

    const page = await calendarCaller.page({
      pageStartDate: "2026-03-02",
      pageSizeDays: 42,
      includeAdhoc: true,
      limit: 20,
    });

    expect(page).toMatchObject({
      startDate: "2026-03-02",
      endDateExclusive: "2026-04-13",
    });
    expect(page).not.toHaveProperty("previousCursor");
    expect(page).not.toHaveProperty("nextCursor");
    expect(callLog.filter((call) => call.table === "events")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ dateFrom: "2026-03-02", dateTo: "2026-04-13" }),
        }),
      ]),
    );
  });

  it.each([
    null,
    "Not/A_Timezone",
  ])("falls back to UTC for a legacy planning timezone (%s) without rewriting persisted calendar dates", async (planningTimezone) => {
    const { calendarCaller, callLog } = createCaller({
      profiles: {
        data: { id: "profile-123", planningTimezone },
        error: null,
      },
      events: {
        data: [
          createEventRow({
            all_day: true,
            scheduled_date: "2026-03-02",
            starts_at: "2026-03-02T00:00:00.000Z",
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-01",
      endDateExclusive: "2026-03-04",
      includeAdhoc: true,
      limit: 20,
    });

    expect(result.timezone).toBe("UTC");
    expect(result.items[0]?.calendarDate).toBe("2026-03-02");
    expect(callLog).toContainEqual({
      table: "events",
      operation: "batch",
      payload: expect.objectContaining({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-04",
        planningTimezone: "UTC",
      }),
    });
  });

  it("passes a valid DST-aware planning timezone and an exclusive range to repositories", async () => {
    const { calendarCaller, callLog } = createCaller({
      profiles: {
        data: { id: "profile-123", planningTimezone: "America/New_York" },
        error: null,
      },
      events: { data: [], error: null },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-08",
      endDateExclusive: "2026-03-10",
      includeAdhoc: true,
      limit: 20,
    });

    expect(result.timezone).toBe("America/New_York");
    expect(callLog).toContainEqual({
      table: "events",
      operation: "batch",
      payload: expect.objectContaining({
        dateFrom: "2026-03-08",
        dateTo: "2026-03-10",
        planningTimezone: "America/New_York",
      }),
    });
    expect(callLog).toContainEqual({
      table: "calendar_activities",
      operation: "batch",
      payload: expect.objectContaining({
        startedAtGte: "2026-03-08T05:00:00.000Z",
        startedAtLt: "2026-03-10T04:00:00.000Z",
      }),
    });
  });

  it("hydrates a linked completion even when it falls outside the date-bounded activity page", async () => {
    const linkedActivityId = "00000000-0000-4000-8000-000000000199";
    const { calendarCaller, callLog } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "completed-event-with-outside-activity",
            linked_activity_id: linkedActivityId,
            scheduled_date: "2026-03-09",
            starts_at: "2026-03-09T08:00:00.000Z",
            status: "completed",
          }),
        ],
        error: null,
      },
      calendar_activities: { data: [], error: null },
      calendar_linked_activities: {
        data: [
          {
            id: linkedActivityId,
            profile_id: "profile-123",
            content_visibility: "private",
            name: "Midnight completion",
            started_at: "2026-03-11T00:05:00.000Z",
            profile: { username: "athlete", avatar_url: null },
            distance_meters: 5_000,
            active_ms: 1_800_000,
            elapsed_ms: 1_900_000,
          },
        ],
        error: null,
      },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-08",
      endDateExclusive: "2026-03-10",
      includeAdhoc: true,
      limit: 20,
    });

    expect(callLog).toContainEqual({
      table: "calendar_linked_activities",
      operation: "batch",
      payload: expect.objectContaining({ activityIds: [linkedActivityId] }),
    });
    expect(
      result.items.find((item) => item.id === "completed-event-with-outside-activity"),
    ).toMatchObject({
      status: "completed",
      activity: {
        id: linkedActivityId,
        metrics: expect.arrayContaining([
          expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
          expect.objectContaining({
            key: "normalized_intensity",
            status: "unavailable",
            value: null,
          }),
        ]),
      },
    });
  });

  it("projects personal timed events in the planning zone and selected group events in the organizer zone", async () => {
    vi.mocked(readSelectedGroupEventsForCalendar).mockResolvedValueOnce({
      items: [
        {
          id: "group-event-1",
          title: "Tokyo start",
          starts_at: "2026-04-30T15:30:00.000Z",
          timezone: "Asia/Tokyo",
          activity_plan_id: null,
          group: { id: "group-1", name: "Tokyo runners" },
          viewerRsvp: null,
          viewerSeriesRsvp: null,
        },
      ],
      truncated: false,
    } as never);
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "personal-timed-1",
            all_day: false,
            starts_at: "2026-03-10T03:30:00.000Z",
            scheduled_date: "2026-03-10",
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-01",
      endDateExclusive: "2026-05-02",
      limit: 20,
      includeAdhoc: true,
    });

    expect(result.items.find((item) => item.id === "personal-timed-1")?.calendarDate).toBe(
      "2026-03-09",
    );
    expect(result.items.find((item) => item.kind === "group_event")).toMatchObject({
      calendarDate: "2026-05-01",
      timing: { startsAt: "2026-04-30T15:30:00.000Z", timezone: "Asia/Tokyo" },
    });
  });

  it("redacts an unauthorized selected group-event plan from the projection DTO", async () => {
    vi.mocked(readSelectedGroupEventsForCalendar).mockResolvedValueOnce({
      items: [
        {
          id: "group-event-private-plan",
          title: "Visible event",
          starts_at: "2026-05-01T09:00:00.000Z",
          timezone: "UTC",
          activity_plan_id: "private-plan-id",
          group: { id: "group-1", name: "Visible group" },
          viewerRsvp: null,
          viewerSeriesRsvp: null,
        },
      ],
      truncated: false,
    } as never);
    const { calendarCaller } = createCaller({
      events: { data: [], error: null },
      calendar_group_activity_plans: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-05-01",
      endDateExclusive: "2026-05-02",
      limit: 20,
      includeAdhoc: true,
    });

    expect(result.items[0]).toMatchObject({
      kind: "group_event",
      title: "Visible event",
      plan: null,
      metrics: [],
      estimated: false,
    });
    expect(JSON.stringify(result)).not.toContain("private-plan-id");
  });

  it("uses stored activity names in completed projections with a safe missing-name fallback", async () => {
    const { calendarCaller } = createCaller({
      events: { data: [], error: null },
      calendar_activities: {
        data: [
          {
            id: "named-activity",
            profile_id: "profile-123",
            content_visibility: "private",
            name: "Morning ride",
            started_at: "2026-05-01T08:00:00.000Z",
            profile: { username: "athlete", avatar_url: "not-a-valid-url" },
            distance_meters: 12_000,
            active_ms: 3_600_000,
            elapsed_ms: 3_700_000,
          },
          {
            id: "unnamed-activity",
            profile_id: "profile-123",
            content_visibility: "private",
            name: null,
            started_at: "2026-05-01T09:00:00.000Z",
            distance_meters: 0,
            active_ms: 600_000,
            elapsed_ms: 600_000,
          },
        ],
        error: null,
      },
    });

    const result = await calendarCaller.range({
      startDate: "2026-05-01",
      endDateExclusive: "2026-05-02",
      limit: 20,
      includeAdhoc: true,
    });

    expect(
      result.items.filter((item) => item.kind === "completed_activity").map((item) => item.title),
    ).toEqual(["Morning ride", "Completed activity"]);
    expect(
      result.items.find((item) => item.id === "named-activity")?.activity?.owner.avatarUrl,
    ).toBeNull();
  });

  it("does not infer completion for a plan-less event from an unrelated same-day activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({ scheduled_date: "2026-03-02", starts_at: "2026-03-02T09:00:00.000Z" }),
        ],
        error: null,
      },
      activities: {
        data: [
          { id: "activity-1", started_at: "2026-03-02T10:00:00.000Z", activity_plan_id: null },
        ],
        error: null,
      },
    });

    await expect(
      calendarCaller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2027-01-01",
        limit: 20,
        includeAdhoc: true,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ status: "expired" })] });
  });

  it("does not infer completion for a same-plan same-day activity without a persisted link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            scheduled_date: "2026-03-02",
            starts_at: "2026-03-02T09:00:00.000Z",
            activity_plan_id: "plan-1",
          }),
        ],
        error: null,
      },
      activities: {
        data: [
          { id: "activity-1", started_at: "2026-03-02T10:00:00.000Z", activity_plan_id: "plan-1" },
        ],
        error: null,
      },
    });

    await expect(
      calendarCaller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2027-01-01",
        limit: 20,
        includeAdhoc: true,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ status: "expired" })] });
  });

  it("does not trust a completed lifecycle label without an activity identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            scheduled_date: "2026-03-02",
            starts_at: "2026-03-02T09:00:00.000Z",
            status: "completed",
            linked_activity_id: null,
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    await expect(
      calendarCaller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2027-01-01",
        limit: 20,
        includeAdhoc: true,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ status: "expired" })] });
  });

  it("gives cancelled status precedence over a retained activity link", async () => {
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "00000000-0000-4000-8000-000000000021",
            status: "cancelled",
            linked_activity_id: "00000000-0000-4000-8000-000000000121",
          }),
          createEventRow({
            id: "00000000-0000-4000-8000-000000000022",
            status: "completed",
            linked_activity_id: "00000000-0000-4000-8000-000000000122",
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
      limit: 20,
      includeAdhoc: true,
    });

    expect(result.items.map((item) => item.status)).toEqual(["cancelled", "completed"]);
  });

  it("uses one bounded range read and does not expose an event-only projection cursor", async () => {
    const first = createEventRow({ id: "00000000-0000-4000-8000-000000000101" });
    const second = createEventRow({
      id: "00000000-0000-4000-8000-000000000102",
      starts_at: "2026-03-03T00:00:00.000Z",
    });
    const third = createEventRow({
      id: "00000000-0000-4000-8000-000000000103",
      starts_at: "2026-03-04T00:00:00.000Z",
    });
    const { calendarCaller, callLog } = createCaller({
      events: { data: [first, second, third], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
      limit: 2,
      includeAdhoc: true,
    });

    expect(result.items).toHaveLength(2);
    expect(result).not.toHaveProperty("nextCursor");
    expect(result.truncation.events).toBe(true);
    expect(
      callLog.filter(
        (call) =>
          call.operation === "filter" &&
          (call.payload as { type?: string; column?: string })?.type === "limit",
      ),
    ).toEqual([
      {
        table: "events",
        operation: "filter",
        payload: { type: "limit", column: "limit", value: 3 },
      },
    ]);
  });

  it("calendar range rejects unexpected input keys", async () => {
    const { calendarCaller } = createCaller({});

    await expect(
      calendarCaller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2027-01-01",
        limit: 20,
        unexpected: true,
      } as never),
    ).rejects.toThrow("Unrecognized key");
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

  it("getById does not expose event existence when the profile lacks access", async () => {
    const { caller } = createCaller({
      events: {
        data: null,
        error: null,
      },
    });

    await expect(
      caller.getById({
        id: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("Event not found");
  });

  it("getById hydrates the linked activity plan for planned events", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000012",
          event_type: "planned",
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
          activity_plan: createActivityPlanRow({
            id: "11111111-1111-4111-8111-111111111111",
            name: "Tempo Builder",
            structure: createActivityPlanStructure("run"),
            route_id: "route-1",
            profile_id: "profile-1",
            updated_at: "2026-03-01T00:00:00.000Z",
          }),
        }),
        error: null,
      },
    });

    const result = await caller.getById({
      id: "00000000-0000-4000-8000-000000000012",
    });

    expect(result.event_type).toBe("planned");
    expect(result.activityPlanSummary).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Tempo Builder",
      updatedAt: "2026-03-01T00:00:00.000Z",
      owner: expect.objectContaining({ username: "user-prof" }),
      activityCategory: "run",
      capabilities: expect.objectContaining({ canRecord: false, canSchedule: true }),
    });
    expect(result.activityPlanSummary?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", provenance: "authored" }),
      ]),
    );
    expect(result.activityPlanSummary?.structure).toEqual(createActivityPlanStructure("run"));
    expect(result.activityPlanSummary).not.toHaveProperty("prescriptionQuantification");
    expect(estimateActivityPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" }),
      expect.anything(),
      expect.any(String),
      { personalize: false },
    );

    await caller.getById({
      id: "00000000-0000-4000-8000-000000000012",
      personalize: true,
    });
    expect(estimateActivityPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" }),
      expect.anything(),
      expect.any(String),
      { personalize: false },
    );
  });

  it("calendar range hydrates linked activity plans for planned events", async () => {
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "planned-1",
            event_type: "planned",
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            activity_plan: createActivityPlanRow({
              id: "11111111-1111-4111-8111-111111111111",
              name: "Threshold Ride",
              route_id: "route-2",
              structure: createActivityPlanStructure("bike", 2),
              profile_id: "profile-2",
              updated_at: "2026-03-02T00:00:00.000Z",
            }),
          }),
          createEventRow({
            id: "custom-1",
            event_type: "custom",
            title: "Strength and mobility",
          }),
        ],
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await calendarCaller.range({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
      limit: 20,
      includeAdhoc: true,
    });
    const plannedEvent = result.items.find((item) => item.id === "planned-1");

    expect(plannedEvent?.plan).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Threshold Ride",
      updatedAt: "2026-03-02T00:00:00.000Z",
      owner: expect.objectContaining({ username: "user-prof" }),
      activityCategory: "bike",
      capabilities: expect.objectContaining({ canRecord: false, canSchedule: true }),
    });
    expect(plannedEvent?.plan?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", provenance: "authored" }),
      ]),
    );
    expect(plannedEvent?.plan?.structure).toEqual(createActivityPlanStructure("bike", 2));
    expect(plannedEvent?.plan).not.toHaveProperty("prescriptionQuantification");
    expect(plannedEvent).toMatchObject({
      kind: "planned_activity",
      plan: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Threshold Ride",
        visibility: "private",
      },
    });
  });

  it("calendar day returns normalized events for the requested planning-zone day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T15:00:00.000Z"));

    const { calendarCaller, callLog } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "today-1",
            event_type: "race_target",
            scheduled_date: "2026-03-12",
            starts_at: "2026-03-12T06:00:00.000Z",
          }),
        ],
        error: null,
      },
    });

    const result = (await calendarCaller.day({ date: "2026-03-12" })).projection.items;

    expect(result).toHaveLength(1);
    expect(result[0]?.event?.type).toBe("race_target");
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "gte",
        column: "starts_at",
        value: "2026-03-12",
      },
    });
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "lt",
        column: "starts_at",
        value: "2026-03-13",
      },
    });
  });

  it("calendar day rejects mixed nested plans", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T15:00:00.000Z"));
    const { calendarCaller } = createCaller({
      events: {
        data: [
          createEventRow({
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            activity_plan: {
              id: "11111111-1111-4111-8111-111111111111",
              profile_id: "profile-1",
              structure: createLegacyCompositionStructure(),
            },
          }),
        ],
        error: null,
      },
    });

    await expect(calendarCaller.day({ date: "2026-03-12" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid",
    });
  });

  it("returns the safe stored-plan error for invalid direct event relations", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
          activity_plan: {
            id: "11111111-1111-4111-8111-111111111111",
            structure: { version: 3, segments: [] },
          },
        }),
        error: null,
      },
    });

    await expect(
      caller.getById({ id: "00000000-0000-4000-8000-000000000001" }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid",
    });
  });

  it("calendar range returns canonical event rows for a planning-zone week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T15:00:00.000Z"));

    const { calendarCaller, callLog } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "week-visible-1",
            event_type: "planned",
            scheduled_date: "2026-03-10",
            starts_at: "2026-03-10T08:00:00.000Z",
          }),
          createEventRow({
            id: "week-visible-custom",
            event_type: "custom",
            scheduled_date: "2026-03-11",
            starts_at: "2026-03-11T08:00:00.000Z",
          }),
          createEventRow({
            id: "week-visible-2",
            event_type: "custom",
            scheduled_date: "2026-03-12",
            starts_at: "2026-03-12T08:00:00.000Z",
          }),
        ],
        error: null,
      },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-08",
      endDateExclusive: "2026-03-15",
      includeAdhoc: true,
      limit: 500,
    });

    expect(result.items).toHaveLength(3);
    expect(result.items).toHaveLength(3);
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "gte",
        column: "starts_at",
        value: "2026-03-08",
      },
    });
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "lt",
        column: "starts_at",
        value: "2026-03-15",
      },
    });
  });

  it("create rejects the legacy planned-activity payload", async () => {
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
          event_type: "planned",
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
        }),
        error: null,
      },
      integrations: {
        data: null,
        error: null,
      },
    });

    await expect(
      caller.create({
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        scheduled_date: "2026-03-12",
        notes: "steady endurance",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.filter((call) => call.operation === "insert")).toHaveLength(0);
  });

  it("create normalizes planned event scheduled_date to all-day persistence", async () => {
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
          starts_at: "2026-03-12T00:00:00.000Z",
          ends_at: "2026-03-13T00:00:00.000Z",
          scheduled_date: "2026-03-12",
          event_type: "planned",
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
      scheduled_date: "2026-03-12",
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect((insertCall?.payload as any).event_type).toBe("planned");
    expect((insertCall?.payload as any).all_day).toBe(true);
    expect((insertCall?.payload as any).starts_at).toBe("2026-03-12T00:00:00.000Z");
    expect((insertCall?.payload as any).ends_at).toBe("2026-03-13T00:00:00.000Z");
    expect((insertCall?.payload as any).scheduled_date).toBe("2026-03-12");
    expect((insertCall?.payload as any).recurrence_rule).toBeNull();
    expect(result.scheduled_date).toBe("2026-03-12");
  });

  it("create persists an accessible event-owned route", async () => {
    const activityPlanId = "11111111-1111-4111-8111-111111111111";
    const routeId = "22222222-2222-4222-8222-222222222222";
    const { caller, callLog } = createCaller({
      activity_plans: { data: { id: activityPlanId }, error: null },
      activity_routes: { data: { id: routeId }, error: null },
      events: {
        data: createEventRow({ activity_plan_id: activityPlanId, route_id: routeId }),
        error: null,
      },
    });

    await caller.create({
      event_type: "planned",
      title: "Route activity",
      scheduled_date: "2026-03-12",
      activity_plan_id: activityPlanId,
      route_id: routeId,
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      activity_plan_id: activityPlanId,
      route_id: routeId,
    });
  });

  it("create rejects an inaccessible route before writing the event", async () => {
    const activityPlanId = "11111111-1111-4111-8111-111111111111";
    const { caller, callLog } = createCaller({
      activity_plans: { data: { id: activityPlanId }, error: null },
      activity_routes: { data: null, error: null },
    });

    await expect(
      caller.create({
        event_type: "planned",
        title: "Private route activity",
        scheduled_date: "2026-03-12",
        activity_plan_id: activityPlanId,
        route_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("Route not found or not accessible");

    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
  });

  it("derives a non-UTC custom event schedule date and preserves persisted dates on reads", async () => {
    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            event_type: "custom",
            timezone: "America/Los_Angeles",
            starts_at: "2026-03-12T01:30:00.000Z",
            scheduled_date: "2026-03-11",
          }),
          error: null,
        },
        {
          data: createEventRow({
            event_type: "custom",
            timezone: "America/Los_Angeles",
            starts_at: "2026-03-12T01:30:00.000Z",
            scheduled_date: "2026-03-11",
          }),
          error: null,
        },
      ],
      integrations: { data: null, error: null },
    });

    await caller.create({
      event_type: "custom",
      title: "Local evening event",
      starts_at: "2026-03-12T01:30:00.000Z",
      all_day: false,
      timezone: "America/Los_Angeles",
    });
    const event = await caller.getById({ id: "00000000-0000-4000-8000-000000000001" });

    expect(
      (callLog.find((call) => call.operation === "insert")?.payload as any).scheduled_date,
    ).toBe("2026-03-11");
    expect(event.scheduled_date).toBe("2026-03-11");
  });

  it("uses recurrence occurrence keys as personal schedule dates across DST and UTC date rollover", async () => {
    const { caller, callLog } = createCaller({
      events: [
        "00000000-0000-4000-8000-000000000110",
        "00000000-0000-4000-8000-000000000111",
        "00000000-0000-4000-8000-000000000112",
      ].map((id) => ({ data: createEventRow({ id, event_type: "custom" }), error: null })),
      integrations: { data: null, error: null },
    });

    await caller.create({
      event_type: "custom",
      title: "Local late recurrence",
      starts_at: "2026-03-02T07:30:00.000Z",
      ends_at: "2026-03-02T08:30:00.000Z",
      all_day: false,
      timezone: "America/Los_Angeles",
      recurrence: {
        rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=3;BYDAY=SU",
        timezone: "America/Los_Angeles",
      },
    });

    const insertPayloads = callLog
      .filter((call) => call.table === "events" && call.operation === "insert")
      .map((call) => call.payload as Record<string, unknown>);
    expect(insertPayloads.map(({ occurrence_key }) => occurrence_key)).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
    ]);
    expect(insertPayloads.map(({ scheduled_date }) => scheduled_date)).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
    ]);
    expect(insertPayloads.map(({ starts_at }) => starts_at)).toEqual([
      "2026-03-02T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
      "2026-03-16T06:30:00.000Z",
    ]);
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
      } as any),
    ).rejects.toThrow(/Invalid discriminator value|rest_day/);
  });

  it("create rejects mixed legacy and domain payload shapes", async () => {
    const { caller, callLog } = createCaller({});

    await expect(
      caller.create({
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        scheduled_date: "2026-03-12",
        title: "Unexpected domain field",
      } as any),
    ).rejects.toThrow(/Invalid discriminator value/);

    expect(callLog).toEqual([]);
  });

  it("create rejects malformed activity plan ids before repository writes", async () => {
    const { caller, callLog } = createCaller({});

    await expect(
      caller.create({
        event_type: "planned",
        title: "Evening Run",
        scheduled_date: "2026-03-12",
        all_day: true,
        timezone: "UTC",
        activity_plan_id: "not-a-uuid",
      } as any),
    ).rejects.toThrow(/Invalid UUID|Invalid activity plan ID|Invalid event create payload/);

    expect(callLog).toEqual([]);
  });

  it("update rejects future-scope mutations", async () => {
    const { caller, callLog } = createCaller({
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

    await expect(
      caller.update({
        id: "00000000-0000-4000-8000-000000000020",
        scope: "future",
        patch: { notes: "move this week" },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("rejects future-scope detail changes before preserving every occurrence", async () => {
    const anchor = createEventRow({
      event_type: "custom",
      series_id: "series-1",
      starts_at: "2026-05-01T09:00:00.000Z",
      scheduled_date: "2026-05-01",
    });
    const future = createEventRow({
      id: "00000000-0000-4000-8000-000000000021",
      event_type: "custom",
      series_id: "series-1",
      starts_at: "2026-05-08T09:00:00.000Z",
      scheduled_date: "2026-05-08",
    });
    const { caller, callLog } = createCaller({
      events: [{ data: anchor, error: null }],
      scoped_events: { data: [anchor, future], error: null },
    });

    await expect(
      caller.update({
        id: anchor.id,
        scope: "future",
        patch: { title: "Updated series" },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
    expect([anchor, future].map((event) => event.scheduled_date)).toEqual([
      "2026-05-01",
      "2026-05-08",
    ]);
  });

  it.each([
    ["date", { scheduled_date: "2026-05-03" }],
    ["title", { patch: { title: "Moved legacy session" } }],
    ["route", { patch: { route_id: "22222222-2222-4222-8222-222222222222" } }],
    ["detach", { patch: { activity_plan_id: null } }],
    ["replacement", { patch: { activity_plan_id: "33333333-3333-4333-8333-333333333333" } }],
  ])("rejects a mixed current plan for this-scope %s updates before writes or provider work", async (kind, input) => {
    const event = createEventRow({
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
      activity_plan_structure: createLegacyCompositionStructure(),
      route_id: "route-1",
    });
    const { caller, callLog } = createCaller({
      activity_plans: { data: { id: "33333333-3333-4333-8333-333333333333" }, error: null },
      activity_routes: { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null },
      events: { data: event, error: null },
      scoped_events: { data: [event], error: null },
    });

    await expect(caller.update({ id: event.id, ...input } as any)).rejects.toMatchObject({
      code: kind === "date" ? "BAD_REQUEST" : "CONFLICT",
    });

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });

  it("rejects strict-invalid and unavailable current plans safely", async () => {
    for (const currentPlan of [
      { activity_plan_structure: { version: 3, segments: [{ role: "activity" }] } },
      { activity_plan_unavailable: true },
    ]) {
      const event = createEventRow({
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        ...currentPlan,
      });
      const { caller, callLog } = createCaller({
        events: { data: event, error: null },
        scoped_events: { data: [event], error: null },
      });

      await expect(
        caller.update({ id: event.id, patch: { title: "Do not update" } }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(callLog.some((call) => call.operation === "update")).toBe(false);
    }
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });

  it("allows unlinked and repeated-same single-activity-category plan updates", async () => {
    const singleActivityCategoryStructure = createActivityPlanStructure("run");
    const unlinked = createEventRow({ event_type: "custom" });
    const linked = createEventRow({
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
      activity_plan_structure: singleActivityCategoryStructure,
      route_id: "route-1",
    });
    const unlinkedCaller = createCaller({
      events: { data: unlinked, error: null },
      scoped_events: { data: [unlinked], error: null },
    });
    const linkedCaller = createCaller({
      activity_plans: { data: { id: linked.activity_plan_id }, error: null },
      events: { data: linked, error: null },
      scoped_events: { data: [linked], error: null },
    });

    await expect(
      unlinkedCaller.caller.update({ id: unlinked.id, patch: { title: "Updated custom event" } }),
    ).resolves.toMatchObject({ id: unlinked.id });
    await expect(
      linkedCaller.caller.update({
        id: linked.id,
        patch: { activity_plan_id: linked.activity_plan_id },
      }),
    ).resolves.toMatchObject({ id: linked.id });

    expect(unlinkedCaller.callLog.some((call) => call.operation === "update")).toBe(true);
    expect(linkedCaller.callLog.some((call) => call.operation === "update")).toBe(true);
  });

  it.each([
    "future",
    "series",
  ] as const)("rejects %s scope atomically when a non-anchor target has a legacy plan", async (scope) => {
    const anchor = createEventRow({
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
      activity_plan_structure: createActivityPlanStructure("run"),
      id: "00000000-0000-4000-8000-000000000070",
      series_id: "00000000-0000-4000-8000-000000000071",
    });
    const legacyTarget = createEventRow({
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
      activity_plan_structure: createLegacyCompositionStructure(),
      id: "00000000-0000-4000-8000-000000000072",
      series_id: anchor.series_id,
    });
    const { caller, callLog } = createCaller({
      events: { data: anchor, error: null },
      scoped_events: { data: [anchor, legacyTarget], error: null },
    });

    await expect(
      caller.update({ id: anchor.id, scope, patch: { title: "No partial update" } } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
    expect(anchor.title).toBe("Planned Activity");
    expect(legacyTarget.title).toBe("Planned Activity");
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });

  it("update persists an accessible event-owned route", async () => {
    const eventId = "00000000-0000-4000-8000-000000000027";
    const routeId = "22222222-2222-4222-8222-222222222222";
    const { caller, callLog } = createCaller({
      activity_routes: { data: { id: routeId }, error: null },
      events: [
        { data: createEventRow({ id: eventId, event_type: "custom" }), error: null },
        {
          data: [createEventRow({ id: eventId, event_type: "custom", route_id: routeId })],
          error: null,
        },
      ],
    });

    await caller.update({ id: eventId, patch: { route_id: routeId } });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({ route_id: routeId });
  });

  it("update rejects an inaccessible route before mutating the event", async () => {
    const eventId = "00000000-0000-4000-8000-000000000029";
    const { caller, callLog } = createCaller({
      activity_routes: { data: null, error: null },
      events: {
        data: createEventRow({ id: eventId, event_type: "custom" }),
        error: null,
      },
    });

    await expect(
      caller.update({
        id: eventId,
        patch: { route_id: "22222222-2222-4222-8222-222222222222" },
      }),
    ).rejects.toThrow("Route not found or not accessible");

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("update clears an event-owned route without requiring route access", async () => {
    const eventId = "00000000-0000-4000-8000-000000000028";
    const routeId = "22222222-2222-4222-8222-222222222222";
    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({ id: eventId, event_type: "custom", route_id: routeId }),
          error: null,
        },
        {
          data: [createEventRow({ id: eventId, event_type: "custom", route_id: null })],
          error: null,
        },
      ],
    });

    await caller.update({ id: eventId, patch: { route_id: null } });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({ route_id: null });
  });

  it("update rejects recurrence changes with single scope", async () => {
    const eventId = "00000000-0000-4000-8000-000000000030";
    const recurrenceRule = "FREQ=WEEKLY;INTERVAL=1;COUNT=3;BYDAY=FR";
    const { caller, callLog } = createCaller({
      events: {
        data: createEventRow({
          id: eventId,
          event_type: "custom",
          starts_at: "2026-05-01T09:00:00.000Z",
          ends_at: "2026-05-01T10:00:00.000Z",
        }),
        error: null,
      },
    });

    await expect(
      caller.update({
        id: eventId,
        scope: "single",
        patch: {
          recurrence: {
            rule: recurrenceRule,
            timezone: "UTC",
          },
        },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("update rejects date/time changes for scoped series mutations", async () => {
    const eventId = "00000000-0000-4000-8000-000000000034";
    const { caller, callLog } = createCaller({
      events: {
        data: createEventRow({
          id: eventId,
          event_type: "custom",
          series_id: "00000000-0000-4000-8000-000000000030",
          starts_at: "2026-05-15T09:00:00.000Z",
          ends_at: "2026-05-15T10:00:00.000Z",
        }),
        error: null,
      },
    });

    await expect(
      caller.update({
        id: eventId,
        scope: "future",
        patch: {
          starts_at: "2026-05-16T09:00:00.000Z",
        },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("single-scope occurrence edits keep the mutation anchored to that occurrence", async () => {
    const eventId = "00000000-0000-4000-8000-000000000033";
    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "custom",
            series_id: "00000000-0000-4000-8000-000000000030",
            occurrence_key: "2026-05-15",
            original_starts_at: "2026-05-15T09:00:00.000Z",
            starts_at: "2026-05-15T09:00:00.000Z",
            ends_at: "2026-05-15T10:00:00.000Z",
          }),
          error: null,
        },
        {
          data: [
            createEventRow({
              id: eventId,
              event_type: "custom",
              series_id: "00000000-0000-4000-8000-000000000030",
              occurrence_key: "2026-05-15",
              original_starts_at: "2026-05-15T09:00:00.000Z",
              starts_at: "2026-05-16T09:00:00.000Z",
              ends_at: "2026-05-15T10:00:00.000Z",
              notes: "one-off location change",
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
      scope: "single",
      patch: {
        starts_at: "2026-05-16T09:00:00.000Z",
        notes: "one-off location change",
      },
    });

    const updateCall = callLog.find(
      (call) => call.table === "events" && call.operation === "update",
    );

    expect((updateCall?.payload as any).starts_at).toBe("2026-05-16T09:00:00.000Z");
    expect((updateCall?.payload as any).notes).toBe("one-off location change");
    expect((updateCall?.payload as any).series_id).toBeUndefined();
    expect((updateCall?.payload as any).occurrence_key).toBeUndefined();
    expect((updateCall?.payload as any).original_starts_at).toBeUndefined();
    expect(result.mutation_scope).toBe("single");
    expect(result.affected_event_ids).toEqual([eventId]);
  });

  it("moving a linked completed planned event clears stale completion linkage", async () => {
    const eventId = "00000000-0000-4000-8000-000000000022";
    const linkedActivityId = "11111111-1111-4111-8111-111111111122";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "planned",
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
              event_type: "planned",
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

    await expect(
      caller.update({ id: eventId, scheduled_date: "2026-05-03" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.some((call) => call.table === "events" && call.operation === "update")).toBe(
      false,
    );
  });

  it("requires explicit completion unlink before replacing a linked activity plan", async () => {
    const event = createEventRow({
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
      linked_activity_id: "33333333-3333-4333-8333-333333333333",
      status: "completed",
    });
    const { caller, callLog } = createCaller({
      events: { data: event, error: null },
      activity_plans: {
        data: { id: "44444444-4444-4444-8444-444444444444" },
        error: null,
      },
    });

    await expect(
      caller.update({
        id: event.id,
        patch: { activity_plan_id: "44444444-4444-4444-8444-444444444444" },
      } as any),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("rejects a future plan replacement before mutating a completed non-anchor occurrence", async () => {
    const existingPlanId = "22222222-2222-4222-8222-222222222222";
    const replacementPlanId = "44444444-4444-4444-8444-444444444444";
    const anchor = createEventRow({
      activity_plan_id: existingPlanId,
      id: "00000000-0000-4000-8000-000000000024",
      series_id: "00000000-0000-4000-8000-000000000025",
      starts_at: "2026-05-01T00:00:00.000Z",
    });
    const completedTarget = createEventRow({
      activity_plan_id: existingPlanId,
      id: "00000000-0000-4000-8000-000000000026",
      linked_activity_id: "33333333-3333-4333-8333-333333333333",
      series_id: anchor.series_id,
      starts_at: "2026-05-08T00:00:00.000Z",
      status: "completed",
    });
    const { caller, callLog } = createCaller({
      activity_plans: { data: { id: replacementPlanId }, error: null },
      events: { data: anchor, error: null },
      scoped_events: { data: [anchor, completedTarget], error: null },
    });

    await expect(
      caller.update({
        id: anchor.id,
        scope: "future",
        patch: { activity_plan_id: replacementPlanId },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog.some((call) => call.operation === "update")).toBe(false);
    expect(completedTarget.activity_plan_id).toBe(existingPlanId);
    expect(completedTarget.linked_activity_id).not.toBeNull();
    expect(completedTarget.status).toBe("completed");
  });

  it("non-move updates keep completion linkage and status unchanged", async () => {
    const eventId = "00000000-0000-4000-8000-000000000023";
    const linkedActivityId = "11111111-1111-4111-8111-111111111123";

    const { caller, callLog } = createCaller({
      events: [
        {
          data: createEventRow({
            id: eventId,
            event_type: "planned",
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
              event_type: "planned",
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

  it("removes legacy planned events and queues their unsync before deleting", async () => {
    const eventId = "00000000-0000-4000-8000-000000000061";
    const plannedId = "00000000-0000-4000-8000-000000000062";
    const { caller, callLog } = createCaller({
      events: [
        { data: createEventRow({ id: eventId, event_type: "planned" }), error: null },
        {
          data: [
            createEventRow({
              id: plannedId,
              event_type: "planned",
              activity_plan_id: "plan-1",
              activity_plan_structure: createLegacyCompositionStructure(),
            }),
            createEventRow({ id: "custom-1", event_type: "custom", activity_plan_id: "plan-2" }),
            createEventRow({ id: "unplanned-1", event_type: "planned", activity_plan_id: null }),
          ],
          error: null,
        },
      ],
    });

    const result = await caller.delete({ id: eventId, scope: "series" });

    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        eventIds: [plannedId],
        operation: "unsync",
        transaction: {},
      }),
    );
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(1);
    expect(result.affected_event_ids).toEqual([plannedId, "custom-1", "unplanned-1"]);
  });

  it("maps unsync enqueue failure to a stable client-safe delete error before deletion", async () => {
    enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValueOnce({
      error: "queue unavailable",
      queued: false,
      success: false,
    });
    const eventId = "00000000-0000-4000-8000-000000000063";
    const { caller, callLog } = createCaller({
      events: [
        { data: createEventRow({ id: eventId, event_type: "planned" }), error: null },
        { data: [createEventRow({ id: eventId, activity_plan_id: "plan-1" })], error: null },
      ],
    });

    await expect(caller.delete({ id: eventId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Failed to delete events",
    });

    expect(callLog.some((call) => call.operation === "delete")).toBe(false);
  });

  it("does not inline-drain disabled Wahoo planned-activity work after deletion", async () => {
    const eventId = "00000000-0000-4000-8000-000000000064";
    const { caller } = createCaller({
      events: [
        { data: createEventRow({ id: eventId, event_type: "custom" }), error: null },
        { data: [createEventRow({ id: eventId, event_type: "custom" })], error: null },
      ],
    });

    await expect(caller.delete({ id: eventId })).resolves.toMatchObject({ success: true });
    expect(drainDueWahooPlannedActivityJobs).not.toHaveBeenCalled();
  });

  it("update blocks changing another event into rest_day", async () => {
    const { caller } = createCaller({
      events: {
        data: createEventRow({
          id: "00000000-0000-4000-8000-000000000042",
          event_type: "custom",
        }),
        error: null,
      },
    });

    await expect(
      caller.update({
        id: "00000000-0000-4000-8000-000000000042",
        patch: { event_type: "rest_day" } as never,
      }),
    ).rejects.toThrow(/Invalid option|Invalid event update payload|rest_day|Invalid input/);
  });

  it("update rejects malformed patch payloads before repository reads", async () => {
    const { caller, callLog } = createCaller({});

    await expect(
      caller.update({
        id: "00000000-0000-4000-8000-000000000042",
        patch: { starts_at: 123 },
      } as any),
    ).rejects.toThrow(/Invalid input|Invalid event update payload/);

    expect(callLog).toEqual([]);
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

  it.each([
    ["legacy", createLegacyCompositionStructure()],
    ["strict-invalid", { version: 3, segments: [{ role: "activity" }] }],
    ["unavailable", null],
  ])("blocks completion linking for a %s current plan", async (_label, structure) => {
    const eventId = "00000000-0000-4000-8000-000000000057";
    const activityId = "11111111-1111-4111-8111-111111111157";
    const { caller, callLog } = createCaller({
      events: {
        data: createEventRow({
          id: eventId,
          activity_plan_id: "22222222-2222-4222-8222-222222222257",
          activity_plan: structure === null ? null : { structure },
        }),
        error: null,
      },
      activities: { data: { id: activityId }, error: null },
    });

    await expect(
      caller.linkCompletion({ event_id: eventId, activity_id: activityId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Events linked to unavailable or non-executable activity plans are read-only",
    });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("blocks completion unlinking for a legacy current plan", async () => {
    const eventId = "00000000-0000-4000-8000-000000000058";
    const { caller, callLog } = createCaller({
      events: {
        data: createEventRow({
          id: eventId,
          activity_plan_id: "22222222-2222-4222-8222-222222222258",
          activity_plan: { structure: createLegacyCompositionStructure() },
          linked_activity_id: "11111111-1111-4111-8111-111111111158",
          status: "completed",
        }),
        error: null,
      },
    });

    await expect(caller.unlinkCompletion({ event_id: eventId })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Events linked to unavailable or non-executable activity plans are read-only",
    });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("status resolution prefers explicit linkage when present", async () => {
    const { calendarCaller } = createCaller({
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

    const result = await calendarCaller.range({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
      includeAdhoc: true,
      limit: 20,
    });
    expect(result.items[0]?.status).toBe("completed");
  });

  it("calendar range returns week events with lifecycle status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T15:00:00.000Z"));

    const { calendarCaller, callLog } = createCaller({
      events: {
        data: [
          createEventRow({
            id: "week-1",
            event_type: "planned",
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
            starts_at: "2026-03-10T00:00:00.000Z",
            scheduled_date: "2026-03-10",
          }),
        ],
        error: null,
      },
      activities: {
        data: [
          {
            id: "activity-week-1",
            started_at: "2026-03-10T12:00:00.000Z",
            activity_plan_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
        error: null,
      },
    });

    const result = await calendarCaller.range({
      startDate: "2026-03-08",
      endDateExclusive: "2026-03-15",
      includeAdhoc: true,
      limit: 500,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe("expired");
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "gte",
        column: "starts_at",
        value: "2026-03-08",
      },
    });
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: {
        type: "lt",
        column: "starts_at",
        value: "2026-03-15",
      },
    });
  });

  it("calendar range uses planning date keys and an exclusive end boundary", async () => {
    const { calendarCaller, callLog } = createCaller({
      events: { data: [], error: null },
      activities: { data: [], error: null },
    });

    await calendarCaller.range({
      startDate: "2026-03-10",
      endDateExclusive: "2026-03-13",
      limit: 20,
      includeAdhoc: true,
    });

    const rangeFilters = callLog
      .filter((call) => call.table === "events" && call.operation === "filter")
      .map((call) => call.payload as { type?: string; column?: string; value?: unknown });

    expect(rangeFilters).toContainEqual({
      type: "gte",
      column: "starts_at",
      value: "2026-03-10",
    });
    expect(rangeFilters).toContainEqual({
      type: "lt",
      column: "starts_at",
      value: "2026-03-13",
    });
  });

  it("rejects recurrence input for personal planned sessions", async () => {
    const { caller } = createCaller({
      activity_plans: {
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      },
    });

    await expect(
      caller.create({
        event_type: "planned",
        title: "Recurring activity",
        activity_plan_id: "11111111-1111-4111-8111-111111111111",
        scheduled_date: "2026-06-02",
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
          timezone: "UTC",
        },
      } as never),
    ).rejects.toThrow();
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
            activity_plan_structure: createActivityPlanStructure("bike"),
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
              activity_plan_structure: createActivityPlanStructure("bike"),
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

  it("reconcileHistoricalCompletions skips legacy and unavailable current plans", async () => {
    const activityId = "11111111-1111-4111-8111-111111111162";
    const events = [
      createEventRow({
        id: "00000000-0000-4000-8000-000000000062",
        starts_at: "2026-01-07T00:00:00.000Z",
        activity_plan_id: "33333333-3333-4333-8333-333333333362",
        activity_plan_structure: createLegacyCompositionStructure(),
      }),
      createEventRow({
        id: "00000000-0000-4000-8000-000000000063",
        starts_at: "2026-01-07T00:00:00.000Z",
        activity_plan_id: "33333333-3333-4333-8333-333333333363",
        activity_plan_structure: null,
      }),
    ];
    const { caller, callLog } = createCaller({
      events: { data: events, error: null },
      activities: {
        data: [
          {
            id: activityId,
            started_at: "2026-01-07T20:00:00.000Z",
            activity_plan_id: events[0]?.activity_plan_id,
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

    expect(result.counts).toEqual({ scanned: 2, matched: 0, updated: 0, skipped: 2 });
    expect(result.sample_ids.skipped_event_ids).toEqual(events.map((event) => event.id));
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
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

  it("calendar day planned-load summary returns the planning timezone and date boundary", async () => {
    const { calendarCaller, callLog } = createCaller({ events: { data: [], error: null } });

    const result = (await calendarCaller.day({ date: "2026-07-27" })).plannedLoadSummary;
    expect(result).toMatchObject({
      date: "2026-07-27",
      timezone: "America/New_York",
      summary: {
        eventCount: 0,
        activity_categories: [],
        totalDurationSeconds: null,
        prescriptionQuantification: {
          members: [],
          summary: { kind: "aggregate", memberSubjectIdentities: [] },
        },
        commonLoad: { status: "unavailable", reason: "no_load_data" },
      },
      source: {
        complete: true,
        eventCount: 0,
        unavailableEstimateCount: 0,
        unavailablePlanCount: 0,
        unlinkedPlanCount: 0,
      },
    });
    expect(result.summary).not.toHaveProperty("totalTss");
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: { type: "eq", column: "scheduled_date", value: "2026-07-27" },
    });
    expect(callLog).toContainEqual({
      table: "events",
      operation: "filter",
      payload: { type: "eq", column: "profile_id", value: "profile-123" },
    });
  });

  it("calendar day rejects non-canonical calendar dates", async () => {
    const { calendarCaller } = createCaller({ events: { data: [], error: null } });

    await expect(calendarCaller.day({ date: "2026-02-30" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
