import { describe, expect, it } from "vitest";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";

import { athleteIntelligenceModelInputSchema, goalInputSchema } from "../model-input-contracts";

const asOf = "2026-07-10T12:00:00.000Z";

function input() {
  let nextId = 0;
  const evidenceRegistry: Record<string, Record<string, unknown>> = {};
  const evidence = (
    value: number | null,
    unit: string | null,
    options: {
      id?: string;
      lineage?: string;
      activity_category?: string | null;
      sourceType?: string;
    } = {},
  ) => {
    const id = options.id ?? `manual:evidence-${nextId++}`;
    evidenceRegistry[id] = {
      athleteId: "athlete-1",
      sourceId: id,
      lineageGroupId: options.lineage ?? "manual-test:history",
      observedAt: "2026-07-09T12:00:00.000Z",
      rawObservation: { value, unit },
      activity_category: options.activity_category ?? null,
      modality: "manual",
      sourceType: options.sourceType ?? "manual_observation",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    };
    return id;
  };
  const ev = <T extends number | null>(value: T, unit: string) => ({
    value,
    unit,
    evidenceSourceIds: [evidence(value, unit)],
  });
  const recordSource = (
    id: string,
    lineage: string,
    activity_category: string | null = null,
    sourceType = "manual_observation",
  ) => evidence(null, null, { id, lineage, activity_category, sourceType });

  const activitySourceId = recordSource(
    "activity:ride-1",
    "activity:ride-history",
    "bike",
    "activity",
  );
  const effortSourceId = recordSource(
    "effort:manual-1",
    "manual-test:effort-history",
    "run",
    "activity_effort",
  );
  const goalSourceId = recordSource("goal:event", "manual-test:event-history", "run", "goal");
  const trainingSourceId = recordSource("manual:preferences", "manual-test:preferences-history");
  const scheduleSourceId = recordSource(
    "manual:schedule-race",
    "manual-test:race-history",
    "run",
    "goal",
  );
  const planSourceId = evidence(null, null, {
    id: "manual:plan-1",
    lineage: "manual-test:race-history",
    activity_category: "run",
  });
  const preferenceEvidenceId = evidence(null, null);
  const effortDurationId = evidence(300, "seconds");
  const effortValueId = evidence(4.2, "meters_per_second");
  const effortStartId = evidence(0, "seconds");

  return {
    contractVersion: "2.0.0",
    assessmentAsOf: asOf,
    athleteId: "athlete-1",
    evidenceRegistry,
    physiology: {
      athleteId: "athlete-1",
      ageYears: ev(37.5, "years"),
      weightKg: ev(null, "kilograms"),
      heightCm: ev(null, "centimeters"),
      bodyFatPercent: ev(null, "percent"),
      preferredUnits: {
        value: {
          distance: "kilometers",
          elevation: "meters",
          mass: "kilograms",
          temperature: null,
        },
        evidenceSourceIds: [preferenceEvidenceId],
      },
    },
    metricEvidence: [
      {
        metricType: "weight_kg" as const,
        role: "watts_per_kilogram_input" as const,
        value: ev(75, "kilograms"),
      },
    ],
    activityWindow: { from: "2026-06-10T12:00:00.000Z", through: asOf },
    activities: [
      {
        sourceId: activitySourceId,
        athleteId: "athlete-1",
        lineageGroupId: "activity:ride-history",
        startedAt: "2026-07-09T12:00:00.000Z",
        endedAt: "2026-07-09T13:00:00.000Z",
        activity_category: "bike" as const,
        metrics: {
          elapsedDurationSeconds: ev(3600, "seconds"),
          movingDurationSeconds: ev(null, "seconds"),
          distanceMeters: ev(null, "meters"),
          ascentMeters: ev(null, "meters"),
          descentMeters: ev(null, "meters"),
          workKilojoules: ev(null, "kilojoules"),
          caloriesKilocalories: ev(null, "kilocalories"),
          averagePowerWatts: ev(null, "watts"),
          maximumPowerWatts: ev(null, "watts"),
          normalizedPowerResult: {
            result: calculateCyclingNormalizedPower({ samples: [] }),
            evidenceSourceIds: [evidence(null, "watts")],
          },
          averageSpeedMetersPerSecond: ev(null, "meters_per_second"),
          maximumSpeedMetersPerSecond: ev(null, "meters_per_second"),
          averageHeartRateBpm: ev(null, "beats_per_minute"),
          maximumHeartRateBpm: ev(null, "beats_per_minute"),
          averageCadenceRpm: ev(null, "revolutions_per_minute"),
          maximumCadenceRpm: ev(null, "revolutions_per_minute"),
          trainingLoad: ev(null, "score"),
          aerobicTrainingEffect: ev(null, "score"),
          anaerobicTrainingEffect: ev(null, "score"),
        },
        zonesAndCurves: [
          {
            kind: "power_curve" as const,
            durationSeconds: 300,
            lowerBound: null,
            upperBound: null,
            value: 310,
            unit: "watts" as const,
            evidenceSourceIds: [evidence(310, "watts"), evidence(300, "seconds")],
          },
        ],
        laps: [],
      },
    ],
    efforts: [
      {
        sourceId: effortSourceId,
        athleteId: "athlete-1",
        lineageGroupId: "manual-test:effort-history",
        activitySourceId: null,
        observedAt: "2026-07-09T10:00:00.000Z",
        activity_category: "run" as const,
        kind: "speed" as const,
        startOffsetSeconds: {
          value: 0,
          unit: "seconds" as const,
          evidenceSourceIds: [effortStartId],
        },
        endOffsetSeconds: {
          value: 300,
          unit: "seconds" as const,
          evidenceSourceIds: [effortDurationId],
        },
        durationSeconds: 300,
        speedMetersPerSecond: 4.2,
        evidenceSourceIds: [effortDurationId, effortValueId],
      },
    ],
    goals: [
      {
        sourceId: goalSourceId,
        athleteId: "athlete-1",
        lineageGroupId: "manual-test:event-history",
        targetDate: "2026-10-01",
        priority: 10,
        goalActivityCategory: "run" as const,
        objective: {
          type: "event_performance" as const,
          activity_category: "run" as const,
          distance_m: 10_000,
          target_speed_mps: 4,
        },
        evidenceSourceIds: [goalSourceId],
      },
    ],
    trainingContext: {
      sourceId: trainingSourceId,
      athleteId: "athlete-1",
      lineageGroupId: "manual-test:preferences-history",
      evidenceSourceIds: [trainingSourceId],
      preferredActivityCategories: ["run" as const, "bike" as const],
      weeklyTimeWindows: [{ day: "tuesday" as const, startMinuteLocal: 360, endMinuteLocal: 480 }],
      hardRestDays: ["monday" as const],
      maximumWeeklyMinutes: ev(600, "minutes"),
      maximumDailyMinutes: ev(180, "minutes"),
      maximumSessionsPerDay: ev(2, "count"),
      maximumSessionDurationMinutes: ev(150, "minutes"),
      activityCategoryDoseLimits: [
        {
          activity_category: "run" as const,
          maximumWeeklyMinutes: ev(240, "minutes"),
          maximumSessionsPerWeek: ev(4, "count"),
          maximumSessionDurationMinutes: ev(120, "minutes"),
        },
      ],
      allowDoubleDays: true,
      minimumRecoveryHours: ev(10, "hours"),
      maximumConsecutiveTrainingDays: ev(5, "days"),
      recoveryPreference: "balanced" as const,
      fatigueTolerance: ev(0.6, "ratio"),
      strategy: "balanced" as const,
      taperPreference: "standard" as const,
      progressionPreference: "adaptive" as const,
      longTermLoadOverride: ev(null, "training_load"),
      recentLoadOverride: ev(null, "training_load"),
    },
    readCoverage: {
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    },
    plannedSchedule: [
      {
        sourceId: scheduleSourceId,
        athleteId: "athlete-1",
        lineageGroupId: "manual-test:race-history",
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-01T10:00:00.000Z",
        timezone: "Europe/London",
        allDay: false,
        lifecycle: "confirmed" as const,
        eventType: "race" as const,
        activity_category: "run" as const,
        recurrence: null,
        completionActivitySourceId: null,
        planSourceId,
        evidenceSourceIds: [scheduleSourceId],
      },
    ],
  };
}

function rejects(candidate: ReturnType<typeof input>) {
  expect(athleteIntelligenceModelInputSchema.safeParse(candidate).success).toBe(false);
}

function activity(candidate: ReturnType<typeof input>) {
  const value = candidate.activities[0];
  if (!value) throw new Error("fixture activity missing");
  return value;
}

function effort(candidate: ReturnType<typeof input>) {
  const value = candidate.efforts[0];
  if (!value) throw new Error("fixture effort missing");
  return value as Omit<
    typeof value,
    "activitySourceId" | "lineageGroupId" | "observedAt" | "activity_category"
  > & {
    activitySourceId: string | null;
    lineageGroupId: string;
    observedAt: string;
    activity_category: "run" | "bike";
  };
}

function event(candidate: ReturnType<typeof input>) {
  const value = candidate.plannedSchedule[0];
  if (!value) throw new Error("fixture schedule event missing");
  return value as Omit<
    typeof value,
    "lifecycle" | "activity_category" | "completionActivitySourceId" | "planSourceId" | "recurrence"
  > & {
    lifecycle: "planned" | "confirmed" | "completed" | "cancelled";
    activity_category: "run" | "bike" | null;
    completionActivitySourceId: string | null;
    planSourceId: string | null;
    recurrence: {
      frequency: "daily" | "weekly" | "monthly";
      interval: number;
      until: string | null;
      timezone?: string | null;
    } | null;
  };
}

describe("athlete intelligence model input contracts", () => {
  it("accepts fully evidenced model input", () => {
    expect(athleteIntelligenceModelInputSchema.safeParse(input()).success).toBe(true);
  });

  it("requires exact identity for numeric activity load and matching activity category", () => {
    const missing = input();
    const load = activity(missing).metrics.trainingLoad as {
      value: number | null;
      identity?: Record<string, unknown> | null;
    };
    load.value = 50;
    rejects(missing);

    const mismatched = input();
    const mismatchedLoad = activity(mismatched).metrics.trainingLoad as typeof load;
    mismatchedLoad.value = 50;
    mismatchedLoad.identity = {
      activity_category: "run",
      family: "trimp",
      method: "heart_rate_threshold",
      version: "1",
      sourceDefinition: "provider:a",
    };
    rejects(mismatched);

    const common = input();
    const commonLoad = activity(common).metrics.trainingLoad as typeof load & {
      evidenceSourceIds: string[];
    };
    commonLoad.value = 50;
    commonLoad.identity = {
      activity_category: "all",
      family: "common_load",
      method: "gradientpeak_relative_load",
      version: "1",
      sourceDefinition: "gradientpeak_relative_load",
    };
    const commonEvidenceId = commonLoad.evidenceSourceIds[0];
    if (!commonEvidenceId) throw new Error("Common Load evidence fixture missing");
    const commonEvidence = common.evidenceRegistry[commonEvidenceId];
    if (!commonEvidence) throw new Error("Common Load registry fixture missing");
    commonEvidence.rawObservation = { value: 50, unit: "score" };
    expect(athleteIntelligenceModelInputSchema.safeParse(common).success).toBe(true);
  });

  it("requires identified, mutually compatible LongTermLoad and RecentLoad overrides", () => {
    const candidate = input();
    (candidate.trainingContext.longTermLoadOverride as { value: number | null }).value = 50;
    (candidate.trainingContext.recentLoadOverride as { value: number | null }).value = 60;
    (
      candidate.trainingContext
        .longTermLoadOverride as typeof candidate.trainingContext.longTermLoadOverride & {
        identity: unknown;
      }
    ).identity = {
      activity_category: "bike",
      family: "load",
      method: "normalized_power",
      version: "1",
      sourceDefinition: "provider:a",
    };
    (
      candidate.trainingContext
        .recentLoadOverride as typeof candidate.trainingContext.recentLoadOverride & {
        identity: unknown;
      }
    ).identity = {
      activity_category: "bike",
      family: "load",
      method: "normalized_power",
      version: "1",
      sourceDefinition: "provider:b",
    };
    rejects(candidate);
  });

  it("keeps goal activity_category in the header for every objective discriminant", () => {
    const candidate = input();
    const goal = candidate.goals[0];
    if (goal === undefined) throw new Error("fixture goal missing");
    const parsed = goalInputSchema.parse({
      ...goal,
      goalActivityCategory: "bike",
      objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 },
    });
    expect(parsed.goalActivityCategory).toBe("bike");
  });

  it("preserves explicit planning and recurrence timezones while accepting prior inputs", () => {
    const candidate = input() as ReturnType<typeof input> & {
      planningTimezone?: string | null;
    };
    candidate.planningTimezone = "America/New_York";
    const scheduled = event(candidate);
    scheduled.recurrence = {
      frequency: "weekly",
      interval: 1,
      until: "2026-10-08T08:00:00.000Z",
      timezone: "Europe/London",
    };

    const parsed = athleteIntelligenceModelInputSchema.safeParse(candidate);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.planningTimezone).toBe("America/New_York");
    expect(parsed.data.plannedSchedule[0]?.recurrence?.timezone).toBe("Europe/London");
  });

  it("accepts truncated schedule read coverage", () => {
    const truncated = input() as { readCoverage: unknown };
    truncated.readCoverage = {
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "truncated", reason: "query_limit_reached" },
    };
    expect(athleteIntelligenceModelInputSchema.safeParse(truncated).success).toBe(true);
  });

  it("rejects malformed and unreasoned bounded read coverage", () => {
    const malformed = input() as { readCoverage: unknown };
    malformed.readCoverage = {
      metrics: { state: "complete", reason: "query_limit_reached" },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    };
    rejects(malformed as ReturnType<typeof input>);

    const truncated = input() as { readCoverage: unknown };
    truncated.readCoverage = {
      metrics: { state: "truncated", reason: "source_window_truncated" },
      activities: { state: "complete", reason: null },
      efforts: { state: "truncated", reason: "unknown" },
      schedules: { state: "truncated", reason: "query_limit_reached" },
    };
    expect(athleteIntelligenceModelInputSchema.safeParse(truncated).success).toBe(true);
  });

  it("rejects an evidenced numeric value not matching referenced raw evidence", () => {
    const candidate = input();
    (candidate.physiology.ageYears as { value: number }).value = 38;
    rejects(candidate);
  });

  it("rejects missing activity, effort, goal, training, and schedule record sources", () => {
    for (const select of [
      (value: ReturnType<typeof input>) => value.activities[0]?.sourceId,
      (value: ReturnType<typeof input>) => value.efforts[0]?.sourceId,
      (value: ReturnType<typeof input>) => value.goals[0]?.sourceId,
      (value: ReturnType<typeof input>) => value.trainingContext.sourceId,
      (value: ReturnType<typeof input>) => value.plannedSchedule[0]?.sourceId,
    ]) {
      const candidate = input();
      const id = select(candidate);
      if (!id) throw new Error("fixture source missing");
      delete candidate.evidenceRegistry[id];
      rejects(candidate);
    }
  });

  it("rejects activity end before start", () => {
    const candidate = input();
    activity(candidate).endedAt = "2026-07-09T11:59:59.000Z";
    rejects(candidate);
  });

  it("rejects activity measurements and series values not backed by referenced evidence", () => {
    const metricCandidate = input();
    (activity(metricCandidate).metrics.elapsedDurationSeconds as { value: number | null }).value =
      3599;
    rejects(metricCandidate);
    const seriesCandidate = input();
    const series = activity(seriesCandidate).zonesAndCurves[0];
    if (!series) throw new Error("fixture series missing");
    (series as { durationSeconds: number | null }).durationSeconds = 301;
    rejects(seriesCandidate);
  });

  it("rejects effort measurements that do not match referenced evidence", () => {
    const candidate = input();
    effort(candidate).speedMetersPerSecond = 4.3;
    rejects(candidate);
  });

  it("rejects invalid activity-derived effort lineage, time, and offsets", () => {
    const mutations = [
      (candidate: ReturnType<typeof input>) => {
        effort(candidate).lineageGroupId = "manual-test:wrong-history";
      },
      (candidate: ReturnType<typeof input>) => {
        effort(candidate).observedAt = "2026-07-09T11:59:59.000Z";
      },
      (candidate: ReturnType<typeof input>) => {
        effort(candidate).endOffsetSeconds = {
          value: 3601,
          unit: "seconds",
          evidenceSourceIds: [candidate.efforts[0]?.evidenceSourceIds[0] ?? ""],
        };
      },
    ];
    for (const mutate of mutations) {
      const candidate = input();
      const candidateEffort = effort(candidate);
      const candidateActivity = activity(candidate);
      candidateEffort.activitySourceId = candidateActivity.sourceId;
      candidateEffort.lineageGroupId = candidateActivity.lineageGroupId;
      candidateEffort.activity_category = "bike";
      candidateEffort.observedAt = candidateActivity.startedAt;
      mutate(candidate);
      rejects(candidate);
    }
  });

  it("rejects effort, goal, training, and schedule source registry mismatches", () => {
    const cases = [
      ["activity:ride-1", "sourceType", "goal"],
      ["effort:manual-1", "lineageGroupId", "manual-test:wrong"],
      ["goal:event", "activity_category", "bike"],
      ["manual:preferences", "sourceType", "goal"],
      ["manual:schedule-race", "sourceType", "manual_observation"],
    ] as const;
    for (const [id, key, value] of cases) {
      const candidate = input();
      const source = candidate.evidenceRegistry[id];
      if (!source) throw new Error("fixture record source missing");
      source[key] = value;
      rejects(candidate);
    }
  });

  it("rejects naked, mismatched, and unevidenced effort offsets while accepting equal boundaries", () => {
    const naked = input();
    (effort(naked) as unknown as { startOffsetSeconds: number }).startOffsetSeconds = 0;
    rejects(naked);

    const mismatched = input();
    effort(mismatched).startOffsetSeconds = {
      value: 1,
      unit: "seconds",
      evidenceSourceIds: effort(mismatched).startOffsetSeconds?.evidenceSourceIds ?? [],
    };
    rejects(mismatched);

    const ordered = input();
    effort(ordered).startOffsetSeconds = effort(ordered).endOffsetSeconds;
    expect(athleteIntelligenceModelInputSchema.safeParse(ordered).success).toBe(true);
  });

  it("rejects recurrence until before start and accepts equality", () => {
    const invalid = input();
    event(invalid).recurrence = {
      frequency: "weekly",
      interval: 1,
      until: "2026-10-01T07:59:59.000Z",
    };
    rejects(invalid);
    const boundary = input();
    event(boundary).recurrence = {
      frequency: "weekly",
      interval: 1,
      until: event(boundary).startAt,
    };
    expect(athleteIntelligenceModelInputSchema.safeParse(boundary).success).toBe(true);
  });

  it("rejects missing schedule plan references and completion on non-completed events", () => {
    const missingPlan = input();
    event(missingPlan).planSourceId = "manual:missing";
    rejects(missingPlan);
    const prematureCompletion = input();
    event(prematureCompletion).completionActivitySourceId = activity(prematureCompletion).sourceId;
    rejects(prematureCompletion);
  });

  it("rejects completed schedules without valid, consistent completion activities", () => {
    const mutations = [
      (candidate: ReturnType<typeof input>) => {
        event(candidate).completionActivitySourceId = null;
      },
      (candidate: ReturnType<typeof input>) => {
        event(candidate).completionActivitySourceId = "activity:missing";
      },
      (candidate: ReturnType<typeof input>) => {
        event(candidate).completionActivitySourceId = activity(candidate).sourceId;
      },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = input();
      const candidateEvent = event(candidate);
      candidateEvent.lifecycle = "completed";
      candidateEvent.startAt = "2026-07-09T11:00:00.000Z";
      candidateEvent.endAt = "2026-07-09T14:00:00.000Z";
      candidateEvent.activity_category = index === 2 ? "run" : "bike";
      mutate(candidate);
      rejects(candidate);
    }
  });
});
