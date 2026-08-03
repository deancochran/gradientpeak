import { describe, expect, it } from "vitest";

import {
  calculateRunningDurationPerformance,
  runningDurationPerformanceInputSchema,
  runningDurationPerformanceModelSchema,
} from "../running";
import {
  RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 as fixture,
  runningEffortFixture,
} from "./fixtures/duration-performance-v1";
import { independentInverseDurationReference } from "./support/independent-reference";

function expectAvailable<T extends { status: string; value: unknown }>(
  outcome: T,
): asserts outcome is T & { status: "available"; value: Exclude<T["value"], null> } {
  expect(outcome.status).toBe("available");
}

describe("running duration performance", () => {
  it("matches critical speed, planning threshold pace, and duration-retention math", () => {
    expect(runningDurationPerformanceInputSchema.parse(fixture.input)).toEqual(fixture.input);
    const model = calculateRunningDurationPerformance(fixture.input);
    expect(runningDurationPerformanceModelSchema.parse(model)).toEqual(model);
    expect(model.evidenceBasis).toBe("raw_speed");
    expectAvailable(model.speedPaceCurve);
    expect(model.speedPaceCurve.value.points).toHaveLength(8);
    expect(
      model.speedPaceCurve.value.points.every(
        (point) => point.evidenceBasis === "raw_speed" && point.sourceEvidenceId.length > 0,
      ),
    ).toBe(true);

    expectAvailable(model.parameters.criticalSpeed);
    expect(model.parameters.criticalSpeed.value.metersPerSecond).toBeCloseTo(
      fixture.expected.criticalSpeedMetersPerSecond,
      10,
    );
    expect(model.parameters.criticalSpeed.value.paceSecondsPerKilometer).toBeCloseTo(250, 10);

    expectAvailable(model.parameters.distanceReserve);
    expect(model.parameters.distanceReserve.value.meters).toBeCloseTo(
      fixture.expected.distanceReserveMeters,
      8,
    );
    expect(model.parameters.distanceReserve.value.interpretation).toBe(
      "two_parameter_model_distance_term_not_a_direct_physiology_measurement",
    );

    expectAvailable(model.parameters.planningThresholdPace);
    expect(model.parameters.planningThresholdPace.value.speedMetersPerSecond).toBeCloseTo(
      fixture.expected.planningThresholdSpeedMetersPerSecond,
      10,
    );
    expect(model.parameters.planningThresholdPace.value.paceSecondsPerKilometer).toBeCloseTo(
      1_000 / fixture.expected.planningThresholdSpeedMetersPerSecond,
      10,
    );

    expectAvailable(model.parameters.durationRetention);
    expect(model.parameters.durationRetention.value.speedRetentionRatio).toBeCloseTo(
      fixture.expected.durationRetentionRatio,
      12,
    );
    expect(model.trainingLevels.every((level) => level.status === "unavailable")).toBe(true);
    expect(
      model.trainingLevels.every((level) =>
        level.reasons.includes("advanced_individualized_level_policy_deferred"),
      ),
    ).toBe(true);
  });

  it("agrees with an independently implemented inverse-duration reference", () => {
    const points = fixture.input.efforts
      .filter((effort) => [180, 300, 600, 1_200, 1_800].includes(effort.durationSeconds))
      .map((effort) => ({ durationSeconds: effort.durationSeconds, value: effort.value }));
    const reference = independentInverseDurationReference(points);
    const model = calculateRunningDurationPerformance(fixture.input);
    expectAvailable(model.parameters.criticalSpeed);
    expectAvailable(model.parameters.distanceReserve);
    expect(model.parameters.criticalSpeed.value.metersPerSecond).toBeCloseTo(
      reference.intercept,
      12,
    );
    expect(model.parameters.distanceReserve.value.meters).toBeCloseTo(reference.reserve, 9);
  });

  it("abstains rather than combining raw and grade-adjusted evidence", () => {
    const mixed = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 600
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: effort.value,
            basis: "grade_adjusted_speed",
          })
        : effort,
    );
    const model = calculateRunningDurationPerformance({ ...fixture.input, efforts: mixed });
    expect(model).toMatchObject({
      evidenceBasis: "mixed",
      speedPaceCurve: {
        status: "unavailable",
        reasons: ["mixed_raw_grade_adjusted_evidence"],
      },
      parameters: {
        criticalSpeed: {
          status: "unavailable",
          reasons: ["mixed_raw_grade_adjusted_evidence"],
        },
      },
    });
  });

  it("abstains on monotonic outliers and insufficient independent fit activities", () => {
    const outlier = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 3_600
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: 5,
          })
        : effort,
    );
    expect(
      calculateRunningDurationPerformance({ ...fixture.input, efforts: outlier }).speedPaceCurve,
    ).toMatchObject({
      status: "unavailable",
      reasons: ["non_monotonic_canonical_curve"],
    });

    const oneActivity = fixture.input.efforts.map((effort) =>
      [180, 300, 600, 1_200, 1_800].includes(effort.durationSeconds)
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: "one-fit-activity",
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: effort.value,
          })
        : effort,
    );
    expect(
      calculateRunningDurationPerformance({ ...fixture.input, efforts: oneActivity }).parameters
        .criticalSpeed,
    ).toMatchObject({
      status: "unavailable",
      reasons: ["critical_speed_insufficient_independent_activities"],
    });
  });

  it("propagates partial source coverage and withholds dependent pace levels", () => {
    const efforts = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 30
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: effort.value,
            extractionStatus: "partial",
            sourceTimeCoverage: 0.9,
          })
        : effort,
    );
    const model = calculateRunningDurationPerformance({ ...fixture.input, efforts });
    expect(model.speedPaceCurve).toMatchObject({
      status: "partial",
      reasons: ["partial_source_evidence"],
      confidence: "low",
    });
    expect(
      model.trainingLevels.find((level) => level.levelId === "short_duration_pace"),
    ).toMatchObject({
      status: "unavailable",
      reasons: ["advanced_individualized_level_policy_deferred"],
    });
  });

  it("withholds the distance-reserve level without its exact 60-second anchor", () => {
    const model = calculateRunningDurationPerformance({
      ...fixture.input,
      efforts: fixture.input.efforts.filter((effort) => effort.durationSeconds !== 60),
    });
    expectAvailable(model.parameters.distanceReserve);
    expect(
      model.trainingLevels.find((level) => level.levelId === "distance_reserve_pace"),
    ).toMatchObject({
      status: "unavailable",
      reasons: ["advanced_individualized_level_policy_deferred"],
    });
  });
});
