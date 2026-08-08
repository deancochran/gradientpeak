import { describe, expect, it } from "vitest";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/cycling-numerical-trust-v1";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";
import { calculateSwimmingDurationPerformance } from "../../duration-performance";
import { SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 } from "../../duration-performance/__tests__/fixtures/duration-performance-v1";
import { aggregateCommonLoad } from "../../load/common-relative-load";
import { buildPerformanceTargetFactsFixture } from "../../performance-model/__tests__/fixtures/target-facts";
import { projectAthletePerformanceTargetFacts } from "../../performance-model/projections";
import { buildPerformanceModelSnapshotFixture } from "../../testing/performance-model";
import {
  activityDerivedMetricsSchema,
  activityDerivedStressSchema,
  activityListDerivedSummarySchema,
  analyzeActivityDerivedMetrics,
} from "..";

const timestamps = {
  started_at: "2026-03-01T10:00:00.000Z",
  finished_at: "2026-03-01T11:00:00.000Z",
} as const;

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function constantNormalizedPowerResult(powerWatts: number, durationSeconds = 3_600) {
  return calculateCyclingNormalizedPower({
    samples: Array.from({ length: durationSeconds + 1 }, (_, timestampSeconds) => ({
      timestampSeconds,
      powerWatts,
    })),
  });
}

describe("activity analysis Common Load", () => {
  it("emits Common Load only from canonical modeled target evidence", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "bike-canonical-target",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power_result: constantNormalizedPowerResult(200),
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 250,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      method: "power_threshold",
      intensity: 0.8,
      quality: { evidence_fingerprint: "planning-threshold-power-evidence" },
    });
    expect(derived.stress).toMatchObject({
      trimp: null,
      trimp_source: null,
      training_effect: "tempo",
    });
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it("uses canonical CSS protocol model output for swimming Common Load", () => {
    const fixture = SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1;
    const snapshot = buildPerformanceModelSnapshotFixture({
      asOf: fixture.input.assessmentAsOf,
      athleteId: fixture.input.athleteId,
    });
    snapshot.categories.swim = calculateSwimmingDurationPerformance(fixture.input);
    const performanceTargets = projectAthletePerformanceTargetFacts(snapshot);
    const cssSpeed = 100 / fixture.expected.cssSecondsPer100Meters;

    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "swim-canonical-css-protocol",
        type: "swim",
        started_at: "2026-07-02T10:00:00.000Z",
        finished_at: "2026-07-02T11:00:00.000Z",
        duration_seconds: 3_600,
        moving_seconds: 3_600,
        avg_speed_mps: cssSpeed,
        normalized_speed_mps: cssSpeed,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets,
        recentEfforts: [],
        profile: {},
      },
    });

    expect(performanceTargets.swimming.css).toMatchObject({
      status: "available",
      sourceEvidenceIds: [fixture.input.cssProtocols[0]?.evidenceId],
    });
    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      method: "swim_pace_threshold",
      load: 100,
      intensity: 1,
      quality: {
        evidence_fingerprint: fixture.input.cssProtocols[0]?.evidenceId,
      },
    });
  });

  it("retains numeric partial Normalized Power coverage without promoting Common Load", () => {
    const fixture = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.missing;
    const normalizedPowerResult = calculateCyclingNormalizedPower({ samples: fixture.samples });
    if (normalizedPowerResult.status !== "partial") {
      throw new Error("Expected the shared missing-power vector to remain partial");
    }
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "bike-partial-normalized-power",
        type: "bike",
        ...timestamps,
        duration_seconds: 61,
        moving_seconds: 61,
        normalized_power_result: normalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 200,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "partial",
      method: "power_threshold",
      load: (60 / 3_600) * 100,
      intensity: 1,
      contributingDurationSeconds: 60,
      eligibleDurationSeconds: 61,
      sourceTimeCoverage: 60 / 61,
      reason: "activity_data_partial",
    });
  });

  it("keeps an unavailable Normalized Power result numeric-free", () => {
    const normalizedPowerResult = calculateCyclingNormalizedPower({
      samples: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.exactBoundary.before,
    });
    expect(normalizedPowerResult).toMatchObject({
      status: "unavailable",
      valueWatts: null,
      reason: "insufficient_window",
    });
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "bike-unavailable-normalized-power",
        type: "bike",
        ...timestamps,
        duration_seconds: 29,
        normalized_power_result: normalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 200,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load.status).toBe("unavailable");
    expect("load" in derived.stress.common_load).toBe(false);
    expect("intensity" in derived.stress.common_load).toBe(false);
  });

  it("keeps low-coverage HR Common Load and training effect unavailable", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "partial-hr",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({ lthrBpm: { run: 150 } }),
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        status: "partial",
        reason: "source_incomplete",
        calculationVersion: "heart-rate-zone-duration-v1",
        coverageSeconds: 1800,
        eligibleDurationSeconds: 3600,
        sourceTimeCoverage: 0.5,
        timeWeightedAverageBpm: 150,
        buckets: [{ bpm: 150, seconds: 1800 }],
        diagnostics: {
          sourceSampleCount: 0,
          acceptedTimestampCount: 0,
          contributingIntervalCount: 0,
          observedSpanSeconds: 3600,
          pausedDurationSeconds: 0,
          excludedGapDurationSeconds: 0,
          excludedMissingDurationSeconds: 1800,
          excludedInvalidDurationSeconds: 0,
          duplicateTimestampCount: 0,
          reversedTimestampCount: 0,
          invalidTimestampCount: 0,
        },
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      sourceTimeCoverage: 0.5,
      reason: "insufficient_coverage",
    });
    expect(derived.stress.training_effect).toBeNull();
  });

  it("keeps Common Load unavailable without fabricating a parallel stress result", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "missing",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: { profileMetrics: {}, recentEfforts: [], profile: {} },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      reason: "threshold_missing",
    });
    expect(derived.stress).toMatchObject({
      trimp: null,
      trimp_source: null,
      training_effect: null,
    });
  });

  it("keeps cycling Common Load unavailable when normalized power has no threshold", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "missing-cycling-threshold",
        type: "bike",
        ...timestamps,
        duration_seconds: 3_600,
        normalized_power_result: constantNormalizedPowerResult(250),
      },
      context: { profileMetrics: {}, recentEfforts: [], profile: {} },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
      reason: "threshold_missing",
    });
    expect("load" in derived.stress.common_load).toBe(false);
  });

  it("does not substitute average cycling power for unavailable Normalized Power", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "average-power-only",
        type: "bike",
        ...timestamps,
        duration_seconds: 3_600,
        avg_power: 250,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 250,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      reason: "activity_data_missing",
    });
    expect("load" in derived.stress.common_load).toBe(false);
  });

  it("preserves measured zero-power coasting as available zero cycling Load", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "zero-power-coasting",
        type: "bike",
        ...timestamps,
        duration_seconds: 3_600,
        normalized_power_result: constantNormalizedPowerResult(0),
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 250,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      load: 0,
      intensity: 0,
      contributingDurationSeconds: 3_600,
    });
  });

  it("excludes known rest by using moving rather than elapsed cycling duration", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "cycling-rest-excluded",
        type: "bike",
        ...timestamps,
        duration_seconds: 3_600,
        moving_seconds: 1_800,
        normalized_power_result: constantNormalizedPowerResult(250, 1_800),
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          planningThresholdPowerWatts: 250,
        }),
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      load: 50,
      intensity: 1,
      contributingDurationSeconds: 1_800,
    });
  });

  it("requires Common Load for detail and list stress contracts, including parent aggregates", () => {
    const detail = analyzeActivityDerivedMetrics({
      activity: {
        id: "aggregate-source",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: { profileMetrics: {}, recentEfforts: [], profile: {} },
    }).stress;
    if (!("activity_category" in detail.common_load)) {
      throw new Error("Expected an activity-level Common Load result");
    }
    const aggregate = aggregateCommonLoad([detail.common_load]);

    expect(
      activityDerivedStressSchema.safeParse({ ...detail, common_load: aggregate }).success,
    ).toBe(true);
    expect(
      activityDerivedStressSchema.safeParse({ ...detail, common_load: undefined }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        common_load: aggregate,
        computed_as_of: timestamps.started_at,
      }).success,
    ).toBe(true);
  });
});
