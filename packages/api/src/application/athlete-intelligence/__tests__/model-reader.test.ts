import {
  athleteIntelligenceModelInputSchema,
  calculateAvailableCommonLoad,
  loadSeriesIdentityForAvailableCommonLoad,
} from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  buildPerformanceModelSnapshotFixture,
  buildPerformanceTargetFactsFixture,
} from "@repo/core/testing/performance-model";
import { activityEfforts } from "@repo/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { getRequiredDb } from "../../../db";
import { sourceId } from "../evidence-adapters";
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

function normalizedPowerResult(valueWatts: number) {
  const result = calculateCyclingNormalizedPower({
    samples: Array.from({ length: 61 }, (_, timestampSeconds) => ({
      timestampSeconds,
      powerWatts: valueWatts,
    })),
  });
  if (result.status === "unavailable") {
    throw new Error("Expected a numeric Normalized Power fixture");
  }
  return result;
}

function completedObservationLoad(value = 83.07244466414016, activityId = "activity-1") {
  const commonLoad = calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    intensity: Math.sqrt(value / 100),
    contributingDurationSeconds: 3600,
    quality: {
      source: "validated_test",
      observed_at: "2026-05-30T00:00:00.000Z",
      valid_at: "2026-05-30T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "best-effort-extraction-v1",
      evidence_fingerprint: "calibration-effort",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 237.5,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-05-30T00:00:00.000Z",
      validAt: "2026-05-30T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "best-effort-extraction-v1",
      sourceFingerprint: "calibration-effort",
    },
    evidenceFingerprint: `${activityId}-load-evidence`,
    computedAsOf: asOf.toISOString(),
    estimated: false,
  });
  if (commonLoad.status !== "available") {
    throw new Error("Expected an available canonical completed-observation fixture");
  }
  return {
    activityId,
    commonLoad,
    loadSeriesIdentity: loadSeriesIdentityForAvailableCommonLoad(commonLoad),
  };
}

function unavailableCompletedObservationLoad(activityId = "activity-1") {
  return {
    activityId,
    commonLoad: {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      activity_category: "bike" as const,
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: asOf.toISOString(),
      contributingDurationSeconds: null,
      reason: "threshold_missing" as const,
    },
    loadSeriesIdentity: null,
  };
}

interface CapturedSelect {
  fields: unknown;
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
    select: (fields?: unknown) => {
      const result = results[selectIndex++] ?? [];
      const capture: CapturedSelect = {
        fields,
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
  const transaction = async <T>(operation: (tx: typeof db) => Promise<T>) => operation(db);
  return { db: { ...db, transaction }, selects };
}

function querySql(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as SQL);
}

function rows(): AthleteIntelligenceRows {
  const metricNames = [
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
    ],
    activities: [
      {
        profileId,
        id: "activity-1",
        parentActivityId: "parent-activity-1",
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
        normalizedPowerResult: normalizedPowerResult(220),
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
        activity_category: "bike",
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
        activity_category: "bike",
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
          activity_category_overrides: {
            bike: { max_sessions_per_week: 4, max_weekly_duration_minutes: 400 },
          },
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
        baseline_fitness: {
          is_enabled: true,
          override_longTermLoad: 55,
          override_recentLoad: 65,
        },
      },
      updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    },
    performanceTargets: buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
      planningThresholdPowerWatts: 237.5,
    }),
    performanceModel: buildPerformanceModelSnapshotFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
    }),
    completedObservationLoads: [completedObservationLoad()],
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
        payload: { activity_category: "running" },
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
    const boundedActivities = Array.from({ length: modelReaderBounds.activities }, () => ({
      startedAt: asOf,
      normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
    }));
    const { db, selects } = createFluentReadDb([
      [], // selected goal
      [], // profile
      [], // metrics
      boundedActivities, // activities
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

    expect(Object.keys(db)).toEqual(["select", "transaction"]);
    expect(selects).toHaveLength(18);
    for (const read of selects.slice(0, 8)) {
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
    expect(selects[4]?.fields).toMatchObject({
      activityId: activityEfforts.activity_id,
    });
    const effortWhere = querySql(selects[4]?.where);
    expect(effortWhere.sql).toContain(
      'and ("activity_efforts"."updated_at" is null or "activity_efforts"."updated_at" <= $4)',
    );
    const normalizedPowerSql = querySql(
      (selects[3]?.fields as { normalizedPowerResult: SQL }).normalizedPowerResult,
    ).sql;
    expect(normalizedPowerSql).toContain('"activity_segments"."summary"');
    expect(normalizedPowerSql).toContain("normalizedPowerResult");
    expect(normalizedPowerSql).not.toContain("::double precision");
    expect(normalizedPowerSql).not.toContain('"activities"."normalized_power"');
    expect(selects[6]).toMatchObject({
      limit: modelReaderBounds.schedule + 1,
      orderBy: [expect.anything(), expect.anything(), expect.anything()],
    });
    expect(selects[7]).toMatchObject({
      limit: 101,
      offset: 0,
      orderBy: [expect.anything(), expect.anything()],
    });
    // The canonical model reads three duration lanes, one CSS protocol lane, and six HR lanes.
    expect(selects.slice(8)).toHaveLength(10);
  });

  it("propagates bounded source coverage into the canonical model contract", async () => {
    const boundedMetricRows = Array.from({ length: modelReaderBounds.metrics + 1 }, () => ({}));
    const boundedActivityRows = Array.from({ length: modelReaderBounds.activities + 1 }, () => ({
      normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
    }));
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

  it("materializes persisted goal activity_category into the canonical header when objective activity_category is omitted", async () => {
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
    expect(goal.goalActivityCategory).toBe("bike");
    expect(result.evidenceRegistry[goal.sourceId]?.activity_category).toBe("bike");
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
    const value = rows();
    const dataSource: AthleteIntelligenceDataSource = {
      read: async (input) => {
        request = input;
        return value;
      },
    };
    const result = await materializeAthleteIntelligenceModelInput({ dataSource, profileId, asOf });

    expect(request).toMatchObject({ profileId, asOf, bounds: modelReaderBounds });
    expect(request?.activityFrom.toISOString()).toBe("2025-12-03T12:00:00.000Z");
    expect(request?.goalId).toBe("goal-1");
    expect(result.athleteId).toBe(profileId);
    expect(result.metricEvidence).toHaveLength(9); // contextual metrics and age only
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
    expect(result.activities[0]).toMatchObject({ athleteId: profileId, activity_category: "bike" });
    const projectedLoad = value.completedObservationLoads[0]?.commonLoad;
    if (projectedLoad?.status !== "available") {
      throw new Error("Expected an available canonical completed-observation fixture");
    }
    expect(result.activities[0]?.metrics.trainingLoad).toMatchObject({
      value: projectedLoad.load,
      identity: {
        activity_category: "all",
        family: "common_load",
        method: "gradientpeak_relative_load",
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
      preferredActivityCategories: ["bike"],
      weeklyTimeWindows: [{ day: "monday", startMinuteLocal: 360, endMinuteLocal: 480 }],
      hardRestDays: ["sunday"],
      allowDoubleDays: null,
      recoveryPreference: null,
      taperPreference: null,
      progressionPreference: null,
    });
    expect(result.trainingContext.activityCategoryDoseLimits[0]?.maximumSessionsPerWeek.value).toBe(
      4,
    );
    expect(result.trainingContext.longTermLoadOverride).toMatchObject({
      value: null,
      identity: null,
    });
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

  it("uses canonical completed-observation Load without recalculating from segment metrics", async () => {
    const withSegmentNormalizedPower = (normalizedPower: number) => {
      const value = rows();
      value.efforts = [];
      value.activities[0] = {
        ...first(value.activities),
        normalizedPowerResult: normalizedPowerResult(normalizedPower),
      };
      return value;
    };
    const baseline = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(withSegmentNormalizedPower(220)),
      profileId,
      asOf,
    });
    // Model-reader activity rows are activity_segments; 300 is the segment summary value,
    // independent of any divergent parent activities.normalized_power compatibility value.
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(withSegmentNormalizedPower(300)),
      profileId,
      asOf,
    });

    expect(result.activities[0]?.metrics.normalizedPowerResult.result.valueWatts).toBe(300);
    expect(result.activities[0]?.metrics.trainingLoad).toEqual(
      baseline.activities[0]?.metrics.trainingLoad,
    );
  });

  it("keeps modeled performance targets out of contextual metric evidence", async () => {
    const baselineRows = rows();
    const modeledRows = rows();
    modeledRows.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
      planningThresholdPowerWatts: 237.5,
      planningThresholdPaceSecondsPerKm: 270,
      swimmingCssSecondsPer100m: 95,
    });
    const [baseline, modeled] = await Promise.all(
      [baselineRows, modeledRows].map((sourceRows) =>
        materializeAthleteIntelligenceModelInput({
          dataSource: readRows(sourceRows),
          profileId,
          asOf,
        }),
      ),
    );
    if (!baseline || !modeled) throw new Error("Expected both model fixtures");

    expect(modeled.metricEvidence).toEqual(baseline.metricEvidence);
  });

  it("preserves exact fractional effort boundaries from ingestion provenance", async () => {
    const sourceRows = rows();
    const effort = sourceRows.efforts.find((candidate) => candidate.id === "effort-1");
    if (!effort) throw new Error("Expected effort fixture");
    effort.provenance = {
      activity_id: "activity-1",
      derived_from: "activity_file_stream",
      exact_window_start_offset_seconds: 600.5,
      exact_window_end_offset_seconds: 900.5,
    };
    effort.source = "imported";
    effort.method = "activity_file_best_effort";

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(sourceRows),
      profileId,
      asOf,
    });
    const materialized = result.efforts.find((candidate) =>
      candidate.sourceId.includes("effort-1"),
    );

    expect(materialized?.startOffsetSeconds).toMatchObject({ value: 600.5, unit: "seconds" });
    expect(materialized?.endOffsetSeconds).toMatchObject({ value: 900.5, unit: "seconds" });
  });

  it("falls back to persisted effort boundaries for inconsistent exact duration", async () => {
    const sourceRows = rows();
    const effort = sourceRows.efforts.find((candidate) => candidate.id === "effort-1");
    if (!effort) throw new Error("Expected effort fixture");
    effort.source = "imported";
    effort.method = "activity_file_best_effort";
    effort.provenance = {
      activity_id: "activity-1",
      derived_from: "activity_file_stream",
      exact_window_start_offset_seconds: 600.5,
      exact_window_end_offset_seconds: 901,
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(sourceRows),
      profileId,
      asOf,
    });
    const materialized = result.efforts.find((candidate) =>
      candidate.sourceId.includes("effort-1"),
    );

    expect(materialized?.startOffsetSeconds).toMatchObject({ value: 600, unit: "seconds" });
    expect(materialized?.endOffsetSeconds).toMatchObject({ value: 900, unit: "seconds" });
  });

  it("rejects an imported effort with mismatched activity provenance", async () => {
    const sourceRows = rows();
    const effort = sourceRows.efforts.find((candidate) => candidate.id === "effort-1");
    if (!effort) throw new Error("Expected effort fixture");
    effort.source = "imported";
    effort.method = "activity_file_best_effort";
    effort.provenance = {
      activity_id: "other-activity",
      derived_from: "activity_file_stream",
      exact_window_start_offset_seconds: 600.5,
      exact_window_end_offset_seconds: 900.5,
    };

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(sourceRows),
      profileId,
      asOf,
    });

    expect(result.efforts.some((candidate) => candidate.sourceId.includes("effort-1"))).toBe(false);
  });

  it("keeps activity training load unknown when no compatible dynamic method is available", async () => {
    const value = rows();
    value.metrics = value.metrics.filter((metric) => metric.type !== "lthr");
    value.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
    });
    value.completedObservationLoads = [unavailableCompletedObservationLoad()];
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

  it("preserves unavailable Load from an already self-excluded canonical target read", async () => {
    const value = rows();
    value.activities[0] = {
      ...first(value.activities),
      id: "segment-1",
      parentActivityId: "parent-1",
    };
    value.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
    });
    value.completedObservationLoads = [unavailableCompletedObservationLoad("segment-1")];

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

  it.each([
    "future",
    "stale",
    "missing",
    "truncated",
  ] as const)("keeps %s target evidence unavailable rather than coercing training load to zero", async (state) => {
    const value = rows();
    value.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
    });
    value.performanceTargets.cycling.planningThresholdPower.reasons = [
      state === "truncated" ? "evidence_read_truncated" : `${state}_evidence`,
    ];
    value.completedObservationLoads = [unavailableCompletedObservationLoad()];

    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });

    expect(result.activities[0]?.metrics.trainingLoad).toMatchObject({
      value: null,
      identity: null,
    });
    expect(result.activities[0]?.metrics.trainingLoad.value).not.toBe(0);
  });

  it("preserves canonical completed-observation projection parity without a second Load calculation", async () => {
    const lower = rows();
    const higher = rows();
    higher.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
      planningThresholdPowerWatts: 285,
      calculationVersion: "higher-performance-target-v1",
    });
    higher.completedObservationLoads = [completedObservationLoad(91)];
    const results = await Promise.all(
      [lower, higher].map((value) =>
        materializeAthleteIntelligenceModelInput({ dataSource: readRows(value), profileId, asOf }),
      ),
    );
    const [lowerResult, higherResult] = results;
    if (!lowerResult || !higherResult) throw new Error("Expected both deterministic results");

    const lowerLoad = lowerResult.activities[0]?.metrics.trainingLoad;
    const higherLoad = higherResult.activities[0]?.metrics.trainingLoad;
    const lowerProjected = lower.completedObservationLoads[0]?.commonLoad;
    const higherProjected = higher.completedObservationLoads[0]?.commonLoad;
    if (lowerProjected?.status !== "available" || higherProjected?.status !== "available") {
      throw new Error("Expected available canonical completed-observation fixtures");
    }
    expect(lowerLoad?.identity).toMatchObject({ family: "common_load" });
    expect(higherLoad?.identity).toMatchObject({ family: "common_load" });
    expect(lowerLoad?.value).toBe(lowerProjected.load);
    expect(higherLoad?.value).toBe(higherProjected.load);
    expect(higherResult.metricEvidence).toEqual(lowerResult.metricEvidence);
  });

  it("rejects duplicate canonical completed-observation delivery before readiness", async () => {
    const value = rows();
    value.completedObservationLoads = [completedObservationLoad(), completedObservationLoad()];

    await expect(
      materializeAthleteIntelligenceModelInput({ dataSource: readRows(value), profileId, asOf }),
    ).rejects.toThrow(/completed-observation delivery duplicated activity-1/);
  });

  it("preserves reference-activity category across current LTHR observations", async () => {
    const value = rows();
    const genericLthr = value.metrics.find((metric) => metric.type === "lthr");
    if (!genericLthr) throw new Error("fixture LTHR missing");
    value.metrics.push(
      {
        ...genericLthr,
        id: "run-lthr",
        value: 168,
        referenceActivityId: "run-reference",
        referenceActivityCategory: "run",
        recordedAt: new Date("2026-05-28T00:00:00.000Z"),
      },
      {
        ...genericLthr,
        id: "bike-lthr",
        value: 178,
        referenceActivityId: "bike-reference",
        referenceActivityCategory: "bike",
        recordedAt: new Date("2026-05-29T00:00:00.000Z"),
      },
    );
    value.performanceTargets = buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: asOf.toISOString(),
      planningThresholdPowerWatts: 237.5,
      lthrBpm: { run: 168, bike: 178 },
    });
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    const lthrEvidence = result.metricEvidence.filter((metric) => metric.metricType === "lthr");

    expect(lthrEvidence).toHaveLength(2);
    expect(
      lthrEvidence.map((metric) => {
        const evidenceId = first(metric.value.evidenceSourceIds);
        return [metric.value.value, result.evidenceRegistry[evidenceId]?.activity_category];
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

  it("selects deterministic latest contextual metrics", async () => {
    const value = rows();
    value.metrics.push({
      profileId,
      id: "metric-weight-z",
      referenceActivityId: null,
      type: "weight_kg",
      value: 80,
      unit: "kg",
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
        "hrv_rmssd",
        "resting_hr",
        "sleep_hours",
        "soreness_level",
        "stress_score",
        "vo2_max",
        "weight_kg",
        "wellness_score",
      ].sort(),
    );
    expect(
      result.metricEvidence.find((metric) => metric.metricType === "weight_kg")?.value.value,
    ).toBe(80);
  });

  it("rejects unknown persisted effort units and retains their raw evidence", async () => {
    const value = rows();
    const effort = first(value.efforts);
    value.efforts = [
      { ...effort, id: "unsupported", activityId: null, value: 10, unit: "horsepower" },
    ];
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
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
    expect(result.trainingContext.activityCategoryDoseLimits[0]).toMatchObject({
      activity_category: "bike",
      maximumWeeklyMinutes: { value: 400 },
      maximumSessionsPerWeek: { value: 4 },
    });
    expect(result.trainingContext.fatigueTolerance.value).toBe(0.3);
    expect(result.trainingContext.longTermLoadOverride).toMatchObject({
      value: null,
      identity: null,
    });
    expect(result.trainingContext.recentLoadOverride).toMatchObject({
      value: null,
      identity: null,
    });
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

  it("materializes a header-only consistency goal without borrowing a payload activity_category", async () => {
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
      goalActivityCategory: "bike",
      objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 },
    });
    expect(result.evidenceRegistry[goal.sourceId]?.activity_category).toBe("bike");
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
    const weightIndex = value.metrics.findIndex((metric) => metric.type === "weight_kg");
    const weightMetric = value.metrics[weightIndex];
    if (weightMetric === undefined) throw new Error("Expected weight fixture");
    value.metrics[weightIndex] = {
      ...weightMetric,
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
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
    expect(result.metricEvidence.some((item) => item.metricType === "weight_kg")).toBe(false);
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
