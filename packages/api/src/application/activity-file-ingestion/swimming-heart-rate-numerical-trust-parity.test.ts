import { analyzeActivityDerivedMetrics } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { calculateProvisionalRecordingMetrics } from "@repo/core/recording-metrics";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "@repo/core/testing/swimming-heart-rate-numerical-trust";
import { describe, expect, it } from "vitest";

import { calculateActivityFileHeartRateEvidence } from "./heart-rate-evidence";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedMetrics,
} from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const STARTED_AT = new Date("2026-07-31T10:00:00.000Z");
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function performanceTargets(asOf: string) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    swimmingCssSecondsPer100m: fixtures.swimTiming.thresholdHour.cssSecondsPer100m,
    lthrBpm: {
      bike: fixtures.heartRate.lthrBpm,
      run: fixtures.heartRate.lthrBpm,
      swim: fixtures.heartRate.lthrBpm,
    },
    calculationVersion: "phase5-threshold-v1",
  });
}

const HR_PARITY_CASES = [
  { name: "irregular complete", fixture: fixtures.heartRate.irregularComplete },
  { name: "over-gap partial", fixture: fixtures.heartRate.overMaximumGap },
  { name: "known pause", fixture: fixtures.heartRate.paused },
  { name: "missing HR", fixture: fixtures.heartRate.missing },
  { name: "zero dropout", fixture: fixtures.heartRate.zeroDropout },
  { name: "timestamp anomalies", fixture: fixtures.heartRate.timestampOrdering },
  { name: "low coverage", fixture: fixtures.heartRate.lowCoverage },
  { name: "all missing", fixture: fixtures.heartRate.allMissing },
] as const;

describe("Phase 5 imported/live swimming and HR parity", () => {
  it.each(
    HR_PARITY_CASES,
  )("keeps $name HR interval evidence aligned without collapsing final/provisional authority", ({
    name,
    fixture,
  }) => {
    const records = fixture.samples.map((sample) => ({
      timestamp: new Date(STARTED_AT.getTime() + sample.timestampSeconds * 1_000),
      ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
    }));
    const includedTimeline = fixture.samples.map(
      (sample) => !("included" in sample) || sample.included !== false,
    );
    const importedEvidence = calculateActivityFileHeartRateEvidence({
      samples: collectActivityFileStreamMetadata(records).samples,
      includedTimeline,
      maxGapSeconds: fixtures.heartRate.maxGapSeconds,
    });
    const finishedAt = new Date(
      STARTED_AT.getTime() + importedEvidence.diagnostics.observedSpanSeconds * 1_000,
    );
    const final = analyzeActivityDerivedMetrics({
      activity: {
        id: `phase5-hr-${name.replaceAll(" ", "-")}`,
        type: "run",
        started_at: STARTED_AT.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_seconds: importedEvidence.eligibleDurationSeconds,
        moving_seconds: importedEvidence.eligibleDurationSeconds,
        timing_coverage: "complete",
        normalized_power_result: unavailableNormalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: performanceTargets(finishedAt.toISOString()),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
      heartRateDistribution: importedEvidence,
    }).stress.common_load;
    const live = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "run",
        performanceTargets: performanceTargets(finishedAt.toISOString()),
        recordingSessionId: `phase5-hr-live-${name.replaceAll(" ", "-")}`,
        preferredCommonLoadMethods: ["heart_rate_zones"],
        maxGapSeconds: fixtures.heartRate.maxGapSeconds,
      },
      samples: fixture.samples.map((sample) => ({
        timestampMs: STARTED_AT.getTime() + sample.timestampSeconds * 1_000,
        moving: !("included" in sample) || sample.included !== false,
        heartRateBpm: sample.heartRateBpm,
      })),
    });

    expect(live).toMatchObject({ stage: "provisional", authority: "live_recording_only" });
    expect(live.heartRateEvidence).toEqual(importedEvidence);
    expect(live.heartRateZoneDuration.status).toBe(
      importedEvidence.status === "unavailable" ? "unavailable" : importedEvidence.status,
    );
    expect(live.commonLoad.status === "available").toBe(false);

    if (!("activity_category" in final)) {
      throw new Error("Phase 5 parity requires an activity-level Common Load result");
    }

    if (final.status === "available" || final.status === "partial") {
      expect(live.commonLoad.status).toBe("partial");
      if (live.commonLoad.status !== "partial") throw new Error(fixture.rationale);
      expect(live.commonLoad.load).toBeCloseTo(final.load ?? Number.NaN, 12);
      expect(live.commonLoad.intensity).toBeCloseTo(final.intensity ?? Number.NaN, 12);
      expect(live.commonLoad.contributingDurationSeconds).toBe(final.contributingDurationSeconds);
    } else {
      expect(live.commonLoad).toMatchObject({ status: "unavailable", reason: final.reason });
    }
  });

  it("keeps active-only CSS Load numeric while final analysis remains authoritative", () => {
    const fixture = fixtures.swimTiming.thresholdHour;
    const finishedAt = new Date(STARTED_AT.getTime() + fixture.elapsedDurationSeconds * 1_000);
    const activeRecords = Array.from(
      { length: fixture.activeDurationSeconds + 1 },
      (_, second) => ({
        timestamp: new Date(STARTED_AT.getTime() + second * 1_000),
        speed: fixture.expected.thresholdSpeedMetersPerSecond,
      }),
    );
    const metadata = collectActivityFileStreamMetadata(activeRecords);
    const importedMetrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "swim",
      distance: fixture.distanceMeters,
      duration: fixture.elapsedDurationSeconds,
      activeDuration: fixture.activeDurationSeconds,
      movingDuration: fixture.activeDurationSeconds,
      streamMetadata: metadata,
    });
    const persistedSummary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: {
          timingCoverage: "complete",
          activeMs: fixture.activeDurationSeconds * 1_000,
          movingMs: fixture.activeDurationSeconds * 1_000,
        },
        distanceMeters: fixture.distanceMeters,
        averageSpeedMetersPerSecond: fixture.expected.thresholdSpeedMetersPerSecond,
        normalizedPowerResult: importedMetrics.normalizedPowerResult,
      },
      metrics: importedMetrics,
    });
    const averageSpeedMetersPerSecond = persistedSummary.averageSpeedMetersPerSecond;
    const normalizedSpeedMetersPerSecond = persistedSummary.normalizedSpeedMetersPerSecond;
    if (
      typeof averageSpeedMetersPerSecond !== "number" ||
      typeof normalizedSpeedMetersPerSecond !== "number"
    ) {
      throw new Error("Phase 5 swim parity requires persisted speed evidence");
    }
    const final = analyzeActivityDerivedMetrics({
      activity: {
        id: "phase5-swim-final",
        type: "swim",
        started_at: STARTED_AT.toISOString(),
        finished_at: finishedAt.toISOString(),
        elapsed_seconds: fixture.elapsedDurationSeconds,
        duration_seconds: fixture.activeDurationSeconds,
        moving_seconds: fixture.activeDurationSeconds,
        timing_coverage: "complete",
        distance_meters: fixture.distanceMeters,
        avg_speed_mps: averageSpeedMetersPerSecond,
        normalized_speed_mps: normalizedSpeedMetersPerSecond,
        normalized_power_result: persistedSummary.normalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: performanceTargets(finishedAt.toISOString()),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
    }).stress.common_load;
    const liveSamples = [
      ...Array.from({ length: fixture.activeDurationSeconds + 1 }, (_, second) => ({
        timestampMs: STARTED_AT.getTime() + second * 1_000,
        moving: true,
        distanceMeters: second,
      })),
      {
        timestampMs: finishedAt.getTime(),
        moving: false,
        distanceMeters: fixture.distanceMeters,
      },
    ];
    const live = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "swim",
        performanceTargets: performanceTargets(finishedAt.toISOString()),
        recordingSessionId: "phase5-swim-live",
      },
      samples: liveSamples,
    });

    expect(final).toMatchObject({ status: "available", load: 100, intensity: 1 });
    expect(live.commonLoad).toMatchObject({
      status: "partial",
      method: "swim_pace_threshold",
      load: 100,
      intensity: 1,
      contributingDurationSeconds: fixture.activeDurationSeconds,
      eligibleDurationSeconds: fixture.activeDurationSeconds,
      sourceTimeCoverage: 1,
    });
    expect(live).toMatchObject({ stage: "provisional", authority: "live_recording_only" });
  });
});
