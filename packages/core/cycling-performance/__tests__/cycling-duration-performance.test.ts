import { describe, expect, it } from "vitest";
import { canonicalCyclingDurationEffortEvidenceSchema } from "../../duration-performance/contracts";
import {
  CYCLING_DURATION_PERFORMANCE_POLICY,
  cyclingDurationPerformanceInputSchema,
  cyclingDurationPerformanceModelSchema,
} from "../contracts";
import { calculateCyclingDurationPerformance } from "../model";
import {
  cyclingEffortFixture,
  CYCLING_DURATION_PERFORMANCE_FIXTURE_V1 as fixture,
} from "./fixtures/cycling-duration-performance-v1";
import { independentCyclingDurationReference } from "./support/independent-reference";

function expectAvailable<T extends { status: string }>(
  outcome: T,
): asserts outcome is T & {
  status: "available";
  value: Exclude<T extends { value: infer V } ? V : never, null>;
} {
  expect(outcome.status).toBe("available");
}

describe("cycling duration-performance contracts", () => {
  it("accepts only canonical extracted cycling power evidence with exact provenance", () => {
    const effort = cyclingEffortFixture({
      evidenceId: "contract-effort",
      activityId: "contract-ride",
      durationSeconds: 300,
      powerWatts: 320,
    });
    expect(canonicalCyclingDurationEffortEvidenceSchema.parse(effort)).toEqual(effort);

    expect(
      canonicalCyclingDurationEffortEvidenceSchema.safeParse({
        ...effort,
        rawSamples: [{ timestampSeconds: 0, powerWatts: 320 }],
      }).success,
    ).toBe(false);
    expect(
      canonicalCyclingDurationEffortEvidenceSchema.safeParse({
        ...effort,
        provenance: { ...effort.provenance, segmentId: "different-segment" },
      }).success,
    ).toBe(false);
    expect(
      canonicalCyclingDurationEffortEvidenceSchema.safeParse({
        ...effort,
        provenance: { ...effort.provenance, contributingDurationSeconds: 299 },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate evidence identities and unbounded/non-finite quantities", () => {
    const effort = cyclingEffortFixture({
      evidenceId: "duplicate-effort",
      activityId: "duplicate-ride",
      durationSeconds: 300,
      powerWatts: 320,
    });
    expect(
      cyclingDurationPerformanceInputSchema.safeParse({
        contractVersion: "cycling-duration-performance-input-v1",
        assessmentAsOf: "2026-07-01T00:00:00.000Z",
        athleteId: "athlete-1",
        effortReadCoverage: { state: "complete", reason: null },
        efforts: [effort, effort],
      }).success,
    ).toBe(false);
    expect(
      cyclingDurationPerformanceInputSchema.safeParse({
        contractVersion: "cycling-duration-performance-input-v1",
        assessmentAsOf: "2026-07-01T00:00:00.000Z",
        athleteId: "another-athlete",
        effortReadCoverage: { state: "complete", reason: null },
        efforts: [effort],
      }).success,
    ).toBe(false);
    expect(
      canonicalCyclingDurationEffortEvidenceSchema.safeParse({
        ...effort,
        value: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
  });

  it("owns a frozen, bounded policy and versioned output contract", () => {
    expect(Object.isFrozen(CYCLING_DURATION_PERFORMANCE_POLICY)).toBe(true);
    expect(Object.isFrozen(CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerBounds)).toBe(true);
    const model = calculateCyclingDurationPerformance(fixture.input);
    expect(cyclingDurationPerformanceModelSchema.parse(model)).toEqual(model);
    expect(model.calculationIdentity).toMatchObject({
      foundationVersion: "duration-performance-foundation-v1",
      modelVersion: "cycling-duration-performance-v1",
      inputContractVersion: "cycling-duration-performance-input-v1",
      evidencePolicyVersion: "cycling-duration-performance-evidence-v1",
      sourceCalculationVersions: ["best-effort-extraction-v1"],
      assessmentAsOf: fixture.input.assessmentAsOf,
      athleteId: fixture.input.athleteId,
      activityCategory: "bike",
      modelVariant: "cycling_power",
    });
    expect(model.calculationIdentity.historySeriesFingerprint).toMatch(/^fnv1a-32:/);
    expect(model.calculationIdentity.evidenceSetFingerprint).toMatch(/^fnv1a-32:/);
    expect(model.calculationIdentity.calculationFingerprint).toMatch(/^fnv1a-32:/);
  });
});

describe("cycling duration-performance literal numerical trust", () => {
  it("matches literal curve, planning threshold, modeled time to exhaustion, and duration retention", () => {
    const model = calculateCyclingDurationPerformance(fixture.input);
    expectAvailable(model.maximalMeanPowerCurve);
    expect(
      model.maximalMeanPowerCurve.value.points.map((point) => [
        point.durationSeconds,
        point.powerWatts,
      ]),
    ).toEqual(fixture.expected.curvePowersByDuration);
    expect(model.maximalMeanPowerCurve.sourceEvidenceIds).toEqual(
      fixture.input.efforts.map((effort) => effort.evidenceId).sort(),
    );

    expectAvailable(model.parameters.fiveSecondPower);
    expect(model.parameters.fiveSecondPower.value.watts).toBe(
      fixture.expected.fiveSecondPowerWatts,
    );
    expect(model.parameters.fiveSecondPower.value.interpretation).toBe(
      "five_second_maximal_mean_power_proxy_not_instantaneous_power",
    );

    expectAvailable(model.parameters.criticalPower);
    expect(model.parameters.criticalPower.value.watts).toBeCloseTo(
      fixture.expected.criticalPowerWatts,
      9,
    );
    expect(model.parameters.criticalPower.value.fit.rSquared).toBeCloseTo(1, 12);

    expectAvailable(model.parameters.anaerobicReserve);
    expect(model.parameters.anaerobicReserve.value.joules).toBeCloseTo(
      fixture.expected.gradientPeakReserveJoules,
      6,
    );
    expect(model.parameters.anaerobicReserve.value.name).toBe("gradientpeak_reserve");

    expectAvailable(model.parameters.planningThresholdPower);
    expect(model.parameters.planningThresholdPower.value.watts).toBeCloseTo(
      fixture.expected.planningThresholdPowerWatts,
      9,
    );
    expect(model.parameters.planningThresholdPower.value.interpretation).toBe(
      "gradientpeak_planning_anchor_not_ftp_or_lactate_threshold",
    );

    expectAvailable(model.parameters.modeledTimeToExhaustion);
    expect(model.parameters.modeledTimeToExhaustion.value.seconds).toBeCloseTo(
      fixture.expected.modeledTimeToExhaustionSeconds,
      6,
    );
    expect(model.parameters.modeledTimeToExhaustion.value.interpretation).toBe(
      "model_intersection_not_observed_exhaustion_time",
    );

    expectAvailable(model.parameters.durationRetention);
    expect(model.parameters.durationRetention.value.ratio).toBeCloseTo(
      fixture.expected.durationRetentionRatio,
      12,
    );
    expect(model.parameters.durationRetention.value.interpretation).toBe(
      "cross_duration_retention_not_late_ride_fatigue_resistance",
    );
    expect(model.parameters.durationRetention.expiresAt).toBe(fixture.expected.expiresAt);
  });

  it("agrees with a separately implemented test-only equation reference", () => {
    const reference = independentCyclingDurationReference({
      criticalPowerPoints: [
        { durationSeconds: 300, powerWatts: 320 },
        { durationSeconds: 600, powerWatts: 280 },
        { durationSeconds: 1_200, powerWatts: 260 },
        { durationSeconds: 1_800, powerWatts: 253.33333333333334 },
      ],
      twentyMinutePowerWatts: 260,
      oneHourPowerWatts: 246.66666666666666,
    });
    const model = calculateCyclingDurationPerformance(fixture.input);
    expectAvailable(model.parameters.criticalPower);
    expectAvailable(model.parameters.anaerobicReserve);
    expectAvailable(model.parameters.planningThresholdPower);
    expectAvailable(model.parameters.modeledTimeToExhaustion);
    expectAvailable(model.parameters.durationRetention);

    expect(model.parameters.criticalPower.value.watts).toBeCloseTo(
      reference.criticalPowerWatts,
      12,
    );
    expect(model.parameters.anaerobicReserve.value.joules).toBeCloseTo(reference.reserveJoules, 9);
    expect(model.parameters.planningThresholdPower.value.watts).toBeCloseTo(
      reference.planningThresholdPowerWatts,
      12,
    );
    expect(model.parameters.modeledTimeToExhaustion.value.seconds).toBeCloseTo(
      reference.modeledTimeToExhaustionSeconds,
      9,
    );
    expect(model.parameters.durationRetention.value.ratio).toBeCloseTo(
      reference.durationRetentionRatio,
      12,
    );
  });
});

describe("cycling AthleteCapabilityProfile-compatible output and levels", () => {
  it("exposes evidence-backed capabilities without a phenotype label", () => {
    const model = calculateCyclingDurationPerformance(fixture.input);
    expect(model.capabilityProfile.activityCategory).toBe("bike");
    expectAvailable(model.capabilityProfile.shortDurationCapacity);
    expect(model.capabilityProfile.shortDurationCapacity.value).toEqual(
      fixture.expected.shortDurationCapacity,
    );
    expectAvailable(model.capabilityProfile.anaerobicReserve);
    expectAvailable(model.capabilityProfile.thresholdCapacity);
    expectAvailable(model.capabilityProfile.longDurationCapacity);
    expect(model.capabilityProfile.longDurationCapacity.value.powerWatts).toBe(
      fixture.expected.longDurationPowerWatts,
    );
    expectAvailable(model.capabilityProfile.durationRetention);
    expect(model.capabilityProfile.repeatedEffortRecovery).toMatchObject({
      status: "unavailable",
      reasons: ["repeated_effort_recovery_not_supported_by_maximal_efforts"],
      value: null,
    });
    expect(model).not.toHaveProperty("phenotype");
    expect(model.capabilityProfile).not.toHaveProperty("phenotype");
  });

  it("keeps advanced individualized levels explicitly deferred", () => {
    const model = calculateCyclingDurationPerformance(fixture.input);
    expect(model.trainingLevels).toHaveLength(6);
    expect(model.trainingLevels.slice(0, 5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "unavailable",
          reasons: ["advanced_individualized_level_policy_deferred"],
          prescription: null,
        }),
      ]),
    );
    expect(model.trainingLevels.slice(0, 5).every((level) => level.status === "unavailable")).toBe(
      true,
    );
    expect(
      model.trainingLevels.find((level) => level.levelId === "repeated_effort_recovery"),
    ).toMatchObject({
      status: "unavailable",
      targetCapability: "repeated_effort_recovery",
      reasons: ["repeated_effort_recovery_not_supported_by_maximal_efforts"],
    });
  });
});
