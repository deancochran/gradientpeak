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
  contractVersion: "plan-tab-projection-v2" as const,
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
      priority: 8,
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
    expect(result.trainingState.series).toEqual([
      {
        date: "2026-04-13",
        actual: { fitness: 42, fatigue: 45, form: -3 },
        planned: null,
      },
      {
        date: "2026-04-14",
        actual: null,
        planned: { fitness: 43, fatigue: 46, form: -3 },
      },
    ]);
    expect(result.intensityDistribution).toMatchObject({
      status: "complete",
      contributingDurationSeconds: 7200,
    });
    expect(
      result.intensityDistribution.bands.find((band) => band.band === "endurance"),
    ).toMatchObject({ durationSeconds: 7200, percentage: 100 });
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
      contributingDurationSeconds: { status: "partial", value: 3000 },
    });
    expect(result.entries.at(-1)?.id).toBe("planned-498");
  });

  it("preserves finite partial Common Load in daily detail and weekly totals", () => {
    const result = buildPlanningLedger({
      projection: {
        ...projection,
        dayLoads: {
          ...projection.dayLoads,
          "2026-04-13": {
            ...projection.dayLoads["2026-04-13"],
            status: "partial" as const,
            commonLoad: 60,
            completedLoadStatus: "partial" as const,
            completedLoad: 15,
            scheduledLoadStatus: "partial" as const,
            scheduledLoad: 40,
            remainingLoadStatus: "partial" as const,
            remainingLoad: 25,
          },
        },
        ledgerItems: projection.ledgerItems.map((item) => ({
          ...item,
          loadStatus: "partial" as const,
          intensityStatus: "partial" as const,
          contributingDurationStatus: "partial" as const,
        })),
        sourceCoverage: {
          activities: { ...projection.sourceCoverage.activities, status: "partial" as const },
          scheduledItems: {
            ...projection.sourceCoverage.scheduledItems,
            status: "partial" as const,
          },
        },
      },
      request: { period: "week", anchorDate: "2026-04-15" },
    });

    expect(result.dailyBreakdown[0]).toMatchObject({
      completed: { status: "partial", value: 15 },
      planned: { status: "partial", value: 25 },
      effective: { status: "partial", value: 60 },
    });
    expect(result.load).toMatchObject({
      completed: { status: "partial", value: 15 },
      planned: { status: "partial", value: 25 },
      effective: { status: "partial", value: 60 },
    });
    expect(result.intensity).toMatchObject({ status: "partial" });
    expect(result.intensity.value).not.toBeNull();
    expect(result.intensityDistribution.status).toBe("partial");
    expect(
      result.intensityDistribution.bands.reduce((total, band) => total + band.percentage, 0),
    ).toBeCloseTo(100, 8);
  });

  it("publishes the known weekly subtotal when another day is unavailable", () => {
    const result = buildPlanningLedger({
      projection: {
        ...projection,
        dayLoads: {
          ...projection.dayLoads,
          "2026-04-13": {
            ...projection.dayLoads["2026-04-13"],
            completedLoadStatus: "partial" as const,
            completedLoad: 15,
          },
          "2026-04-14": {
            ...projection.dayLoads["2026-04-14"],
            completedLoadStatus: "unavailable" as const,
            completedLoad: null,
          },
        },
      },
      request: { period: "week", anchorDate: "2026-04-15" },
    });

    expect(result.load.completed).toEqual({ status: "partial", value: 15 });
  });

  it("bounds a daily training-state series to the trailing seven-day context", () => {
    const actual = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-04-${String(8 + index).padStart(2, "0")}`,
      longTermLoad: 30 + index,
      recentLoad: 20 + index,
      loadBalance: 10,
    }));
    const result = buildPlanningLedger({
      projection: { ...projection, fitness: { ...projection.fitness, actual } },
      request: { period: "day", anchorDate: "2026-04-15" },
    });

    expect(result.trainingState.series).toHaveLength(7);
    expect(result.trainingState.series[0]?.date).toBe("2026-04-09");
    expect(result.trainingState.series.at(-1)?.date).toBe("2026-04-15");
    expect(result.trainingState.series.every((point) => point.actual !== null)).toBe(true);
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
      expect.objectContaining({
        db: tx,
        profileId: "profile-1",
        request: { startDate: "2026-04-06", endDate: "2026-04-19" },
      }),
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

  it("requests the trailing seven-day state context for a daily ledger", async () => {
    const transaction = vi.fn(async (operation) => operation({ marker: "daily-ledger-snapshot" }));
    const readProjection = vi.fn(async () => projection);
    const readCalendarFacts = vi.fn(async () => ({
      entries: [],
      sourceCoverage: {
        calendarEvents: {
          startDate: "2026-04-15",
          endDate: "2026-04-15",
          status: "complete" as const,
        },
        groupEvents: {
          startDate: "2026-04-15",
          endDate: "2026-04-15",
          status: "complete" as const,
        },
      },
    }));

    await readPlanningLedger({
      db: { $client: {}, transaction } as never,
      profileId: "profile-1",
      request: { period: "day", anchorDate: "2026-04-15" },
      dependencies: { readProjection, readCalendarFacts },
    });

    expect(readProjection).toHaveBeenCalledWith(
      expect.objectContaining({ request: { startDate: "2026-04-09", endDate: "2026-04-15" } }),
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
