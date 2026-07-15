import { describe, expect, it } from "vitest";

import {
  type CalculationResult,
  observedResult,
  unavailableResult,
} from "../../calculation-result-contracts";
import { athleteMetricRoleByType } from "../../evidence-contracts";
import { athleteIntelligenceModelInputSchema } from "../../model-input-contracts";
import { athleteIntelligenceProjectionSchema } from "../../projection-contracts";
import type { ActivityReadinessResults } from "../activity-readiness";
import type { GoalDemandPolicyV1Result } from "../goal-demand";
import type { PhysiologyMetricsPolicyResult } from "../physiology-metrics";
import { assembleWholeAthleteProjectionV1 } from "../projection";
import type { TrainingFeasibilityResults } from "../training-feasibility";

const AS_OF = "2026-07-10T12:00:00.000Z";
const result = (value: number, unit: string, source = "manual:test") =>
  observedResult({ rawValue: value, unit, sourceId: source, uncertainty: 0.1 });
const missing = (reason = "missing_test_evidence") =>
  unavailableResult({
    state: "insufficient_evidence",
    missingDataState: "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reason],
  });

const effect = (
  value: CalculationResult,
  role: PhysiologyMetricsPolicyResult["metrics"]["ftp"]["role"],
) => ({ role, result: value, influence: 1 });
function physiology(ftp = 300, weight = 75): PhysiologyMetricsPolicyResult {
  return {
    policyVersion: "physiology_metrics_v1",
    metrics: {
      ftp: effect(result(ftp, "watts", "metric:ftp"), athleteMetricRoleByType.ftp),
      threshold_pace_seconds_per_km: effect(
        result(270, "seconds_per_km"),
        athleteMetricRoleByType.threshold_pace_seconds_per_km,
      ),
      css_seconds_per_100m: effect(
        result(95, "seconds_per_100m"),
        athleteMetricRoleByType.css_seconds_per_100m,
      ),
      lthr: effect(result(170, "beats_per_minute", "metric:lthr"), athleteMetricRoleByType.lthr),
      max_hr: effect(result(190, "beats_per_minute"), athleteMetricRoleByType.max_hr),
      resting_hr: effect(result(50, "beats_per_minute"), athleteMetricRoleByType.resting_hr),
      vo2_max: effect(missing(), athleteMetricRoleByType.vo2_max),
      weight_kg: effect(result(weight, "kilograms"), athleteMetricRoleByType.weight_kg),
      hrv_rmssd: effect(missing(), athleteMetricRoleByType.hrv_rmssd),
      sleep_hours: effect(missing(), athleteMetricRoleByType.sleep_hours),
      stress_score: effect(missing(), athleteMetricRoleByType.stress_score),
      soreness_level: effect(missing(), athleteMetricRoleByType.soreness_level),
      wellness_score: effect(missing(), athleteMetricRoleByType.wellness_score),
      age_years: effect(missing(), athleteMetricRoleByType.age_years),
    },
    wattsPerKilogram: result(ftp / weight, "watts_per_kilogram", "metric:ftp"),
    heartRateReserve: result(140, "beats_per_minute", "metric:hr-reserve"),
    individualizedRatios: {
      hrvRmssd: missing(),
      sleep: missing(),
      stress: missing(),
      soreness: missing(),
      wellness: missing(),
    },
  };
}

const readiness = (
  overrides: Partial<ActivityReadinessResults> = {},
): ActivityReadinessResults => ({
  policyVersion: "activity_readiness_v1",
  endurance: result(180, "minutes"),
  durability: result(0.9, "ratio"),
  sportSpecificity: result(0.8, "ratio"),
  volumeTrend: result(1, "ratio"),
  frequencyTrend: result(1, "ratio"),
  readinessContext: result(0.2, "bounded_baseline_deviation"),
  ...overrides,
});
const feasibility = (coverage = 1): TrainingFeasibilityResults => ({
  policyVersion: "training-feasibility-v1",
  timeCoverage: result(coverage, "ratio"),
  requiredSessionCoverage: result(1, "ratio"),
  compatibleScheduledMinutes: result(300, "minutes"),
  scheduleCoverage: result(1, "ratio"),
  constraints: {
    hardRestConflicts: result(0, "count"),
    dailyDurationExcesses: result(0, "count"),
    dailySessionCapExcesses: result(0, "count"),
    doubleDayConflicts: result(0, "count"),
    sessionDurationExcesses: result(0, "count"),
    weeklyDurationExcesses: result(0, "count"),
    weeklySessionCapExcesses: result(0, "count"),
    sportOverrideExcesses: result(0, "count"),
    recoveryPreferenceConflicts: result(0, "count"),
  },
});

type Objective =
  | {
      type: "threshold";
      metric: "power" | "hr" | "pace";
      activity_category?: "bike" | "run";
      value: number;
      test_duration_s: number;
    }
  | {
      type: "event_performance";
      activity_category: "bike" | "run";
      distance_m: number;
      target_time_s: number;
    }
  | {
      type: "completion";
      activity_category?: "bike" | "run";
      distance_m?: number;
      duration_s?: number;
    }
  | { type: "consistency"; target_sessions_per_week: number; target_weeks: number };
type Goal = {
  id: string;
  priority: number;
  goalSport?: "bike" | "run" | null;
  objective: Objective;
};

function first<T>(items: readonly T[], fixtureName: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`${fixtureName} fixture missing`);
  return item;
}

function model(
  goals: readonly Goal[],
  activity = { distance: 80_000, duration: 10_800, count: 4 },
) {
  const source = "manual:test";
  const evidenceRegistry: Record<
    string,
    {
      athleteId: string;
      sourceId: string;
      lineageGroupId: string;
      observedAt: string;
      rawObservation: { value: number | null; unit: string | null };
      sport: "bike" | "run" | null;
      modality: "manual";
      sourceType: "manual_observation" | "activity" | "goal";
      qualityState: "known";
      validityState: "valid";
      compatibilityState: "compatible";
    }
  > = {};
  let evidenceIndex = 0;
  const addEvidence = (
    sourceId: string,
    value: number | null,
    unit: string | null,
    metadata: {
      lineageGroupId?: string;
      sport?: "bike" | "run" | null;
      sourceType?: "manual_observation" | "activity" | "goal";
    } = {},
  ) => {
    evidenceRegistry[sourceId] = {
      athleteId: "athlete-1",
      sourceId,
      lineageGroupId: metadata.lineageGroupId ?? `manual-test:${sourceId.replace(":", "-")}`,
      observedAt: AS_OF,
      rawObservation: { value, unit },
      sport: metadata.sport === undefined ? "bike" : metadata.sport,
      modality: "manual",
      sourceType: metadata.sourceType ?? "manual_observation",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
    };
    return sourceId;
  };
  addEvidence(source, null, null, { lineageGroupId: "manual-test:test", sport: null });
  const ev = <T extends number | null>(value: T, unit: string) => ({
    value,
    unit,
    evidenceSourceIds: [addEvidence(`manual:value-${evidenceIndex++}`, value, unit)],
  });
  const nullEv = (unit: string) => ev(null, unit);
  const activities = Array.from({ length: activity.count }, (_, index) => ({
    sourceId: `activity:${index}`,
    athleteId: "athlete-1",
    lineageGroupId: `activity:${index}`,
    startedAt: `2026-07-0${index + 1}T12:00:00.000Z`,
    endedAt: null,
    sport: "bike" as const,
    metrics: {
      elapsedDurationSeconds: ev(activity.duration, "seconds"),
      movingDurationSeconds: nullEv("seconds"),
      distanceMeters: ev(activity.distance, "meters"),
      ascentMeters: nullEv("meters"),
      descentMeters: nullEv("meters"),
      workKilojoules: nullEv("kilojoules"),
      caloriesKilocalories: nullEv("kilocalories"),
      averagePowerWatts: nullEv("watts"),
      maximumPowerWatts: nullEv("watts"),
      normalizedPowerWatts: nullEv("watts"),
      averageSpeedMetersPerSecond: nullEv("meters_per_second"),
      maximumSpeedMetersPerSecond: nullEv("meters_per_second"),
      averageHeartRateBpm: nullEv("beats_per_minute"),
      maximumHeartRateBpm: nullEv("beats_per_minute"),
      averageCadenceRpm: nullEv("revolutions_per_minute"),
      maximumCadenceRpm: nullEv("revolutions_per_minute"),
      trainingLoad: nullEv("score"),
      aerobicTrainingEffect: nullEv("score"),
      anaerobicTrainingEffect: nullEv("score"),
    },
    zonesAndCurves: [],
    laps: [],
  }));
  for (let index = 0; index < activity.count; index++)
    addEvidence(`activity:${index}`, null, null, {
      lineageGroupId: `activity:${index}`,
      sport: "bike",
      sourceType: "activity",
    });
  for (const goal of goals)
    addEvidence(goal.id, null, null, {
      lineageGroupId: `manual-test:${goal.id}`,
      sport:
        goal.goalSport ??
        ("activity_category" in goal.objective ? (goal.objective.activity_category ?? null) : null),
      sourceType: "goal",
    });
  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "2.0.0",
    assessmentAsOf: AS_OF,
    athleteId: "athlete-1",
    evidenceRegistry,
    physiology: {
      athleteId: "athlete-1",
      ageYears: nullEv("years"),
      weightKg: nullEv("kilograms"),
      heightCm: nullEv("centimeters"),
      bodyFatPercent: nullEv("percent"),
      preferredUnits: {
        value: { distance: null, elevation: null, mass: null, temperature: null },
        evidenceSourceIds: [source],
      },
    },
    metricEvidence: [],
    activityWindow: { from: "2026-06-12T12:00:00.000Z", through: AS_OF },
    activities,
    efforts: [],
    goals: goals.map((goal) => ({
      sourceId: goal.id,
      athleteId: "athlete-1",
      lineageGroupId: `manual-test:${goal.id}`,
      targetDate: null,
      priority: goal.priority,
      goalSport:
        goal.goalSport ??
        ("activity_category" in goal.objective ? (goal.objective.activity_category ?? null) : null),
      objective: goal.objective,
      evidenceSourceIds: [source],
    })),
    trainingContext: {
      sourceId: source,
      athleteId: "athlete-1",
      lineageGroupId: "manual-test:test",
      evidenceSourceIds: [source],
      preferredSports: [],
      weeklyTimeWindows: [],
      hardRestDays: [],
      maximumWeeklyMinutes: nullEv("minutes"),
      maximumDailyMinutes: nullEv("minutes"),
      maximumSessionsPerDay: nullEv("count"),
      maximumSessionDurationMinutes: nullEv("minutes"),
      sportDoseLimits: [],
      allowDoubleDays: null,
      minimumRecoveryHours: nullEv("hours"),
      maximumConsecutiveTrainingDays: nullEv("days"),
      recoveryPreference: null,
      fatigueTolerance: nullEv("ratio"),
      strategy: null,
      taperPreference: null,
      progressionPreference: null,
      ctlOverride: nullEv("training_load"),
      atlOverride: nullEv("training_load"),
    },
    plannedSchedule: [],
  });
}

const demand = (
  goalSourceId: string,
  requirement: Extract<GoalDemandPolicyV1Result, { state: "complete" }>["requirement"],
): GoalDemandPolicyV1Result => ({
  policyVersion: "goal-demand-v1",
  state: "complete",
  goalSourceId,
  missingFields: [],
  requirement,
});
const baseInput = (
  goals: readonly Goal[],
  demands: readonly {
    goalSourceId: string;
    demand: GoalDemandPolicyV1Result;
    effortCurve?: {
      policyVersion: "effort-curves-v1";
      threshold: CalculationResult;
      highIntensity: CalculationResult;
    };
  }[],
) => ({
  model: model(goals),
  physiology: physiology(),
  effortCurves: demands,
  activityReadiness: readiness(),
  calendarFeasibility: feasibility(),
});

describe("whole athlete projection v1", () => {
  it("covers threshold units, event speed, completion distance+duration, and consistency", () => {
    const goals = [
      {
        id: "goal:power",
        priority: 4,
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 350,
          test_duration_s: 1200,
        } as const,
      },
      {
        id: "goal:hr",
        priority: 3,
        objective: {
          type: "threshold",
          metric: "hr",
          activity_category: "bike",
          value: 175,
          test_duration_s: 1200,
        } as const,
      },
      {
        id: "goal:event",
        priority: 2,
        objective: {
          type: "event_performance",
          activity_category: "bike",
          distance_m: 40_000,
          target_time_s: 3600,
        } as const,
      },
      {
        id: "goal:completion",
        priority: 1,
        objective: {
          type: "completion",
          activity_category: "bike",
          distance_m: 100_000,
          duration_s: 14_400,
        } as const,
      },
      {
        id: "goal:consistency",
        priority: 0,
        goalSport: "bike" as const,
        objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 } as const,
      },
    ];
    const inputs = [
      {
        goalSourceId: "goal:power",
        demand: demand("goal:power", {
          type: "threshold",
          metric: "power",
          target: result(350, "W"),
          testDuration: result(1200, "s"),
        }),
      },
      {
        goalSourceId: "goal:hr",
        demand: demand("goal:hr", {
          type: "threshold",
          metric: "hr",
          target: result(175, "bpm"),
          testDuration: result(1200, "s"),
        }),
      },
      {
        goalSourceId: "goal:event",
        demand: demand("goal:event", {
          type: "event_performance",
          requiredDistance: result(40_000, "m"),
          requiredDuration: result(3600, "s"),
          requiredSpeed: result(11.11, "m/s"),
        }),
        effortCurve: {
          policyVersion: "effort-curves-v1" as const,
          threshold: result(90, "seconds_per_kilometer"),
          highIntensity: result(70, "seconds_per_kilometer"),
        },
      },
      {
        goalSourceId: "goal:completion",
        demand: demand("goal:completion", {
          type: "completion",
          requiredDistance: result(100_000, "m"),
          requiredDuration: result(14_400, "s"),
        }),
      },
      {
        goalSourceId: "goal:consistency",
        demand: demand("goal:consistency", {
          type: "consistency",
          sessionsPerWeek: result(2, "sessions/week"),
          weeks: result(8, "weeks"),
        }),
      },
    ];
    const projection = assembleWholeAthleteProjectionV1(baseInput(goals, inputs));
    expect(athleteIntelligenceProjectionSchema.parse(projection)).toEqual(projection);
    expect(
      projection.goalCoverage.map((goal) => goal.dimensions.map((item) => item.dimension)),
    ).toEqual([["threshold"], ["threshold"], ["speed"], ["distance", "duration"], ["frequency"]]);
    expect(projection.goalCoverage[0]?.dimensions[0]?.capability).toMatchObject({
      estimate: 300,
      unit: "W",
    });
    expect(projection.goalCoverage[3]?.dimensions.map((item) => item.physicalGap.estimate)).toEqual(
      [20_000, 3600],
    );
  });

  it("normalizes pace capability and requirement to speed with higher-is-better gaps", () => {
    const goals = [
      {
        id: "goal:ahead",
        priority: 2,
        objective: {
          type: "threshold",
          metric: "pace",
          activity_category: "run",
          value: 300,
          test_duration_s: 1200,
        } as const,
      },
      {
        id: "goal:behind",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "pace",
          activity_category: "run",
          value: 200,
          test_duration_s: 1200,
        } as const,
      },
    ];
    const paceInput = (goalSourceId: string, target: number) => ({
      goalSourceId,
      demand: demand(goalSourceId, {
        type: "threshold" as const,
        metric: "pace" as const,
        target: result(target, "seconds_per_kilometer", `goal:pace-${target}`),
        testDuration: result(1200, "s"),
      }),
      effortCurve: {
        policyVersion: "effort-curves-v1" as const,
        threshold: result(250, "seconds_per_kilometer", `metric:curve-${target}`),
        highIntensity: result(200, "seconds_per_kilometer"),
      },
    });
    const projection = assembleWholeAthleteProjectionV1(
      baseInput(goals, [paceInput("goal:ahead", 300), paceInput("goal:behind", 200)]),
    );

    expect(projection.goalCoverage.map((goal) => goal.dimensions[0])).toEqual([
      {
        dimension: "threshold",
        capability: {
          estimate: 4,
          unit: "m/s",
          uncertainty: 0.1,
          state: "estimated",
          missingDataState: "none",
          reasonCodes: ["pace_curve_converted_to_speed"],
          contributingSourceIds: ["metric:curve-300"],
        },
        requirement: {
          estimate: 10 / 3,
          unit: "m/s",
          uncertainty: 0.1,
          state: "estimated",
          missingDataState: "none",
          reasonCodes: ["pace_converted_to_speed"],
          contributingSourceIds: ["goal:pace-300"],
        },
        coverage: {
          estimate: 1.2,
          unit: "ratio",
          uncertainty: 0.1,
          state: "estimated",
          missingDataState: "none",
          reasonCodes: ["capability_divided_by_requirement"],
          contributingSourceIds: ["metric:curve-300", "goal:pace-300"],
        },
        physicalGap: {
          estimate: 0,
          unit: "m/s",
          uncertainty: 0.1,
          state: "estimated",
          missingDataState: "none",
          reasonCodes: ["requirement_minus_capability_same_unit"],
          contributingSourceIds: ["metric:curve-300", "goal:pace-300"],
        },
      },
      expect.objectContaining({
        capability: expect.objectContaining({ estimate: 4, unit: "m/s" }),
        requirement: expect.objectContaining({ estimate: 5, unit: "m/s" }),
        coverage: expect.objectContaining({ estimate: 0.8, unit: "ratio" }),
        physicalGap: expect.objectContaining({ estimate: 1, unit: "m/s" }),
      }),
    ]);
    expect(projection.opportunities.training.map(({ goalSourceId }) => goalSourceId)).toEqual([
      "goal:behind",
    ]);
  });

  it("keeps incompatible evidence unsupported and distinct from missing evidence", () => {
    const goals = [
      {
        id: "goal:pace",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "pace",
          activity_category: "run",
          value: 300,
          test_duration_s: 1200,
        } as const,
      },
    ];
    const projection = assembleWholeAthleteProjectionV1(
      baseInput(goals, [
        {
          goalSourceId: "goal:pace",
          demand: demand("goal:pace", {
            type: "threshold",
            metric: "pace",
            target: result(300, "seconds_per_kilometer"),
            testDuration: result(1200, "s"),
          }),
          effortCurve: {
            policyVersion: "effort-curves-v1",
            threshold: result(300, "watts"),
            highIntensity: result(400, "watts"),
          },
        },
      ]),
    );
    expect(projection.goalCoverage[0]?.dimensions[0]).toMatchObject({
      capability: {
        state: "unsupported",
        missingDataState: "incompatible_data",
        reasonCodes: ["compatible_speed_curve_required"],
      },
      coverage: {
        estimate: null,
        state: "unsupported",
        missingDataState: "incompatible_data",
        reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
      },
      physicalGap: {
        estimate: null,
        state: "unsupported",
        missingDataState: "incompatible_data",
        reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
      },
    });
    expect(projection.opportunities.training).toEqual([]);
    expect(projection.opportunities.evidence).toHaveLength(1);

    const missingProjection = assembleWholeAthleteProjectionV1(
      baseInput(goals, [
        {
          goalSourceId: "goal:pace",
          demand: demand("goal:pace", {
            type: "threshold",
            metric: "pace",
            target: result(300, "seconds_per_kilometer"),
            testDuration: result(1200, "s"),
          }),
        },
      ]),
    );
    expect(missingProjection.goalCoverage[0]?.dimensions[0]?.coverage).toMatchObject({
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: ["directly_comparable_physical_units_required"],
    });
  });

  it("orders opportunities only by goal priority then stable dimension order", () => {
    const goals = [
      {
        id: "goal:low",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 1000,
          test_duration_s: 1200,
        } as const,
      },
      {
        id: "goal:high",
        priority: 9,
        objective: {
          type: "completion",
          activity_category: "bike",
          distance_m: 80_001,
          duration_s: 10_801,
        } as const,
      },
    ];
    const demands = [
      {
        goalSourceId: "goal:low",
        demand: demand("goal:low", {
          type: "threshold",
          metric: "power",
          target: result(1000, "W"),
          testDuration: result(1200, "s"),
        }),
      },
      {
        goalSourceId: "goal:high",
        demand: demand("goal:high", {
          type: "completion",
          requiredDistance: result(80_001, "m"),
          requiredDuration: result(10_801, "s"),
        }),
      },
    ];
    const projection = assembleWholeAthleteProjectionV1(baseInput(goals, demands));
    expect(
      projection.opportunities.training.map(({ goalSourceId, dimension }) => [
        goalSourceId,
        dimension,
      ]),
    ).toEqual([
      ["goal:high", "distance"],
      ["goal:high", "duration"],
      ["goal:low", "threshold"],
    ]);
    const reordered = assembleWholeAthleteProjectionV1(
      baseInput(
        [
          {
            id: "goal:low",
            priority: 10,
            objective: {
              type: "threshold",
              metric: "power",
              activity_category: "bike",
              value: 1000,
              test_duration_s: 1200,
            },
          },
          {
            id: "goal:high",
            priority: 9,
            objective: {
              type: "completion",
              activity_category: "bike",
              distance_m: 80_001,
              duration_s: 10_801,
            },
          },
        ],
        demands,
      ),
    );
    expect(reordered.opportunities.training[0]?.goalSourceId).toBe("goal:low");
    expect(reordered.capability).toEqual(projection.capability);
    expect(reordered.readiness).toEqual(projection.readiness);
    expect(reordered.feasibility).toEqual(projection.feasibility);
    expect(reordered.goalCoverage).toEqual(projection.goalCoverage);
    expect(reordered.decisionGuidance).toEqual(projection.decisionGuidance);
    expect(
      [...reordered.opportunities.training].sort((a, b) =>
        a.goalSourceId.localeCompare(b.goalSourceId),
      ),
    ).toEqual(
      [...projection.opportunities.training].sort((a, b) =>
        a.goalSourceId.localeCompare(b.goalSourceId),
      ),
    );
  });

  it("preserves physical values and isolates capability, readiness, feasibility, and coverage changes", () => {
    const goals = [
      {
        id: "goal:power",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 350,
          test_duration_s: 1200,
        } as const,
      },
    ];
    const demands = [
      {
        goalSourceId: "goal:power",
        demand: demand("goal:power", {
          type: "threshold",
          metric: "power",
          target: result(350, "W"),
          testDuration: result(1200, "s"),
        }),
        effortCurve: {
          policyVersion: "effort-curves-v1" as const,
          threshold: result(320, "watts"),
          highIntensity: result(410, "watts"),
        },
      },
    ];
    const base = assembleWholeAthleteProjectionV1(baseInput(goals, demands));
    const ftp = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, demands),
      physiology: physiology(320, 80),
    });
    expect(ftp.capability.ftp.estimate).toBe(320);
    expect(ftp.capability.runningThresholdPace).toMatchObject({
      estimate: 270,
      unit: "seconds_per_km",
    });
    expect(ftp.capability.swimmingCss).toMatchObject({
      estimate: 95,
      unit: "seconds_per_100m",
    });
    expect(ftp.capability.wattsPerKilogram.estimate).toBe(4);
    expect(ftp.readiness).toEqual(base.readiness);
    expect(ftp.feasibility).toEqual(base.feasibility);
    const effort = assembleWholeAthleteProjectionV1(
      baseInput(goals, [
        {
          goalSourceId: "goal:power",
          demand: demand("goal:power", {
            type: "threshold",
            metric: "power",
            target: result(350, "W"),
            testDuration: result(1200, "s"),
          }),
          effortCurve: {
            policyVersion: "effort-curves-v1",
            threshold: result(330, "watts"),
            highIntensity: result(410, "watts"),
          },
        },
      ]),
    );
    expect(effort.capability.effortCurves[0]?.threshold.estimate).toBe(330);
    expect(effort.goalCoverage).toEqual(base.goalCoverage);
    const endurance = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, demands),
      activityReadiness: readiness({ endurance: result(240, "minutes") }),
    });
    expect(endurance.capability.enduranceRecencyWeightedMinutes.estimate).toBe(240);
    expect(endurance.readiness).toEqual(base.readiness);
    const availability = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, demands),
      calendarFeasibility: feasibility(0.5),
    });
    expect(availability.capability).toEqual(base.capability);
    expect(availability.goalCoverage).toEqual(base.goalCoverage);
    const recovery = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, demands),
      activityReadiness: readiness({
        readinessContext: result(-0.5, "bounded_baseline_deviation"),
      }),
    });
    expect(recovery.readiness.recoveryContext.estimate).toBe(-0.5);
    expect(recovery.capability).toEqual(base.capability);
  });

  it.each([
    ["proceed", 250, 1, 0.2, false],
    ["adjust-gap", 350, 1, 0.2, false],
    ["adjust-calendar", 250, 0.5, 0.2, false],
    ["adjust-recovery", 250, 1, -0.5, false],
    ["unknown", 250, 1, 0.2, true],
  ])("covers guidance branch %s without medical language", (_case, target, calendar, recovery, incomplete) => {
    const goals = [
      {
        id: "goal:test",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: target,
          test_duration_s: 1200,
        } as const,
      },
    ];
    const demandResult: GoalDemandPolicyV1Result = incomplete
      ? {
          policyVersion: "goal-demand-v1",
          state: "incomplete",
          goalSourceId: "goal:test",
          missingFields: ["objective.value"],
        }
      : demand("goal:test", {
          type: "threshold",
          metric: "power",
          target: result(target, "W"),
          testDuration: result(1200, "s"),
        });
    const projection = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, [{ goalSourceId: "goal:test", demand: demandResult }]),
      calendarFeasibility: feasibility(calendar),
      activityReadiness: readiness({
        readinessContext: result(recovery, "bounded_baseline_deviation"),
      }),
    });
    expect(
      [
        ...projection.decisionGuidance.recommendedActions,
        ...projection.decisionGuidance.cautions,
      ].join(" "),
    ).not.toMatch(/diagnos|medical|injur|disease|treat/i);
    expect(projection.decisionGuidance.state).toBe(
      incomplete ? "unknown" : target > 300 || calendar < 1 || recovery < 0 ? "adjust" : "proceed",
    );
  });

  it("suppresses training above the immutable 0.5 decision-quality uncertainty boundary", () => {
    const goals = [
      {
        id: "goal:uncertain",
        priority: 1,
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 350,
          test_duration_s: 1200,
        } as const,
      },
    ];
    const uncertainFtp = unavailableResult({
      state: "insufficient_evidence",
      missingDataState: "partial",
      uncertainty: 0.6,
      reasonCodes: ["partial_direct_power_evidence"],
      contributingSourceIds: ["metric:ftp"],
    });
    const projection = assembleWholeAthleteProjectionV1({
      ...baseInput(goals, [
        {
          goalSourceId: "goal:uncertain",
          demand: demand("goal:uncertain", {
            type: "threshold",
            metric: "power",
            target: result(350, "W"),
            testDuration: result(1200, "s"),
          }),
          effortCurve: {
            policyVersion: "effort-curves-v1",
            threshold: uncertainFtp,
            highIntensity: missing("distinct_high_intensity_requirement_missing"),
          },
        },
      ]),
      physiology: {
        ...physiology(),
        metrics: {
          ...physiology().metrics,
          ftp: effect(uncertainFtp, "direct_threshold_evidence"),
        },
      },
    });

    expect(projection.opportunities.training).toEqual([]);
    expect(projection.opportunities.evidence).toEqual([
      expect.objectContaining({
        goalSourceId: "goal:uncertain",
        dimension: "threshold",
        reasonCodes: ["decision_quality_not_recommendation_compatible"],
      }),
    ]);
    expect(projection.decisionGuidance.state).toBe("unknown");
  });

  it.each([
    ["metrics", "threshold", "metrics_read_truncated"],
    ["activities", "distance", "activities_read_truncated"],
    ["efforts", "speed", "efforts_read_truncated"],
  ] as const)("treats truncated %s reads as partial evidence rather than authoritative absence", (domain, dimension, reasonCode) => {
    const goal =
      domain === "activities"
        ? {
            id: "goal:completion",
            priority: 1,
            objective: {
              type: "completion" as const,
              activity_category: "bike" as const,
              distance_m: 100_000,
            },
          }
        : domain === "efforts"
          ? {
              id: "goal:event",
              priority: 1,
              objective: {
                type: "event_performance" as const,
                activity_category: "bike" as const,
                distance_m: 40_000,
                target_time_s: 3600,
              },
            }
          : {
              id: "goal:threshold",
              priority: 1,
              objective: {
                type: "threshold" as const,
                metric: "power" as const,
                activity_category: "bike" as const,
                value: 350,
                test_duration_s: 1200,
              },
            };
    const requirement =
      domain === "activities"
        ? { type: "completion" as const, requiredDistance: result(100_000, "m") }
        : domain === "efforts"
          ? {
              type: "event_performance" as const,
              requiredDistance: result(40_000, "m"),
              requiredDuration: result(3600, "s"),
              requiredSpeed: result(11.11, "m/s"),
            }
          : {
              type: "threshold" as const,
              metric: "power" as const,
              target: result(350, "W"),
              testDuration: result(1200, "s"),
            };
    const projection = assembleWholeAthleteProjectionV1({
      ...baseInput(
        [goal],
        [
          {
            goalSourceId: goal.id,
            demand: demand(goal.id, requirement),
            ...(domain === "efforts"
              ? {
                  effortCurve: {
                    policyVersion: "effort-curves-v1" as const,
                    threshold: result(250, "seconds_per_kilometer"),
                    highIntensity: result(200, "seconds_per_kilometer"),
                  },
                }
              : {}),
          },
        ],
      ),
      model: athleteIntelligenceModelInputSchema.parse({
        ...model([goal]),
        readCoverage: {
          ...model([goal]).readCoverage,
          [domain]: { state: "truncated", reason: "query_limit_reached" },
        },
      }),
    });

    expect(projection.goalCoverage[0]?.dimensions[0]).toMatchObject({
      dimension,
      capability: {
        estimate: null,
        state: "insufficient_evidence",
        missingDataState: "partial",
        reasonCodes: [reasonCode],
      },
    });
    expect(projection.opportunities.training).toEqual([]);
    expect(projection.opportunities.evidence).toEqual([
      expect.objectContaining({ dimension, reasonCodes: [reasonCode] }),
    ]);
    if (domain === "activities") {
      expect(projection.capability.enduranceRecencyWeightedMinutes).toMatchObject({
        estimate: null,
        state: "insufficient_evidence",
        missingDataState: "partial",
        reasonCodes: ["activities_read_truncated"],
      });
      expect(projection.readiness).toEqual(
        expect.objectContaining({
          volumeTrend: expect.objectContaining({ reasonCodes: ["activities_read_truncated"] }),
          frequencyTrend: expect.objectContaining({ reasonCodes: ["activities_read_truncated"] }),
          recoveryContext: expect.objectContaining({ reasonCodes: ["activities_read_truncated"] }),
        }),
      );
    }
    expect(projection.decisionGuidance.state).toBe("unknown");
  });

  it.each([
    ["distance", "evidence_invalid", { validityState: "invalid" }],
    ["duration", "evidence_value_unknown", { qualityState: "unknown" }],
    ["duration", "evidence_incompatible_sport", { sport: "run" }],
  ] as const)("does not use %s completion evidence when its field is ineligible", (dimension, reasonCode, evidenceOverride) => {
    const goal = {
      id: "goal:completion",
      priority: 1,
      objective: {
        type: "completion" as const,
        activity_category: "bike" as const,
        distance_m: 100_000,
        duration_s: 14_400,
      },
    };
    const baseModel = model([goal], { distance: 80_000, duration: 10_800, count: 1 });
    const activity = first(baseModel.activities, "Activity");
    const fieldSourceId =
      dimension === "distance"
        ? first(activity.metrics.distanceMeters.evidenceSourceIds, "Distance evidence")
        : first(activity.metrics.elapsedDurationSeconds.evidenceSourceIds, "Duration evidence");
    const projection = assembleWholeAthleteProjectionV1({
      ...baseInput(
        [goal],
        [
          {
            goalSourceId: goal.id,
            demand: demand(goal.id, {
              type: "completion",
              requiredDistance: result(100_000, "m"),
              requiredDuration: result(14_400, "s"),
            }),
          },
        ],
      ),
      model: athleteIntelligenceModelInputSchema.parse({
        ...baseModel,
        evidenceRegistry: {
          ...baseModel.evidenceRegistry,
          [fieldSourceId]: {
            ...baseModel.evidenceRegistry[fieldSourceId],
            ...evidenceOverride,
          },
        },
      }),
    });

    const capability = projection.goalCoverage[0]?.dimensions.find(
      (entry) => entry.dimension === dimension,
    )?.capability;
    expect(capability).toMatchObject({
      estimate: null,
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: expect.arrayContaining([reasonCode]),
      contributingSourceIds: expect.arrayContaining([fieldSourceId]),
    });
    expect(projection.opportunities.training).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ dimension })]),
    );
  });

  it("uses only compatible eligible activities for each completion field", () => {
    const goal = {
      id: "goal:completion",
      priority: 1,
      objective: {
        type: "completion" as const,
        activity_category: "bike" as const,
        distance_m: 100_000,
        duration_s: 14_400,
      },
    };
    const baseModel = model([goal], { distance: 80_000, duration: 10_800, count: 2 });
    const runActivity = baseModel.activities[1];
    if (runActivity === undefined) throw new Error("Run activity fixture missing");
    const runEvidenceIds = [
      runActivity.sourceId,
      ...runActivity.metrics.distanceMeters.evidenceSourceIds,
      ...runActivity.metrics.elapsedDurationSeconds.evidenceSourceIds,
    ];
    const projection = assembleWholeAthleteProjectionV1({
      ...baseInput(
        [goal],
        [
          {
            goalSourceId: goal.id,
            demand: demand(goal.id, {
              type: "completion",
              requiredDistance: result(100_000, "m"),
              requiredDuration: result(14_400, "s"),
            }),
          },
        ],
      ),
      model: athleteIntelligenceModelInputSchema.parse({
        ...baseModel,
        activities: baseModel.activities.map((activity, index) =>
          index === 1 ? { ...activity, sport: "run" as const } : activity,
        ),
        evidenceRegistry: Object.fromEntries(
          Object.entries(baseModel.evidenceRegistry).map(([sourceId, evidence]) => [
            sourceId,
            runEvidenceIds.includes(sourceId) ? { ...evidence, sport: "run" as const } : evidence,
          ]),
        ),
      }),
    });

    expect(projection.goalCoverage[0]?.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "distance",
          capability: expect.objectContaining({ estimate: 80_000 }),
        }),
        expect.objectContaining({
          dimension: "duration",
          capability: expect.objectContaining({ estimate: 10_800 }),
        }),
      ]),
    );
  });

  it("uses compatible eligible activities as the frequency denominator and preserves rejections", () => {
    const goal = {
      id: "goal:consistency",
      priority: 1,
      goalSport: "bike" as const,
      objective: { type: "consistency", target_sessions_per_week: 2, target_weeks: 8 } as const,
    };
    const baseModel = model([goal], { distance: 80_000, duration: 10_800, count: 2 });
    const bikeActivity = first(baseModel.activities, "Bike activity");
    const bikeDurationSourceId = first(
      bikeActivity.metrics.elapsedDurationSeconds.evidenceSourceIds,
      "Bike duration evidence",
    );
    const runActivity = baseModel.activities[1];
    if (runActivity === undefined) throw new Error("Run activity fixture missing");
    const runEvidenceIds = [
      runActivity.sourceId,
      ...runActivity.metrics.elapsedDurationSeconds.evidenceSourceIds,
    ];
    const sportFilteredModel = athleteIntelligenceModelInputSchema.parse({
      ...baseModel,
      activities: baseModel.activities.map((activity, index) =>
        index === 1 ? { ...activity, sport: "run" as const } : activity,
      ),
      evidenceRegistry: Object.fromEntries(
        Object.entries(baseModel.evidenceRegistry).map(([sourceId, evidence]) => [
          sourceId,
          runEvidenceIds.includes(sourceId) ? { ...evidence, sport: "run" as const } : evidence,
        ]),
      ),
    });
    const input = {
      ...baseInput(
        [goal],
        [
          {
            goalSourceId: goal.id,
            demand: demand(goal.id, {
              type: "consistency",
              sessionsPerWeek: result(2, "sessions/week"),
              weeks: result(8, "weeks"),
            }),
          },
        ],
      ),
      model: sportFilteredModel,
    };
    const projection = assembleWholeAthleteProjectionV1(input);
    expect(projection.goalCoverage[0]?.dimensions[0]?.capability).toMatchObject({
      estimate: 0.25,
      contributingSourceIds: [bikeDurationSourceId],
    });

    const bikeDurationEvidence = sportFilteredModel.evidenceRegistry[bikeDurationSourceId];
    if (bikeDurationEvidence === undefined)
      throw new Error("Bike duration evidence fixture missing");
    const futureSportSpecificModel = {
      ...sportFilteredModel,
      evidenceRegistry: {
        ...sportFilteredModel.evidenceRegistry,
        [bikeDurationSourceId]: {
          ...bikeDurationEvidence,
          observedAt: "2026-07-12T12:00:00.000Z",
        },
      },
    };
    const futureProjection = assembleWholeAthleteProjectionV1({
      ...input,
      model: futureSportSpecificModel,
    });
    expect(futureProjection.goalCoverage[0]?.dimensions[0]?.capability).toMatchObject({
      estimate: null,
      state: "insufficient_evidence",
      missingDataState: "partial",
      reasonCodes: expect.arrayContaining(["evidence_future_observation"]),
      contributingSourceIds: expect.arrayContaining([bikeDurationSourceId]),
    });
  });

  it("does not use another sport or an unspecified sport as direct goal capability", () => {
    const missingSport = {
      id: "goal:missing-sport",
      priority: 1,
      objective: { type: "threshold", metric: "power", value: 350, test_duration_s: 1200 } as const,
    };
    const projection = assembleWholeAthleteProjectionV1(
      baseInput(
        [missingSport],
        [
          {
            goalSourceId: missingSport.id,
            demand: demand(missingSport.id, {
              type: "threshold",
              metric: "power",
              target: result(350, "W"),
              testDuration: result(1200, "s"),
            }),
          },
        ],
      ),
    );
    expect(projection.goalCoverage[0]?.dimensions[0]?.capability).toMatchObject({
      state: "unsupported",
      reasonCodes: ["goal_sport_missing"],
    });
    expect(projection.opportunities.training).toEqual([]);
  });
});
