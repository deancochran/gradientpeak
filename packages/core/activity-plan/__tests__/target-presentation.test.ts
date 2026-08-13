import { describe, expect, it } from "vitest";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { resolveActivityPlanTargetPresentation } from "../target-presentation";

const asOf = "2026-08-12T12:00:00.000Z";

function confirmedFacts() {
  const unavailable = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
  return {
    ...unavailable,
    cycling: {
      planningThresholdPower: {
        ...unavailable.cycling.planningThresholdPower,
        status: "available" as const,
        calibrationState: "confirmed" as const,
        value: 300,
        confidence: "high" as const,
        expiresAt: "2026-08-13T12:00:00.000Z",
        sourceEvidenceIds: ["evidence-1"],
        evidenceTime: { observedFrom: asOf, observedThrough: asOf, computedAt: asOf },
      },
    },
    heartRate: {
      ...unavailable.heartRate,
      run: {
        ...unavailable.heartRate.run,
        lthr: {
          ...unavailable.heartRate.run.lthr,
          status: "available" as const,
          calibrationState: "confirmed" as const,
          valueBpm: 180,
          observedAt: asOf,
          expiresAt: "2026-08-13T12:00:00.000Z",
          sourceEvidenceId: "evidence-1",
          sourceActivityId: "activity-1",
          source: "activity_file" as const,
          method: "performance_calibration" as const,
          calculationVersion: "v1",
          reason: null,
        },
      },
    },
  };
}

describe("resolveActivityPlanTargetPresentation", () => {
  it("keeps absolute authored targets exact", () => {
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "watts", intensity: 240 },
        activityCategory: "bike",
        asOf,
      }),
    ).toEqual({ kind: "exact_authored", label: "240 W", sourceLabel: "240 W" });
  });

  it("resolves confirmed, current FTP and HR targets while preserving their authored context", () => {
    const performanceTargets = confirmedFacts();
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%FTP", intensity: 80 },
        activityCategory: "bike",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ kind: "exact_personalized", label: "240 W (80% FTP)" });
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%ThresholdHR", intensity: 90 },
        activityCategory: "run",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ kind: "exact_personalized", label: "162 bpm (90% Threshold HR)" });
  });

  it.each([
    ["partial", "confirmed", "2026-08-13T12:00:00.000Z"],
    ["available", "provisional", "2026-08-13T12:00:00.000Z"],
    ["available", "stale", "2026-08-13T12:00:00.000Z"],
    ["available", "confirmed", "2026-08-11T12:00:00.000Z"],
  ] as const)("keeps FTP abstract for %s/%s/%s facts", (status, calibrationState, expiresAt) => {
    const performanceTargets = confirmedFacts();
    performanceTargets.cycling.planningThresholdPower = {
      ...performanceTargets.cycling.planningThresholdPower,
      status,
      calibrationState,
      expiresAt,
    } as typeof performanceTargets.cycling.planningThresholdPower;
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%FTP", intensity: 80 },
        activityCategory: "bike",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ kind: "abstract", label: "80% FTP" });
  });

  it("keeps unavailable HR facts abstract", () => {
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%MaxHR", intensity: 90 },
        activityCategory: "run",
        performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1"),
        asOf,
      }),
    ).toMatchObject({ kind: "abstract", label: "90% Max HR" });
  });

  it.each([
    ["provisional", "2026-08-13T12:00:00.000Z"],
    ["stale", "2026-08-13T12:00:00.000Z"],
    ["confirmed", "2026-08-11T12:00:00.000Z"],
  ] as const)("keeps HR abstract for %s or expired facts", (calibrationState, expiresAt) => {
    const performanceTargets = confirmedFacts();
    performanceTargets.heartRate.run.lthr = {
      ...performanceTargets.heartRate.run.lthr,
      calibrationState,
      expiresAt,
    } as typeof performanceTargets.heartRate.run.lthr;
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%ThresholdHR", intensity: 90 },
        activityCategory: "run",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ kind: "abstract", label: "90% Threshold HR" });
  });
});
