import type { AthleteIntelligenceModelInput, TrainingFeasibilityInput } from "@repo/core";
import { athleteIntelligenceModelInputSchema, type calculateTrainingFeasibility } from "@repo/core";
import type { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AthleteIntelligenceModelReader } from "../projection-orchestrator";
import {
  athleteIntelligenceRuntimeProjectionSchema,
  projectAthleteIntelligence,
} from "../projection-orchestrator";

const coreFeasibility = vi.hoisted(() => ({
  calculate: undefined as unknown as (
    input: TrainingFeasibilityInput,
  ) => ReturnType<typeof calculateTrainingFeasibility>,
}));
const calculateTrainingFeasibilityMock = vi.hoisted(() => vi.fn());

vi.mock("@repo/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@repo/core")>();
  coreFeasibility.calculate = core.calculateTrainingFeasibility;
  calculateTrainingFeasibilityMock.mockImplementation(core.calculateTrainingFeasibility);
  return { ...core, calculateTrainingFeasibility: calculateTrainingFeasibilityMock };
});

const profileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const goalId = "11111111-1111-4111-8111-111111111111";
const asOf = new Date("2026-07-10T12:00:00.000Z");

function canonicalModel(): AthleteIntelligenceModelInput {
  const evidenceRegistry: AthleteIntelligenceModelInput["evidenceRegistry"] = {};
  let sequence = 0;
  const evidence = (
    value: number | null,
    unit: string | null,
    options: {
      sourceId?: string;
      lineageGroupId?: string;
      sourceType?:
        | "manual_observation"
        | "profile_metric"
        | "activity"
        | "activity_effort"
        | "goal";
      sport?: "bike" | null;
      compatibilityState?: "compatible" | "incompatible_unit";
      modality?: string;
    } = {},
  ) => {
    const sourceId = options.sourceId ?? `manual:value-${sequence++}`;
    evidenceRegistry[sourceId] = {
      athleteId: profileId,
      sourceId,
      lineageGroupId: options.lineageGroupId ?? `manual-test:value-${sequence}`,
      observedAt: asOf.toISOString(),
      rawObservation: { value, unit },
      sport: options.sport ?? null,
      modality: options.modality ?? "manual",
      sourceType: options.sourceType ?? "manual_observation",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: options.compatibilityState ?? "compatible",
    };
    return sourceId;
  };
  const measured = (value: number | null, unit: string, sourceId?: string) => ({
    value,
    unit,
    evidenceSourceIds: [evidence(value, unit, sourceId ? { sourceId } : {})],
  });
  const profileSource = evidence(null, null, {
    sourceId: "manual:profile",
    lineageGroupId: "manual-test:profile",
  });
  const activitySource = evidence(null, null, {
    sourceId: "activity:ride:record",
    lineageGroupId: "activity:ride",
    sourceType: "activity",
    sport: "bike",
  });
  const effortSource = evidence(null, null, {
    sourceId: "effort:hour:record",
    lineageGroupId: "activity:effort-hour",
    sourceType: "activity_effort",
    sport: "bike",
  });
  const goalSource = evidence(null, null, {
    sourceId: `goal:${goalId}:record`,
    lineageGroupId: `manual-test:goal-${goalId}`,
    sourceType: "goal",
    sport: "bike",
  });
  const nullMetric = (unit: string) => measured(null, unit);
  const bikeLoadIdentity = {
    sport: "bike",
    family: "tss" as const,
    method: "normalized_power",
    version: "1",
    sourceDefinition: "first_party:ftp-300",
  };
  const activityMetrics = {
    elapsedDurationSeconds: measured(7200, "seconds"),
    movingDurationSeconds: measured(7000, "seconds"),
    distanceMeters: measured(60_000, "meters"),
    ascentMeters: nullMetric("meters"),
    descentMeters: nullMetric("meters"),
    workKilojoules: nullMetric("kilojoules"),
    caloriesKilocalories: nullMetric("kilocalories"),
    averagePowerWatts: measured(210, "watts"),
    maximumPowerWatts: nullMetric("watts"),
    normalizedPowerWatts: nullMetric("watts"),
    averageSpeedMetersPerSecond: nullMetric("meters_per_second"),
    maximumSpeedMetersPerSecond: nullMetric("meters_per_second"),
    averageHeartRateBpm: measured(145, "beats_per_minute"),
    maximumHeartRateBpm: nullMetric("beats_per_minute"),
    averageCadenceRpm: nullMetric("revolutions_per_minute"),
    maximumCadenceRpm: nullMetric("revolutions_per_minute"),
    trainingLoad: { ...measured(90, "score"), identity: bikeLoadIdentity },
    aerobicTrainingEffect: nullMetric("score"),
    anaerobicTrainingEffect: nullMetric("score"),
  };
  for (const metric of Object.values(activityMetrics)) {
    for (const sourceId of metric.evidenceSourceIds) {
      const item = evidenceRegistry[sourceId];
      if (item) evidenceRegistry[sourceId] = { ...item, sport: "bike" };
    }
  }

  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "phase-1",
    assessmentAsOf: asOf.toISOString(),
    athleteId: profileId,
    planningTimezone: "UTC",
    evidenceRegistry,
    physiology: {
      athleteId: profileId,
      ageYears: measured(35, "years"),
      weightKg: measured(75, "kilograms"),
      heightCm: nullMetric("centimeters"),
      bodyFatPercent: nullMetric("percent"),
      preferredUnits: {
        value: {
          distance: "kilometers",
          elevation: "meters",
          mass: "kilograms",
          temperature: "celsius",
        },
        evidenceSourceIds: [profileSource],
      },
    },
    metricEvidence: [
      {
        metricType: "ftp",
        role: "direct_threshold_evidence",
        value: measured(300, "watts", "metric:ftp"),
      },
      {
        metricType: "hrv_rmssd",
        role: "readiness_context",
        value: measured(55, "milliseconds", "metric:hrv"),
      },
    ],
    activityWindow: { from: "2026-06-10T12:00:00.000Z", through: asOf.toISOString() },
    activities: [
      {
        sourceId: activitySource,
        athleteId: profileId,
        lineageGroupId: "activity:ride",
        startedAt: "2026-07-08T08:00:00.000Z",
        endedAt: "2026-07-08T10:00:00.000Z",
        sport: "bike",
        metrics: activityMetrics,
        zonesAndCurves: [],
        laps: [],
      },
    ],
    efforts: [
      {
        sourceId: effortSource,
        athleteId: profileId,
        lineageGroupId: "activity:effort-hour",
        activitySourceId: null,
        observedAt: "2026-07-08T09:00:00.000Z",
        sport: "bike",
        startOffsetSeconds: null,
        endOffsetSeconds: null,
        durationSeconds: 3600,
        evidenceSourceIds: [
          evidence(3600, "seconds", {
            lineageGroupId: "activity:effort-hour",
            sourceType: "activity_effort",
            sport: "bike",
            modality: "duration",
          }),
          evidence(280, "watts", {
            lineageGroupId: "activity:effort-hour",
            sourceType: "activity_effort",
            sport: "bike",
            modality: "value",
          }),
        ],
        kind: "power",
        powerWatts: 280,
      },
      {
        sourceId: evidence(null, null, {
          sourceId: "effort:hour-2:record",
          lineageGroupId: "activity:effort-hour-2",
          sourceType: "activity_effort",
          sport: "bike",
        }),
        athleteId: profileId,
        lineageGroupId: "activity:effort-hour-2",
        activitySourceId: null,
        observedAt: "2026-07-07T09:00:00.000Z",
        sport: "bike",
        startOffsetSeconds: null,
        endOffsetSeconds: null,
        durationSeconds: 3600,
        evidenceSourceIds: [
          evidence(3600, "seconds", {
            lineageGroupId: "activity:effort-hour-2",
            sourceType: "activity_effort",
            sport: "bike",
            modality: "duration",
          }),
          evidence(260, "watts", {
            lineageGroupId: "activity:effort-hour-2",
            sourceType: "activity_effort",
            sport: "bike",
            modality: "value",
          }),
        ],
        kind: "power",
        powerWatts: 260,
      },
    ],
    goals: [
      {
        sourceId: goalSource,
        athleteId: profileId,
        lineageGroupId: `manual-test:goal-${goalId}`,
        targetDate: "2026-09-01",
        priority: 8,
        goalSport: "bike",
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 320,
          test_duration_s: 3600,
        },
        evidenceSourceIds: [goalSource],
      },
    ],
    trainingContext: {
      sourceId: profileSource,
      athleteId: profileId,
      lineageGroupId: "manual-test:profile",
      evidenceSourceIds: [profileSource],
      preferredSports: ["bike"],
      weeklyTimeWindows: [{ day: "monday", startMinuteLocal: 360, endMinuteLocal: 480 }],
      hardRestDays: [],
      maximumWeeklyMinutes: measured(600, "minutes"),
      maximumDailyMinutes: measured(180, "minutes"),
      maximumSessionsPerDay: measured(2, "count"),
      maximumSessionDurationMinutes: measured(180, "minutes"),
      sportDoseLimits: [],
      allowDoubleDays: true,
      minimumRecoveryHours: measured(12, "hours"),
      maximumConsecutiveTrainingDays: measured(6, "days"),
      recoveryPreference: "balanced",
      fatigueTolerance: measured(0.7, "ratio"),
      strategy: "balanced",
      taperPreference: "standard",
      progressionPreference: "steady",
      ctlOverride: { ...nullMetric("training_load"), identity: null },
      atlOverride: { ...nullMetric("training_load"), identity: null },
    },
    plannedSchedule: [
      {
        sourceId: evidence(null, null, {
          sourceId: "manual:event",
          lineageGroupId: "manual-test:event",
          sport: "bike",
        }),
        athleteId: profileId,
        lineageGroupId: "manual-test:event",
        startAt: "2026-07-13T06:00:00.000Z",
        endAt: "2026-07-13T07:00:00.000Z",
        timezone: "UTC",
        allDay: false,
        lifecycle: "planned",
        eventType: "training",
        sport: "bike",
        recurrence: null,
        completionActivitySourceId: null,
        planSourceId: null,
        evidenceSourceIds: [profileSource],
      },
    ],
    scheduleReadState: "complete",
  });
}

const readerFor = (model: AthleteIntelligenceModelInput): AthleteIntelligenceModelReader => ({
  read: vi.fn(async () => model),
});

async function project(model: AthleteIntelligenceModelInput) {
  return projectAthleteIntelligence({
    modelReader: readerFor(model),
    profileId,
    goalId,
    asOf,
    planningTimezone: "UTC",
  });
}

function first<T>(items: readonly T[], fixtureName: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`${fixtureName} fixture missing`);
  return item;
}

function replaceEvidenceValue(
  model: AthleteIntelligenceModelInput,
  sourceId: string | undefined,
  value: number,
): void {
  if (sourceId === undefined) throw new Error("Evidence source fixture missing");
  const source = model.evidenceRegistry[sourceId];
  if (source === undefined) throw new Error(`Evidence fixture missing: ${sourceId}`);
  model.evidenceRegistry[sourceId] = {
    ...source,
    rawObservation: { ...source.rawObservation, value },
  };
}

afterEach(() => {
  calculateTrainingFeasibilityMock.mockImplementation(coreFeasibility.calculate);
});

describe("projectAthleteIntelligence", () => {
  it("delegates the requested profile and asOf to the injected model reader", async () => {
    const reader = readerFor(canonicalModel());
    await projectAthleteIntelligence({ modelReader: reader, profileId, goalId, asOf });
    expect(reader.read).toHaveBeenCalledOnce();
    expect(reader.read).toHaveBeenCalledWith({ profileId, goalId, asOf });
  });

  it("returns the same not-found boundary for a missing or foreign-owned goal", async () => {
    const model = canonicalModel();
    await expect(
      projectAthleteIntelligence({
        modelReader: readerFor(model),
        profileId,
        goalId: "22222222-2222-4222-8222-222222222222",
        asOf,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Goal not found",
    } satisfies Partial<TRPCError>);
    const foreign = { ...model, athleteId: "athlete-2" };
    await expect(project(foreign)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Goal not found",
    } satisfies Partial<TRPCError>);
  });

  it("projects physiology, effort, activity, preferences, and schedule into canonical outputs", async () => {
    const baseline = await project(canonicalModel());
    const changedModel = canonicalModel();
    const ftp = changedModel.metricEvidence.find((metric) => metric.metricType === "ftp");
    if (!ftp) throw new Error("FTP fixture missing");
    ftp.value.value = 340;
    replaceEvidenceValue(changedModel, ftp.value.evidenceSourceIds[0], 340);
    const effort = first(changedModel.efforts, "Power effort");
    if (effort.kind !== "power") throw new Error("Power effort fixture has the wrong kind");
    changedModel.efforts[0] = { ...effort, powerWatts: 330 };
    const effortValueSource = effort.evidenceSourceIds.find(
      (sourceId) => changedModel.evidenceRegistry[sourceId]?.rawObservation.unit === "watts",
    );
    if (!effortValueSource) throw new Error("Effort value evidence fixture missing");
    replaceEvidenceValue(changedModel, effortValueSource, 330);
    const activity = first(changedModel.activities, "Activity");
    changedModel.activities[0] = {
      ...activity,
      metrics: {
        ...activity.metrics,
        elapsedDurationSeconds: {
          ...activity.metrics.elapsedDurationSeconds,
          value: 3600,
        },
      },
    };
    replaceEvidenceValue(
      changedModel,
      activity.metrics.elapsedDurationSeconds.evidenceSourceIds[0],
      3600,
    );
    changedModel.trainingContext.maximumWeeklyMinutes.value = 30;
    replaceEvidenceValue(
      changedModel,
      changedModel.trainingContext.maximumWeeklyMinutes.evidenceSourceIds[0],
      30,
    );
    changedModel.trainingContext.hardRestDays = ["monday"];
    const plannedEvent = first(changedModel.plannedSchedule, "Planned event");
    changedModel.plannedSchedule[0] = {
      ...plannedEvent,
      endAt: "2026-07-13T09:00:00.000Z",
    };

    const changed = await project(athleteIntelligenceModelInputSchema.parse(changedModel));
    expect(changed.capability.ftp.estimate).toBe(340);
    expect(changed.capability.effortCurves).not.toEqual(baseline.capability.effortCurves);
    expect(changed.capability.enduranceRecencyWeightedMinutes).not.toEqual(
      baseline.capability.enduranceRecencyWeightedMinutes,
    );
    expect(changed.feasibility).not.toEqual(baseline.feasibility);
    expect(changed.decisionGuidance).not.toEqual(baseline.decisionGuidance);
    expect(baseline.capability.effortCurves[0]?.highIntensity).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["distinct_high_intensity_requirement_missing"],
    });
    expect(baseline.feasibility.timeCoverage).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "required_data_missing",
    });
    expect(baseline.feasibility.requiredSessionCoverage).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "required_data_missing",
    });
    expect(baseline.decisionGuidance).toMatchObject({
      state: "unknown",
      reasonCodes: expect.arrayContaining(["weekly_training_demand_not_approved"]),
    });
  });

  it("reports missing and incompatible evidence explicitly", async () => {
    const missing = canonicalModel();
    missing.efforts = [];
    missing.metricEvidence = missing.metricEvidence.filter((metric) => metric.metricType !== "ftp");
    const missingProjection = await project(athleteIntelligenceModelInputSchema.parse(missing));
    expect(missingProjection.opportunities.evidence.length).toBeGreaterThan(0);
    expect(missingProjection.capability.effortCurves[0]?.threshold).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "required_data_missing",
    });
    expect(
      missingProjection.capability.effortCurves[0]?.threshold.reasonCodes.length,
    ).toBeGreaterThan(0);

    const incompatible = canonicalModel();
    const ftpSource = incompatible.metricEvidence.find((metric) => metric.metricType === "ftp")
      ?.value.evidenceSourceIds[0];
    if (!ftpSource || !incompatible.evidenceRegistry[ftpSource])
      throw new Error("FTP evidence fixture missing");
    incompatible.evidenceRegistry[ftpSource] = {
      ...incompatible.evidenceRegistry[ftpSource],
      compatibilityState: "incompatible_unit",
    };
    const incompatibleProjection = await project(
      athleteIntelligenceModelInputSchema.parse(incompatible),
    );
    expect(incompatibleProjection.capability.ftp).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
    });
    expect(incompatibleProjection.capability.ftp.reasonCodes).toContain(
      "invalid_or_incompatible_metric_evidence",
    );
    expect(incompatibleProjection.opportunities.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goalSourceId: `goal:${goalId}:record`,
          dimension: "threshold",
          reasonCodes: ["decision_quality_not_recommendation_compatible"],
        }),
      ]),
    );

    const incompatibleEffort = canonicalModel();
    for (const sourceId of first(incompatibleEffort.efforts, "Power effort").evidenceSourceIds) {
      const source = incompatibleEffort.evidenceRegistry[sourceId];
      if (source) {
        incompatibleEffort.evidenceRegistry[sourceId] = {
          ...source,
          compatibilityState: "incompatible_unit",
        };
      }
    }
    const effortProjection = await project(
      athleteIntelligenceModelInputSchema.parse(incompatibleEffort),
    );
    expect(effortProjection.capability.effortCurves[0]?.threshold).toMatchObject({
      state: "unsupported",
      missingDataState: "incompatible_data",
      reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
    });

    const registryOnly = canonicalModel();
    registryOnly.efforts = [];
    registryOnly.evidenceRegistry["effort:unsupported:value-raw"] = {
      athleteId: profileId,
      sourceId: "effort:unsupported:value-raw",
      lineageGroupId: "activity:effort-unsupported",
      observedAt: asOf.toISOString(),
      rawObservation: { value: 10, unit: "horsepower" },
      sport: "bike",
      modality: "value-raw",
      sourceType: "activity_effort",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "incompatible_unit",
    };
    const registryOnlyProjection = await project(
      athleteIntelligenceModelInputSchema.parse(registryOnly),
    );
    expect(registryOnlyProjection.capability.effortCurves[0]?.threshold).toMatchObject({
      state: "unsupported",
      missingDataState: "incompatible_data",
      reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
      contributingSourceIds: ["effort:unsupported:value-raw"],
    });
    expect(registryOnlyProjection.opportunities.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goalSourceId: `goal:${goalId}:record`,
          dimension: "threshold",
          reasonCodes: ["decision_quality_not_recommendation_compatible"],
        }),
      ]),
    );
  });

  it("preserves recurrence for core expansion and marks truncated schedule reads partial", async () => {
    const recurring = canonicalModel();
    const event = first(recurring.plannedSchedule, "Planned event");
    recurring.plannedSchedule[0] = {
      ...event,
      recurrence: { frequency: "weekly", interval: 1, until: "2026-08-31T06:00:00.000Z" },
    };
    const expanded = await project(athleteIntelligenceModelInputSchema.parse(recurring));
    expect(expanded.feasibility.compatibleScheduledMinutes.estimate).toBeGreaterThan(60);

    recurring.readCoverage = {
      metrics: recurring.readCoverage?.metrics ?? { state: "complete", reason: null },
      activities: recurring.readCoverage?.activities ?? { state: "complete", reason: null },
      efforts: recurring.readCoverage?.efforts ?? { state: "complete", reason: null },
      schedules: { state: "truncated", reason: "query_limit_reached" },
    };
    recurring.scheduleReadState = "truncated";
    const truncated = await project(athleteIntelligenceModelInputSchema.parse(recurring));
    expect(truncated.feasibility.scheduleCoverage).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: ["schedule_read_truncated"],
    });
    expect(truncated.feasibility.compatibleScheduledMinutes).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
      estimate: null,
      reasonCodes: ["schedule_read_truncated"],
    });
    expect(truncated.feasibility.constraints.hardRestConflicts).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
      estimate: null,
    });
    expect(truncated.decisionGuidance.state).toBe("unknown");
  });

  it("credits only run sessions while preserving bike and strength constraints", async () => {
    const runGoal = canonicalModel();
    const goal = first(runGoal.goals, "Goal");
    runGoal.goals[0] = {
      ...goal,
      goalSport: "run",
      objective: {
        type: "threshold",
        metric: "pace",
        activity_category: "run",
        value: 300,
        test_duration_s: 3600,
      },
    };
    const goalEvidence = runGoal.evidenceRegistry[goal.sourceId];
    if (!goalEvidence) throw new Error("Goal evidence fixture missing");
    runGoal.evidenceRegistry[goal.sourceId] = {
      ...goalEvidence,
      sport: "run",
    };
    const event = first(runGoal.plannedSchedule, "Planned event");
    const eventEvidence = runGoal.evidenceRegistry[event.sourceId];
    if (!eventEvidence) throw new Error("Schedule evidence fixture missing");
    runGoal.evidenceRegistry["manual:event-strength"] = {
      ...eventEvidence,
      sourceId: "manual:event-strength",
      lineageGroupId: "manual-test:event-strength",
      sport: "strength",
    };
    runGoal.plannedSchedule = [
      { ...event, sport: "bike" },
      {
        ...event,
        sourceId: "manual:event-strength",
        lineageGroupId: "manual-test:event-strength",
        startAt: "2026-07-13T07:00:00.000Z",
        endAt: "2026-07-13T08:00:00.000Z",
        sport: "strength",
      },
    ];
    runGoal.trainingContext.hardRestDays = ["monday"];
    runGoal.trainingContext.maximumDailyMinutes.value = 90;
    runGoal.trainingContext.maximumSessionsPerDay.value = 1;
    runGoal.trainingContext.maximumWeeklyMinutes.value = 90;
    replaceEvidenceValue(
      runGoal,
      runGoal.trainingContext.maximumDailyMinutes.evidenceSourceIds[0],
      90,
    );
    replaceEvidenceValue(
      runGoal,
      runGoal.trainingContext.maximumSessionsPerDay.evidenceSourceIds[0],
      1,
    );
    replaceEvidenceValue(
      runGoal,
      runGoal.trainingContext.maximumWeeklyMinutes.evidenceSourceIds[0],
      90,
    );
    calculateTrainingFeasibilityMock.mockImplementationOnce((input: TrainingFeasibilityInput) => {
      expect(input.targetGoalSport).toBe("run");
      return coreFeasibility.calculate({ ...input, requiredWeeklySessions: 2 });
    });

    const projection = await project(athleteIntelligenceModelInputSchema.parse(runGoal));

    expect(projection.feasibility.requiredSessionCoverage.estimate).toBe(0);
    expect(projection.feasibility.constraints.hardRestConflicts.estimate).toBe(2);
    expect(projection.feasibility.constraints.dailyDurationExcesses.estimate).toBe(1);
    expect(projection.feasibility.constraints.dailySessionCapExcesses.estimate).toBe(1);
    expect(projection.feasibility.constraints.weeklyDurationExcesses.estimate).toBe(1);
  });

  it("reports missing selected-goal sport instead of borrowing scheduled-session credit", async () => {
    const noSport = canonicalModel();
    const goal = first(noSport.goals, "Goal");
    noSport.goals[0] = {
      ...goal,
      goalSport: null,
      objective: { type: "threshold", metric: "power", value: 320, test_duration_s: 3600 },
    };
    const goalEvidence = noSport.evidenceRegistry[goal.sourceId];
    if (!goalEvidence) throw new Error("Goal evidence fixture missing");
    noSport.evidenceRegistry[goal.sourceId] = {
      ...goalEvidence,
      sport: null,
    };
    calculateTrainingFeasibilityMock.mockImplementationOnce((input: TrainingFeasibilityInput) => {
      expect(input.targetGoalSport).toBeNull();
      return coreFeasibility.calculate({ ...input, requiredWeeklySessions: 2 });
    });

    const projection = await project(athleteIntelligenceModelInputSchema.parse(noSport));

    expect(projection.feasibility.requiredSessionCoverage).toMatchObject({
      state: "unsupported",
      missingDataState: "unsupported_input",
      reasonCodes: ["target_goal_sport_required_for_session_coverage"],
    });
  });

  it("credits matching sessions for a header-only consistency goal", async () => {
    const consistency = canonicalModel();
    const goal = first(consistency.goals, "Goal");
    consistency.goals[0] = {
      ...goal,
      goalSport: "bike",
      objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 },
    };

    const projection = await project(athleteIntelligenceModelInputSchema.parse(consistency));

    expect(projection.feasibility.requiredSessionCoverage).toMatchObject({
      unit: "ratio",
    });
    expect(projection.feasibility.requiredSessionCoverage.estimate).toBeGreaterThan(0);
  });

  it("requires request planning timezone without an event-zone or materialized-model fallback", async () => {
    const noPlanningZone = canonicalModel();
    const event = first(noPlanningZone.plannedSchedule, "Planned event");
    noPlanningZone.plannedSchedule[0] = {
      ...event,
      recurrence: {
        frequency: "weekly",
        interval: 1,
        until: "2026-08-31T06:00:00.000Z",
        timezone: "Asia/Tokyo",
      },
    };

    const parsed = athleteIntelligenceModelInputSchema.parse(noPlanningZone);
    const projection = await projectAthleteIntelligence({
      modelReader: readerFor(parsed),
      profileId,
      goalId,
      asOf,
    });
    expect(projection.feasibility.compatibleScheduledMinutes).toMatchObject({
      state: "unsupported",
      missingDataState: "unsupported_input",
      reasonCodes: expect.arrayContaining(["planning_timezone_required"]),
    });
    expect(projection.runtimeContext.stateVector.limitations).toContain(
      "planning_timezone_required",
    );
    expect(parsed.planningTimezone).toBe("UTC");
  });

  it.each([
    ["no events", []],
    [
      "DST-boundary event",
      [
        {
          ...first(canonicalModel().plannedSchedule, "Planned event"),
          startAt: "2026-11-01T05:30:00.000Z",
          endAt: "2026-11-01T07:30:00.000Z",
          timezone: "America/New_York",
        },
      ],
    ],
  ])("keeps date-sensitive calendar results unsupported without request timezone: %s", async (_name, plannedSchedule) => {
    const model = athleteIntelligenceModelInputSchema.parse({
      ...canonicalModel(),
      planningTimezone: "Asia/Tokyo",
      plannedSchedule,
    });
    const projection = await projectAthleteIntelligence({
      modelReader: readerFor(model),
      profileId,
      goalId,
      asOf,
    });
    for (const value of [
      projection.feasibility.timeCoverage,
      projection.feasibility.requiredSessionCoverage,
      projection.feasibility.compatibleScheduledMinutes,
      projection.feasibility.scheduleCoverage,
    ]) {
      expect(value).toMatchObject({
        state: "unsupported",
        reasonCodes: ["planning_timezone_required"],
      });
    }
    expect(projection.runtimeContext.stateVector.calendarContext.coverage.state).not.toBe(
      "complete",
    );
  });

  it("uses a valid request timezone as the sole planning override", async () => {
    const model = canonicalModel();
    const projection = await projectAthleteIntelligence({
      modelReader: readerFor(model),
      profileId,
      goalId,
      asOf,
      planningTimezone: "America/New_York",
    });
    expect(projection.feasibility.compatibleScheduledMinutes.reasonCodes).not.toContain(
      "planning_timezone_required",
    );
  });

  it("assembles separated ephemeral state with deterministic request time", async () => {
    const projection = await project(canonicalModel());
    expect(projection.runtimeContext.stateVector.generatedAt).toBe(asOf.toISOString());
    expect(projection.runtimeContext.stateVector.internalResponse.result).toMatchObject({
      state: "unsupported",
      reasonCodes: ["internal_response_policy_not_available"],
    });
    expect(projection.runtimeContext.stateVector.wellnessContext.coverage.sourceIds).toContain(
      "metric:hrv",
    );
    expect(projection.runtimeContext.stateVector.externalWork[0]).toMatchObject({ sport: "bike" });
    expect(projection.runtimeContext.stateVector.externalWork[0]?.loadIdentity).toBeTruthy();
    expect(projection.runtimeContext.stateVector.mechanicalExposure.result.state).toBe(
      "unsupported",
    );
    expect(projection.runtimeContext.stateVector.strengthExposure.result.state).toBe("unsupported");
    expect(projection.runtimeContext).toEqual({
      stateVector: projection.runtimeContext.stateVector,
    });
  });

  it("emits one external-work channel per represented sport and exact load identity", async () => {
    const model = canonicalModel();
    const bike = first(model.activities, "Bike activity");
    const runSourceId = "activity:run-load";
    const run = {
      ...bike,
      sourceId: runSourceId,
      lineageGroupId: "activity:run-load",
      sport: "run" as const,
      metrics: {
        ...bike.metrics,
        trainingLoad: {
          ...bike.metrics.trainingLoad,
          identity: {
            sport: "run",
            family: "trimp" as const,
            method: "heart_rate",
            version: "1",
            sourceDefinition: "first_party:hr-zones",
          },
        },
      },
    };
    const parsed = athleteIntelligenceModelInputSchema.parse({
      ...model,
      evidenceRegistry: {
        ...model.evidenceRegistry,
        [runSourceId]: {
          ...model.evidenceRegistry[bike.sourceId],
          sourceId: runSourceId,
          lineageGroupId: "activity:run-load",
          sport: "run",
        },
      },
      activities: [run, bike],
    });
    const projection = await project(parsed);
    expect(
      projection.runtimeContext.stateVector.externalWork.map(({ sport }) => sport).sort(),
    ).toEqual(["bike", "run"]);

    const reordered = await project(
      athleteIntelligenceModelInputSchema.parse({
        ...parsed,
        activities: [...parsed.activities].reverse(),
      }),
    );
    expect(reordered.runtimeContext.stateVector.externalWork).toEqual(
      projection.runtimeContext.stateVector.externalWork,
    );
  });

  it("returns a projection accepted by the public schema", async () => {
    const projection = await project(canonicalModel());
    expect(athleteIntelligenceRuntimeProjectionSchema.parse(projection)).toEqual(projection);
    expect(
      athleteIntelligenceRuntimeProjectionSchema.safeParse({ ...projection, unexpected: true })
        .success,
    ).toBe(false);
  });
});
