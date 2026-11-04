import { describe, expect, it } from "vitest";

import {
  CYCLING_NORMALIZED_POWER_CALCULATION_VERSION,
  calculateCyclingNormalizedPower,
  calculateNormalizedPower,
  cyclingNormalizedPowerResultSchema,
} from "../normalized-power";
import { NORMALIZED_SERIES_CALCULATION_VERSION } from "../normalized-series";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/cycling-numerical-trust-v1";
import {
  CYCLING_NORMALIZED_POWER_REFERENCE_VERSION,
  calculateReferenceCyclingNormalizedPower,
  type ReferenceCyclingPowerSample,
} from "./support/cycling-normalized-power-reference";

function production(samples: readonly ReferenceCyclingPowerSample[]) {
  return calculateCyclingNormalizedPower({ samples });
}

function expectNumericVector(
  samples: readonly ReferenceCyclingPowerSample[],
  expected: {
    status: "available" | "partial";
    normalizedPowerWatts: number;
    diagnostics: Readonly<Record<string, number>>;
  },
): void {
  const result = production(samples);
  const reference = calculateReferenceCyclingNormalizedPower({ samples });
  expect(result.status).toBe(expected.status);
  expect(reference.status).toBe(expected.status);
  if (
    result.status === "unavailable" ||
    reference.status === "unavailable" ||
    reference.valueWatts === null
  ) {
    throw new Error("Expected a numeric production and independent-reference result");
  }
  expect(Math.abs(result.valueWatts - expected.normalizedPowerWatts)).toBeLessThanOrEqual(
    fixtures.tolerances.normalizedPowerWatts,
  );
  expect(Math.abs(reference.valueWatts - expected.normalizedPowerWatts)).toBeLessThanOrEqual(
    fixtures.tolerances.normalizedPowerWatts,
  );
  expect(Math.abs(result.valueWatts - reference.valueWatts)).toBeLessThanOrEqual(
    fixtures.tolerances.normalizedPowerWatts,
  );
  expect(result.diagnostics).toMatchObject(expected.diagnostics);
  expect(reference.diagnostics).toMatchObject(expected.diagnostics);
  expect(cyclingNormalizedPowerResultSchema.safeParse(result).success).toBe(true);
}

describe("cycling Normalized Power numerical trust v1", () => {
  it("uses separately versioned production and independent reference calculations", () => {
    expect(fixtures.version).toBe("cycling-numerical-trust-fixtures-v1");
    expect(CYCLING_NORMALIZED_POWER_CALCULATION_VERSION).toBe(fixtures.calculationVersion);
    expect(CYCLING_NORMALIZED_POWER_REFERENCE_VERSION).toBe(fixtures.referenceVersion);
    expect(NORMALIZED_SERIES_CALCULATION_VERSION).toBe("fixed-one-second-normalized-series-v2");
    expect(calculateReferenceCyclingNormalizedPower).not.toBe(calculateCyclingNormalizedPower);
  });

  it("returns an explicit unavailable result rather than zero without evidence", () => {
    expect(calculateNormalizedPower([], [])).toMatchObject({
      status: "unavailable",
      valueWatts: null,
      reason: "no_samples",
      unit: "watts",
      calculationVersion: fixtures.calculationVersion,
    });
  });

  it("matches manually declared constant and canonical threshold vectors", () => {
    expectNumericVector(fixtures.constant.samples, fixtures.constant.expected);
    expectNumericVector(
      fixtures.canonicalThresholdHour.samples,
      fixtures.canonicalThresholdHour.expected,
    );
    expectNumericVector(
      fixtures.canonicalHalfThresholdTwoHours.samples,
      fixtures.canonicalHalfThresholdTwoHours.expected,
    );
  });

  it("is representation-equivalent at 1, 2, 5, and irregular sample intervals", () => {
    const vector = fixtures.variableRepresentations;
    for (const samples of [
      vector.oneSecond,
      vector.twoSecond,
      vector.fiveSecond,
      vector.irregular,
    ]) {
      expectNumericVector(samples, vector.expected);
    }
  });

  it("requires the exact complete 30-second boundary", () => {
    const vector = fixtures.exactBoundary;
    const before = production(vector.before);
    const beforeReference = calculateReferenceCyclingNormalizedPower({ samples: vector.before });
    expect(before).toMatchObject({
      status: vector.expectedBefore.status,
      valueWatts: vector.expectedBefore.normalizedPowerWatts,
      reason: vector.expectedBefore.reason,
      diagnostics: vector.expectedBefore.diagnostics,
    });
    expect(beforeReference).toMatchObject({
      status: vector.expectedBefore.status,
      valueWatts: vector.expectedBefore.normalizedPowerWatts,
      reason: vector.expectedBefore.reason,
      diagnostics: vector.expectedBefore.diagnostics,
    });
    expectNumericVector(vector.at, vector.expectedAt);
  });

  it("distinguishes the maximum accepted gap from maximum plus one", () => {
    expectNumericVector(fixtures.maximumGap.samples, fixtures.maximumGap.expected);
    expectNumericVector(fixtures.overMaximumGap.samples, fixtures.overMaximumGap.expected);
  });

  it("keeps paused, missing, zero-coasting, and timestamp-anomaly semantics distinct", () => {
    expectNumericVector(fixtures.paused.samples, fixtures.paused.expected);
    expectNumericVector(fixtures.missing.samples, fixtures.missing.expected);
    expectNumericVector(fixtures.zeroCoasting.samples, fixtures.zeroCoasting.expected);
    expectNumericVector(fixtures.timestampOrdering.samples, fixtures.timestampOrdering.expected);

    const zero = production(fixtures.zeroCoasting.samples);
    const missing = production(fixtures.missing.samples);
    const paused = production(fixtures.paused.samples);
    expect(zero).toMatchObject({ status: "available", valueWatts: 0 });
    expect(missing).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      diagnostics: { excludedMissingDurationSeconds: 1 },
    });
    expect(paused).toMatchObject({
      status: "available",
      diagnostics: { excludedInactiveDurationSeconds: 1, sourceTimeCoverage: 1 },
    });
  });

  it("rejects invalid, non-finite, sparse, or misaligned compatibility input", () => {
    expect(() => calculateNormalizedPower([-1], [0])).toThrow();
    expect(() => calculateNormalizedPower([Number.NaN], [0])).toThrow();
    expect(() => calculateNormalizedPower([100], [Number.POSITIVE_INFINITY])).toThrow();
    expect(() => calculateNormalizedPower([100], [])).toThrow(/equal lengths/);
    expect(() => calculateNormalizedPower([100], [0], undefined, [])).toThrow(/align/);

    const sparsePower = Array<number | null>(2);
    sparsePower[0] = 100;
    expect(() => calculateNormalizedPower(sparsePower, [0, 1])).toThrow(/sparse/);
  });
});
