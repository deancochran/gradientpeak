import { athleteIntelligenceModelInputSchema } from "@repo/core";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { getRequiredDb } from "../../../db";
import { sourceId, temporalOverlayValue } from "../evidence-adapters";
import {
  type AthleteIntelligenceDataSource,
  type AthleteIntelligenceRows,
  createDrizzleAthleteIntelligenceDataSource,
  materializeAthleteIntelligenceModelInput,
  mergeBoundedScheduleRows,
  modelReaderBounds,
  parsePersistedScheduleRecurrence,
  readEligibleRecurringEventPages,
} from "../model-reader";

const asOf = new Date("2026-06-01T12:00:00.000Z");
const profileId = "athlete-a";
const pgDialect = new PgDialect();

interface CapturedSelect {
  from: unknown;
  leftJoins: unknown[][];
  limit: number | undefined;
  offset: number | undefined;
  orderBy: unknown[];
  where: unknown;
}

interface FluentSelect extends PromiseLike<unknown[]> {
  from(table: unknown): FluentSelect;
  leftJoin(...args: unknown[]): FluentSelect;
  innerJoin(...args: unknown[]): FluentSelect;
  where(condition: unknown): FluentSelect;
  orderBy(...columns: unknown[]): FluentSelect;
  limit(value: number): FluentSelect;
  offset(value: number): FluentSelect;
}

function createFluentReadDb(results: readonly unknown[][]) {
  const selects: CapturedSelect[] = [];
  let selectIndex = 0;
  const db = {
    select: () => {
      const result = results[selectIndex++] ?? [];
      const capture: CapturedSelect = {
        from: undefined,
        leftJoins: [],
        limit: undefined,
        offset: undefined,
        orderBy: [],
        where: undefined,
      };
      selects.push(capture);
      const query: FluentSelect = {
        from: (table) => {
          capture.from = table;
          return query;
        },
        leftJoin: (...args) => {
          capture.leftJoins.push(args);
          return query;
        },
        innerJoin: (...args) => {
          capture.leftJoins.push(args);
          return query;
        },
        where: (condition) => {
          capture.where = condition;
          return query;
        },
        orderBy: (...columns) => {
          capture.orderBy = columns;
          return query;
        },
        limit: (value) => {
          capture.limit = value;
          return query;
        },
        offset: (value) => {
          capture.offset = value;
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: Drizzle select builders are awaitable.
        then: (onfulfilled, onrejected) =>
          Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined),
      };
      return query;
    },
  };
  return { db, selects };
}

function querySql(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as SQL);
}

function rows(): AthleteIntelligenceRows {
  const metricNames = [
    "ftp",
    "lthr",
    "max_hr",
    "resting_hr",
    "vo2_max",
    "weight_kg",
    "hrv_rmssd",
    "sleep_hours",
    "stress_score",
    "soreness_level",
    "wellness_score",
  ];
  const units: Record<string, string> = {
    ftp: "W",
    lthr: "bpm",
    max_hr: "beats per minute",
    resting_hr: "bpm",
    vo2_max: "ml/kg/min",
    weight_kg: "pounds",
    hrv_rmssd: "ms",
    sleep_hours: "minutes",
    stress_score: "score",
    soreness_level: "points",
    wellness_score: "score",
  };
  return {
    profile: {
      id: profileId,
      dob: new Date("1990-06-01T00:00:00.000Z"),
      planningTimezone: "America/New_York",
      preferredUnits: "imperial",
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    },
    metrics: [
      ...metricNames.map((type, index) => ({
        profileId,
        id: `metric-${type}`,
        referenceActivityId: null,
        type,
        value: type === "weight_kg" ? 220 : type === "sleep_hours" ? 480 : index + 1,
        unit: units[type] ?? "unsupported",
        recordedAt: new Date("2026-05-30T00:00:00.000Z"),
        createdAt: new Date("2026-05-30T00:00:00.000Z"),
        updatedAt: new Date("2026-05-30T00:00:00.000Z"),
      })),
      {
        profileId,
        id: "older-ftp",
        referenceActivityId: null,
        type: "ftp",
        value: 100,
        unit: "watts",
        recordedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        profileId,
        id: "future-ftp",
        referenceActivityId: null,
        type: "ftp",
        value: 999,
        unit: "watts",
        recordedAt: new Date("2026-06-02T00:00:00.000Z"),
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      },
    ],
    activities: [
      {
        profileId,
        id: "activity-1",
        activityPlanId: "plan-1",
        routeId: "route-1",
        type: "Cycling",
        startedAt: new Date("2026-05-31T10:00:00.000Z"),
        finishedAt: new Date("2026-05-31T11:00:00.000Z"),
        durationSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 30000,
        ascentMeters: 250,
        descentMeters: 250,
        calories: 500,
        averageHeartRate: 150,
        maximumHeartRate: 180,
        averagePower: 200,
        maximumPower: 500,
        normalizedPower: 220,
        averageCadence: 88,
        maximumCadence: 110,
        averageSpeed: 8.33,
        maximumSpeed: 15,
        createdAt: new Date("2026-05-31T11:00:00.000Z"),
        updatedAt: new Date("2026-05-31T11:00:00.000Z"),
      },
    ],
    efforts: [
      {
        profileId,
        id: "effort-1",
        activityId: "activity-1",
        recordedAt: new Date("2026-05-31T10:10:00.000Z"),
        sport: "bike",
        kind: "power",
        durationSeconds: 300,
        startOffsetSeconds: 600,
        unit: "watts",
        value: 350,
        source: "provider",
        provenance: { observation_type: "observed", trusted: true },
        createdAt: new Date("2026-05-31T10:10:00.000Z"),
        updatedAt: new Date("2026-05-31T10:10:00.000Z"),
      },
      {
        profileId,
        id: "effort-threshold",
        activityId: "activity-1",
        recordedAt: new Date("2026-05-31T10:45:00.000Z"),
        sport: "bike",
        kind: "power",
        durationSeconds: 1200,
        startOffsetSeconds: 1200,
        unit: "watts",
        value: 250,
        source: "imported",
        method: "activity_file_best_effort",
        provenance: { activity_id: "activity-1", derived_from: "activity_file_stream" },
        createdAt: new Date("2026-05-31T10:45:00.000Z"),
        updatedAt: new Date("2026-05-31T10:45:00.000Z"),
      },
    ],
    goals: [
      {
        profileId,
        id: "goal-1",
        targetDate: "2026-09-01",
        priority: 8,
        activityCategory: "bike",
        targetPayload: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 300,
        },
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-02T00:00:00.000Z"),
      },
    ],
    trainingSettings: {
      profileId,
      settings: {
        availability: {
          weekly_windows: [
            {
              day: "monday",
              windows: [{ start_minute_of_day: 360, end_minute_of_day: 480 }],
              max_sessions: 2,
            },
          ],
          hard_rest_days: ["sunday"],
        },
        dose_limits: {
          max_single_session_duration_minutes: 120,
          max_weekly_duration_minutes: 600,
          sport_overrides: { bike: { max_sessions_per_week: 4, max_weekly_duration_minutes: 400 } },
        },
        training_style: {
          progression_pace: 0.5,
          week_pattern_preference: 0.5,
          strength_integration_priority: 0.2,
        },
        recovery_preferences: {
          recovery_priority: 0.8,
          post_goal_recovery_days: 5,
          systemic_fatigue_tolerance: 0.3,
        },
        adaptation_preferences: {},
        goal_strategy_preferences: { target_surplus_preference: 0.2, taper_style_preference: 0.7 },
        baseline_fitness: { is_enabled: true, override_ctl: 55, override_atl: 65 },
      },
      updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    },
    schedule: [
      {
        profileId,
        id: "event-1",
        type: "planned",
        status: "scheduled",
        startsAt: new Date("2026-06-10T10:00:00.000Z"),
        endsAt: new Date("2026-06-10T11:00:00.000Z"),
        timezone: "UTC",
        allDay: false,
        linkedActivityId: null,
        trainingPlanId: "training-plan-1",
        activityPlanId: "plan-1",
        routeId: "route-1",
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: { sport: "running" },
        recurrenceRule: null,
      },
    ],
  };
}

const readRows = (value: AthleteIntelligenceRows): AthleteIntelligenceDataSource => ({
  read: async () => value,
});

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("fixture item missing");
  return item;
}

describe("materializeAthleteIntelligenceModelInput", () => {
  it("enforces source-side profile, as-of, ordering, and bounded-read limits without writes", async () => {
    const { db, selects } = createFluentReadDb([
      [], // selected goal
      [], // profile
      [], // metrics
      [], // activities
      [], // efforts
      [], // training settings
      [], // nonrecurring schedule
      [], // recurring schedule page
    ]);
    const source = createDrizzleAthleteIntelligenceDataSource(
      db as unknown as ReturnType<typeof getRequiredDb>,
    );

    await source.read({
      profileId,
      goalId: "goal-1",
      asOf,
      activityFrom: new Date("2025-12-03T12:00:00.000Z"),
      bounds: modelReaderBounds,
    });

    expect(Object.keys(db)).toEqual(["select"]);
    expect(selects).toHaveLength(8);
    for (const read of selects) {
      const query = querySql(read?.where);
      expect(query.params).toContain(profileId);
      expect(query.params.some((value) => Date.parse(String(value)) === asOf.getTime())).toBe(true);
    }
    expect(selects[0]?.limit).toBe(1);
    expect(selects[2]).toMatchObject({
      limit: modelReaderBounds.metrics + 1,
      orderBy: [expect.anything(), expect.anything()],
    });
    expect(selects[3]).toMatchObject({
      limit: modelReaderBounds.activities + 1,
      leftJoins: [[expect.anything(), expect.anything()]],
      orderBy: [expect.anything(), expect.anything()],
    });
    expect(selects[4]).toMatchObject({
      limit: modelReaderBounds.efforts + 1,
      orderBy: [expect.anything(), expect.anything()],
    });
    expect(selects[6]).toMatchObject({
      limit: modelReaderBounds.schedule + 1,
      orderBy: [expect.anything(), expect.anything(), expect.anything()],
    });
    expect(selects[7]).toMatchObject({
      limit: 101,
      offset: 0,
      orderBy: [expect.anything(), expect.anything()],
    });
  });

  it("propagates bounded source coverage into the canonical model contract", async () => {
    const boundedMetricRows = Array.from({ length: modelReaderBounds.metrics + 1 }, () => ({}));
    const boundedActivityRows = Array.from(
      { length: modelReaderBounds.activities + 1 },
      () => ({}),
    );
    const boundedEffortRows = Array.from({ length: modelReaderBounds.efforts + 1 }, () => ({}));
    const { db } = createFluentReadDb([
      [],
      [],
      boundedMetricRows,
      boundedActivityRows,
      boundedEffortRows,
      [],
      [],
      [],
    ]);
    const source = createDrizzleAthleteIntelligenceDataSource(
      db as unknown as ReturnType<typeof getRequiredDb>,
    );

    const result = await source.read({
      profileId,
      goalId: "goal-1",
      asOf,
      activityFrom: new Date("2025-12-03T12:00:00.000Z"),
      bounds: modelReaderBounds,
    });

    expect(result.metrics).toHaveLength(modelReaderBounds.metrics);
    expect(result.activities).toHaveLength(modelReaderBounds.activities);
    expect(result.efforts).toHaveLength(modelReaderBounds.efforts);
    expect(result.readCoverage).toEqual({
      metrics: { state: "truncated", reason: "query_limit_reached" },
      activities: { state: "truncated", reason: "query_limit_reached" },
      efforts: { state: "truncated", reason: "query_limit_reached" },
      schedules: { state: "complete", reason: null },
    });
  });

  it("materializes persisted goal sport into the canonical header when objective sport is omitted", async () => {
    const persistedGoal = {
      ...first(rows().goals),
      activityCategory: "Cycling",
      targetPayload: { type: "completion", distance_m: 10_000 },
    };
    const { db } = createFluentReadDb([[persistedGoal], [rows().profile], [], [], [], [], [], []]);
    const dataSource = createDrizzleAthleteIntelligenceDataSource(
      db as unknown as ReturnType<typeof getRequiredDb>,
    );

    const result = await materializeAthleteIntelligenceModelInput({ dataSource, profileId, asOf });
    const goal = first(result.goals);

    expect(goal.objective).toEqual({
      type: "completion",
      distance_m: 10_000,
    });
    expect(goal.goalSport).toBe("bike");
    expect(result.evidenceRegistry[goal.sourceId]?.sport).toBe("bike");
  });

  it("marks schedule coverage truncated when a date-only goal has no typed planning timezone", async () => {
    const selectedGoal = first(rows().goals);
    const { db } = createFluentReadDb([[selectedGoal], [], [], [], [], [], [], []]);
    const dataSource = createDrizzleAthleteIntelligenceDataSource(
      db as unknown as ReturnType<typeof getRequiredDb>,
    );

    const sourceRows = await dataSource.read({
      profileId,
      goalId: selectedGoal.id,
      asOf,
      activityFrom: new Date("2025-12-03T12:00:00.000Z"),
      bounds: modelReaderBounds,
    });

    expect(sourceRows.readCoverage?.schedules).toEqual({
      state: "truncated",
      reason: "source_window_truncated",
    });
  });

  it("keeps active and future schedule candidates when source pages contain more than the bound of historical recurring rows", async () => {
    const event = first(rows().schedule);
    const historicalRecurring = Array.from(
      { length: modelReaderBounds.schedule + 1 },
      (_, index) => ({
        ...event,
        id: `historical-recurring-${String(index).padStart(3, "0")}`,
        startsAt: new Date("2026-01-01T10:00:00.000Z"),
        endsAt: new Date("2026-01-01T11:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20260701T100000Z",
      }),
    );
    const future = {
      ...event,
      id: "future-nonrecurring",
      startsAt: new Date("2026-06-10T10:00:00.000Z"),
      endsAt: new Date("2026-06-10T11:00:00.000Z"),
    };
    const active = {
      ...event,
      id: "active-nonrecurring",
      startsAt: new Date("2026-06-01T11:00:00.000Z"),
      endsAt: new Date("2026-06-01T13:00:00.000Z"),
    };
    const { db } = createFluentReadDb([
      [],
      [],
      [],
      [],
      [],
      [],
      [future, active],
      historicalRecurring,
      [],
    ]);
    const source = createDrizzleAthleteIntelligenceDataSource(
      db as unknown as ReturnType<typeof getRequiredDb>,
    );

    const result = await source.read({
      profileId,
      goalId: "goal-1",
      asOf,
      activityFrom: new Date("2025-12-03T12:00:00.000Z"),
      bounds: modelReaderBounds,
    });

    expect(result.schedule).toHaveLength(modelReaderBounds.schedule);
    expect(result.schedule.map((item) => item.id)).toContain("future-nonrecurring");
    expect(result.schedule.map((item) => item.id)).toContain("active-nonrecurring");
    expect(result.scheduleTruncated).toBe(true);
    expect(result.readCoverage?.schedules).toEqual({
      state: "truncated",
      reason: "query_limit_reached",
    });
  });

  it("scopes and bounds the port request before materializing canonical, fully evidenced data", async () => {
    let request: Parameters<AthleteIntelligenceDataSource["read"]>[0] | undefined;
    const dataSource: AthleteIntelligenceDataSource = {
      read: async (input) => {
        request = input;
        return rows();
      },
    };
    const result = await materializeAthleteIntelligenceModelInput({ dataSource, profileId, asOf });

    expect(request).toMatchObject({ profileId, asOf, bounds: modelReaderBounds });
    expect(request?.activityFrom.toISOString()).toBe("2025-12-03T12:00:00.000Z");
    expect(request?.goalId).toBe("goal-1");
    expect(result.athleteId).toBe(profileId);
    expect(result.metricEvidence).toHaveLength(12); // eleven stored types plus derived age
    expect(result.metricEvidence.find((metric) => metric.metricType === "ftp")?.value.value).toBe(
      1,
    );
    expect(
      result.metricEvidence.find((metric) => metric.metricType === "weight_kg")?.value.value,
    ).toBeCloseTo(99.7903, 3);
    expect(
      result.metricEvidence.find((metric) => metric.metricType === "sleep_hours")?.value.value,
    ).toBe(8);
    expect(result.physiology.preferredUnits.value).toEqual({
      distance: "miles",
      elevation: "feet",
      mass: "pounds",
      temperature: "fahrenheit",
    });
    expect(result.activities[0]).toMatchObject({ athleteId: profileId, sport: "bike" });
    expect(result.activities[0]?.metrics.trainingLoad).toMatchObject({
      value: 225,
      identity: {
        family: "tss",
        method: "power_threshold",
        sourceDefinition: "activity_analysis",
        sport: "bike",
        version: "1",
      },
    });
    expect(result.efforts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "power",
          powerWatts: 350,
          activitySourceId: "activity:activity-1:record",
        }),
      ]),
    );
    expect(result.trainingContext).toMatchObject({
      preferredSports: ["bike"],
      weeklyTimeWindows: [{ day: "monday", startMinuteLocal: 360, endMinuteLocal: 480 }],
      hardRestDays: ["sunday"],
      allowDoubleDays: null,
      recoveryPreference: null,
      taperPreference: null,
      progressionPreference: null,
    });
    expect(result.trainingContext.sportDoseLimits[0]?.maximumSessionsPerWeek.value).toBe(4);
    expect(result.trainingContext.ctlOverride).toMatchObject({ value: null, identity: null });
    expect(result.plannedSchedule[0]?.startAt).toBe("2026-06-10T10:00:00.000Z");
    expect(result.readCoverage).toEqual({
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "truncated", reason: "source_window_truncated" },
    });
    for (const activity of result.activities)
      expect(result.evidenceRegistry[activity.sourceId]).toBeDefined();
    expect(
      Object.values(result.evidenceRegistry).every(
        (item) => item.athleteId === profileId && Date.parse(item.observedAt) <= asOf.getTime(),
      ),
    ).toBe(true);
  });

  it("materializes canonical running threshold pace and swimming CSS metrics with sport scope", async () => {
    const sourceRows = rows();
    sourceRows.metrics.push(
      {
        profileId,
        id: "metric-run-threshold",
        referenceActivityId: null,
        type: "threshold_pace_seconds_per_km",
        value: 270,
        unit: "s/km",
        recordedAt: new Date("2026-05-31T00:00:00.000Z"),
        createdAt: new Date("2026-05-31T00:00:00.000Z"),
        updatedAt: new Date("2026-05-31T00:00:00.000Z"),
      },
      {
        profileId,
        id: "metric-swim-css",
        referenceActivityId: null,
        type: "css_seconds_per_100m",
        value: 95,
        unit: "s/100m",
        recordedAt: new Date("2026-05-31T00:00:00.000Z"),
        createdAt: new Date("2026-05-31T00:00:00.000Z"),
        updatedAt: new Date("2026-05-31T00:00:00.000Z"),
      },
    );
    const dataSource: AthleteIntelligenceDataSource = { read: async () => sourceRows };

    const result = await materializeAthleteIntelligenceModelInput({ dataSource, profileId, asOf });
    const run = result.metricEvidence.find(
      (metric) => metric.metricType === "threshold_pace_seconds_per_km",
    );
    const swim = result.metricEvidence.find(
      (metric) => metric.metricType === "css_seconds_per_100m",
    );

    expect(run?.value).toMatchObject({ value: 270, unit: "seconds_per_km" });
    expect(swim?.value).toMatchObject({ value: 95, unit: "seconds_per_100m" });
    expect(result.evidenceRegistry[run?.value.evidenceSourceIds[0] ?? ""]?.sport).toBe("run");
    expect(result.evidenceRegistry[swim?.value.evidenceSourceIds[0] ?? ""]?.sport).toBe("swim");
  });

  it("keeps activity training load unknown when no compatible dynamic method is available", async () => {
    const value = rows();
    value.metrics = value.metrics.filter(
      (metric) => metric.type !== "ftp" && metric.type !== "lthr",
    );
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.activities[0]?.metrics.trainingLoad).toMatchObject({
      value: null,
      identity: null,
    });
  });

  it("excludes modeled onboarding curves from observed efforts", async () => {
    const value = rows();
    value.efforts = [
      {
        ...first(value.efforts),
        id: "modeled-effort",
        source: "estimated",
        method: "onboarding_modeled_curve",
        provenance: { observation_type: "modeled" },
      },
    ];
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.efforts).toEqual([]);
    expect(result.evidenceRegistry["effort:modeled-effort:value-modeled"]).toMatchObject({
      validityState: "unknown",
      rawObservation: { value: 350, unit: "watts" },
    });
  });

  it("preserves reference-activity sport across current LTHR observations", async () => {
    const value = rows();
    const genericLthr = value.metrics.find((metric) => metric.type === "lthr");
    if (!genericLthr) throw new Error("fixture LTHR missing");
    value.metrics.push(
      {
        ...genericLthr,
        id: "run-lthr",
        value: 168,
        referenceActivityId: "run-reference",
        referenceActivityType: "run",
        recordedAt: new Date("2026-05-28T00:00:00.000Z"),
      },
      {
        ...genericLthr,
        id: "bike-lthr",
        value: 178,
        referenceActivityId: "bike-reference",
        referenceActivityType: "bike",
        recordedAt: new Date("2026-05-29T00:00:00.000Z"),
      },
    );
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const lthrEvidence = result.metricEvidence.filter((metric) => metric.metricType === "lthr");

    expect(lthrEvidence).toHaveLength(3);
    expect(
      lthrEvidence.map((metric) => {
        const evidenceId = first(metric.value.evidenceSourceIds);
        return [metric.value.value, result.evidenceRegistry[evidenceId]?.sport];
      }),
    ).toEqual(
      expect.arrayContaining([
        [168, "run"],
        [178, "bike"],
      ]),
    );
  });

  it("rejects a data source that leaks another profile", async () => {
    const leaked = rows();
    if (!leaked.profile) throw new Error("fixture profile missing");
    leaked.profile = { ...leaked.profile, id: "athlete-b" };
    await expect(
      materializeAthleteIntelligenceModelInput({
        dataSource: { read: async () => leaked },
        profileId,
        asOf,
      }),
    ).rejects.toThrow("Athlete profile not found");
  });

  it("rejects a profile leak in every collection at the data-source boundary", async () => {
    const collectionMutations: Array<(value: AthleteIntelligenceRows) => void> = [
      (value) => {
        value.metrics[0] = { ...first(value.metrics), profileId: "athlete-b" };
      },
      (value) => {
        value.activities[0] = { ...first(value.activities), profileId: "athlete-b" };
      },
      (value) => {
        value.efforts[0] = { ...first(value.efforts), profileId: "athlete-b" };
      },
      (value) => {
        value.goals[0] = { ...first(value.goals), profileId: "athlete-b" };
      },
      (value) => {
        value.schedule[0] = { ...first(value.schedule), profileId: "athlete-b" };
      },
      (value) => {
        if (value.trainingSettings)
          value.trainingSettings = { ...value.trainingSettings, profileId: "athlete-b" };
      },
    ];
    for (const mutate of collectionMutations) {
      const leaked = rows();
      mutate(leaked);
      await expect(
        materializeAthleteIntelligenceModelInput({ dataSource: readRows(leaked), profileId, asOf }),
      ).rejects.toThrow("profile boundary violation");
    }
  });

  it("filters observed data by asOf, sorts deterministically, and applies explicit bounds", async () => {
    const value = rows();
    const activity = first(value.activities);
    value.activities = Array.from({ length: modelReaderBounds.activities + 5 }, (_, index) => ({
      ...activity,
      id: `activity-${String(index).padStart(3, "0")}`,
      startedAt: new Date(asOf.getTime() - (index + 1) * 1_000),
      finishedAt: new Date(asOf.getTime() - index * 1_000),
    }));
    value.activities.push({
      ...activity,
      id: "future",
      startedAt: new Date(asOf.getTime() + 1_000),
      finishedAt: new Date(asOf.getTime() + 2_000),
    });
    value.efforts = [];
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(result.activities).toHaveLength(modelReaderBounds.activities);
    expect(result.activities[0]?.sourceId).toBe("activity:activity-000:record");
    expect(result.activities.some((activityItem) => activityItem.sourceId.includes("future"))).toBe(
      false,
    );
  });

  it("selects the deterministic latest metric and includes all eleven stored supported types", async () => {
    const value = rows();
    value.metrics.push({
      profileId,
      id: "metric-ftp-z",
      referenceActivityId: null,
      type: "ftp",
      value: 444,
      unit: "watts",
      recordedAt: new Date("2026-05-30T00:00:00.000Z"),
      createdAt: new Date("2026-05-30T00:00:00.000Z"),
      updatedAt: new Date("2026-05-30T00:00:00.000Z"),
    });
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const stored = result.metricEvidence.filter((metric) => metric.metricType !== "age_years");
    expect(stored.map((metric) => metric.metricType).sort()).toEqual(
      [
        "ftp",
        "hrv_rmssd",
        "lthr",
        "max_hr",
        "resting_hr",
        "sleep_hours",
        "soreness_level",
        "stress_score",
        "vo2_max",
        "weight_kg",
        "wellness_score",
      ].sort(),
    );
    expect(result.metricEvidence.find((metric) => metric.metricType === "ftp")?.value.value).toBe(
      444,
    );
  });

  it("normalizes supported effort units and retains incompatible raw effort evidence", async () => {
    const value = rows();
    const effort = first(value.efforts);
    value.efforts = [
      { ...effort, id: "kw", value: 0.4, unit: "kW" },
      {
        ...effort,
        id: "mph",
        activityId: null,
        sport: "run",
        kind: "speed",
        value: 10,
        unit: "mph",
      },
      { ...effort, id: "unsupported", activityId: null, value: 10, unit: "horsepower" },
    ];
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(
      result.efforts.find((effortItem) => effortItem.sourceId === "effort:kw:record"),
    ).toMatchObject({ kind: "power", powerWatts: 400 });
    expect(
      result.efforts.find((effortItem) => effortItem.sourceId === "effort:mph:record"),
    ).toMatchObject({ kind: "speed", speedMetersPerSecond: 4.4704 });
    expect(result.efforts.some((effortItem) => effortItem.sourceId.includes("unsupported"))).toBe(
      false,
    );
    expect(result.evidenceRegistry["effort:unsupported:value-raw"]).toMatchObject({
      lineageGroupId: "activity:effort-unsupported",
      rawObservation: { value: 10, unit: "horsepower" },
      validityState: "invalid",
      compatibilityState: "incompatible_unit",
    });
  });

  it("maps persisted preferences and abstains from identity-less baseline load", async () => {
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(rows()),
      profileId,
      asOf,
    });
    expect(result.trainingContext.weeklyTimeWindows).toEqual([
      { day: "monday", startMinuteLocal: 360, endMinuteLocal: 480 },
    ]);
    expect(result.trainingContext.maximumSessionsPerDay.value).toBe(2);
    expect(result.trainingContext.sportDoseLimits[0]).toMatchObject({
      sport: "bike",
      maximumWeeklyMinutes: { value: 400 },
      maximumSessionsPerWeek: { value: 4 },
    });
    expect(result.trainingContext.fatigueTolerance.value).toBe(0.3);
    expect(result.trainingContext.ctlOverride).toMatchObject({ value: null, identity: null });
    expect(result.trainingContext.atlOverride).toMatchObject({ value: null, identity: null });
    expect(result.trainingContext.strategy).toBeNull();
  });

  it("falls back to absent-setting semantics for malformed persisted preferences", async () => {
    const malformed = rows();
    if (!malformed.trainingSettings) throw new Error("fixture settings missing");
    malformed.trainingSettings = {
      ...malformed.trainingSettings,
      settings: { availability: {} },
    };
    const absent = rows();
    absent.trainingSettings = null;

    const [malformedResult, absentResult] = await Promise.all([
      materializeAthleteIntelligenceModelInput({
        dataSource: readRows(malformed),
        profileId,
        asOf,
      }),
      materializeAthleteIntelligenceModelInput({
        dataSource: readRows(absent),
        profileId,
        asOf,
      }),
    ]);

    expect(malformedResult.trainingContext).toEqual(absentResult.trainingContext);
  });

  it("excludes future observations but includes bounded future planned schedule", async () => {
    const value = rows();
    value.metrics.push({
      profileId,
      id: "future-weight",
      referenceActivityId: null,
      type: "weight_kg",
      value: 1,
      unit: "kilograms",
      recordedAt: new Date("2026-06-02T00:00:00.000Z"),
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    });
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(
      result.metricEvidence.find((metric) => metric.metricType === "weight_kg")?.value.value,
    ).not.toBe(1);
    expect(result.plannedSchedule).toHaveLength(1);
    expect(Date.parse(first(result.plannedSchedule).startAt)).toBeGreaterThan(asOf.getTime());
  });

  it("binds every recursive evidence reference to a registry item and reparses the frozen schema", async () => {
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(rows()),
      profileId,
      asOf,
    });
    const references: string[] = [];
    const collect = (candidate: unknown): void => {
      if (Array.isArray(candidate)) {
        candidate.forEach(collect);
        return;
      }
      if (!candidate || typeof candidate !== "object") return;
      for (const [key, child] of Object.entries(candidate)) {
        if (key === "evidenceSourceIds" && Array.isArray(child))
          references.push(...(child as string[]));
        else if (key !== "evidenceRegistry") collect(child);
      }
    };
    collect(result);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((id) => result.evidenceRegistry[id] !== undefined)).toBe(true);
    expect(athleteIntelligenceModelInputSchema.safeParse(result).success).toBe(true);
  });

  it("excludes profile, goals, settings, and events updated after asOf", async () => {
    const futureUpdated = rows();
    futureUpdated.goals[0] = {
      ...first(futureUpdated.goals),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    if (futureUpdated.trainingSettings)
      futureUpdated.trainingSettings = {
        ...futureUpdated.trainingSettings,
        updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      };
    futureUpdated.schedule[0] = {
      ...first(futureUpdated.schedule),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(futureUpdated),
      profileId,
      asOf,
    });
    expect(result.goals).toEqual([]);
    expect(result.plannedSchedule).toEqual([]);
    expect(result.trainingContext.maximumWeeklyMinutes.value).toBeNull();
    expect(result.trainingContext.weeklyTimeWindows).toEqual([]);

    const futureProfile = rows();
    if (!futureProfile.profile) throw new Error("fixture profile missing");
    futureProfile.profile = {
      ...futureProfile.profile,
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    await expect(
      materializeAthleteIntelligenceModelInput({
        dataSource: readRows(futureProfile),
        profileId,
        asOf,
      }),
    ).rejects.toThrow("Athlete profile not found");
  });

  it("uses temporal summary values only when their update is observable", () => {
    expect(
      temporalOverlayValue({
        legacyValue: 100,
        summaryValue: 200,
        summaryUpdatedAt: new Date("2026-05-31T00:00:00.000Z"),
        asOf,
      }),
    ).toBe(200);
    expect(
      temporalOverlayValue({
        legacyValue: 100,
        summaryValue: 200,
        summaryUpdatedAt: new Date("2026-06-02T00:00:00.000Z"),
        asOf,
      }),
    ).toBe(100);
  });

  it("timestamps activity measurements at completion and preserves linked effort lineage", async () => {
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(rows()),
      profileId,
      asOf,
    });
    const activity = first(result.activities);
    for (const id of activity.metrics.distanceMeters.evidenceSourceIds)
      expect(result.evidenceRegistry[id]?.observedAt).toBe(activity.endedAt);
    const effort = first(result.efforts);
    const effortEvidenceIds = [
      effort.sourceId,
      ...effort.evidenceSourceIds,
      ...(effort.startOffsetSeconds?.evidenceSourceIds ?? []),
      ...(effort.endOffsetSeconds?.evidenceSourceIds ?? []),
    ];
    expect(
      effortEvidenceIds.every(
        (id) => result.evidenceRegistry[id]?.lineageGroupId === activity.lineageGroupId,
      ),
    ).toBe(true);
  });

  it("represents unsupported metric units as unavailable while retaining incompatible raw lineage", async () => {
    const value = rows();
    value.metrics = value.metrics.map((metric) =>
      metric.type === "weight_kg" ? { ...metric, unit: "stone" } : metric,
    );
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const metric = result.metricEvidence.find((item) => item.metricType === "weight_kg");
    expect(metric?.value).toEqual({
      value: 220,
      unit: "stone",
      evidenceSourceIds: ["metric:metric-weight_kg:weight_kg-raw"],
    });
    expect(result.physiology.weightKg.value).toBeNull();
    expect(result.physiology.weightKg.evidenceSourceIds).toEqual([
      "metric:metric-weight_kg:weight_kg-unavailable",
    ]);
    expect(result.evidenceRegistry["metric:metric-weight_kg:weight_kg-raw"]).toMatchObject({
      lineageGroupId: "metric:metric-weight_kg",
      rawObservation: { value: 220, unit: "stone" },
      validityState: "valid",
      compatibilityState: "incompatible_unit",
    });
    expect(result.evidenceRegistry["metric:metric-weight_kg:weight_kg-unavailable"]).toMatchObject({
      lineageGroupId: "metric:metric-weight_kg",
      rawObservation: { value: null, unit: "kilograms" },
      compatibilityState: "incompatible_unit",
    });
  });

  it("encodes source ID components without delimiter collisions", () => {
    expect(sourceId("metric", "a:b", "c")).not.toBe(sourceId("metric", "a", "b:c"));
  });

  it("does not let more-than-limit expired recurring rows displace a future plan", async () => {
    const value = rows();
    const event = first(value.schedule);
    value.schedule = Array.from({ length: modelReaderBounds.schedule + 10 }, (_, index) => ({
      ...event,
      id: `old-${index}`,
      startsAt: new Date("2025-01-01T00:00:00.000Z"),
      endsAt: new Date("2025-01-01T01:00:00.000Z"),
      recurrenceRule: "FREQ=WEEKLY;UNTIL=20250501T010000Z",
    }));
    value.schedule.push(event);
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(result.plannedSchedule).toHaveLength(1);
    expect(first(result.plannedSchedule).sourceId).toContain("event-event-1");
  });

  it("prioritizes current and future plans over more-than-limit historical open-ended rows", async () => {
    const value = rows();
    const event = first(value.schedule);
    value.schedule = [
      ...Array.from({ length: modelReaderBounds.schedule + 10 }, (_, index) => ({
        ...event,
        id: `historical-open-${String(index).padStart(3, "0")}`,
        startsAt: new Date("2025-01-01T00:00:00.000Z"),
        endsAt: null,
      })),
      event,
    ];

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(first(result.plannedSchedule)).toMatchObject({
      sourceId: "manual:event-historical-open-000:record",
      lineageGroupId: "manual-test:event-historical-open-000",
    });
    expect(result.readCoverage?.schedules.state).toBe("truncated");
  });

  it("pages past more than 100 ineligible recurring rows at the data-source boundary", async () => {
    const event = first(rows().schedule);
    const candidates = [
      ...Array.from({ length: 125 }, (_, index) => ({
        ...event,
        id: `expired-${String(index).padStart(3, "0")}`,
        startsAt: new Date("2025-01-01T00:00:00.000Z"),
        endsAt: new Date("2025-01-01T01:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20250501T010000Z",
      })),
      {
        ...event,
        id: "active-after-expired",
        startsAt: new Date("2025-01-02T00:00:00.000Z"),
        endsAt: new Date("2025-01-02T01:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20260701T010000Z",
      },
    ];
    const requests: Array<{ offset: number; limit: number }> = [];

    const result = await readEligibleRecurringEventPages({
      asOf,
      limit: modelReaderBounds.schedule,
      pageSize: 100,
      readPage: async (offset, limit) => {
        requests.push({ offset, limit });
        return candidates.slice(offset, offset + limit);
      },
    });

    expect(requests).toEqual([
      { offset: 0, limit: 101 },
      { offset: 100, limit: 101 },
    ]);
    expect(result).toMatchObject({ truncated: false, rows: [{ id: "active-after-expired" }] });
  });

  it("marks a nonrecurring limit-plus-one read as truncated", () => {
    const event = first(rows().schedule);
    const nonrecurringRows = Array.from({ length: modelReaderBounds.schedule + 1 }, (_, index) => ({
      ...event,
      id: `nonrecurring-${String(index).padStart(3, "0")}`,
      startsAt: new Date(event.startsAt.getTime() + index * 60_000),
    }));

    const result = mergeBoundedScheduleRows({
      asOf,
      nonrecurringRows,
      recurring: { rows: [], truncated: false },
      limit: modelReaderBounds.schedule,
    });

    expect(result.rows).toHaveLength(modelReaderBounds.schedule);
    expect(result.truncated).toBe(true);
  });

  it("keeps canonical schedule coverage coherent with the legacy schedule state", async () => {
    const value = rows();
    value.readCoverage = {
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "truncated", reason: "query_limit_reached" },
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.readCoverage?.schedules).toEqual({
      state: "truncated",
      reason: "query_limit_reached",
    });
    expect(result.readCoverage?.schedules.state).toBe("truncated");
  });

  it("materializes a header-only consistency goal without borrowing a payload sport", async () => {
    const value = rows();
    value.goals[0] = {
      ...first(value.goals),
      activityCategory: "Cycling",
      targetPayload: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 },
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const goal = first(result.goals);

    expect(goal).toMatchObject({
      goalSport: "bike",
      objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 },
    });
    expect(result.evidenceRegistry[goal.sourceId]?.sport).toBe("bike");
  });

  it("marks schedule coverage truncated rather than treating a UTC cutoff as a planning-date bound", async () => {
    const value = rows();
    value.readCoverage = {
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.readCoverage?.schedules).toEqual({
      state: "truncated",
      reason: "source_window_truncated",
    });
    expect(result.readCoverage?.schedules.state).toBe("truncated");
  });

  it("uses recurring limit-plus-one overflow without marking an exact exhausted bound truncated", async () => {
    const event = first(rows().schedule);
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      ...event,
      id: `recurring-${index}`,
      recurrenceRule: "FREQ=WEEKLY;UNTIL=20260701T010000Z",
    }));
    const read = (values: typeof candidates) =>
      readEligibleRecurringEventPages({
        asOf,
        limit: 2,
        pageSize: 2,
        readPage: async (offset, limit) => values.slice(offset, offset + limit),
      });

    await expect(read(candidates.slice(0, 2))).resolves.toMatchObject({ truncated: false });
    await expect(read(candidates)).resolves.toMatchObject({
      rows: [{ id: "recurring-0" }, { id: "recurring-1" }],
      truncated: true,
    });
  });

  it("marks merged eligible recurring and nonrecurring overflow before the final slice", () => {
    const event = first(rows().schedule);
    const nonrecurring = { ...event, id: "later", startsAt: new Date("2026-06-03T00:00:00Z") };
    const recurring = {
      ...event,
      id: "earlier",
      startsAt: new Date("2026-06-02T00:00:00Z"),
      recurrenceRule: "FREQ=WEEKLY;UNTIL=20260701T010000Z",
    };

    const result = mergeBoundedScheduleRows({
      asOf,
      nonrecurringRows: [nonrecurring],
      recurring: { rows: [recurring], truncated: false },
      limit: 1,
    });

    expect(result.rows.map((row) => row.id)).toEqual(["earlier"]);
    expect(result.truncated).toBe(true);
  });

  it("omits completed schedule entries whose activities are outside the bounded window", async () => {
    const value = rows();
    value.schedule[0] = {
      ...first(value.schedule),
      status: "completed",
      linkedActivityId: "outside-window",
      startsAt: new Date("2026-05-01T00:00:00.000Z"),
      endsAt: new Date("2026-05-01T01:00:00.000Z"),
    };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(result.plannedSchedule).toEqual([]);
  });

  it("preserves referenced activity provenance for metric and physiology evidence", async () => {
    const value = rows();
    value.metrics = value.metrics.map((metric) =>
      metric.type === "weight_kg"
        ? { ...metric, referenceActivityId: "activity-outside-window" }
        : metric,
    );
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const metric = result.metricEvidence.find((item) => item.metricType === "weight_kg");
    const metricSource = metric?.value.evidenceSourceIds[0];
    const physiologySource = result.physiology.weightKg.evidenceSourceIds[0];
    expect(metricSource).toBeDefined();
    expect(physiologySource).toBe(metricSource);
    expect(result.evidenceRegistry[metricSource ?? ""]?.lineageGroupId).toBe(
      "activity:activity-outside-window",
    );
    expect(metricSource?.startsWith("metric:")).toBe(true);
  });

  it("binds available schedule plan and route links to stable plan evidence", async () => {
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(rows()),
      profileId,
      asOf,
    });
    const event = first(result.plannedSchedule);
    expect(event.planSourceId).not.toBeNull();
    const planEvidence = result.evidenceRegistry[event.planSourceId ?? ""];
    expect(planEvidence).toMatchObject({
      sourceType: "manual_observation",
      lineageGroupId: event.lineageGroupId,
      modality: "plan-training-plan+activity-plan+route",
      rawObservation: { value: null, unit: null },
    });
    expect(Date.parse(planEvidence?.observedAt ?? "")).toBeLessThanOrEqual(asOf.getTime());
  });

  it("retains persisted raw metric and effort observations beside canonical derived evidence", async () => {
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(rows()),
      profileId,
      asOf,
    });
    expect(
      result.evidenceRegistry["metric:metric-weight_kg:weight_kg-raw"]?.rawObservation,
    ).toEqual({
      value: 220,
      unit: "pounds",
    });
    expect(
      result.evidenceRegistry["metric:metric-weight_kg:weight_kg"]?.rawObservation,
    ).toMatchObject({
      unit: "kilograms",
    });
    expect(result.evidenceRegistry["effort:effort-1:value-raw"]?.rawObservation).toEqual({
      value: 350,
      unit: "watts",
    });
  });

  it("excludes mutable metric, activity, and effort rows inserted or updated after asOf", async () => {
    const value = rows();
    value.metrics[0] = { ...first(value.metrics), updatedAt: new Date("2026-06-02T00:00:00.000Z") };
    value.activities[0] = {
      ...first(value.activities),
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    value.efforts[0] = { ...first(value.efforts), updatedAt: new Date("2026-06-02T00:00:00.000Z") };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(result.metricEvidence.some((item) => item.metricType === "ftp")).toBe(true); // older observable FTP remains
    expect(result.activities).toEqual([]);
    expect(result.efforts).toEqual([]);
  });

  it("adapts safely typed recurrence and documents relational lap omission", async () => {
    const value = rows();
    value.schedule[0] = {
      ...first(value.schedule),
      recurrenceRule: "RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20260901T000000Z",
      recurrenceTimezone: "America/Los_Angeles",
    };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(first(result.plannedSchedule).recurrence).toEqual({
      frequency: "weekly",
      interval: 2,
      until: "2026-09-01T00:00:00.000Z",
      timezone: "America/Los_Angeles",
    });
    expect(first(result.activities).laps).toEqual([]);
  });

  it("retains a selected-goal schedule event more than one year after assessment", async () => {
    const value = rows();
    value.goals[0] = { ...first(value.goals), targetDate: "2028-01-15" };
    value.schedule[0] = {
      ...first(value.schedule),
      startsAt: new Date("2028-01-15T20:00:00.000Z"),
      endsAt: new Date("2028-01-15T21:00:00.000Z"),
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      goalId: "goal-1",
      asOf,
    });

    expect(first(result.plannedSchedule).startAt).toBe("2028-01-15T20:00:00.000Z");
  });

  it("uses the persisted planning timezone for the goal target-day cutoff", async () => {
    const value = rows();
    value.schedule[0] = {
      ...first(value.schedule),
      // 23:30 on the goal date in the profile's America/New_York planning timezone.
      startsAt: new Date("2026-09-02T03:30:00.000Z"),
      endsAt: new Date("2026-09-02T04:30:00.000Z"),
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      goalId: "goal-1",
      asOf,
    });

    expect(first(result.plannedSchedule).startAt).toBe("2026-09-02T03:30:00.000Z");
  });

  it("retains schedule entries that overlap the assessment window", async () => {
    const value = rows();
    const event = first(value.schedule);
    value.schedule = [
      {
        ...event,
        id: "in-progress-ended",
        startsAt: new Date("2026-06-01T11:00:00.000Z"),
        endsAt: new Date("2026-06-01T13:00:00.000Z"),
      },
      {
        ...event,
        id: "in-progress-open",
        startsAt: new Date("2026-06-01T10:00:00.000Z"),
        endsAt: null,
      },
      {
        ...event,
        id: "already-ended",
        startsAt: new Date("2026-06-01T09:00:00.000Z"),
        endsAt: new Date("2026-06-01T10:00:00.000Z"),
      },
    ];

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.plannedSchedule.map((eventItem) => eventItem.sourceId)).toEqual([
      "manual:event-in-progress-open:record",
      "manual:event-in-progress-ended:record",
    ]);
  });

  it("retains recurring series started before asOf only while future occurrences are possible", async () => {
    const value = rows();
    const event = first(value.schedule);
    value.schedule = [
      {
        ...event,
        id: "recurring-active",
        startsAt: new Date("2026-01-01T10:00:00.000Z"),
        endsAt: new Date("2026-01-01T11:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20260701T100000Z",
      },
      {
        ...event,
        id: "recurring-expired",
        startsAt: new Date("2026-01-01T10:00:00.000Z"),
        endsAt: new Date("2026-01-01T11:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20260501T100000Z",
      },
    ];

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.plannedSchedule.map((eventItem) => eventItem.sourceId)).toEqual([
      "manual:event-recurring-active:record",
    ]);
  });

  it("classifies nonrecurring, supported, unsupported, and malformed recurrence", () => {
    const startsAt = new Date("2026-01-01T10:00:00.000Z");
    expect(parsePersistedScheduleRecurrence(null, startsAt)).toEqual({ state: "nonrecurring" });
    expect(parsePersistedScheduleRecurrence("FREQ=WEEKLY;INTERVAL=2", startsAt)).toMatchObject({
      state: "supported",
      recurrence: { frequency: "weekly", interval: 2 },
    });
    expect(parsePersistedScheduleRecurrence("FREQ=WEEKLY;BYDAY=MO", startsAt)).toEqual({
      state: "unsupported",
    });
    expect(parsePersistedScheduleRecurrence("FREQ=WEEKLY;INTERVAL", startsAt)).toEqual({
      state: "malformed",
    });
  });

  it("marks a persisted unsupported recurrence as a partial schedule read", async () => {
    const value = rows();
    value.schedule[0] = {
      ...first(value.schedule),
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      goalId: "goal-1",
      asOf,
    });
    expect(result.readCoverage?.schedules.state).toBe("truncated");
  });
});
