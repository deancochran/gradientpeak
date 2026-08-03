import { describe, expect, it } from "vitest";
import { analyzeActivityDerivedMetrics } from "../../activity-analysis";
import { calculateSwimTiming } from "../../activity-analysis/swim-timing";
import { buildPerformanceTargetFactsFixture } from "../../performance-model/__tests__/fixtures/target-facts";
import { calculateCyclingNormalizedPower } from "../normalized-power";
import {
  CSS_CALCULATION_VERSION,
  calculateCssFrom400m200mTest,
  evaluateCssFrom400m200mTest,
} from "../swim-pace-curve";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/swimming-heart-rate-numerical-trust-v1";
import {
  calculateReferenceCss400m200m,
  calculateReferenceSwimTiming,
  SWIMMING_HEART_RATE_REFERENCE_VERSION,
} from "./support/swimming-heart-rate-reference";

const STARTED_AT = "2026-07-31T10:00:00.000Z";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

describe("Phase 5 CSS numerical trust", () => {
  it("pins an independently implemented test-only reference", () => {
    expect(SWIMMING_HEART_RATE_REFERENCE_VERSION).toBe(fixtures.referenceVersion);
    expect(calculateReferenceCss400m200m).not.toBe(evaluateCssFrom400m200mTest);
  });

  it.each([
    fixtures.css.canonical,
    fixtures.css.secondExample,
  ])("matches the manual example: $rationale", (fixture) => {
    const result = evaluateCssFrom400m200mTest(fixture.input);
    const reference = calculateReferenceCss400m200m(fixture.input);
    expect(result).toMatchObject({
      status: fixture.expected.status,
      calculationVersion: CSS_CALCULATION_VERSION,
      cssSecondsPer100m: fixture.expected.cssSecondsPer100m,
      cssMetersPerSecond: fixture.expected.cssMetersPerSecond,
    });
    if (result.status !== "available") throw new Error(fixture.rationale);
    if (reference.status !== "available")
      throw new Error(`Reference rejected: ${fixture.rationale}`);
    expect(result.cssSecondsPer100m).toBe(reference.cssSecondsPer100m);
    expect(result.cssMetersPerSecond).toBe(reference.cssMetersPerSecond);
    expect(result.efforts).toEqual(reference.efforts);
    expect(result.efforts).toEqual(calculateCssFrom400m200mTest(fixture.input).efforts);
  });

  it.each(
    fixtures.css.unavailable,
  )("abstains for incomplete/invalid input: $rationale", (fixture) => {
    expect(calculateReferenceCss400m200m(fixture.input)).toEqual({ status: "unavailable" });
    expect(evaluateCssFrom400m200mTest(fixture.input)).toEqual({
      status: "unavailable",
      calculationVersion: fixtures.cssCalculationVersion,
      protocol: "css_400m_200m",
      cssSecondsPer100m: null,
      cssMetersPerSecond: null,
      efforts: null,
      reason: "invalid_protocol",
    });
  });
});

describe("Phase 5 swim active/rest timing and threshold Load", () => {
  it("separates explicit active and rest lengths without using rest as threshold duration", () => {
    const fixture = fixtures.swimTiming.complete;
    const result = calculateSwimTiming({
      elapsedDurationSeconds: fixture.elapsedDurationSeconds,
      expectedActiveLengthCount: fixture.expectedActiveLengthCount,
      lengths: fixture.lengths,
    });
    expect(result).toMatchObject({
      ...fixture.expected,
      calculationVersion: fixtures.swimTimingCalculationVersion,
    });
    expect(result).toMatchObject(
      calculateReferenceSwimTiming({
        elapsedDurationSeconds: fixture.elapsedDurationSeconds,
        expectedActiveLengthCount: fixture.expectedActiveLengthCount,
        lengths: fixture.lengths,
      }),
    );

    const reordered = fixtures.swimTiming.reordered;
    expect(
      calculateSwimTiming({
        elapsedDurationSeconds: reordered.elapsedDurationSeconds,
        expectedActiveLengthCount: reordered.expectedActiveLengthCount,
        lengths: reordered.lengths,
      }),
    ).toEqual(result);
  });

  it("preserves known partial timing and rejects impossible totals", () => {
    const partial = fixtures.swimTiming.partial;
    const partialResult = calculateSwimTiming({
      elapsedDurationSeconds: partial.elapsedDurationSeconds,
      expectedActiveLengthCount: partial.expectedActiveLengthCount,
      lengths: partial.lengths,
    });
    expect(partialResult).toMatchObject(partial.expected);
    expect(partialResult).toMatchObject(
      calculateReferenceSwimTiming({
        elapsedDurationSeconds: partial.elapsedDurationSeconds,
        expectedActiveLengthCount: partial.expectedActiveLengthCount,
        lengths: partial.lengths,
      }),
    );

    const invalid = fixtures.swimTiming.invalidOverflow;
    const invalidResult = calculateSwimTiming({
      elapsedDurationSeconds: invalid.elapsedDurationSeconds,
      lengths: invalid.lengths,
    });
    expect(invalidResult).toMatchObject(invalid.expected);
    expect(invalidResult).toMatchObject(
      calculateReferenceSwimTiming({
        elapsedDurationSeconds: invalid.elapsedDurationSeconds,
        lengths: invalid.lengths,
      }),
    );
  });

  it("anchors one active hour at CSS to intensity 1 and 100 Common Load", () => {
    const fixture = fixtures.swimTiming.thresholdHour;
    const finishedAt = new Date(Date.parse(STARTED_AT) + fixture.elapsedDurationSeconds * 1_000);
    const result = analyzeActivityDerivedMetrics({
      activity: {
        id: "phase5-swim-threshold-hour",
        type: "swim",
        started_at: STARTED_AT,
        finished_at: finishedAt.toISOString(),
        elapsed_seconds: fixture.elapsedDurationSeconds,
        duration_seconds: fixture.activeDurationSeconds,
        moving_seconds: fixture.activeDurationSeconds,
        timing_coverage: "complete",
        distance_meters: fixture.distanceMeters,
        avg_speed_mps: fixture.distanceMeters / fixture.activeDurationSeconds,
        normalized_speed_mps: fixture.distanceMeters / fixture.activeDurationSeconds,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          swimmingCssSecondsPer100m: 100 / fixture.expected.thresholdSpeedMetersPerSecond,
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
    }).stress.common_load;

    expect(result).toMatchObject({
      status: "available",
      method: "swim_pace_threshold",
      load: fixture.expected.commonLoad,
      intensity: fixture.expected.intensity,
      contributingDurationSeconds: fixture.activeDurationSeconds,
    });
  });

  it("does not promote partial swim timing to complete threshold Load", () => {
    const result = analyzeActivityDerivedMetrics({
      activity: {
        id: "phase5-partial-swim-timing",
        type: "swim",
        started_at: STARTED_AT,
        finished_at: "2026-07-31T10:02:00.000Z",
        elapsed_seconds: 120,
        duration_seconds: 60,
        moving_seconds: 60,
        timing_coverage: "partial",
        normalized_speed_mps: 1,
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          swimmingCssSecondsPer100m: 100,
        }),
        recentEfforts: [],
        profile: {},
      },
    }).stress.common_load;

    expect(result).toMatchObject({
      status: "partial",
      reason: "duration_partial",
      load: 100 / 60,
      intensity: 1,
      sourceTimeCoverage: 1,
    });
  });
});
