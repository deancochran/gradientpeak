import { describe, expect, it } from "vitest";

import type { CanonicalCyclingDurationEffortEvidence } from "../../duration-performance/contracts";
import type { CyclingDurationPerformanceInput } from "../contracts";
import { calculateCyclingDurationPerformance } from "../model";
import {
  cyclingEffortFixture,
  CYCLING_DURATION_PERFORMANCE_FIXTURE_V1 as fixture,
} from "./fixtures/cycling-duration-performance-v1";

const PROPERTY_SEED = 0xc1c1_2026;

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

function modelInput(input: {
  efforts: readonly CanonicalCyclingDurationEffortEvidence[];
  assessmentAsOf?: string;
  readCoverage?: CyclingDurationPerformanceInput["effortReadCoverage"];
}): CyclingDurationPerformanceInput {
  return {
    contractVersion: "cycling-duration-performance-input-v1",
    assessmentAsOf: input.assessmentAsOf ?? fixture.input.assessmentAsOf,
    athleteId: fixture.input.athleteId,
    effortReadCoverage: input.readCoverage ?? { state: "complete", reason: null },
    efforts: [...input.efforts],
  };
}

function reassignActivity(
  effort: CanonicalCyclingDurationEffortEvidence,
  activityId: string,
): CanonicalCyclingDurationEffortEvidence {
  return cyclingEffortFixture({
    evidenceId: effort.evidenceId,
    activityId,
    durationSeconds: effort.durationSeconds,
    powerWatts: effort.value,
    recordedAt: effort.recordedAt,
    extractionStatus: effort.provenance.extractionStatus,
    sourceTimeCoverage: effort.provenance.sourceTimeCoverage,
  });
}

describe(`cycling duration-performance deterministic properties (seed 0x${PROPERTY_SEED.toString(16)})`, () => {
  it("is invariant to input ordering and preserves deterministic tie ordering", () => {
    const random = pseudoRandom(PROPERTY_SEED);
    const equalOlder = cyclingEffortFixture({
      evidenceId: "equal-older",
      activityId: "tie-old",
      durationSeconds: 300,
      powerWatts: 320,
      recordedAt: "2026-06-29T00:00:00.000Z",
    });
    const equalNewerLexicalLater = cyclingEffortFixture({
      evidenceId: "z-equal-newer",
      activityId: "tie-new-z",
      durationSeconds: 300,
      powerWatts: 320,
    });
    const equalNewerLexicalFirst = cyclingEffortFixture({
      evidenceId: "a-equal-newer",
      activityId: "tie-new-a",
      durationSeconds: 300,
      powerWatts: 320,
    });
    const efforts = [
      ...fixture.input.efforts.filter((effort) => effort.durationSeconds !== 300),
      equalOlder,
      equalNewerLexicalLater,
      equalNewerLexicalFirst,
    ];
    const expected = calculateCyclingDurationPerformance(modelInput({ efforts }));

    for (let iteration = 0; iteration < 24; iteration += 1) {
      expect(
        calculateCyclingDurationPerformance(modelInput({ efforts: shuffled(efforts, random) })),
      ).toEqual(expected);
    }
    expect(expected.maximalMeanPowerCurve).toMatchObject({
      status: "available",
      value: {
        points: expect.arrayContaining([
          expect.objectContaining({
            durationSeconds: 300,
            sourceEvidenceId: "a-equal-newer",
          }),
        ]),
      },
    });
  });

  it("returns only non-increasing available curves across seeded exact CP models", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0x5eed);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const criticalPower = 180 + random() * 120;
      const reserve = 12_000 + random() * 18_000;
      const powers = [
        [5, 1_400],
        [30, 800],
        [60, 600],
        [300, criticalPower + reserve / 300],
        [600, criticalPower + reserve / 600],
        [1_200, criticalPower + reserve / 1_200],
        [1_800, criticalPower + reserve / 1_800],
        [3_600, criticalPower + reserve / 3_600],
      ];
      const efforts = powers.map(([durationSeconds, powerWatts], index) =>
        cyclingEffortFixture({
          evidenceId: `generated-${iteration}-${durationSeconds}`,
          activityId: `generated-ride-${index % 4}`,
          durationSeconds: durationSeconds ?? 0,
          powerWatts: powerWatts ?? 0,
        }),
      );
      const model = calculateCyclingDurationPerformance(modelInput({ efforts }));
      expect(model.maximalMeanPowerCurve.status).toBe("available");
      expect(model.parameters.criticalPower.status).toBe("available");
      expect(model.parameters.anaerobicReserve.status).toBe("available");
      if (
        model.maximalMeanPowerCurve.status !== "available" ||
        model.parameters.criticalPower.status !== "available" ||
        model.parameters.anaerobicReserve.status !== "available"
      ) {
        continue;
      }
      const curvePowers = model.maximalMeanPowerCurve.value.points.map((point) => point.powerWatts);
      for (let index = 1; index < curvePowers.length; index += 1) {
        const previous = curvePowers[index - 1];
        const current = curvePowers[index];
        if (previous === undefined || current === undefined) continue;
        expect(current).toBeLessThanOrEqual(previous);
      }
      expect(model.parameters.criticalPower.value.watts).toBeCloseTo(criticalPower, 8);
      expect(model.parameters.anaerobicReserve.value.joules).toBeCloseTo(reserve, 5);
    }
  });

  it("abstains on a monotonicity outlier instead of deleting or repairing it", () => {
    const efforts = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 3_600
        ? cyclingEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: 3_600,
            powerWatts: 300,
          })
        : effort,
    );
    const model = calculateCyclingDurationPerformance(modelInput({ efforts }));

    expect(model.maximalMeanPowerCurve).toMatchObject({
      status: "unavailable",
      reasons: ["non_monotonic_canonical_curve"],
    });
    expect(model.parameters.criticalPower).toMatchObject({
      status: "unavailable",
      reasons: ["non_monotonic_canonical_curve"],
    });
    expect(model.evidenceSummary.selectedSourceEvidenceIds).toContain("effort-3600");
  });

  it("does not remove a monotonic CP residual outlier to force an accepted fit", () => {
    const efforts = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 600
        ? cyclingEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: 600,
            powerWatts: 315,
          })
        : effort,
    );
    const model = calculateCyclingDurationPerformance(modelInput({ efforts }));

    expect(model.maximalMeanPowerCurve.status).toBe("available");
    expect(model.parameters.criticalPower.status).toBe("unavailable");
    expect(model.parameters.criticalPower.reasons).toEqual(["critical_power_poor_fit"]);
    expect(model.parameters.criticalPower.sourceEvidenceIds).toContain("effort-600");
  });

  it("uses an inclusive 90-day window, excludes stale maxima, and changes only at expiry", () => {
    const stale = cyclingEffortFixture({
      evidenceId: "stale-five-second",
      activityId: "stale-ride",
      durationSeconds: 5,
      powerWatts: 1_500,
      recordedAt: "2026-04-01T23:59:59.999Z",
    });
    const boundary = cyclingEffortFixture({
      evidenceId: "boundary-five-second",
      activityId: "boundary-ride",
      durationSeconds: 5,
      powerWatts: 1_300,
      recordedAt: "2026-04-02T00:00:00.000Z",
    });
    const atBoundary = calculateCyclingDurationPerformance(
      modelInput({ efforts: [...fixture.input.efforts, stale, boundary] }),
    );
    expect(atBoundary.parameters.fiveSecondPower).toMatchObject({
      status: "available",
      value: { watts: 1_300 },
      sourceEvidenceIds: ["boundary-five-second"],
    });
    expect(atBoundary.evidenceSummary.excludedEvidence).toContainEqual({
      evidenceId: "stale-five-second",
      reason: "outside_freshness_window",
    });

    const afterBoundary = calculateCyclingDurationPerformance(
      modelInput({
        efforts: [...fixture.input.efforts, stale, boundary],
        assessmentAsOf: "2026-07-01T00:00:00.001Z",
      }),
    );
    expect(afterBoundary.parameters.fiveSecondPower).toMatchObject({
      status: "available",
      value: { watts: 1_200 },
      sourceEvidenceIds: ["effort-5"],
    });
    expect(afterBoundary.evidenceSummary.excludedEvidence).toContainEqual({
      evidenceId: "boundary-five-second",
      reason: "outside_freshness_window",
    });
  });

  it("requires winning CP points from multiple activities", () => {
    const oneActivity = fixture.input.efforts.map((effort) =>
      [300, 600, 1_200, 1_800].includes(effort.durationSeconds)
        ? reassignActivity(effort, "same-cp-ride")
        : effort,
    );
    const lowerIndependentDuplicate = cyclingEffortFixture({
      evidenceId: "lower-independent-300",
      activityId: "independent-lower-ride",
      durationSeconds: 300,
      powerWatts: 319,
    });
    const oneWinningActivity = calculateCyclingDurationPerformance(
      modelInput({ efforts: [...oneActivity, lowerIndependentDuplicate] }),
    );
    expect(oneWinningActivity.parameters.criticalPower).toMatchObject({
      status: "unavailable",
      reasons: ["critical_power_insufficient_independent_activities"],
    });

    const multipleWinningActivities = oneActivity.map((effort) =>
      effort.durationSeconds === 1_800 ? reassignActivity(effort, "second-cp-ride") : effort,
    );
    expect(
      calculateCyclingDurationPerformance(modelInput({ efforts: multipleWinningActivities }))
        .parameters.criticalPower.status,
    ).toBe("available");
  });

  it("propagates partial canonical extraction and withholds dependent levels", () => {
    const efforts = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 5
        ? cyclingEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            powerWatts: effort.value,
            extractionStatus: "partial",
            sourceTimeCoverage: 0.9,
          })
        : effort,
    );
    const model = calculateCyclingDurationPerformance(modelInput({ efforts }));

    expect(model.parameters.fiveSecondPower).toMatchObject({
      status: "partial",
      reasons: ["partial_source_evidence"],
      confidence: "low",
    });
    expect(model.capabilityProfile.shortDurationCapacity.status).toBe("partial");
    expect(model.trainingLevels.find((level) => level.levelId === "sprint_capacity")).toMatchObject(
      {
        status: "unavailable",
        reasons: ["advanced_individualized_level_policy_deferred"],
      },
    );
  });

  it("returns explicit unavailable states for empty, truncated, and unsupported recovery evidence", () => {
    const empty = calculateCyclingDurationPerformance(modelInput({ efforts: [] }));
    expect(empty.maximalMeanPowerCurve).toMatchObject({
      status: "unavailable",
      value: null,
      reasons: ["no_eligible_efforts"],
      confidence: "unavailable",
    });

    const truncated = calculateCyclingDurationPerformance(
      modelInput({
        efforts: fixture.input.efforts,
        readCoverage: { state: "truncated", reason: "query_limit_reached" },
      }),
    );
    expect(truncated.parameters.fiveSecondPower).toMatchObject({
      status: "unavailable",
      reasons: ["evidence_read_truncated"],
    });
    expect(truncated.capabilityProfile.repeatedEffortRecovery).toMatchObject({
      status: "unavailable",
      reasons: ["repeated_effort_recovery_not_supported_by_maximal_efforts"],
    });
  });

  it("keeps a valid sparse curve partial and unsupported capabilities unavailable", () => {
    const efforts = fixture.input.efforts.filter((effort) => effort.durationSeconds !== 60);
    const model = calculateCyclingDurationPerformance(modelInput({ efforts }));

    expect(model.maximalMeanPowerCurve).toMatchObject({
      status: "partial",
      reasons: ["missing_curve_anchors"],
    });
    expect(model.capabilityProfile.shortDurationCapacity).toMatchObject({
      status: "unavailable",
      reasons: ["short_duration_evidence_missing"],
    });
    expect(
      model.trainingLevels.find((level) => level.levelId === "reserve_capacity"),
    ).toMatchObject({ status: "unavailable" });
  });
});
