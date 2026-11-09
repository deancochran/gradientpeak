import { describe, expect, it } from "vitest";

import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import {
  calculateReferenceHeartRateCommonLoadInputs,
  calculateReferenceHeartRateDuration,
} from "../../calculations/__tests__/support/swimming-heart-rate-reference";
import { calculateHeartRateDuration } from "../../zones/heart-rate-duration";
import {
  calculateHeartRateZoneStress,
  HEART_RATE_COMMON_LOAD_CALCULATION_VERSION,
  heartRateCommonLoadCalculationResultSchema,
} from "../heart-rate-zone-stress";

const policy = fixtures.heartRate;

function calculateFixture(fixture: {
  samples: Parameters<typeof calculateHeartRateDuration>[0]["samples"];
}) {
  const evidence = calculateHeartRateDuration({
    samples: fixture.samples,
    maxGapSeconds: policy.maxGapSeconds,
  });
  return calculateHeartRateZoneStress({
    durationSeconds: evidence.eligibleDurationSeconds,
    lthrBpm: policy.lthrBpm,
    distribution: evidence,
  });
}

describe("Phase 5 HR Common Load", () => {
  it("matches the manual irregular-sampling result without zone quantization", () => {
    const fixture = policy.irregularComplete;
    const result = calculateFixture(fixture);
    const referenceEvidence = calculateReferenceHeartRateDuration({
      samples: fixture.samples,
      maxGapSeconds: policy.maxGapSeconds,
    });
    const reference = calculateReferenceHeartRateCommonLoadInputs({
      evidence: referenceEvidence,
      lthrBpm: policy.lthrBpm,
    });
    expect(result).toMatchObject({
      status: "available",
      calculationVersion: HEART_RATE_COMMON_LOAD_CALCULATION_VERSION,
      rawLoad: fixture.expected.rawCommonLoad,
      rawEquivalentIntensityFactor: fixture.expected.rawIntensity,
      zoneSeconds: fixture.expected.zoneSeconds,
      coverageRatio: 1,
    });
    expect(heartRateCommonLoadCalculationResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject(reference);
  });

  it("anchors one qualified active hour at LTHR to intensity 1 and 100 Load", () => {
    const fixture = policy.thresholdHour;
    expect(calculateFixture(fixture)).toMatchObject({
      status: fixture.expected.status,
      load: fixture.expected.load,
      rawLoad: fixture.expected.load,
      equivalentIntensityFactor: fixture.expected.intensity,
      rawEquivalentIntensityFactor: fixture.expected.intensity,
      contributingDurationSeconds: 3_600,
    });
  });

  it("keeps exactly 80% qualified coverage numeric but partial", () => {
    const fixture = policy.missing;
    expect(calculateFixture(fixture)).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      rawLoad: fixture.expected.rawCommonLoad,
      rawEquivalentIntensityFactor: 1,
      contributingDurationSeconds: fixture.expected.coverageSeconds,
      eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
      coverageRatio: fixture.expected.sourceTimeCoverage,
    });
  });

  it("is unavailable below minimum coverage and before the exact duration boundary", () => {
    expect(calculateFixture(policy.lowCoverage)).toMatchObject({
      status: "unavailable",
      reason: "insufficient_coverage",
      coverageRatio: policy.lowCoverage.expected.sourceTimeCoverage,
    });
    expect(calculateFixture({ samples: policy.minimumEvidence.before })).toMatchObject(
      policy.minimumEvidence.expectedBefore,
    );
    expect(calculateFixture({ samples: policy.minimumEvidence.at })).toMatchObject({
      status: policy.minimumEvidence.expectedAt.status,
      rawLoad: policy.minimumEvidence.expectedAt.load,
      rawEquivalentIntensityFactor: policy.minimumEvidence.expectedAt.intensity,
    });
  });

  it("is unavailable for missing HR or missing/invalid LTHR instead of returning zero", () => {
    const missingEvidence = calculateHeartRateDuration({ samples: policy.allMissing.samples });
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 30,
        lthrBpm: policy.lthrBpm,
        distribution: missingEvidence,
      }),
    ).toMatchObject({ status: "unavailable", reason: "activity_data_missing", load: null });

    const evidence = calculateHeartRateDuration({ samples: policy.thresholdHour.samples });
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 3_600,
        lthrBpm: null,
        distribution: evidence,
      }),
    ).toMatchObject({ status: "unavailable", reason: "threshold_missing", load: null });
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 3_600,
        lthrBpm: 79,
        distribution: evidence,
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_threshold", load: null });
  });

  it("rejects a distribution whose eligible duration is incompatible with the activity", () => {
    const evidence = calculateHeartRateDuration({ samples: policy.thresholdHour.samples });
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 3_599,
        lthrBpm: policy.lthrBpm,
        distribution: evidence,
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_data", load: null });
  });
});
