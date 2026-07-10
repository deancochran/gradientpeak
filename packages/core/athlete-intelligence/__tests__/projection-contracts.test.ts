import { describe, expect, it } from "vitest";

import { observedResult, unavailableResult } from "../calculation-result-contracts";
import { athleteIntelligenceProjectionSchema } from "../projection-contracts";

const unavailable = unavailableResult({
  state: "unknown",
  missingDataState: "required_data_missing",
  uncertainty: 1,
  reasonCodes: ["not_available"],
});

function projection() {
  return {
    contractVersion: "2.0.0",
    assessmentAsOf: "2026-07-10T12:00:00.000Z",
    athleteId: "athlete-1",
    capability: {
      aerobicCapacity: unavailable,
      thresholdCapacity: unavailable,
      enduranceCapacity: unavailable,
      powerToWeightCapacity: unavailable,
      movementEfficiency: unavailable,
    },
    readiness: {
      acuteReadiness: unavailable,
      recoveryBalance: unavailable,
      recentLoadTolerance: unavailable,
    },
    feasibility: {
      availableTrainingTime: unavailable,
      requiredTrainingLoad: unavailable,
      sustainableLoadProgression: unavailable,
      scheduleFit: unavailable,
      routeDemandFit: unavailable,
    },
    goalCoverage: {
      distanceCoverage: unavailable,
      durationCoverage: unavailable,
      elevationCoverage: unavailable,
      intensityCoverage: unavailable,
    },
    opportunities: {
      trainingOpportunity: unavailable,
      evidenceOpportunity: unavailable,
    },
    decisionGuidance: {
      state: "unknown",
      reasonCodes: ["not_available"],
      recommendedActions: [],
      cautions: [],
    },
  } as const;
}

describe("athlete intelligence projection contracts", () => {
  it("keeps projection domains and both opportunity types separate", () => {
    const parsed = athleteIntelligenceProjectionSchema.parse(projection());

    expect(Object.keys(parsed)).toEqual([
      "contractVersion",
      "assessmentAsOf",
      "athleteId",
      "capability",
      "readiness",
      "feasibility",
      "goalCoverage",
      "opportunities",
      "decisionGuidance",
    ]);
    expect(parsed.opportunities).toHaveProperty("trainingOpportunity");
    expect(parsed.opportunities).toHaveProperty("evidenceOpportunity");
    expect("score" in parsed).toBe(false);
    expect("probability" in parsed).toBe(false);
  });

  it("requires CalculationResult for every numeric projection dimension", () => {
    const candidate = projection();
    const invalid = {
      ...candidate,
      readiness: { ...candidate.readiness, acuteReadiness: 0.8 },
    };

    expect(athleteIntelligenceProjectionSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a generic score even when all required dimensions are present", () => {
    expect(
      athleteIntelligenceProjectionSchema.safeParse({ ...projection(), score: 0.8 }).success,
    ).toBe(false);
  });

  it("requires normalized dimensions to use ratio units and remain in 0..1", () => {
    const wrongUnit = observedResult({
      rawValue: 0.8,
      unit: "percent",
      sourceId: "metric:1",
      uncertainty: 0,
    });
    const outOfRange = observedResult({
      rawValue: 1.1,
      unit: "ratio",
      sourceId: "metric:1",
      uncertainty: 0,
    });
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        readiness: { ...projection().readiness, acuteReadiness: wrongUnit },
      }).success,
    ).toBe(false);
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        readiness: { ...projection().readiness, acuteReadiness: outOfRange },
      }).success,
    ).toBe(false);
  });

  it("uses explicit units for non-ratio feasibility dimensions", () => {
    const wrong = observedResult({
      rawValue: 120,
      unit: "ratio",
      sourceId: "metric:1",
      uncertainty: 0,
    });
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        feasibility: { ...projection().feasibility, availableTrainingTime: wrong },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["availableTrainingTime", "minutes"],
    ["requiredTrainingLoad", "training_load"],
  ] as const)("rejects negative %s estimates", (dimension, unit) => {
    const negative = observedResult({
      rawValue: -1,
      unit,
      sourceId: "metric:1",
      uncertainty: 0,
    });

    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        feasibility: { ...projection().feasibility, [dimension]: negative },
      }).success,
    ).toBe(false);
  });

  it("rejects oversized projection reason and source arrays", () => {
    const tooManyReasons = unavailableResult({
      state: "unknown",
      missingDataState: "required_data_missing",
      uncertainty: 1,
      reasonCodes: Array.from({ length: 33 }, (_, index) => `reason_${index}`) as [
        string,
        ...string[],
      ],
    });
    const tooManySources = observedResult({
      rawValue: 0.8,
      unit: "ratio",
      sourceId: "metric:seed",
      uncertainty: 0,
    });
    tooManySources.contributingSourceIds = Array.from(
      { length: 65 },
      (_, index) => `metric:${index}`,
    );

    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        opportunities: { ...projection().opportunities, trainingOpportunity: tooManyReasons },
      }).success,
    ).toBe(false);
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        opportunities: { ...projection().opportunities, evidenceOpportunity: tooManySources },
      }).success,
    ).toBe(false);
  });
});
