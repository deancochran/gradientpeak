import { athleteIntelligenceModelInputSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import { parseScheduleRecurrence, sourceId, temporalOverlayValue } from "../evidence-adapters";
import {
  type AthleteIntelligenceDataSource,
  type AthleteIntelligenceRows,
  materializeAthleteIntelligenceModelInput,
  modelReaderBounds,
  readEligibleRecurringEventPages,
} from "../model-reader";

const asOf = new Date("2026-06-01T12:00:00.000Z");
const profileId = "athlete-a";

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
        sport: "cycling",
        kind: "power",
        durationSeconds: 300,
        startOffsetSeconds: 600,
        unit: "watts",
        value: 350,
        createdAt: new Date("2026-05-31T10:10:00.000Z"),
        updatedAt: new Date("2026-05-31T10:10:00.000Z"),
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
        type: "planned_activity",
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
    expect(request?.scheduleThrough.toISOString()).toBe("2027-06-01T12:00:00.000Z");
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
    expect(result.efforts[0]).toMatchObject({
      kind: "power",
      powerWatts: 350,
      activitySourceId: "activity:activity-1:record",
    });
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
    expect(result.trainingContext.ctlOverride.value).toBe(55);
    expect(result.plannedSchedule[0]?.startAt).toBe("2026-06-10T10:00:00.000Z");
    for (const activity of result.activities)
      expect(result.evidenceRegistry[activity.sourceId]).toBeDefined();
    expect(
      Object.values(result.evidenceRegistry).every(
        (item) => item.athleteId === profileId && Date.parse(item.observedAt) <= asOf.getTime(),
      ),
    ).toBe(true);
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

  it("normalizes supported effort units and defers unsupported units", async () => {
    const value = rows();
    const effort = first(value.efforts);
    value.efforts = [
      { ...effort, id: "kw", value: 0.4, unit: "kW" },
      { ...effort, id: "mph", activityId: null, kind: "speed", value: 10, unit: "mph" },
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
  });

  it("maps persisted preferences, sport dose limits, and enabled baseline load only", async () => {
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
    expect(result.trainingContext.ctlOverride.value).toBe(55);
    expect(result.trainingContext.strategy).toBeNull();
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

  it("defers unsupported metric units without relabeling physiology", async () => {
    const value = rows();
    value.metrics = value.metrics.map((metric) =>
      metric.type === "weight_kg" ? { ...metric, unit: "stone" } : metric,
    );
    const result = await materializeAthleteIntelligenceModelInput({
      dataSource: readRows(value),
      profileId,
      asOf,
    });
    expect(result.metricEvidence.some((metric) => metric.metricType === "weight_kg")).toBe(false);
    expect(result.physiology.weightKg.value).toBeNull();
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
      { offset: 0, limit: 100 },
      { offset: 100, limit: 100 },
    ]);
    expect(result).toMatchObject({ truncated: false, rows: [{ id: "active-after-expired" }] });
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
    });
    expect(first(result.activities).laps).toEqual([]);
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

  it.each([
    "FREQ=WEEKLY;BYDAY=MO",
    "FREQ=DAILY;COUNT=4",
    "FREQ=WEEKLY;FREQ=DAILY",
    "FREQ=WEEKLY;INTERVAL",
    "FREQ=WEEKLY;INTERVAL=2=3",
    "FREQ=WEEKLY;UNTIL=20260230T100000Z",
  ])("defers recurrence rules with unsupported or malformed semantics: %s", (rule) => {
    expect(parseScheduleRecurrence(rule, new Date("2026-01-01T10:00:00.000Z"))).toBeNull();
  });
});
