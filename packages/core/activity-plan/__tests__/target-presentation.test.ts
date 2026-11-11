import { describe, expect, it } from "vitest";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import {
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "../target-presentation";

const asOf = "2026-08-12T12:00:00.000Z";

function confirmedFacts() {
  return buildPerformanceTargetFactsFixture({
    asOf,
    athleteId: "athlete-1",
    thresholdEffectiveAt: "2026-08-11T12:00:00.000Z",
    bikeThresholdWatts: 300,
    lthrBpm: { run: 180 },
    expiresAt: "2026-08-13T12:00:00.000Z",
  });
}

describe("resolveActivityPlanTargetPresentation", () => {
  it("orders conflicting target permutations identically without mutating authored data", () => {
    const first = [
      { type: "speed" as const, intensity: 18 },
      { type: "speed" as const, intensity: 14.4 },
      { type: "RPE" as const, intensity: 6 },
    ];
    const second = [
      { type: "speed" as const, intensity: 14.4 },
      { type: "RPE" as const, intensity: 6 },
      { type: "speed" as const, intensity: 18 },
    ];

    expect(orderActivityPlanTargetsForPresentation(first)).toEqual(
      orderActivityPlanTargetsForPresentation(second),
    );
    expect(first.map((target) => target.intensity)).toEqual([18, 14.4, 6]);
  });

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
    ["provisional", "fresh"],
    ["confirmed", "stale"],
  ] as const)("uses the viewer's available FTP fact for %s/%s facts", (state, freshness) => {
    const performanceTargets = confirmedFacts();
    if (performanceTargets.thresholds.bike.status !== "available")
      throw new Error("Expected bike threshold");
    performanceTargets.thresholds.bike.state = state;
    performanceTargets.thresholds.bike.freshness = freshness;
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%FTP", intensity: 80 },
        activityCategory: "bike",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ kind: "exact_personalized", label: "240 W (80% FTP)" });
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

  it("keeps Threshold HR and Max HR distinct while preserving each authored fallback", () => {
    const performanceTargets = confirmedFacts();
    performanceTargets.heartRate.run.maxHr = {
      ...performanceTargets.heartRate.run.maxHr,
      status: "available",
      valueBpm: 200,
      calibrationState: "confirmed",
    } as typeof performanceTargets.heartRate.run.maxHr;
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%ThresholdHR", intensity: 90 },
        activityCategory: "run",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ label: "162 bpm (90% Threshold HR)", sourceLabel: "90% Threshold HR" });
    expect(
      resolveActivityPlanTargetPresentation({
        target: { type: "%MaxHR", intensity: 90 },
        activityCategory: "run",
        performanceTargets,
        asOf,
      }),
    ).toMatchObject({ label: "180 bpm (90% Max HR)", sourceLabel: "90% Max HR" });
  });
});
