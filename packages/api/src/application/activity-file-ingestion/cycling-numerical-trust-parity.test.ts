import {
  analyzeActivityDerivedMetrics,
  type CommonLoadResult,
  getNormalizedIntensity,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { selectCyclingNormalizedPowerWatts } from "@repo/core/calculations";
import { calculateProvisionalRecordingMetrics } from "@repo/core/recording-metrics";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/cycling-numerical-trust";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it } from "vitest";
import { buildCompletedSegmentAnalysisActivity } from "../../lib/activity-analysis/derived";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedMetrics,
} from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const STARTED_AT = new Date("2026-07-31T10:00:00.000Z");
const THRESHOLD_POWER_WATTS = 200;
const DISTANCE_METERS_PER_SECOND = 10;
const ACTIVITY_ID = "11111111-1111-4111-8111-111111111111";
const SEGMENT_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";

type FixturePowerSample = {
  readonly timestampSeconds: number;
  readonly powerWatts: number | null;
  readonly included?: boolean;
};

type NumericFixtureVector = {
  readonly samples: readonly FixturePowerSample[];
  readonly expected: {
    readonly status: "available" | "partial";
    readonly normalizedPowerWatts: number;
    readonly diagnostics: {
      readonly contributingDurationSeconds: number;
      readonly normalizedDurationSeconds: number;
      readonly excludedGapDurationSeconds?: number;
      readonly excludedInactiveDurationSeconds?: number;
      readonly excludedMissingDurationSeconds?: number;
      readonly duplicateTimestampCount?: number;
      readonly reversedTimestampCount?: number;
    };
  };
};

const PARITY_CASES: readonly { name: string; vector: NumericFixtureVector }[] = [
  { name: "complete", vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.constant },
  { name: "gap", vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.overMaximumGap },
  { name: "pause", vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.paused },
  { name: "missing", vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.missing },
  { name: "valid zero", vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.zeroCoasting },
  {
    name: "duplicate and reversed",
    vector: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.timestampOrdering,
  },
];

function materializeSource(samples: readonly FixturePowerSample[]) {
  let firstAcceptedTimestamp: number | null = null;
  let previousAcceptedTimestamp: number | null = null;
  let activeSeconds = 0;
  let distanceMeters = 0;
  const materialized = samples.map((sample) => {
    if (previousAcceptedTimestamp === null || sample.timestampSeconds > previousAcceptedTimestamp) {
      if (firstAcceptedTimestamp === null) firstAcceptedTimestamp = sample.timestampSeconds;
      if (previousAcceptedTimestamp !== null) {
        const intervalSeconds = sample.timestampSeconds - previousAcceptedTimestamp;
        if (sample.included !== false) {
          activeSeconds += intervalSeconds;
          distanceMeters += intervalSeconds * DISTANCE_METERS_PER_SECOND;
        }
      }
      previousAcceptedTimestamp = sample.timestampSeconds;
    }
    return { ...sample, distanceMeters };
  });
  if (firstAcceptedTimestamp === null || previousAcceptedTimestamp === null) {
    throw new Error("Parity vectors require at least one accepted timestamp");
  }
  return {
    samples: materialized,
    elapsedSeconds: previousAcceptedTimestamp - firstAcceptedTimestamp,
    activeSeconds,
    distanceMeters,
  };
}

function performanceTargets(asOf: string) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    bikeThresholdWatts: THRESHOLD_POWER_WATTS,
    calculationVersion: "cycling-numerical-trust-threshold-v1",
  });
}

function commonLoadCoverage(result: CommonLoadResult, eligibleDurationSeconds: number) {
  if (result.status === "unavailable") return null;
  return result.status === "partial"
    ? result.sourceTimeCoverage
    : result.contributingDurationSeconds / eligibleDurationSeconds;
}

describe("cycling numerical trust import/live parity", () => {
  it.each(
    PARITY_CASES,
  )("keeps $name source semantics aligned without collapsing final and provisional authority", ({
    name,
    vector,
  }) => {
    const source = materializeSource(vector.samples);
    const finishedAt = new Date(STARTED_AT.getTime() + source.elapsedSeconds * 1_000);
    const records = source.samples.map((sample) => ({
      timestamp: new Date(STARTED_AT.getTime() + sample.timestampSeconds * 1_000),
      ...(sample.powerWatts === null ? {} : { power: sample.powerWatts }),
    }));
    const metadata = collectActivityFileStreamMetadata(records);
    const importMetrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "bike",
      distance: source.distanceMeters,
      duration: source.elapsedSeconds,
      activeDuration: source.activeSeconds,
      movingDuration: source.activeSeconds,
      includedTimeline: source.samples.map((sample) => sample.included !== false),
      streamMetadata: metadata,
    });
    const persistedSummary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: {
          timingCoverage: "complete",
          activeMs: source.activeSeconds * 1_000,
          movingMs: source.activeSeconds * 1_000,
        },
        distanceMeters: source.distanceMeters,
        normalizedPowerResult: importMetrics.normalizedPowerResult,
      },
      metrics: importMetrics,
    });
    const persistedSegment = {
      id: SEGMENT_ID,
      activity_id: ACTIVITY_ID,
      ordinal: 0,
      role: "activity" as const,
      activity_category: "bike" as const,
      start_offset_ms: 0,
      end_offset_ms: source.elapsedSeconds * 1_000,
      timing_coverage: "complete" as const,
      active_ms: source.activeSeconds * 1_000,
      moving_ms: source.activeSeconds * 1_000,
      summary: persistedSummary,
    };
    const finalAnalysisActivity = buildCompletedSegmentAnalysisActivity({
      activityStartedAt: STARTED_AT,
      segment: persistedSegment,
      summary: persistedSummary,
    });
    const derivedCommonLoad = analyzeActivityDerivedMetrics({
      activity: finalAnalysisActivity,
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          asOf: finishedAt.toISOString(),
          bikeThresholdWatts: THRESHOLD_POWER_WATTS,
          calculationVersion: "cycling-numerical-trust-threshold-v1",
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
    }).stress.common_load;
    if (!("activity_category" in derivedCommonLoad)) {
      throw new Error("A single imported segment must produce activity-level Common Load");
    }
    const finalCommonLoad = derivedCommonLoad;
    const finalObservation = quantifyCompletedActivityObservation({
      activityCategory: "bike",
      source: {
        activityId: ACTIVITY_ID,
        segmentId: SEGMENT_ID,
        provider: null,
        externalId: null,
        artifactId: ARTIFACT_ID,
        capability: "activity_file",
        parserVersion: "cycling-numerical-trust-import-v1",
        decodedContractVersion: "cycling-numerical-trust-decoded-v1",
        materializerVersion: "cycling-numerical-trust-materializer-v1",
        segmentsRevision: 1,
        segmentRevision: 1,
        summaryVersion: 1,
        sourceSessionIndex: 0,
        sourceMessageIndex: null,
        rawType: null,
        rawSport: "cycling",
        rawSubSport: null,
      },
      timing: {
        coverage: "complete",
        source: "activity_file",
        basis: "session_timing",
        startedAt: STARTED_AT.toISOString(),
        finishedAt: finishedAt.toISOString(),
        elapsedSeconds: source.elapsedSeconds,
        activeSeconds: source.activeSeconds,
        movingSeconds: source.activeSeconds,
      },
      distance: {
        meters: source.distanceMeters,
        source: "activity_file",
        basis: "session_summary",
      },
      intensity: {
        averageHeartRateBpm: null,
        averagePowerWatts: null,
        averageSpeedMetersPerSecond: null,
        normalizedSpeedMetersPerSecond: null,
      },
      commonLoad: finalCommonLoad,
    });
    const live = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "bike",
        performanceTargets: performanceTargets(finishedAt.toISOString()),
        recordingSessionId: `cycling-numerical-trust-${name.replaceAll(" ", "-")}`,
      },
      samples: source.samples.map((sample) => ({
        timestampMs: STARTED_AT.getTime() + sample.timestampSeconds * 1_000,
        moving: sample.included !== false,
        powerWatts: sample.powerWatts,
        distanceMeters: sample.distanceMeters,
      })),
    });

    const expectedContributingDuration = vector.expected.diagnostics.contributingDurationSeconds;
    const expectedCoverage = expectedContributingDuration / source.activeSeconds;
    const expectedIntensity = vector.expected.normalizedPowerWatts / THRESHOLD_POWER_WATTS;
    const expectedLoad = (expectedContributingDuration / 3_600) * expectedIntensity ** 2 * 100;
    const expectedFinalStatus = vector.expected.status === "partial" ? "partial" : "available";

    expect(importMetrics.normalizedPowerResult).toMatchObject({
      status: vector.expected.status,
      valueWatts: vector.expected.normalizedPowerWatts,
      diagnostics: vector.expected.diagnostics,
    });
    expect(live.normalizedPowerResult).toMatchObject({
      status: vector.expected.status,
      valueWatts: vector.expected.normalizedPowerWatts,
      diagnostics: vector.expected.diagnostics,
    });
    expect(importMetrics.normalizedPowerResult.diagnostics.sourceTimeCoverage).toBeCloseTo(
      expectedCoverage,
      12,
    );
    expect(live.normalizedPowerResult.diagnostics.sourceTimeCoverage).toBeCloseTo(
      expectedCoverage,
      12,
    );
    expect(selectCyclingNormalizedPowerWatts(importMetrics.normalizedPowerResult)).toBeCloseTo(
      vector.expected.normalizedPowerWatts,
      10,
    );
    expect(selectCyclingNormalizedPowerWatts(live.normalizedPowerResult)).toBeCloseTo(
      vector.expected.normalizedPowerWatts,
      10,
    );
    expect(persistedSummary).toMatchObject({
      normalizedPowerResult: {
        status: vector.expected.status,
        diagnostics: {
          contributingDurationSeconds: expectedContributingDuration,
          sourceTimeCoverage: expectedCoverage,
        },
      },
    });

    expect(finalObservation).toMatchObject({
      kind: "observation",
      stage: "final",
      duration: {
        elapsed: { status: "available", value: source.elapsedSeconds },
        active: { status: "available", value: source.activeSeconds },
        moving: { status: "available", value: source.activeSeconds },
      },
      distance: { status: "available", value: source.distanceMeters },
      commonLoad: { status: expectedFinalStatus },
    });
    expect(finalObservation).not.toHaveProperty("authority");
    expect(live).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      observations: {
        duration: {
          value: {
            elapsed: { status: "available", value: source.elapsedSeconds },
            active: { status: "available", value: source.activeSeconds },
            moving: { status: "available", value: source.activeSeconds },
          },
        },
        distance: { value: { status: "available", value: source.distanceMeters } },
      },
      commonLoad: { status: "partial" },
    });

    expect(getNormalizedIntensity(finalCommonLoad)).toBeCloseTo(expectedIntensity, 12);
    expect(getNormalizedIntensity(live.commonLoad)).toBeCloseTo(expectedIntensity, 12);
    expect(commonLoadCoverage(finalCommonLoad, source.activeSeconds)).toBeCloseTo(
      expectedCoverage,
      12,
    );
    expect(commonLoadCoverage(live.commonLoad, source.activeSeconds)).toBeCloseTo(
      expectedCoverage,
      12,
    );
    if (finalCommonLoad.status === "unavailable" || finalCommonLoad.load === null) {
      throw new Error(`Expected numeric final Common Load for ${name}`);
    }
    if (live.commonLoad.status !== "partial" || live.commonLoad.load === null) {
      throw new Error(`Expected numeric provisional Common Load for ${name}`);
    }
    expect(finalCommonLoad.load).toBeCloseTo(expectedLoad, 10);
    expect(live.commonLoad.load).toBeCloseTo(expectedLoad, 10);
    expect(finalCommonLoad.contributingDurationSeconds).toBe(expectedContributingDuration);
    expect(live.commonLoad.contributingDurationSeconds).toBe(expectedContributingDuration);
    if (vector.expected.status === "partial") {
      expect(finalCommonLoad.status).toBe("partial");
    } else {
      expect(finalCommonLoad.status).toBe("available");
    }
  });
});
