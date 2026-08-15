import { describe, expect, it } from "vitest";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/running-numerical-trust-v1";
import { calculateRunningNormalizedGradedPace } from "../../calculations/normalized-graded-pace";
import { calculateCyclingNormalizedPower } from "../../calculations/normalized-power";
import { aggregateCommonLoad, type CommonLoadResult } from "../../load/common-relative-load";
import { athletePerformanceTargetFactsSchema } from "../../performance-model/projections";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import { type ActivitySummaryForAnalysis, analyzeActivityDerivedMetrics } from "../stress";

const STARTED_AT = "2026-07-31T10:00:00.000Z";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
type CommonFixture =
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.paused
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation;

function activityFromFixture(fixture: CommonFixture): ActivitySummaryForAnalysis {
  const normalizedGradedPaceResult = calculateRunningNormalizedGradedPace({
    samples: fixture.samples,
  });
  if (normalizedGradedPaceResult.status === "unavailable") {
    throw new Error(fixture.rationale);
  }
  return {
    id: `running-common-load-${fixture.expected.status}`,
    type: "run",
    started_at: STARTED_AT,
    finished_at: new Date(
      Date.parse(STARTED_AT) + fixture.expected.elapsedDurationSeconds * 1_000,
    ).toISOString(),
    duration_seconds: fixture.expected.activeDurationSeconds,
    moving_seconds: fixture.expected.movingDurationSeconds,
    distance_meters: fixture.expected.distanceMeters,
    avg_speed_mps: fixture.expected.distanceMeters / fixture.expected.movingDurationSeconds,
    normalized_speed_mps: fixture.expected.distanceMeters / fixture.expected.movingDurationSeconds,
    normalized_power_result: unavailableNormalizedPowerResult,
    normalized_graded_pace_result: normalizedGradedPaceResult,
  };
}

function analyzeFixture(fixture: CommonFixture, thresholdAvailable = true): CommonLoadResult {
  const result = analyzeActivityDerivedMetrics({
    activity: activityFromFixture(fixture),
    context: {
      profileMetrics: {},
      performanceTargets: buildPerformanceTargetFactsFixture(
        thresholdAvailable
          ? {
              runThresholdMetersPerSecond: fixture.thresholdSpeedMetersPerSecond,
            }
          : {},
      ),
      recentEfforts: [],
      profile: {},
    },
    computedAsOf: new Date(
      Date.parse(STARTED_AT) + fixture.expected.elapsedDurationSeconds * 1_000,
    ).toISOString(),
  }).stress.common_load;
  if (!("activity_category" in result)) {
    throw new Error("Running fixture must produce activity-level Common Load");
  }
  return result;
}

describe("running Common Load v1", () => {
  it("calculates one active threshold hour as literal full-precision 100 Load", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour;
    const result = analyzeFixture(fixture);
    expect(result).toMatchObject({
      status: "available",
      model: "gradientpeak_relative_load",
      version: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.commonLoadVersion,
      activity_category: "run",
      method: "run_pace_threshold",
      contributingDurationSeconds: fixture.expected.activeDurationSeconds,
    });
    if (!("activity_category" in result) || result.status !== "available") {
      throw new Error(fixture.rationale);
    }
    expect(result.intensity).toBeCloseTo(fixture.expected.normalizedIntensity, 12);
    expect(result.load).toBeCloseTo(fixture.expected.commonLoad, 12);
  });

  it("calculates normal Load from a provisional valid run threshold", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour;
    const targets = buildPerformanceTargetFactsFixture({
      runThresholdMetersPerSecond: fixture.thresholdSpeedMetersPerSecond,
    });
    const performanceTargets = athletePerformanceTargetFactsSchema.parse({
      ...targets,
      thresholds: {
        ...targets.thresholds,
        run: {
          ...targets.thresholds.run,
          state: "provisional",
          confidence: 0.6,
        },
      },
    });

    const result = analyzeActivityDerivedMetrics({
      activity: activityFromFixture(fixture),
      context: { profileMetrics: {}, performanceTargets, recentEfforts: [], profile: {} },
    }).stress.common_load;
    expect(result).toMatchObject({ status: "available", method: "run_pace_threshold" });
    if (result.status !== "available") throw new Error("Expected provisional run Load");
    expect(result.load).toBeCloseTo(100, 12);
  });

  it("returns threshold_missing without converting evidenced NGP into Load", () => {
    const result = analyzeFixture(
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour,
      false,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      method: "run_pace_threshold",
      reason: "threshold_missing",
    });
    expect(result).not.toHaveProperty("load");
    expect(result).not.toHaveProperty("intensity");
  });

  it("does not fall back to unversioned speed when aligned elevation evidence is unavailable", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.misalignedElevation;
    const normalizedGradedPaceResult = calculateRunningNormalizedGradedPace({
      samples: fixture.samples,
    });
    expect(normalizedGradedPaceResult.status).toBe("unavailable");
    const result = analyzeActivityDerivedMetrics({
      activity: {
        id: "running-misaligned-elevation",
        type: "run",
        started_at: STARTED_AT,
        finished_at: new Date(Date.parse(STARTED_AT) + 31_000).toISOString(),
        duration_seconds: 31,
        moving_seconds: 31,
        distance_meters: 124,
        avg_speed_mps: 4,
        normalized_speed_mps: 4,
        normalized_power_result: unavailableNormalizedPowerResult,
        normalized_graded_pace_result: normalizedGradedPaceResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          runThresholdMetersPerSecond: 4,
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: new Date(Date.parse(STARTED_AT) + 31_000).toISOString(),
    }).stress.common_load;

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "activity_data_missing",
    });
    expect(result).not.toHaveProperty("load");
  });

  it("returns activity_data_missing when the canonical NGP result is absent", () => {
    const result = analyzeActivityDerivedMetrics({
      activity: {
        id: "running-missing-ngp-result",
        type: "run",
        started_at: STARTED_AT,
        finished_at: new Date(Date.parse(STARTED_AT) + 60_000).toISOString(),
        duration_seconds: 60,
        moving_seconds: 60,
        distance_meters: 240,
        avg_speed_mps: 4,
        normalized_speed_mps: 4,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          runThresholdMetersPerSecond: 4,
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: new Date(Date.parse(STARTED_AT) + 60_000).toISOString(),
    }).stress.common_load;

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "activity_data_missing",
    });
    expect(result).not.toHaveProperty("load");
    expect(result).not.toHaveProperty("intensity");
  });

  it("keeps incomplete NGP numeric only over its evidenced contributing duration", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation;
    const result = analyzeFixture(fixture);
    expect(result).toMatchObject({
      status: "partial",
      method: "run_pace_threshold",
      contributingDurationSeconds: fixture.expected.diagnostics.contributingDurationSeconds,
      eligibleDurationSeconds: fixture.expected.activeDurationSeconds,
      sourceTimeCoverage:
        fixture.expected.diagnostics.contributingDurationSeconds /
        fixture.expected.activeDurationSeconds,
      reason: "activity_data_partial",
    });
    if (!("activity_category" in result) || result.status !== "partial") {
      throw new Error(fixture.rationale);
    }
    expect(result.intensity).toBeCloseTo(fixture.expected.normalizedIntensity, 12);
    expect(result.load).toBeCloseTo(fixture.expected.commonLoad, 12);
  });

  it("excludes known rest from final duration and Load rather than using elapsed time", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.paused;
    const result = analyzeFixture(fixture);
    expect(fixture.expected.elapsedDurationSeconds).toBeGreaterThan(
      fixture.expected.activeDurationSeconds,
    );
    expect(result).toMatchObject({
      status: "available",
      contributingDurationSeconds: fixture.expected.activeDurationSeconds,
    });
    if (!("activity_category" in result) || result.status !== "available") {
      throw new Error(fixture.rationale);
    }
    expect(result.intensity).toBeCloseTo(fixture.expected.normalizedIntensity, 12);
    expect(result.load).toBeCloseTo(fixture.expected.commonLoad, 12);
  });

  it("keeps an aggregate partial when one running member has incomplete NGP", () => {
    const complete = analyzeFixture(RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour);
    const partial = analyzeFixture(RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation);
    const aggregate = aggregateCommonLoad([complete, partial]);
    expect(aggregate).toMatchObject({
      status: "partial",
      partialActivityCount: 1,
      contributingActivityCount: 2,
      totalActivityCount: 2,
    });
    if (aggregate.status !== "partial") throw new Error("Expected partial aggregate");
    expect(aggregate.load).toBeCloseTo(
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour.expected.commonLoad +
        RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation.expected.commonLoad,
      12,
    );
  });
});
