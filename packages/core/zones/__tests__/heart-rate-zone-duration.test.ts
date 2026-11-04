import { describe, expect, it } from "vitest";

import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import {
  calculateReferenceHeartRateDuration,
  calculateReferenceHeartRateZoneSeconds,
} from "../../calculations/__tests__/support/swimming-heart-rate-reference";
import {
  calculateHeartRateDuration,
  calculateHeartRateZoneDuration,
  heartRateDurationEvidenceSchema,
  heartRateZoneDurationResultSchema,
} from "../heart-rate-duration";

const policy = fixtures.heartRate;

function evidenceFor(samples: Parameters<typeof calculateHeartRateDuration>[0]["samples"]) {
  return calculateHeartRateDuration({ samples, maxGapSeconds: policy.maxGapSeconds });
}

describe("Phase 5 time-weighted HR zone duration", () => {
  it("matches literal irregular-sampling duration and zone expectations", () => {
    const fixture = policy.irregularComplete;
    const evidence = evidenceFor(fixture.samples);
    const zones = calculateHeartRateZoneDuration({ evidence, lthrBpm: policy.lthrBpm });
    const reference = calculateReferenceHeartRateDuration({
      samples: fixture.samples,
      maxGapSeconds: policy.maxGapSeconds,
    });

    expect(evidence).toMatchObject({
      status: fixture.expected.status,
      calculationVersion: fixtures.heartRateDurationCalculationVersion,
      coverageSeconds: fixture.expected.coverageSeconds,
      eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
      sourceTimeCoverage: fixture.expected.sourceTimeCoverage,
      timeWeightedAverageBpm: fixture.expected.timeWeightedAverageBpm,
    });
    expect(zones).toMatchObject({
      status: "available",
      zoneSeconds: fixture.expected.zoneSeconds,
    });
    expect(evidence).toMatchObject(reference);
    expect(zones).toMatchObject({
      zoneSeconds: calculateReferenceHeartRateZoneSeconds({
        buckets: reference.buckets,
        lthrBpm: policy.lthrBpm,
      }),
    });
    expect(heartRateDurationEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(heartRateZoneDurationResultSchema.parse(zones)).toEqual(zones);
  });

  it("includes the exact maximum gap and excludes an over-bound gap as partial", () => {
    const exact = evidenceFor(policy.exactMaximumGap.samples);
    expect(exact).toMatchObject(policy.exactMaximumGap.expected);

    const over = evidenceFor(policy.overMaximumGap.samples);
    expect(over).toMatchObject({
      status: policy.overMaximumGap.expected.status,
      coverageSeconds: policy.overMaximumGap.expected.coverageSeconds,
      eligibleDurationSeconds: policy.overMaximumGap.expected.eligibleDurationSeconds,
      sourceTimeCoverage: policy.overMaximumGap.expected.sourceTimeCoverage,
      diagnostics: {
        excludedGapDurationSeconds: policy.overMaximumGap.expected.excludedGapDurationSeconds,
      },
    });
  });

  it("excludes known pauses from eligible coverage without making complete HR partial", () => {
    const fixture = policy.paused;
    expect(evidenceFor(fixture.samples)).toMatchObject({
      status: fixture.expected.status,
      coverageSeconds: fixture.expected.coverageSeconds,
      eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
      diagnostics: { pausedDurationSeconds: fixture.expected.pausedDurationSeconds },
    });
  });

  it("distinguishes missing HR and zero dropout from qualified HR", () => {
    const missing = evidenceFor(policy.missing.samples);
    expect(missing).toMatchObject({
      status: "partial",
      coverageSeconds: policy.missing.expected.coverageSeconds,
      diagnostics: {
        excludedMissingDurationSeconds: policy.missing.expected.excludedMissingDurationSeconds,
        excludedInvalidDurationSeconds: 0,
      },
    });

    const zero = evidenceFor(policy.zeroDropout.samples);
    expect(zero).toMatchObject({
      status: "partial",
      coverageSeconds: policy.zeroDropout.expected.coverageSeconds,
      diagnostics: {
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: policy.zeroDropout.expected.excludedInvalidDurationSeconds,
      },
    });
    if (zero.status === "unavailable") throw new Error(policy.zeroDropout.rationale);
    expect(zero.buckets.some((bucket) => bucket.bpm === 0)).toBe(false);
  });

  it("returns explicit unavailable evidence rather than false complete zero zones", () => {
    const evidence = evidenceFor(policy.allMissing.samples);
    const zones = calculateHeartRateZoneDuration({ evidence, lthrBpm: policy.lthrBpm });
    expect(evidence).toMatchObject(policy.allMissing.expected);
    expect(zones).toMatchObject({
      status: "unavailable",
      reason: "heart_rate_unavailable",
      zoneSeconds: null,
    });
  });

  it("uses exact half-open LTHR boundaries", () => {
    const fixture = policy.zoneBoundaries;
    const evidence = evidenceFor([fixture.anchor, ...fixture.samples]);
    expect(calculateHeartRateZoneDuration({ evidence, lthrBpm: fixture.lthrBpm })).toMatchObject({
      status: "available",
      zoneSeconds: fixture.expectedZoneSeconds,
    });
  });

  it("ignores duplicate/reversed samples without replacing the accepted timestamp cursor", () => {
    const fixture = policy.timestampOrdering;
    expect(evidenceFor(fixture.samples)).toMatchObject({
      status: fixture.expected.status,
      coverageSeconds: fixture.expected.coverageSeconds,
      diagnostics: {
        duplicateTimestampCount: fixture.expected.duplicateTimestampCount,
        reversedTimestampCount: fixture.expected.reversedTimestampCount,
      },
    });
  });

  it("keeps a qualified distribution partial below the Common Load coverage policy", () => {
    expect(evidenceFor(policy.lowCoverage.samples)).toMatchObject(policy.lowCoverage.expected);
  });

  it("requires LTHR for zones while preserving independently qualified HR evidence", () => {
    const evidence = evidenceFor(policy.irregularComplete.samples);
    expect(calculateHeartRateZoneDuration({ evidence, lthrBpm: null })).toMatchObject({
      status: "unavailable",
      reason: "threshold_missing",
      zoneSeconds: null,
      evidence: { status: "available", coverageSeconds: 36 },
    });
  });
});
