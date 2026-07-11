import { describe, expect, it } from "vitest";

import {
  ACTIVITY_READINESS_POLICY_VERSION,
  type ActivityEvidenceInput,
  type ActivityHistoryObservation,
  calculateActivityReadinessV1,
} from "../policies/activity-readiness";

const assessmentAt = "2026-07-10T12:00:00.000Z";
const runLoadIdentity = {
  sport: "run",
  family: "trimp" as const,
  method: "heart_rate_reserve",
  version: "1",
  sourceDefinition: "first_party:activity-summary",
};

function activity(
  day: number,
  overrides: Partial<ActivityHistoryObservation> = {},
): ActivityHistoryObservation {
  return {
    sourceId: `activity:${day}:${overrides.sport ?? "run"}`,
    lineageGroupId: `activity:${day}:${overrides.sport ?? "run"}`,
    startedAt: new Date(Date.parse(assessmentAt) - day * 86_400_000).toISOString(),
    sport: "run",
    durationSeconds: 3_600,
    trainingLoad: 60,
    trainingLoadIdentity: runLoadIdentity,
    averagePowerWatts: 240,
    averageHeartRateBpm: 150,
    efficiencyFactor: 1.6,
    decouplingPercent: 4,
    ...overrides,
  };
}

function eligibilityFor(
  observation: ActivityHistoryObservation,
  overrides: Partial<ActivityEvidenceInput["evidence"]> = {},
): ActivityEvidenceInput {
  return {
    evidence: {
      athleteId: "athlete-1",
      sourceId: observation.sourceId,
      lineageGroupId: observation.lineageGroupId,
      observedAt: observation.startedAt,
      rawObservation: { value: observation.durationSeconds, unit: "seconds" },
      sport: observation.sport,
      modality: "activity_duration",
      sourceType: "activity",
      qualityState: "known",
      validityState: "valid",
      compatibilityState: "compatible",
      ...overrides,
    },
  };
}

describe("activity readiness v1", () => {
  it("returns separate continuous results and responds to added recent training", () => {
    const history = [activity(3), activity(8), activity(17), activity(24)];
    const before = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: history,
    });
    const after = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [
        activity(1, { durationSeconds: 7_200, trainingLoad: 120 }),
        activity(2, { durationSeconds: 7_200, trainingLoad: 120 }),
        ...history,
      ],
    });

    expect(after.policyVersion).toBe(ACTIVITY_READINESS_POLICY_VERSION);
    expect(after.endurance.estimate).toBeGreaterThan(before.endurance.estimate ?? 0);
    expect(after.volumeTrend.estimate).toBeGreaterThan(before.volumeTrend.estimate ?? 0);
    expect(after.frequencyTrend.unit).toBe("fractional_change");
    expect(after.sportSpecificity.unit).toBe("ratio");
  });

  it("excludes future observations and preserves already contract-safe history", () => {
    const valid = [activity(2), activity(7), activity(16), activity(22)];
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: valid,
    });
    const withFuture = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [activity(-1, { durationSeconds: 100_000, trainingLoad: 10_000 }), ...valid],
    });

    expect(withFuture).toEqual(baseline);
  });

  it("allows only eligible evidence-backed activity fields to affect readiness calculations", () => {
    const accepted = [2, 7, 16, 22].map((day) => {
      const observation = activity(day);
      return { ...observation, eligibility: eligibilityFor(observation) };
    });
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: accepted,
    });
    const rejected = [
      activity(3, { durationSeconds: 100_000, trainingLoad: 10_000 }),
      activity(4, { durationSeconds: 100_000, trainingLoad: 10_000 }),
      activity(5, { durationSeconds: 100_000, trainingLoad: 10_000 }),
      activity(-1, { durationSeconds: 100_000, trainingLoad: 10_000 }),
    ].map((observation, index) => ({
      ...observation,
      eligibility: eligibilityFor(
        observation,
        index === 0
          ? { validityState: "invalid" }
          : index === 1
            ? { compatibilityState: "incompatible_modality" }
            : index === 2
              ? { qualityState: "unknown" }
              : {},
      ),
    }));
    const mixed = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [...accepted, ...rejected],
    });

    expect(mixed.endurance).toEqual(baseline.endurance);
    expect(mixed.volumeTrend).toEqual(baseline.volumeTrend);
    expect(mixed.rejectedEvidence?.map(({ reasonCode }) => reasonCode)).toEqual([
      "evidence_invalid",
      "evidence_incompatible_modality",
      "evidence_value_unknown",
      "evidence_future_observation",
    ]);
    expect(mixed.rejectedEvidence?.map(({ sourceId }) => sourceId)).toEqual(
      rejected.map(({ sourceId }) => sourceId),
    );
  });

  it("returns unknown or insufficient results when history cannot support a calculation", () => {
    const empty = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "bike",
      activities: [],
    });
    const sparse = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "bike",
      activities: [activity(2, { averagePowerWatts: null, averageHeartRateBpm: null })],
    });

    expect(empty.endurance.state).toBe("unknown");
    expect(empty.readinessContext.state).toBe("unknown");
    expect(sparse.durability.state).toBe("unknown");
    expect(sparse.volumeTrend.state).toBe("unknown");
  });

  it("uses a robust durability baseline rather than allowing one outlier to dominate", () => {
    const normal = [activity(2), activity(6), activity(10), activity(15), activity(20)];
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: normal,
    });
    const outlier = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [...normal, activity(25, { efficiencyFactor: 500 })],
    });

    expect(baseline.durability.state).toBe("estimated");
    expect(outlier.durability.estimate).toBeCloseTo(baseline.durability.estimate ?? 0, 10);
  });

  it("calculates sport specificity as recency-weighted target-sport duration share", () => {
    const mostlyRun = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [activity(1), activity(4), activity(7, { sport: "bike" })],
    });
    const mostlyBike = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [activity(1, { sport: "bike" }), activity(4, { sport: "bike" }), activity(7)],
    });

    expect(mostlyRun.sportSpecificity.estimate).toBeGreaterThan(
      mostlyBike.sportSpecificity.estimate ?? 0,
    );
    expect(mostlyRun.sportSpecificity.estimate).toBeLessThan(1);
  });

  it("bounds wellness context and keeps it contextual rather than medical", () => {
    const readinessContext = [1, 5, 10, 15, 20, 25].map((day, index) => ({
      sourceId: `metric:wellness-${day}`,
      lineageGroupId: `metric:wellness-${day}`,
      observedAt: new Date(Date.parse(assessmentAt) - day * 86_400_000).toISOString(),
      metric: "sleep_hours" as const,
      value: index === 0 ? 20 : 7,
    }));
    const result = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [],
      readinessContext,
    });

    expect(result.readinessContext.estimate).toBe(1);
    expect(result.readinessContext.unit).toBe("bounded_baseline_deviation");
    expect(result.readinessContext.reasonCodes).toEqual([
      "wellness_context_only_no_medical_inference",
    ]);
  });

  it("deduplicates activity and context lineages before values and confidence", () => {
    const activities = [activity(2), activity(6), activity(16), activity(20)];
    const context = [1, 5, 10, 15, 20, 25].map((day) => ({
      sourceId: `metric:sleep-${day}`,
      lineageGroupId: `metric:sleep-${day}`,
      observedAt: new Date(Date.parse(assessmentAt) - day * 86_400_000).toISOString(),
      metric: "sleep_hours" as const,
      value: day === 1 ? 8 : 7,
    }));
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities,
      readinessContext: context,
    });
    const firstActivity = activities[0];
    const firstContext = context[0];
    if (firstActivity === undefined || firstContext === undefined)
      throw new Error("fixture missing");
    const duplicateActivity = { ...firstActivity, sourceId: "activity:duplicate" };
    const duplicateContext = { ...firstContext, sourceId: "metric:duplicate" };

    expect(
      calculateActivityReadinessV1({
        assessmentAt,
        targetSport: "run",
        activities: [...activities, duplicateActivity],
        readinessContext: [...context, duplicateContext],
      }),
    ).toEqual(baseline);
  });

  it("excludes cross-sport work from endurance and durability but retains it for specificity", () => {
    const runOnly = [activity(2), activity(6), activity(16), activity(20)];
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: runOnly,
    });
    const withBike = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [
        ...runOnly,
        activity(4, {
          sourceId: "activity:bike-extra",
          lineageGroupId: "activity:bike-extra",
          sport: "bike",
          durationSeconds: 7_200,
          efficiencyFactor: 4,
        }),
      ],
    });

    expect(withBike.endurance).toEqual(baseline.endurance);
    expect(withBike.durability).toEqual(baseline.durability);
    expect(withBike.sportSpecificity.estimate).toBeLessThan(
      baseline.sportSpecificity.estimate ?? 0,
    );
  });

  it("derives power/heart-rate efficiency only for bike activities", () => {
    const result = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [2, 6, 10, 15].map((day) => activity(day, { efficiencyFactor: null })),
    });

    expect(result.durability.state).toBe("unknown");
  });

  it("uses robust totals while keeping frequency independent from load magnitude", () => {
    const normal = [
      activity(2, { trainingLoad: 58 }),
      activity(5, { trainingLoad: 60 }),
      activity(9, { trainingLoad: 62 }),
      activity(11, { trainingLoad: 61 }),
      activity(16, { trainingLoad: 57 }),
      activity(20, { trainingLoad: 60 }),
      activity(24, { trainingLoad: 63 }),
      activity(26, { trainingLoad: 59 }),
    ];
    const baseline = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: normal,
    });
    const withOutliers = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [
        ...normal.filter(
          ({ startedAt }) =>
            ![11, 26].some(
              (day) =>
                startedAt === new Date(Date.parse(assessmentAt) - day * 86_400_000).toISOString(),
            ),
        ),
        activity(11, { trainingLoad: 50_000, durationSeconds: 500_000 }),
        activity(26, { trainingLoad: 50_000, durationSeconds: 500_000 }),
      ],
    });

    expect(withOutliers.endurance.estimate).toBeCloseTo(baseline.endurance.estimate ?? 0, 0);
    expect(withOutliers.volumeTrend.estimate).toBeCloseTo(baseline.volumeTrend.estimate ?? 0, 1);
    expect(withOutliers.frequencyTrend.estimate).toBe(baseline.frequencyTrend.estimate);
    expect(withOutliers.sportSpecificity.estimate).toBeCloseTo(1, 10);
  });

  it.each([
    ["missing identity", { trainingLoadIdentity: null }],
    ["mixed method", { trainingLoadIdentity: { ...runLoadIdentity, method: "provider_score" } }],
    [
      "mixed provider",
      { trainingLoadIdentity: { ...runLoadIdentity, sourceDefinition: "provider:opaque" } },
    ],
    ["identity sport mismatch", { trainingLoadIdentity: { ...runLoadIdentity, sport: "bike" } }],
  ])("abstains from load trend for %s rather than substituting duration", (_name, override) => {
    const activities = [2, 5, 9, 11, 16, 20, 24, 26].map((day) => activity(day));
    activities[0] = activity(2, override);
    const result = calculateActivityReadinessV1({ assessmentAt, targetSport: "run", activities });

    expect(result.volumeTrend.estimate).toBeNull();
    expect(result.volumeTrend.reasonCodes).toContain("load_trend_identity_unavailable");
  });

  it("does not combine identified loads across sports", () => {
    const activities = [2, 5, 9, 11, 16, 20, 24, 26].map((day) => activity(day));
    activities[0] = activity(2, {
      sport: "bike",
      trainingLoadIdentity: { ...runLoadIdentity, sport: "bike" },
    });
    const result = calculateActivityReadinessV1({ assessmentAt, targetSport: "run", activities });

    expect(result.volumeTrend.estimate).not.toBeNull();
    expect(result.volumeTrend.contributingSourceIds).not.toContain(activities[0]?.sourceId);
  });

  it("robustly bounds a readiness outlier without making a medical claim", () => {
    const observations = [1, 2, 3, 5, 10, 15, 20, 25].map((day) => ({
      sourceId: `metric:readiness-${day}`,
      lineageGroupId: `metric:readiness-${day}`,
      observedAt: new Date(Date.parse(assessmentAt) - day * 86_400_000).toISOString(),
      metric: "wellness_score" as const,
      value: day === 1 ? 1_000 : day === 2 ? 7.1 : 7 + (day % 3) * 0.1,
    }));
    const result = calculateActivityReadinessV1({
      assessmentAt,
      targetSport: "run",
      activities: [],
      readinessContext: observations,
    });

    expect(Math.abs(result.readinessContext.estimate ?? 2)).toBeLessThan(0.5);
    expect(result.readinessContext.reasonCodes).toEqual([
      "wellness_context_only_no_medical_inference",
    ]);
  });
});
