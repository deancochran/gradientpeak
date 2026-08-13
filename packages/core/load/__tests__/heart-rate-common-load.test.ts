import { describe, expect, it } from "vitest";

import { analyzeActivityDerivedMetrics } from "../../activity-analysis";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";
import { buildPerformanceTargetFactsFixture } from "../../performance-model/__tests__/fixtures/target-facts";
import {
  calculateHeartRateDuration,
  type HeartRateDurationEvidence,
} from "../../zones/heart-rate-duration";
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
  elapsedSeconds?: number;
  includeElapsed?: boolean;
  distribution?: HeartRateDurationEvidence;
  lthrBpm?: number | null;
  includeQuality?: boolean;
  stale?: boolean;
  provisional?: boolean;
}): CommonLoadResult {
  const evidence =
    input.distribution ??
    calculateHeartRateDuration({
      samples: input.samples,
      maxGapSeconds: fixtures.heartRate.maxGapSeconds,
    });
  const performanceTargets = buildPerformanceTargetFactsFixture({
    lthrBpm: input.lthrBpm === null ? {} : { run: input.lthrBpm ?? fixtures.heartRate.lthrBpm },
  });
  if (input.stale || input.provisional) {
    performanceTargets.heartRate.run.lthr.calibrationState = input.stale ? "stale" : "provisional";
  }
  const result = analyzeActivityDerivedMetrics({
    activity: {
      id: `phase5-hr-${input.durationSeconds}`,
      type: "run",
      started_at: STARTED_AT,
      finished_at: new Date(Date.parse(STARTED_AT) + input.durationSeconds * 1_000).toISOString(),
      duration_seconds: input.durationSeconds,
      ...(input.includeElapsed === false
        ? {}
        : { elapsed_seconds: input.elapsedSeconds ?? input.durationSeconds }),
      moving_seconds: input.durationSeconds,
      timing_coverage: "complete",
      normalized_power_result: unavailableNormalizedPowerResult,
    },
    context: {
      profileMetrics: {},
      ...(input.includeQuality === false ? {} : { performanceTargets }),
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

  it.each([
    "provisional",
    "stale",
  ] as const)("calculates normal HR Load from a %s valid threshold", (state) => {
    expect(
      finalHeartRateLoad({
        samples: fixtures.heartRate.thresholdHour.samples,
        durationSeconds: 3_600,
        ...(state === "provisional" ? { provisional: true } : { stale: true }),
      }),
    ).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      load: 100,
      thresholdEvidence: { freshness: state === "stale" ? "stale" : "current" },
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

  it("uses bounded versioned HR evidence duration when provider active time differs", () => {
    const distribution: HeartRateDurationEvidence = {
      status: "available",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 1_800,
      eligibleDurationSeconds: 1_800,
      sourceTimeCoverage: 1,
      timeWeightedAverageBpm: fixtures.heartRate.lthrBpm,
      buckets: [{ bpm: fixtures.heartRate.lthrBpm, seconds: 1_800 }],
      diagnostics: {
        sourceSampleCount: 1_801,
        acceptedTimestampCount: 1_801,
        contributingIntervalCount: 1_800,
        observedSpanSeconds: 1_800,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };

    expect(
      finalHeartRateLoad({
        samples: [],
        durationSeconds: 2_400,
        elapsedSeconds: 3_600,
        distribution,
      }),
    ).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1_800,
      load: 50,
      intensity: 1,
    });
  });

  it("rejects versioned HR evidence that exceeds the segment elapsed boundary", () => {
    const distribution: HeartRateDurationEvidence = {
      status: "available",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 1_800,
      eligibleDurationSeconds: 1_800,
      sourceTimeCoverage: 1,
      timeWeightedAverageBpm: fixtures.heartRate.lthrBpm,
      buckets: [{ bpm: fixtures.heartRate.lthrBpm, seconds: 1_800 }],
      diagnostics: {
        sourceSampleCount: 1_801,
        acceptedTimestampCount: 1_801,
        contributingIntervalCount: 1_800,
        observedSpanSeconds: 1_800,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };

    expect(
      finalHeartRateLoad({
        samples: [],
        durationSeconds: 1_800,
        elapsedSeconds: 1_700,
        distribution,
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_data" });
  });

  it("uses active duration as the evidence boundary when elapsed duration is omitted", () => {
    const distribution: HeartRateDurationEvidence = {
      status: "available",
      calculationVersion: "heart-rate-zone-duration-v1",
      coverageSeconds: 1_800,
      eligibleDurationSeconds: 1_800,
      sourceTimeCoverage: 1,
      timeWeightedAverageBpm: fixtures.heartRate.lthrBpm,
      buckets: [{ bpm: fixtures.heartRate.lthrBpm, seconds: 1_800 }],
      diagnostics: {
        sourceSampleCount: 1_801,
        acceptedTimestampCount: 1_801,
        contributingIntervalCount: 1_800,
        observedSpanSeconds: 1_800,
        pausedDurationSeconds: 0,
        excludedGapDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
        excludedInvalidDurationSeconds: 0,
        duplicateTimestampCount: 0,
        reversedTimestampCount: 0,
        invalidTimestampCount: 0,
      },
    };

    expect(
      finalHeartRateLoad({
        samples: [],
        durationSeconds: 1_800,
        includeElapsed: false,
        distribution,
      }),
    ).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1_800,
      load: 50,
      intensity: 1,
    });
  });

  it("keeps missing, low-coverage, and unqualified model facts unavailable", () => {
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
