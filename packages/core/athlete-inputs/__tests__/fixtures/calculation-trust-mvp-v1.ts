import type { CalculationTrustObservedEffort } from "../../calculation-trust";

const AS_OF = "2026-08-01T00:00:00.000Z";

function effort(input: {
  effortId: string;
  performanceSignal: number;
  observedAt?: string;
  coveredDurationSeconds?: number;
  gapDurationSeconds?: number;
}): CalculationTrustObservedEffort {
  return {
    effortId: input.effortId,
    source: {
      identity: `activity:${input.effortId}`,
      provenance: "activity_file_best_effort",
      calculationVersion: "best-effort-extraction-v1",
      activityId: `activity-${input.effortId}`,
      segmentId: `segment-${input.effortId}`,
    },
    observedAt: input.observedAt ?? AS_OF,
    performanceSignal: input.performanceSignal,
    durationSeconds: 1_200,
    expectedDurationSeconds: 1_200,
    coveredDurationSeconds: input.coveredDurationSeconds ?? 1_200,
    gapDurationSeconds: input.gapDurationSeconds ?? 0,
  };
}

export const CALCULATION_TRUST_REFERENCE_FIXTURES_V1 = {
  version: "calculation-trust-reference-fixtures-v1",
  tolerance: 1e-10,
  asOf: AS_OF,
  quality: {
    rationale:
      "High, medium, and low quality observations all contribute, while coverage and gaps monotonically reduce influence.",
    efforts: [
      effort({ effortId: "high", performanceSignal: 250 }),
      effort({
        effortId: "medium",
        performanceSignal: 260,
        coveredDurationSeconds: 900,
        gapDurationSeconds: 120,
      }),
      effort({
        effortId: "low",
        performanceSignal: 240,
        coveredDurationSeconds: 300,
        gapDurationSeconds: 600,
      }),
    ],
    expectedQualityWeights: {
      high: 1,
      medium: 0.8605,
      low: 0.5275,
    },
    expectedCentralValue: 251.39447236180908,
    expectedCoverage: 0.7442420435510888,
    expectedConfidence: 0.6942083333333333,
  },
  recency: {
    rationale:
      "At the declared 42-day half-life, an otherwise identical old effort retains exactly half the base influence of a current effort.",
    efforts: [
      effort({
        effortId: "old",
        performanceSignal: 240,
        observedAt: "2026-06-20T00:00:00.000Z",
      }),
      effort({ effortId: "current", performanceSignal: 260 }),
    ],
    expectedOldRecencyWeight: 0.5,
    expectedCurrentRecencyWeight: 1,
    expectedCentralValue: 253.33333333333334,
  },
  consistent: {
    rationale:
      "Several consistent moderate efforts average centrally without residual down-weighting.",
    efforts: [
      effort({ effortId: "moderate-a", performanceSignal: 245 }),
      effort({ effortId: "moderate-b", performanceSignal: 250 }),
      effort({ effortId: "moderate-c", performanceSignal: 252 }),
      effort({ effortId: "moderate-d", performanceSignal: 255 }),
    ],
    expectedCentralValue: 250.5,
    expectedWeightedMedian: 250,
    expectedMedianAbsoluteDeviation: 2,
    expectedConfidence: 1,
  },
  outlier: {
    rationale:
      "One extreme observation remains a positive contributor but bounded residual weighting keeps the estimate near the moderate cluster.",
    efforts: [
      effort({ effortId: "moderate-a", performanceSignal: 245 }),
      effort({ effortId: "moderate-b", performanceSignal: 250 }),
      effort({ effortId: "moderate-c", performanceSignal: 252 }),
      effort({ effortId: "moderate-d", performanceSignal: 255 }),
      effort({ effortId: "extreme", performanceSignal: 5_000 }),
    ],
    expectedCentralValue: 258.36444397718617,
    expectedWeightedMedian: 252,
    expectedRobustScale: 12.600000000000001,
    expectedOutlierResidualWeight: 0.006634372367312553,
  },
};
