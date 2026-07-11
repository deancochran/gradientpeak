import { describe, expect, it } from "vitest";

import { unavailableResult } from "../calculation-result-contracts";
import {
  ATHLETE_INTELLIGENCE_PROJECTION_VERSION,
  athleteIntelligenceProjectionSchema,
} from "../projection-contracts";

const unavailable = unavailableResult({
  state: "unknown",
  missingDataState: "required_data_missing",
  uncertainty: 1,
  reasonCodes: ["not_available"],
});

const projection = () => ({
  contractVersion: ATHLETE_INTELLIGENCE_PROJECTION_VERSION,
  assessmentAsOf: "2026-07-10T12:00:00.000Z",
  athleteId: "athlete-1",
  capability: {
    ftp: unavailable,
    wattsPerKilogram: unavailable,
    heartRateReserve: unavailable,
    effortCurves: [],
    enduranceRecencyWeightedMinutes: unavailable,
    durabilityBaselineRatio: unavailable,
    sportSpecificity: unavailable,
  },
  readiness: {
    volumeTrend: unavailable,
    frequencyTrend: unavailable,
    recoveryContext: unavailable,
  },
  feasibility: {
    policyVersion: "training-feasibility-v1" as const,
    timeCoverage: unavailable,
    requiredSessionCoverage: unavailable,
    compatibleScheduledMinutes: unavailable,
    scheduleCoverage: unavailable,
    constraints: {
      hardRestConflicts: unavailable,
      dailyDurationExcesses: unavailable,
      dailySessionCapExcesses: unavailable,
      doubleDayConflicts: unavailable,
      sessionDurationExcesses: unavailable,
      weeklyDurationExcesses: unavailable,
      weeklySessionCapExcesses: unavailable,
      sportOverrideExcesses: unavailable,
      recoveryPreferenceConflicts: unavailable,
    },
  },
  goalCoverage: [],
  opportunities: { training: [], evidence: [] },
  decisionGuidance: {
    state: "unknown" as const,
    reasonCodes: [],
    recommendedActions: [],
    cautions: [],
  },
});

describe("athlete intelligence projection contract", () => {
  it("is the single physical/per-goal contract without generic score or probability", () => {
    const parsed = athleteIntelligenceProjectionSchema.parse(projection());
    expect(parsed.capability).toHaveProperty("ftp");
    expect(parsed.readiness).toEqual(projection().readiness);
    expect(Array.isArray(parsed.goalCoverage)).toBe(true);
    expect("score" in parsed).toBe(false);
    expect("probability" in parsed).toBe(false);
  });

  it("requires CalculationResults and rejects duplicate generic dimensions", () => {
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        capability: { ...projection().capability, ftp: 300 },
      }).success,
    ).toBe(false);
    expect(
      athleteIntelligenceProjectionSchema.safeParse({ ...projection(), goals: [] }).success,
    ).toBe(false);
  });

  it("does not expose an unreachable defer guidance state", () => {
    expect(
      athleteIntelligenceProjectionSchema.safeParse({
        ...projection(),
        decisionGuidance: { ...projection().decisionGuidance, state: "defer" },
      }).success,
    ).toBe(false);
  });
});
