import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { readSelectedGroupEventsForCalendar } from "../groups/groupEventViews";
import {
  buildPlanningLedger,
  buildPlanningRange,
  readPlanningLedger,
  readPlanningRange,
  resolvePlanningLedgerPeriod,
} from "./planningLedgerService";

const projection = {
  contractVersion: "plan-tab-projection-v1" as const,
  asOf: "2026-04-15T12:00:00.000Z",
  planningTimezone: "America/Los_Angeles",
  today: "2026-04-15",
  currentScheduledPlan: null,
  timeline: {
    startDate: "2026-04-13",
    endDate: "2026-04-19",
    today: "2026-04-15",
    days: [
      {
        date: "2026-04-13",
        load: {
          plannedLoad: 60,
          plannedLoadStatus: "complete" as const,
          scheduledLoad: 40,
          scheduledLoadStatus: "complete" as const,
          completedLoad: 15,
          completedLoadStatus: "complete" as const,
          remainingLoad: 25,
          remainingLoadStatus: "complete" as const,
          recommendedLoad: 60,
          recommendedLoadStatus: "complete" as const,
          deltaLoad: -25,
        },
        scheduledItems: [
          {
            id: "event-1",
            source: "training_plan" as const,
            date: "2026-04-13",
            title: "Tempo ride",
            plannedLoad: 40,
            plannedLoadStatus: "complete" as const,
            status: "planned" as const,
          },
        ],
        completedItems: [
          {
            id: "activity-1",
            source: "completed_activity" as const,
            date: "2026-04-13",
            title: "Morning ride",
            completedLoad: 15,
            completedLoadStatus: "complete" as const,
          },
        ],
        annotations: [],
        confidence: null,
      },
      {
        date: "2026-04-14",
        load: {
          plannedLoad: 0,
          plannedLoadStatus: "known_zero" as const,
          scheduledLoad: 0,
          scheduledLoadStatus: "known_zero" as const,
          completedLoad: 0,
          completedLoadStatus: "known_zero" as const,
          remainingLoad: 0,
          remainingLoadStatus: "known_zero" as const,
          recommendedLoad: 0,
          recommendedLoadStatus: "known_zero" as const,
          deltaLoad: 0,
        },
        scheduledItems: [],
        completedItems: [],
        annotations: [],
        confidence: null,
      },
    ],
    weeks: [],
  },
  dayLoads: {
    "2026-04-13": {
      status: "complete" as const,
      commonLoad: 60,
      intensity: 0.7,
      contributingDurationSeconds: 7200,
      completedLoadStatus: "complete" as const,
      completedLoad: 15,
      scheduledLoadStatus: "complete" as const,
      scheduledLoad: 40,
      remainingLoadStatus: "complete" as const,
      remainingLoad: 25,
      hasUnavailableCompletedLoad: false,
      recommendedLoadStatus: "complete" as const,
      recommendedLoad: 60,
    },
    "2026-04-14": {
      status: "known_zero" as const,
      commonLoad: 0,
      intensity: null,
      contributingDurationSeconds: 0,
      completedLoadStatus: "known_zero" as const,
      completedLoad: 0,
      scheduledLoadStatus: "known_zero" as const,
      scheduledLoad: 0,
      remainingLoadStatus: "known_zero" as const,
      remainingLoad: 0,
      hasUnavailableCompletedLoad: false,
      recommendedLoadStatus: "known_zero" as const,
      recommendedLoad: 0,
    },
  },
  fitness: {
    actual: [{ date: "2026-04-13", longTermLoad: 42, recentLoad: 45, loadBalance: -3 }],
    scheduled: [{ date: "2026-04-14", longTermLoad: 43, recentLoad: 46, loadBalance: -3 }],
    recommended: [],
  },
  recommendationPoints: [],
  ledgerItems: [
    {
      id: "event-1",
      date: "2026-04-13",
      kind: "planned" as const,
      title: "Tempo ride",
      loadStatus: "complete" as const,
      load: 40,
      intensityStatus: "complete" as const,
      intensity: 0.7,
      contributingDurationStatus: "complete" as const,
      contributingDurationSeconds: 3600,
    },
    {
      id: "activity-1",
      date: "2026-04-13",
      kind: "completed" as const,
      title: "Morning ride",
      loadStatus: "complete" as const,
      load: 15,
      intensityStatus: "complete" as const,
      intensity: 0.7,
      contributingDurationStatus: "complete" as const,
      contributingDurationSeconds: 3600,
    },
  ],
  sourceCoverage: {
    activities: { startDate: "2026-04-13", endDate: "2026-04-19", status: "complete" as const },
    scheduledItems: {
      startDate: "2026-04-13",
      endDate: "2026-04-19",
      status: "complete" as const,
    },
  },
  goalMarkers: [
    {
      id: "goal-1",
      label: "Spring event",
      targetDate: "2026-04-14",
      activityCategory: "bike",
    },
  ],
  publishedRevision: 7,
  algorithmVersion: "athlete-state-v1",
};

describe("planning ledger", () => {
  it("exposes actual, committed, target, and effective load without double counting", () => {
    const ledger = buildPlanningLedger({
      projection: { ...projection, goalMarkers: [] },
      request: { period: "week", anchorDate: "2026-04-15" },
    });
    const range = buildPlanningRange({
      projection: { ...projection, goalMarkers: [] },
      ledger,
      startDate: "2026-04-13",
      endDate: "2026-04-14",
    });

    expect(range.days[0]).toMatchObject({
      actual: { status: "complete", value: 15 },
      committed: { status: "complete", value: 25 },
      target: { status: "complete", value: 60 },
      effective: { status: "complete", value: 60 },
    });
    expect(range.weeks[0]).toMatchObject({
      actual: { value: 15 },
      committed: { value: 25 },
      target: { value: 60 },
      effective: { value: 60 },
    });
    expect(range.publishedRevision).toBe(7);
  });

  it("composes the full 366-day PlanningRange through one repeatable read", async () => {
    const tx = { marker: "planning-range-snapshot" };
    const transaction = vi.fn(async (operation, config) => {
      expect(config).toEqual({ accessMode: "read only", isolationLevel: "repeatable read" });
      return operation(tx);
    });
    const readProjection = vi.fn(async () => ({ ...projection, goalMarkers: [] }));
    const readCalendarFacts = vi.fn(async () => ({
      entries: [],
      sourceCoverage: {
        calendarEvents: {
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          status: "complete" as const,
        },
        groupEvents: {
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          status: "complete" as const,
        },
      },
    }));
    const result = await readPlanningRange({
      db: { $client: {}, transaction } as never,
      profileId: "11111111-1111-4111-8111-111111111111",
      request: { startDate: "2026-01-01", endDate: "2027-01-01" },
      dependencies: { readProjection, readCalendarFacts },
    });

    expect(result.days).toHaveLength(366);
    expect(readProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        request: { startDate: "2026-01-01", endDate: "2027-01-01" },
      }),
    );
    expect(readCalendarFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        periodStart: "2026-01-01",
        periodEndExclusive: "2027-01-02",
      }),
    );
  });

  it("uses canonical Monday week and calendar-month boundaries", () => {
    expect(resolvePlanningLedgerPeriod({ period: "week", anchorDate: "2026-04-15" })).toEqual({
      periodStart: "2026-04-13",
      periodEnd: "2026-04-19",
    });
    expect(resolvePlanningLedgerPeriod({ period: "month", anchorDate: "2028-02-29" })).toEqual({
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
    });
  });

  it("preserves zero and unavailable values while aggregating factual period detail", () => {
    const calendarFacts = {
      entries: [
        {
          id: "event-1",
          date: "2026-04-13",
          startsAt: "2026-04-13T16:00:00.000Z",
          kind: "planned" as const,
          title: "Tempo ride",
          status: "scheduled",
          navigation: { target: "event" as const, id: "event-1" },
        },
        {
          id: "event-ordinary",
          date: "2026-04-13",
          startsAt: "2026-04-13T18:00:00.000Z",
          kind: "event" as const,
          title: "Physio appointment",
          status: "scheduled",
          navigation: { target: "event" as const, id: "event-ordinary" },
        },
        {
          id: "group-event-1",
          date: "2026-04-14",
          startsAt: "2026-04-14T15:00:00.000Z",
          kind: "group_event" as const,
          title: "Club ride",
          status: "scheduled",
          navigation: { target: "group_event" as const, id: "group-event-1" },
        },
      ],
      sourceCoverage: {
        calendarEvents: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          status: "complete" as const,
        },
        groupEvents: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          status: "complete" as const,
        },
      },
    };
    const result = buildPlanningLedger({
      projection,
      request: { period: "week", anchorDate: "2026-04-15" },
      calendarFacts,
    });

    expect(result.load).toMatchObject({
      completed: { status: "complete", value: 15 },
      planned: { status: "complete", value: 25 },
      remaining: { status: "complete", value: 25 },
      effective: { status: "complete", value: 60 },
    });
    expect(result.contractVersion).toBe("planning-ledger-v3");
    expect(result.load).not.toHaveProperty("tentative");
    expect(result.dailyBreakdown[1]).toMatchObject({
      date: "2026-04-14",
      completed: { status: "known_zero", value: 0 },
    });
    expect(result.dailyBreakdown[0]).toMatchObject({
      completed: { status: "complete", value: 15 },
      planned: { status: "complete", value: 25 },
      remaining: { status: "complete", value: 25 },
    });
    expect(result.dailyBreakdown[0]).not.toHaveProperty("tentative");
    expect(result.trainingState.planned.fitness).toEqual({
      status: "available",
      value: 43,
      observedOn: "2026-04-14",
      source: "scheduled_projection",
    });
    expect(result.entries.map((entry) => entry.kind)).toEqual([
      "completed",
      "planned",
      "event",
      "goal",
      "group_event",
    ]);
    expect(result.entries.filter((entry) => entry.id === "event-1")).toHaveLength(1);
    expect(result.sourceCoverage).toMatchObject({
      calendarEvents: { status: "complete" },
      groupEvents: { status: "complete" },
    });
    expect(result.modelContext).toMatchObject({ publishedRevision: 7 });
  });

  it("does not turn a missing period into a known-zero rest day", () => {
    const result = buildPlanningLedger({
      projection: { ...projection, timeline: null, dayLoads: {} },
      request: { period: "day", anchorDate: "2026-04-15" },
    });

    expect(result.load.completed).toEqual({ status: "unavailable", value: null });
    expect(result.load.planned).toEqual({ status: "unavailable", value: null });
    expect(result.load.remaining).toEqual({ status: "unavailable", value: null });
    expect(result.load.effective).toEqual({ status: "unavailable", value: null });
  });

  it("caps dense ledgers deterministically", () => {
    const denseProjection = {
      ...projection,
      ledgerItems: [
        {
          id: "planned-first",
          date: "2026-04-13",
          kind: "planned" as const,
          title: "Club ride",
          loadStatus: "partial" as const,
          load: 35,
          intensityStatus: "partial" as const,
          intensity: 0.65,
          contributingDurationStatus: "partial" as const,
          contributingDurationSeconds: 3000,
        },
        ...Array.from({ length: 505 }, (_, index) => ({
          id: `planned-${String(index).padStart(3, "0")}`,
          date: "2026-04-14",
          kind: "planned" as const,
          title: `Planned session ${String(index).padStart(3, "0")}`,
          loadStatus: "complete" as const,
          load: 10,
          intensityStatus: "complete" as const,
          intensity: 0.5,
          contributingDurationStatus: "complete" as const,
          contributingDurationSeconds: 1440,
        })),
      ],
    };

    const result = buildPlanningLedger({
      projection: denseProjection,
      request: { period: "week", anchorDate: "2026-04-15" },
    });

    expect(result.entries).toHaveLength(500);
    expect(result.entriesTruncated).toBe(true);
    expect(result.entries[0]).toMatchObject({
      id: "planned-first",
      kind: "planned",
      load: { status: "partial", value: 35 },
      intensity: { status: "partial", value: 0.65 },
    });
    expect(result.entries.at(-1)?.id).toBe("planned-498");
  });

  it("reads projection and calendar facts through one scoped read-only snapshot", async () => {
    const tx = { marker: "ledger-snapshot" };
    const transaction = vi.fn(async (operation, config) => {
      expect(config).toEqual({ accessMode: "read only", isolationLevel: "repeatable read" });
      return operation(tx);
    });
    const readProjection = vi.fn(async () => projection);
    const readCalendarFacts = vi.fn(async () => ({
      entries: [],
      sourceCoverage: {
        calendarEvents: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          status: "complete" as const,
        },
        groupEvents: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          status: "complete" as const,
        },
      },
    }));

    await readPlanningLedger({
      db: { $client: {}, transaction } as never,
      profileId: "profile-1",
      request: { period: "week", anchorDate: "2026-04-15" },
      asOf: new Date("2026-04-15T12:00:00.000Z"),
      dependencies: { readProjection, readCalendarFacts },
    });

    expect(readProjection).toHaveBeenCalledWith(
      expect.objectContaining({ db: tx, profileId: "profile-1" }),
    );
    expect(readCalendarFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        profileId: "profile-1",
        periodStart: "2026-04-13",
        periodEndExclusive: "2026-04-20",
      }),
    );
  });

  it("uses the canonical active-member group-event selection predicate", async () => {
    let whereCondition: unknown;
    const limit = vi.fn().mockResolvedValue([]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              leftJoin: vi.fn(() => ({
                leftJoin: vi.fn(() => ({
                  where: vi.fn((condition: unknown) => {
                    whereCondition = condition;
                    return { orderBy: vi.fn(() => ({ limit })) };
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    };

    await expect(
      readSelectedGroupEventsForCalendar({
        db: db as never,
        profileId: "profile-1",
        startDate: "2026-04-13",
        endDateExclusive: "2026-04-20",
        limit: 500,
      }),
    ).resolves.toEqual({ items: [], truncated: false });

    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"group_memberships"."status" =');
    expect(query.sql).toContain('coalesce("group_event_rsvps"."status"');
    expect(query.sql).toContain('"group_event_series_rsvps"."status"');
    expect(query.sql).toContain("'going'");
    expect(query.params).toEqual(
      expect.arrayContaining(["profile-1", "active", "2026-04-13", "2026-04-20"]),
    );
    expect(limit).toHaveBeenCalledWith(501);
  });
});
