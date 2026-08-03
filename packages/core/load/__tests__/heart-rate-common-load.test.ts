import { describe, expect, it } from "vitest";

import { analyzeActivityDerivedMetrics } from "../../activity-analysis";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";
import { buildPerformanceTargetFactsFixture } from "../../performance-model/__tests__/fixtures/target-facts";
import { calculateHeartRateDuration } from "../../zones/heart-rate-duration";
import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
} from "../common-relative-load";

const STARTED_AT = "2026-07-31T10:00:00.000Z";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function finalHeartRateLoad(input: {
  samples: Parameters<typeof calculateHeartRateDuration>[0]["samples"];
  durationSeconds: number;
  lthrBpm?: number | null;
  includeQuality?: boolean;
  stale?: boolean;
}): CommonLoadResult {
  const evidence = calculateHeartRateDuration({
    samples: input.samples,
    maxGapSeconds: fixtures.heartRate.maxGapSeconds,
  });
  const result = analyzeActivityDerivedMetrics({
    activity: {
      id: `phase5-hr-${input.durationSeconds}`,
      type: "run",
      started_at: STARTED_AT,
      finished_at: new Date(Date.parse(STARTED_AT) + input.durationSeconds * 1_000).toISOString(),
      duration_seconds: input.durationSeconds,
      moving_seconds: input.durationSeconds,
      timing_coverage: "complete",
      normalized_power_result: unavailableNormalizedPowerResult,
    },
    context: {
      profileMetrics: {},
      ...(input.includeQuality === false || input.stale === true
        ? {}
        : {
            performanceTargets: buildPerformanceTargetFactsFixture({
              lthrBpm:
                input.lthrBpm === null ? {} : { run: input.lthrBpm ?? fixtures.heartRate.lthrBpm },
            }),
          }),
      recentEfforts: [],
      profile: {},
    },
    heartRateDistribution: evidence,
  }).stress.common_load;
  if (!("activity_category" in result)) throw new Error("Expected an activity Common Load result");
  return result;
}

describe("Phase 5 final HR Common Load contract", () => {
  it("retains model compatibility, threshold provenance, and complete coverage", () => {
    const result = finalHeartRateLoad({
      samples: fixtures.heartRate.thresholdHour.samples,
      durationSeconds: 3_600,
    });
    expect(result).toMatchObject({
      status: "available",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      method: "heart_rate_zones",
      load: 100,
      intensity: 1,
      contributingDurationSeconds: 3_600,
      quality: { evidence_fingerprint: "run-lthr-evidence" },
      thresholdEvidence: {
        type: "lthr_bpm",
        value: fixtures.heartRate.lthrBpm,
        freshness: "current",
      },
    });
  });

  it("propagates qualified source incompleteness as numeric partial Load", () => {
    const fixture = fixtures.heartRate.missing;
    const result = finalHeartRateLoad({
      samples: fixture.samples,
      durationSeconds: fixture.expected.eligibleDurationSeconds,
    });
    expect(result).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      load: fixture.expected.rawCommonLoad,
      intensity: 1,
      contributingDurationSeconds: fixture.expected.coverageSeconds,
      eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
      sourceTimeCoverage: fixture.expected.sourceTimeCoverage,
      reason: "activity_data_partial",
    });
  });

  it("keeps missing, low-coverage, unqualified, and stale model facts unavailable", () => {
    const lowCoverage = fixtures.heartRate.lowCoverage;
    expect(
      finalHeartRateLoad({
        samples: lowCoverage.samples,
        durationSeconds: lowCoverage.expected.eligibleDurationSeconds,
      }),
    ).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      reason: "insufficient_coverage",
      sourceTimeCoverage: lowCoverage.expected.sourceTimeCoverage,
    });
    expect(
      finalHeartRateLoad({
        samples: fixtures.heartRate.thresholdHour.samples,
        durationSeconds: 3_600,
        lthrBpm: null,
      }),
    ).toMatchObject({ status: "unavailable", reason: "threshold_missing" });
    expect(
      finalHeartRateLoad({
        samples: fixtures.heartRate.thresholdHour.samples,
        durationSeconds: 3_600,
        includeQuality: false,
      }),
    ).toMatchObject({ status: "unavailable", reason: "threshold_missing" });
    expect(
      finalHeartRateLoad({
        samples: fixtures.heartRate.thresholdHour.samples,
        durationSeconds: 3_600,
        stale: true,
      }),
    ).toMatchObject({ status: "unavailable", reason: "threshold_missing" });
  });

  it("propagates partial members and abstains from incompatible model arithmetic", () => {
    const complete = finalHeartRateLoad({
      samples: fixtures.heartRate.thresholdHour.samples,
      durationSeconds: 3_600,
    });
    const partial = finalHeartRateLoad({
      samples: fixtures.heartRate.missing.samples,
      durationSeconds: fixtures.heartRate.missing.expected.eligibleDurationSeconds,
    });
    expect(aggregateCommonLoad([complete, partial])).toMatchObject({
      status: "partial",
      contributingActivityCount: 2,
      partialActivityCount: 1,
      unavailableActivityCount: 0,
      totalActivityCount: 2,
    });

    expect(
      aggregateCommonLoad([
        complete,
        {
          model: COMMON_RELATIVE_LOAD_MODEL,
          version: "2",
          knownEligibleDurationSeconds: 3_600,
        },
      ]),
    ).toMatchObject({
      status: "unavailable",
      reason: "incompatible_version",
      contributingActivityCount: 0,
      unavailableActivityCount: 2,
    });
  });
});
