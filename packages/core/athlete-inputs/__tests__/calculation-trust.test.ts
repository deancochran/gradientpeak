import {
  calculatePerformanceSignalEstimate as calculateFromRoot,
  calculationTrustEstimateResultSchema as schemaFromRoot,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  CALCULATION_TRUST_MODEL_VERSION,
  CALCULATION_TRUST_MVP_VERSION,
  calculatePerformanceSignalEstimate,
  calculationTrustEstimateInputSchema,
  calculationTrustEstimateResultSchema,
} from "../calculation-trust";
import { CALCULATION_TRUST_REFERENCE_FIXTURES_V1 as fixtures } from "./fixtures/calculation-trust-mvp-v1";

const baseInput = {
  asOf: fixtures.asOf,
  signalKind: "cycling_ftp_projection",
  signalUnit: "watts",
};

describe("Calculation Trust MVP", () => {
  it("exports an explicit projection API and unavailable result", () => {
    expect(calculateFromRoot).toBe(calculatePerformanceSignalEstimate);
    expect(schemaFromRoot).toBe(calculationTrustEstimateResultSchema);
    expect(calculatePerformanceSignalEstimate({ ...baseInput, efforts: [] })).toEqual(
      expect.objectContaining({
        status: "unavailable",
        reason: "no_observed_efforts",
        centralValue: null,
        calculationVersion: CALCULATION_TRUST_MVP_VERSION,
        modelVersion: CALCULATION_TRUST_MODEL_VERSION,
        contributors: [],
      }),
    );
  });

  it("keeps high, medium, and low quality efforts as weighted contributors", () => {
    const result = calculatePerformanceSignalEstimate({
      ...baseInput,
      efforts: fixtures.quality.efforts,
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error(fixtures.quality.rationale);

    const byId = new Map(
      result.contributors.map((contributor) => [contributor.effortId, contributor]),
    );
    expect(result.contributors).toHaveLength(3);
    expect(byId.get("high")?.qualityWeight).toBe(fixtures.quality.expectedQualityWeights.high);
    expect(byId.get("medium")?.qualityWeight).toBeCloseTo(
      fixtures.quality.expectedQualityWeights.medium,
      10,
    );
    expect(byId.get("low")?.qualityWeight).toBeCloseTo(
      fixtures.quality.expectedQualityWeights.low,
      10,
    );
    expect(byId.get("low")?.robustWeight).toBeGreaterThan(0);
    expect(byId.get("low")?.source).toEqual(fixtures.quality.efforts[2]?.source);
    expect(byId.get("medium")?.weightedSignal).toBeCloseTo(
      260 * fixtures.quality.expectedQualityWeights.medium,
      10,
    );
    expect(result.centralValue).toBeCloseTo(fixtures.quality.expectedCentralValue, 10);
    expect(result.aggregate.coverage).toBeCloseTo(fixtures.quality.expectedCoverage, 10);
    expect(result.aggregate.confidence).toBeCloseTo(fixtures.quality.expectedConfidence, 10);
  });

  it("applies the documented monotonic recency half-life", () => {
    const result = calculatePerformanceSignalEstimate({
      ...baseInput,
      efforts: fixtures.recency.efforts,
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error(fixtures.recency.rationale);
    const old = result.contributors.find((contributor) => contributor.effortId === "old");
    const current = result.contributors.find((contributor) => contributor.effortId === "current");
    expect(old?.recencyWeight).toBeCloseTo(fixtures.recency.expectedOldRecencyWeight, 10);
    expect(current?.recencyWeight).toBe(fixtures.recency.expectedCurrentRecencyWeight);
    expect((current?.combinedWeight ?? 0) / (old?.combinedWeight ?? 1)).toBeCloseTo(2, 10);
    expect(result.centralValue).toBeCloseTo(fixtures.recency.expectedCentralValue, 10);
  });

  it("averages several consistent moderate efforts", () => {
    const result = calculatePerformanceSignalEstimate({
      ...baseInput,
      efforts: fixtures.consistent.efforts,
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error(fixtures.consistent.rationale);
    expect(result.centralValue).toBe(fixtures.consistent.expectedCentralValue);
    expect(result.diagnostics.weightedMedian).toBe(fixtures.consistent.expectedWeightedMedian);
    expect(result.diagnostics.weightedMedianAbsoluteDeviation).toBe(
      fixtures.consistent.expectedMedianAbsoluteDeviation,
    );
    expect(result.contributors.every((contributor) => contributor.residualWeight === 1)).toBe(true);
    expect(result.aggregate.confidence).toBe(fixtures.consistent.expectedConfidence);
  });

  it("bounds one extreme effort without dropping it", () => {
    const result = calculatePerformanceSignalEstimate({
      ...baseInput,
      efforts: fixtures.outlier.efforts,
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error(fixtures.outlier.rationale);
    const outlier = result.contributors.find((contributor) => contributor.effortId === "extreme");
    expect(result.centralValue).toBeCloseTo(fixtures.outlier.expectedCentralValue, 10);
    expect(result.centralValue).toBeLessThan(260);
    expect(result.diagnostics.weightedMedian).toBe(fixtures.outlier.expectedWeightedMedian);
    expect(result.diagnostics.robustScale).toBeCloseTo(fixtures.outlier.expectedRobustScale, 10);
    expect(outlier?.residualWeight).toBeCloseTo(fixtures.outlier.expectedOutlierResidualWeight, 10);
    expect(outlier?.robustWeight).toBeGreaterThan(0);
    expect(outlier?.influenceShare).toBeGreaterThan(0);
  });

  it("rejects future, duplicate, and internally inconsistent source evidence", () => {
    const source = fixtures.quality.efforts[0];
    if (source === undefined) throw new Error("Reference effort missing");
    expect(
      calculationTrustEstimateInputSchema.safeParse({
        ...baseInput,
        efforts: [{ ...source, observedAt: "2026-08-02T00:00:00.000Z" }],
      }).success,
    ).toBe(false);
    expect(
      calculationTrustEstimateInputSchema.safeParse({
        ...baseInput,
        efforts: [source, source],
      }).success,
    ).toBe(false);
    expect(
      calculationTrustEstimateInputSchema.safeParse({
        ...baseInput,
        efforts: [
          {
            ...source,
            coveredDurationSeconds: 1_000,
            gapDurationSeconds: 500,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
