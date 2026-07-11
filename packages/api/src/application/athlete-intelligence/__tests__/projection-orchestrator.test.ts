import type { AthleteIntelligenceModelInput } from "@repo/core";
import {
  athleteIntelligenceModelInputSchema,
  athleteIntelligenceProjectionSchema,
} from "@repo/core";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { AthleteIntelligenceModelReader } from "../projection-orchestrator";
import { projectAthleteIntelligence } from "../projection-orchestrator";

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
    trainingLoad: measured(90, "score"),
    aerobicTrainingEffect: nullMetric("score"),
    anaerobicTrainingEffect: nullMetric("score"),
  };

  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "phase-1",
    assessmentAsOf: asOf.toISOString(),
    athleteId: profileId,
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
    ],
    goals: [
      {
        sourceId: goalSource,
        athleteId: profileId,
        lineageGroupId: `manual-test:goal-${goalId}`,
        targetDate: "2026-09-01",
        priority: 8,
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
      ctlOverride: nullMetric("training_load"),
      atlOverride: nullMetric("training_load"),
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
  return projectAthleteIntelligence({ modelReader: readerFor(model), profileId, goalId, asOf });
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
          reasonCodes: ["missing_incompatible_or_uncertain_physical_evidence"],
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
          reasonCodes: ["missing_incompatible_or_uncertain_physical_evidence"],
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

    recurring.scheduleReadState = "truncated";
    const truncated = await project(athleteIntelligenceModelInputSchema.parse(recurring));
    expect(truncated.feasibility.scheduleCoverage).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: ["schedule_read_truncated"],
    });
  });

  it("returns a projection accepted by the public schema", async () => {
    const projection = await project(canonicalModel());
    expect(athleteIntelligenceProjectionSchema.parse(projection)).toEqual(projection);
  });
});
