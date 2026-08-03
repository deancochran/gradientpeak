import { describe, expect, it } from "vitest";

import type { CanonicalRunningDurationEffortEvidence } from "../contracts";
import { calculateRunningDurationPerformance } from "../running";
import { calculateStrengthOtherPerformance } from "../strength-other";
import { calculateSwimmingDurationPerformance } from "../swimming";
import {
  OTHER_PERFORMANCE_FIXTURE_V1 as otherFixture,
  runningEffortFixture,
  RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 as runningFixture,
  sessionEvidenceFixture,
  STRENGTH_PERFORMANCE_FIXTURE_V1 as strengthFixture,
  swimmingEffortFixture,
  SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 as swimmingFixture,
} from "./fixtures/duration-performance-v1";

const PROPERTY_SEED = 0xd0a4_2026;

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

function generatedRunningEfforts(input: {
  iteration: number;
  criticalSpeed: number;
  distanceReserve: number;
}): CanonicalRunningDurationEffortEvidence[] {
  const values = [
    [30, 9],
    [60, 8],
    [180, input.criticalSpeed + input.distanceReserve / 180],
    [300, input.criticalSpeed + input.distanceReserve / 300],
    [600, input.criticalSpeed + input.distanceReserve / 600],
    [1_200, input.criticalSpeed + input.distanceReserve / 1_200],
    [1_800, input.criticalSpeed + input.distanceReserve / 1_800],
    [3_600, input.criticalSpeed + input.distanceReserve / 3_600],
  ];
  return values.map(([durationSeconds, speedMetersPerSecond], index) =>
    runningEffortFixture({
      evidenceId: `generated-${input.iteration}-${durationSeconds}`,
      activityId: `generated-activity-${input.iteration}-${index % 4}`,
      durationSeconds: durationSeconds ?? 0,
      speedMetersPerSecond: speedMetersPerSecond ?? 0,
    }),
  );
}

describe(`duration-performance seeded properties (seed 0x${PROPERTY_SEED.toString(16)})`, () => {
  it("recovers exact running models and emits only non-increasing available curves", () => {
    const random = pseudoRandom(PROPERTY_SEED);
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const criticalSpeed = 2.5 + random() * 1.5;
      const distanceReserve = 300 + random() * 300;
      const model = calculateRunningDurationPerformance({
        ...runningFixture.input,
        efforts: generatedRunningEfforts({ iteration, criticalSpeed, distanceReserve }),
      });
      expect(model.speedPaceCurve.status).toBe("available");
      expect(model.parameters.criticalSpeed.status).toBe("available");
      expect(model.parameters.distanceReserve.status).toBe("available");
      if (
        model.speedPaceCurve.status !== "available" ||
        model.parameters.criticalSpeed.status !== "available" ||
        model.parameters.distanceReserve.status !== "available"
      ) {
        continue;
      }
      const speeds = model.speedPaceCurve.value.points.map((point) => point.speedMetersPerSecond);
      for (let index = 1; index < speeds.length; index += 1) {
        const previous = speeds[index - 1];
        const current = speeds[index];
        if (previous === undefined || current === undefined) continue;
        expect(current).toBeLessThanOrEqual(previous);
      }
      expect(model.parameters.criticalSpeed.value.metersPerSecond).toBeCloseTo(criticalSpeed, 9);
      expect(model.parameters.distanceReserve.value.meters).toBeCloseTo(distanceReserve, 6);
    }
  });

  it("is invariant to evidence ordering while retaining source/change identity", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0x51e7);
    const expectedRun = calculateRunningDurationPerformance(runningFixture.input);
    const expectedSwim = calculateSwimmingDurationPerformance(swimmingFixture.input);
    const expectedStrength = calculateStrengthOtherPerformance(strengthFixture.input);

    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(
        calculateRunningDurationPerformance({
          ...runningFixture.input,
          efforts: shuffled(runningFixture.input.efforts, random),
        }),
      ).toEqual(expectedRun);
      expect(
        calculateSwimmingDurationPerformance({
          ...swimmingFixture.input,
          efforts: shuffled(swimmingFixture.input.efforts, random),
        }),
      ).toEqual(expectedSwim);
      expect(
        calculateStrengthOtherPerformance({
          ...strengthFixture.input,
          observations: shuffled(strengthFixture.input.observations, random),
        }),
      ).toEqual(expectedStrength);
    }
    expect(expectedRun.calculationIdentity.evidenceSetFingerprint).toMatch(/^fnv1a-32:/);
    expect(expectedSwim.evidenceSummary.selectedCssProtocolEvidenceIds).toEqual([
      swimmingFixture.input.cssProtocols[0]?.evidenceId,
    ]);
    expect(expectedStrength.evidenceSummary.selectedProtocolEvidenceIds).toEqual([
      "strength-repeat",
    ]);
  });

  it("keeps raw/grade, pool/open-water, and strength/other lanes separate", () => {
    const runMixed = calculateRunningDurationPerformance({
      ...runningFixture.input,
      efforts: [
        ...runningFixture.input.efforts,
        runningEffortFixture({
          evidenceId: "grade-lane",
          activityId: "grade-activity",
          durationSeconds: 900,
          speedMetersPerSecond: 4.4,
          basis: "grade_adjusted_speed",
        }),
      ],
    });
    expect(runMixed.speedPaceCurve).toMatchObject({
      status: "unavailable",
      reasons: ["mixed_raw_grade_adjusted_evidence"],
    });

    const swimMixed = calculateSwimmingDurationPerformance({
      ...swimmingFixture.input,
      efforts: [
        ...swimmingFixture.input.efforts,
        swimmingEffortFixture({
          evidenceId: "open-lane",
          activityId: "open-activity",
          durationSeconds: 3_600,
          speedMetersPerSecond: 1.2,
          environment: "open_water",
        }),
      ],
    });
    expect(swimMixed.paceDurationCurve).toMatchObject({
      status: "unavailable",
      reasons: ["mixed_pool_open_water_evidence"],
    });

    const strengthMixed = calculateStrengthOtherPerformance({
      ...strengthFixture.input,
      observations: [
        ...strengthFixture.input.observations,
        sessionEvidenceFixture({
          evidenceId: "other-lane",
          activityId: "other-lane-activity",
          category: "other",
          rpe: 5,
          activeDurationSeconds: 1_200,
          repetitions: null,
        }),
      ],
    });
    expect(strengthMixed.metrics.strengthVolume).toMatchObject({
      status: "unavailable",
      reasons: ["mixed_activity_category_evidence"],
    });
    expect(
      calculateStrengthOtherPerformance(otherFixture.input).calculationIdentity
        .historySeriesFingerprint,
    ).not.toBe(
      calculateStrengthOtherPerformance(strengthFixture.input).calculationIdentity
        .historySeriesFingerprint,
    );
  });

  it("uses an inclusive recency boundary and changes evidence identity after expiry", () => {
    const boundary = runningEffortFixture({
      evidenceId: "boundary-60",
      activityId: "boundary-activity",
      durationSeconds: 60,
      speedMetersPerSecond: 8.5,
      recordedAt: "2026-04-02T00:00:00.000Z",
    });
    const atBoundary = calculateRunningDurationPerformance({
      ...runningFixture.input,
      efforts: [...runningFixture.input.efforts, boundary],
    });
    expect(atBoundary.speedPaceCurve).toMatchObject({
      value: {
        points: expect.arrayContaining([
          expect.objectContaining({ durationSeconds: 60, sourceEvidenceId: "boundary-60" }),
        ]),
      },
    });

    const afterBoundary = calculateRunningDurationPerformance({
      ...runningFixture.input,
      assessmentAsOf: "2026-07-01T00:00:00.001Z",
      efforts: [...runningFixture.input.efforts, boundary],
    });
    expect(afterBoundary.evidenceSummary.excludedEvidence).toContainEqual({
      evidenceId: "boundary-60",
      reason: "outside_freshness_window",
    });
    expect(afterBoundary.calculationIdentity.evidenceSetFingerprint).not.toBe(
      atBoundary.calculationIdentity.evidenceSetFingerprint,
    );
  });

  it("requires multiple activities and abstains on outliers instead of repairing them", () => {
    const generated = generatedRunningEfforts({
      iteration: 99,
      criticalSpeed: 3.5,
      distanceReserve: 450,
    });
    const oneActivity = generated.map((effort) =>
      [180, 300, 600, 1_200, 1_800].includes(effort.durationSeconds)
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: "single-fit-activity",
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: effort.value,
          })
        : effort,
    );
    expect(
      calculateRunningDurationPerformance({ ...runningFixture.input, efforts: oneActivity })
        .parameters.criticalSpeed,
    ).toMatchObject({
      status: "unavailable",
      reasons: ["critical_speed_insufficient_independent_activities"],
    });

    const outlier = generated.map((effort) =>
      effort.durationSeconds === 3_600
        ? runningEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: 4.5,
          })
        : effort,
    );
    expect(
      calculateRunningDurationPerformance({ ...runningFixture.input, efforts: outlier })
        .speedPaceCurve,
    ).toMatchObject({
      status: "unavailable",
      reasons: ["non_monotonic_canonical_curve"],
    });
  });
});
