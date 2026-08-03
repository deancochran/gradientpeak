import { describe, expect, it } from "vitest";

import {
  calculateGradeAdjustedSpeedSeries,
  calculateGradedSpeed,
  calculateNGP,
  calculateRunningNormalizedGradedPace,
  createRunningNormalizedGradedPaceAccumulator,
  getCostFactor,
  RUNNING_NORMALIZED_GRADED_PACE_CALCULATION_VERSION,
} from "../normalized-graded-pace";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/running-numerical-trust-v1";
import {
  calculateReferenceRunningNormalizedGradedPace,
  type ReferenceRunningNgpSample,
  RUNNING_NORMALIZED_GRADED_PACE_REFERENCE_VERSION,
} from "./support/running-normalized-graded-pace-reference";

function assertProductionReferenceAgreement(samples: readonly ReferenceRunningNgpSample[]) {
  const production = calculateRunningNormalizedGradedPace({ samples });
  const reference = calculateReferenceRunningNormalizedGradedPace({ samples });
  expect(production.status).toBe(reference.status);
  expect(production.diagnostics).toMatchObject(reference.diagnostics);
  if (production.status === "unavailable" || reference.valueMetersPerSecond === null) {
    expect(reference.status).toBe("unavailable");
    expect(production.valueMetersPerSecond).toBeNull();
    return production;
  }
  expect(production.valueMetersPerSecond).toBeCloseTo(reference.valueMetersPerSecond, 10);
  return production;
}

describe("running Normalized Graded Pace numerical trust v1", () => {
  it("pins the production, reference, and fixture versions", () => {
    expect(RUNNING_NORMALIZED_GRADED_PACE_CALCULATION_VERSION).toBe(fixtures.calculationVersion);
    expect(RUNNING_NORMALIZED_GRADED_PACE_REFERENCE_VERSION).toBe(fixtures.referenceVersion);
  });

  it("applies the declared finite grade-cost model without rounding", () => {
    expect(getCostFactor(0)).toBe(3.6);
    expect(getCostFactor(0.05)).toBeGreaterThan(getCostFactor(0));
    expect(getCostFactor(-0.05)).toBeLessThan(getCostFactor(0));
    expect(calculateGradedSpeed(3, 0)).toBe(3);
    expect(calculateGradedSpeed(3, 0.05)).toBeGreaterThan(3);
    expect(() => calculateGradedSpeed(Number.NaN, 0)).toThrow();
    expect(() => calculateGradedSpeed(3, Number.POSITIVE_INFINITY)).toThrow();
  });

  it.each([
    ["canonical threshold hour", fixtures.canonicalThresholdHour],
    ["flat", fixtures.flat],
    ["ascent", fixtures.ascent],
    ["descent", fixtures.descent],
    ["measured zero", fixtures.measuredZero],
  ] as const)("matches the literal and independent %s fixture", (_name, fixture) => {
    const result = assertProductionReferenceAgreement(fixture.samples);
    expect(result).toMatchObject({
      status: fixture.expected.status,
      calculationVersion: fixtures.calculationVersion,
      unit: "meters_per_second",
      diagnostics: fixture.expected.diagnostics,
    });
    if (result.status === "unavailable") throw new Error(fixture.rationale);
    expect(
      Math.abs(result.valueMetersPerSecond - fixture.expected.normalizedGradedSpeedMetersPerSecond),
    ).toBeLessThanOrEqual(fixtures.tolerances.normalizedGradedSpeedMetersPerSecond);
  });

  it("is stable across regular and irregular representations of the same signal", () => {
    const fixture = fixtures.irregularRepresentations;
    const values = [
      fixture.oneSecond,
      fixture.twoSecond,
      fixture.fiveSecond,
      fixture.irregular,
    ].map((samples) => assertProductionReferenceAgreement(samples));
    for (const result of values) {
      expect(result).toMatchObject({
        status: fixture.expected.status,
        diagnostics: fixture.expected.diagnostics,
      });
      if (result.status === "unavailable") throw new Error(fixture.rationale);
      expect(
        Math.abs(
          result.valueMetersPerSecond - fixture.expected.normalizedGradedSpeedMetersPerSecond,
        ),
      ).toBeLessThanOrEqual(fixtures.tolerances.normalizedGradedSpeedMetersPerSecond);
    }
  });

  it("requires the complete 30-second boundary", () => {
    const fixture = fixtures.exactBoundary;
    expect(assertProductionReferenceAgreement(fixture.before)).toMatchObject({
      status: fixture.expectedBefore.status,
      reason: fixture.expectedBefore.reason,
      valueMetersPerSecond: fixture.expectedBefore.normalizedGradedSpeedMetersPerSecond,
      diagnostics: fixture.expectedBefore.diagnostics,
    });
    expect(assertProductionReferenceAgreement(fixture.at)).toMatchObject({
      status: fixture.expectedAt.status,
      valueMetersPerSecond: fixture.expectedAt.normalizedGradedSpeedMetersPerSecond,
      diagnostics: fixture.expectedAt.diagnostics,
    });
  });

  it.each([
    ["maximum gap", fixtures.maximumGap],
    ["over-maximum gap", fixtures.overMaximumGap],
    ["known pause", fixtures.paused],
    ["missing elevation", fixtures.missingElevation],
    ["duplicate and reversal", fixtures.timestampOrdering],
    ["misaligned elevation", fixtures.misalignedElevation],
  ] as const)("keeps %s evidence explicit", (_name, fixture) => {
    const result = assertProductionReferenceAgreement(fixture.samples);
    const expectedDiagnostics =
      "diagnostics" in fixture.expected ? fixture.expected.diagnostics : undefined;
    expect(result).toMatchObject({
      status: fixture.expected.status,
      ...(fixture.expected.status === "unavailable"
        ? {
            reason: fixture.expected.reason,
            valueMetersPerSecond: fixture.expected.normalizedGradedSpeedMetersPerSecond,
          }
        : {}),
      ...(expectedDiagnostics === undefined ? {} : { diagnostics: expectedDiagnostics }),
    });
    if (result.status !== "unavailable") {
      const expectedValue = fixture.expected.normalizedGradedSpeedMetersPerSecond;
      if (expectedValue === null) throw new Error(fixture.rationale);
      expect(Math.abs(result.valueMetersPerSecond - expectedValue)).toBeLessThanOrEqual(
        fixtures.tolerances.normalizedGradedSpeedMetersPerSecond,
      );
    }
  });

  it("retains timestamps, inclusion, and missing alignment through grade projection", () => {
    const samples = fixtures.missingElevation.samples;
    const projected = calculateGradeAdjustedSpeedSeries({
      timestampsSeconds: samples.map((sample) => sample.timestampSeconds),
      speedMetersPerSecond: samples.map((sample) => sample.speedMetersPerSecond),
      elevationMeters: samples.map((sample) => sample.elevationMeters),
      includedStream: samples.map((sample) => !("included" in sample) || sample.included !== false),
    });
    expect(projected.map((sample) => sample.timestampSeconds)).toEqual(
      samples.map((sample) => sample.timestampSeconds),
    );
    expect(projected.filter((sample) => sample.value === null)).toHaveLength(2);
    expect(projected.every((sample) => sample.included === true)).toBe(true);
  });

  it("keeps incremental and batch calculations equivalent", () => {
    const samples = fixtures.missingElevation.samples;
    const accumulator = createRunningNormalizedGradedPaceAccumulator();
    for (const sample of samples) accumulator.addSample(sample);
    expect(accumulator.getResult()).toEqual(calculateRunningNormalizedGradedPace({ samples }));
    accumulator.reset();
    expect(accumulator.getResult()).toMatchObject({
      status: "unavailable",
      reason: "no_samples",
      valueMetersPerSecond: null,
    });
  });

  it("never turns unavailable adjusted-speed normalization into numeric zero", () => {
    expect(calculateNGP([], [])).toBeNull();
    expect(calculateNGP([4, 4], [0, 1])).toBeNull();
  });

  it("rejects unsafe parallel-array and numeric evidence", () => {
    expect(() =>
      calculateGradeAdjustedSpeedSeries({
        timestampsSeconds: [0, 1],
        speedMetersPerSecond: [4],
        elevationMeters: [100, 100],
      }),
    ).toThrow();
    expect(() =>
      calculateRunningNormalizedGradedPace({
        samples: [
          { timestampSeconds: 0, speedMetersPerSecond: 4, elevationMeters: 100 },
          { timestampSeconds: 1, speedMetersPerSecond: -1, elevationMeters: 100 },
        ],
      }),
    ).toThrow();
    expect(() =>
      calculateRunningNormalizedGradedPace({
        samples: [
          {
            timestampSeconds: 0,
            speedMetersPerSecond: 4,
            elevationMeters: Number.NaN,
          },
        ],
      }),
    ).toThrow();
  });
});
