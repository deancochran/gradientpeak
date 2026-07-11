import { describe, expect, it } from "vitest";

import { type AthleteMetricType, athleteMetricRoleByType } from "../evidence-contracts";
import type { AthleteIntelligenceModelInput } from "../model-input-contracts";
import {
  evaluatePhysiologyMetrics,
  PHYSIOLOGY_METRIC_TYPES,
  PHYSIOLOGY_METRICS_POLICY_VERSION,
} from "../policies/physiology-metrics";

const AS_OF = "2026-07-10T12:00:00.000Z";
const units: Record<AthleteMetricType, string> = {
  ftp: "watts",
  lthr: "beats_per_minute",
  max_hr: "beats_per_minute",
  resting_hr: "beats_per_minute",
  vo2_max: "milliliters_per_kilogram_per_minute",
  weight_kg: "kilograms",
  hrv_rmssd: "milliseconds",
  sleep_hours: "hours",
  stress_score: "score",
  soreness_level: "score",
  wellness_score: "score",
  age_years: "years",
};

type Observation = {
  value: number;
  daysAgo?: number;
  sourceType?: "profile_metric" | "activity_effort";
  valid?: boolean;
  lineageGroupId?: string;
};

function model(
  observations: Partial<Record<AthleteMetricType, Observation[]>>,
): AthleteIntelligenceModelInput {
  const evidenceRegistry: AthleteIntelligenceModelInput["evidenceRegistry"] = {};
  let id = 0;
  const evidence = (
    value: number | null,
    unit: string | null,
    sourceType: "profile_metric" | "activity_effort" | "manual_observation" = "manual_observation",
    daysAgo = 1,
    valid = true,
    lineageGroupId?: string,
  ) => {
    const sourceId = `manual:physiology-${id++}`;
    evidenceRegistry[sourceId] = {
      athleteId: "athlete-1",
      sourceId,
      lineageGroupId: lineageGroupId
        ? `manual-test:${lineageGroupId}`
        : `manual-test:physiology-${id}`,
      observedAt: new Date(Date.parse(AS_OF) - daysAgo * 86_400_000).toISOString(),
      rawObservation: { value, unit },
      sport: null,
      modality: "manual",
      sourceType,
      qualityState: "known",
      validityState: valid ? "valid" : "invalid",
      compatibilityState: "compatible",
    };
    return sourceId;
  };
  const ev = (value: number | null, unit: string) => ({
    value,
    unit,
    evidenceSourceIds: [evidence(value, unit)],
  });
  const trainingId = evidence(null, null);
  const metricEvidence = PHYSIOLOGY_METRIC_TYPES.flatMap((metricType) =>
    (observations[metricType] ?? []).map((item) => ({
      metricType,
      role: athleteMetricRoleByType[metricType],
      value: {
        value: item.value,
        unit: units[metricType],
        evidenceSourceIds: [
          evidence(
            item.value,
            units[metricType],
            item.sourceType ?? "profile_metric",
            item.daysAgo,
            item.valid,
            item.lineageGroupId,
          ),
        ],
      },
    })),
  );
  return {
    contractVersion: "2.0.0",
    assessmentAsOf: AS_OF,
    athleteId: "athlete-1",
    evidenceRegistry,
    physiology: {
      athleteId: "athlete-1",
      ageYears: ev(null, "years"),
      weightKg: ev(null, "kilograms"),
      heightCm: ev(null, "centimeters"),
      bodyFatPercent: ev(null, "percent"),
      preferredUnits: {
        value: { distance: null, elevation: null, mass: null, temperature: null },
        evidenceSourceIds: [trainingId],
      },
    },
    metricEvidence,
    activityWindow: { from: "2026-06-01T00:00:00.000Z", through: AS_OF },
    activities: [],
    efforts: [],
    goals: [],
    plannedSchedule: [],
    scheduleReadState: "complete",
    trainingContext: {
      sourceId: trainingId,
      athleteId: "athlete-1",
      lineageGroupId: "manual-test:physiology-1",
      evidenceSourceIds: [trainingId],
      preferredSports: [],
      weeklyTimeWindows: [],
      hardRestDays: [],
      maximumWeeklyMinutes: ev(null, "minutes"),
      maximumDailyMinutes: ev(null, "minutes"),
      maximumSessionsPerDay: ev(null, "count"),
      maximumSessionDurationMinutes: ev(null, "minutes"),
      sportDoseLimits: [],
      allowDoubleDays: null,
      minimumRecoveryHours: ev(null, "hours"),
      maximumConsecutiveTrainingDays: ev(null, "days"),
      recoveryPreference: null,
      fatigueTolerance: ev(null, "ratio"),
      strategy: null,
      taperPreference: null,
      progressionPreference: null,
      ctlOverride: ev(null, "training_load"),
      atlOverride: ev(null, "training_load"),
    },
  };
}

function baselineHistory(current: number, history: readonly number[]): Observation[] {
  return [
    { value: current, daysAgo: 1, lineageGroupId: "current" },
    ...history.map((value, index) => ({
      value,
      daysAgo: index + 2,
      lineageGroupId: `history-${index}`,
    })),
  ];
}

const ratioMetricCases = [
  ["hrv_rmssd", "hrvRmssd"],
  ["sleep_hours", "sleep"],
  ["stress_score", "stress"],
  ["soreness_level", "soreness"],
  ["wellness_score", "wellness"],
] satisfies readonly (readonly [
  AthleteMetricType,
  "hrvRmssd" | "sleep" | "stress" | "soreness" | "wellness",
])[];

const expectedDownstreamEffects: Record<AthleteMetricType, readonly string[]> = {
  ftp: ["wattsPerKilogram"],
  lthr: [],
  max_hr: ["heartRateReserve"],
  resting_hr: ["heartRateReserve"],
  vo2_max: [],
  weight_kg: ["wattsPerKilogram"],
  hrv_rmssd: ["hrvRmssd"],
  sleep_hours: ["sleep"],
  stress_score: ["stress"],
  soreness_level: ["soreness"],
  wellness_score: ["wellness"],
  age_years: [],
};

function downstreamEstimates(result: ReturnType<typeof evaluatePhysiologyMetrics>) {
  return {
    wattsPerKilogram: result.wattsPerKilogram.estimate,
    heartRateReserve: result.heartRateReserve.estimate,
    hrvRmssd: result.individualizedRatios.hrvRmssd.estimate,
    sleep: result.individualizedRatios.sleep.estimate,
    stress: result.individualizedRatios.stress.estimate,
    soreness: result.individualizedRatios.soreness.estimate,
    wellness: result.individualizedRatios.wellness.estimate,
  };
}

const downstreamKeys = [
  "wattsPerKilogram",
  "heartRateReserve",
  "hrvRmssd",
  "sleep",
  "stress",
  "soreness",
  "wellness",
] satisfies readonly (keyof ReturnType<typeof downstreamEstimates>)[];

describe("physiology metric policy", () => {
  it("is versioned and keeps every metric in its frozen individualized role", () => {
    const result = evaluatePhysiologyMetrics(model({ age_years: [{ value: 42 }] }));
    expect(result.policyVersion).toBe(PHYSIOLOGY_METRICS_POLICY_VERSION);
    expect(result.metrics.age_years.role).toBe("adaptation_recovery_context");
    expect(result.metrics.age_years.result.estimate).toBe(42);
    expect(result.metrics.ftp.result.state).toBe("insufficient_evidence");
    expect(result).not.toHaveProperty("score");
  });

  it.each(
    PHYSIOLOGY_METRIC_TYPES,
  )("changes only the intended direct output for %s", (metricType) => {
    const before = evaluatePhysiologyMetrics(model({}));
    const after = evaluatePhysiologyMetrics(
      model({ [metricType]: [{ value: metricType === "weight_kg" ? 70 : 50 }] }),
    );
    for (const other of PHYSIOLOGY_METRIC_TYPES) {
      expect(after.metrics[other].result.estimate).toBe(
        other === metricType
          ? metricType === "weight_kg"
            ? 70
            : 50
          : before.metrics[other].result.estimate,
      );
    }
  });

  it.each(
    PHYSIOLOGY_METRIC_TYPES,
  )("is invariant to duplicate evidence from the same lineage for %s", (metricType) => {
    const once = evaluatePhysiologyMetrics(
      model({ [metricType]: [{ value: 50, daysAgo: 1, lineageGroupId: "same-reading" }] }),
    );
    const duplicated = evaluatePhysiologyMetrics(
      model({
        [metricType]: [
          { value: 50, daysAgo: 1, lineageGroupId: "same-reading" },
          { value: 50, daysAgo: 1, lineageGroupId: "same-reading" },
        ],
      }),
    );
    expect(duplicated.metrics[metricType].result.estimate).toBe(
      once.metrics[metricType].result.estimate,
    );
    expect(duplicated.metrics[metricType].influence).toBe(once.metrics[metricType].influence);
  });

  it.each(PHYSIOLOGY_METRIC_TYPES)("excludes future evidence for %s", (metricType) => {
    const result = evaluatePhysiologyMetrics(
      model({
        [metricType]: [
          { value: 50, daysAgo: 1 },
          { value: 999, daysAgo: -1, sourceType: "activity_effort" },
        ],
      }),
    );
    expect(result.metrics[metricType].result.estimate).toBe(50);
  });

  it.each(
    PHYSIOLOGY_METRIC_TYPES,
  )("changes only intended downstream calculations for %s", (metricType) => {
    const observations: Record<AthleteMetricType, Observation[]> = {
      ftp: [{ value: 250 }],
      lthr: [{ value: 170 }],
      max_hr: [{ value: 190 }],
      resting_hr: [{ value: 50 }],
      vo2_max: [{ value: 55 }],
      weight_kg: [{ value: 50 }],
      hrv_rmssd: baselineHistory(60, [50, 50, 50, 50, 50]),
      sleep_hours: baselineHistory(8, [7, 7, 7, 7, 7]),
      stress_score: baselineHistory(30, [20, 20, 20, 20, 20]),
      soreness_level: baselineHistory(3, [2, 2, 2, 2, 2]),
      wellness_score: baselineHistory(80, [70, 70, 70, 70, 70]),
      age_years: [{ value: 40 }],
    };
    const before = downstreamEstimates(evaluatePhysiologyMetrics(model(observations)));
    const changedCurrent = (observations[metricType][0]?.value ?? 1) + 10;
    const after = downstreamEstimates(
      evaluatePhysiologyMetrics(
        model({
          ...observations,
          [metricType]: [
            { ...observations[metricType][0], value: changedCurrent },
            ...observations[metricType].slice(1),
          ],
        }),
      ),
    );
    const changedOutputs = downstreamKeys.filter((output) => after[output] !== before[output]);
    expect(changedOutputs).toEqual(expectedDownstreamEffects[metricType]);
  });

  it("uses weight only to enable W/kg and max/resting HR only for normalization", () => {
    const result = evaluatePhysiologyMetrics(
      model({
        ftp: [{ value: 280 }],
        weight_kg: [{ value: 70 }],
        max_hr: [{ value: 190 }],
        resting_hr: [{ value: 50 }],
      }),
    );
    expect(result.wattsPerKilogram.estimate).toBe(4);
    expect(result.heartRateReserve.estimate).toBe(140);
  });

  it("requires five historical independent lineages for continuous ratios", () => {
    expect(
      evaluatePhysiologyMetrics(model({ hrv_rmssd: [{ value: 60 }] })).individualizedRatios.hrvRmssd
        .state,
    ).toBe("insufficient_evidence");
    const result = evaluatePhysiologyMetrics(
      model({ hrv_rmssd: baselineHistory(60, [50, 50, 50, 50, 50]) }),
    );
    expect(result.individualizedRatios.hrvRmssd.estimate).toBe(1.2);
  });

  it.each(
    ratioMetricCases,
  )("does not count duplicate lineage history toward the minimum for %s", (metricType, resultKey) => {
    const result = evaluatePhysiologyMetrics(
      model({
        [metricType]: [
          { value: 60, daysAgo: 1, lineageGroupId: "current" },
          ...[2, 3, 4, 5, 6].map((daysAgo) => ({
            value: 50,
            daysAgo,
            lineageGroupId: "copied-history",
          })),
        ],
      }),
    );
    expect(result.individualizedRatios[resultKey].state).toBe("insufficient_evidence");
    expect(result.individualizedRatios[resultKey].reasonCodes).toContain(
      "athlete_baseline_insufficient_independent_history",
    );
  });

  it.each(
    ratioMetricCases,
  )("requires all five historical lineages to be inside the versioned window for %s", (metricType, resultKey) => {
    const observations = baselineHistory(60, [50, 50, 50, 50, 50]);
    const oldest = observations.at(-1);
    const result = evaluatePhysiologyMetrics(
      model({
        [metricType]: oldest
          ? [...observations.slice(0, -1), { ...oldest, daysAgo: 91 }]
          : observations,
      }),
    );
    expect(result.individualizedRatios[resultKey].state).toBe("insufficient_evidence");
  });

  it.each(
    ratioMetricCases,
  )("uses a median baseline so one outlier does not dominate %s", (metricType, resultKey) => {
    const ordinary = evaluatePhysiologyMetrics(
      model({ [metricType]: baselineHistory(60, [50, 50, 50, 50, 50]) }),
    );
    const withOutlier = evaluatePhysiologyMetrics(
      model({ [metricType]: baselineHistory(60, [50, 50, 50, 50, 5_000]) }),
    );
    expect(withOutlier.individualizedRatios[resultKey].estimate).toBe(
      ordinary.individualizedRatios[resultKey].estimate,
    );
    expect(withOutlier.individualizedRatios[resultKey].estimate).toBe(1.2);
  });

  it("returns explicit insufficient evidence for invalid data", () => {
    const result = evaluatePhysiologyMetrics(model({ vo2_max: [{ value: 55, valid: false }] }));
    expect(result.metrics.vo2_max.result).toMatchObject({
      state: "insufficient_evidence",
      estimate: null,
    });
    expect(result.metrics.vo2_max.result.reasonCodes).toContain(
      "invalid_or_incompatible_metric_evidence",
    );
  });

  it("changes freshness influence and uncertainty without changing the raw value", () => {
    const fresh = evaluatePhysiologyMetrics(model({ lthr: [{ value: 172, daysAgo: 1 }] })).metrics
      .lthr;
    const old = evaluatePhysiologyMetrics(model({ lthr: [{ value: 172, daysAgo: 180 }] })).metrics
      .lthr;
    expect(fresh.result.estimate).toBe(172);
    expect(old.result.estimate).toBe(172);
    expect(fresh.influence).toBeGreaterThan(old.influence);
    expect(fresh.result.uncertainty).toBeLessThan(old.result.uncertainty);
  });

  it("prioritizes recent observed performance over a newer profile threshold", () => {
    const result = evaluatePhysiologyMetrics(
      model({
        ftp: [
          { value: 250, daysAgo: 1, sourceType: "profile_metric" },
          { value: 270, daysAgo: 2, sourceType: "activity_effort" },
        ],
      }),
    );
    expect(result.metrics.ftp.result.estimate).toBe(270);
    expect(result.metrics.ftp.result.contributingSourceIds[0]).toContain("manual:physiology-");
  });
});
