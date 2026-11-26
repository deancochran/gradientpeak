import { describe, expect, it } from "vitest";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import { activityTargetRoleByType, resolveObjectiveIntensityTarget } from "../objective-intensity";

const facts = buildPerformanceTargetFactsFixture({
  bikeThresholdWatts: 250,
  runThresholdMetersPerSecond: 4,
  swimThresholdMetersPerSecond: 1.25,
  lthrBpm: { bike: 160, run: 170, swim: 150 },
});

describe("objective activity intensity", () => {
  it("classifies objective and supporting targets centrally", () => {
    expect(activityTargetRoleByType).toEqual({
      "%FTP": "objective",
      "%MaxHR": "objective",
      "%ThresholdHR": "objective",
      watts: "objective",
      bpm: "objective",
      speed: "objective",
      cadence: "supporting",
      RPE: "supporting",
      rest: "supporting",
    });
  });

  it.each([
    ["%FTP", 80, 0.8],
    ["%ThresholdHR", 75, 0.75],
    ["%MaxHR", 70, 0.7],
  ] as const)("normalizes direct %s targets without athlete calibration", (type, intensity, value) => {
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory: type === "%FTP" ? "bike" : "run",
        performanceTargets: facts,
        targets: [{ type, intensity }],
      }),
    ).toEqual({ status: "available", value, source: "direct_relative" });
  });

  it.each([
    ["bike", { type: "watts", intensity: 200 }, 0.8],
    ["run", { type: "bpm", intensity: 153 }, 0.9],
    ["swim", { type: "speed", intensity: 3.6 }, 0.8],
  ] as const)("normalizes calibrated %s targets", (activityCategory, target, value) => {
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory,
        performanceTargets: facts,
        targets: [target],
      }),
    ).toEqual({ status: "available", value, source: "athlete_calibrated" });
  });

  it("ignores supporting targets when exactly one objective target is present", () => {
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory: "bike",
        performanceTargets: facts,
        targets: [
          { type: "%FTP", intensity: 80 },
          { type: "cadence", intensity: 90 },
          { type: "RPE", intensity: 6 },
        ],
      }),
    ).toEqual({ status: "available", value: 0.8, source: "direct_relative" });
  });

  it("fails closed for no objective, missing calibration, or multiple objectives", () => {
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory: "bike",
        performanceTargets: facts,
        targets: [
          { type: "RPE", intensity: 6 },
          { type: "cadence", intensity: 90 },
        ],
      }),
    ).toMatchObject({ status: "unavailable", reason: "no_objective_target" });
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory: "bike",
        performanceTargets: buildPerformanceTargetFactsFixture(),
        targets: [{ type: "watts", intensity: 200 }],
      }),
    ).toMatchObject({ status: "unavailable", reason: "calibration_required" });
    expect(
      resolveObjectiveIntensityTarget({
        activityCategory: "bike",
        performanceTargets: facts,
        targets: [
          { type: "%FTP", intensity: 80 },
          { type: "watts", intensity: 200 },
          { type: "cadence", intensity: 90 },
        ],
      }),
    ).toMatchObject({ status: "unavailable", reason: "ambiguous_objective_targets" });
  });
});
