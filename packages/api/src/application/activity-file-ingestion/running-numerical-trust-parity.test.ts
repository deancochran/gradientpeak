import {
  analyzeActivityDerivedMetrics,
  type CommonLoadResult,
  getNormalizedIntensity,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { selectRunningNormalizedGradedSpeedMetersPerSecond } from "@repo/core/calculations";
import { calculateProvisionalRecordingMetrics } from "@repo/core/recording-metrics";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import {
  type ReferenceRunningNgpSample,
  RUNNING_NUMERICAL_TRUST_FIXTURES_V1,
} from "@repo/core/testing/running-numerical-trust";
import { secondsPerKilometerToMetersPerSecond } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import { buildCompletedSegmentAnalysisActivity } from "../../lib/activity-analysis/derived";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedMetrics,
} from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const STARTED_AT = new Date("2026-07-31T10:00:00.000Z");
const ACTIVITY_ID = "11111111-1111-4111-8111-111111111111";
const SEGMENT_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";

type ParityVector =
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.paused
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.irregularParity
  | typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1.timestampOrdering;

const PARITY_CASES: readonly { name: string; vector: ParityVector }[] = [
  {
    name: "complete threshold hour",
    vector: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour,
  },
  { name: "known pause", vector: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.paused },
  { name: "missing elevation", vector: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation },
  { name: "irregular rate", vector: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.irregularParity },
  {
    name: "duplicate and reversed timestamps",
    vector: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.timestampOrdering,
  },
];

function materializeSource(samples: readonly ReferenceRunningNgpSample[]) {
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
          if (sample.speedMetersPerSecond !== null) {
            distanceMeters += intervalSeconds * sample.speedMetersPerSecond;
          }
        }
      }
      previousAcceptedTimestamp = sample.timestampSeconds;
    }
    return { ...sample, distanceMeters };
  });
  if (firstAcceptedTimestamp === null || previousAcceptedTimestamp === null) {
    throw new Error("Running parity vectors require accepted timestamps");
  }
  return {
    samples: materialized,
    elapsedSeconds: previousAcceptedTimestamp - firstAcceptedTimestamp,
    activeSeconds,
    distanceMeters,
  };
}

function performanceTargets(asOf: string, thresholdPaceSecondsPerKm: number) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    runThresholdMetersPerSecond: secondsPerKilometerToMetersPerSecond(thresholdPaceSecondsPerKm),
    calculationVersion: "running-numerical-trust-threshold-v1",
  });
}

function commonLoadCoverage(result: CommonLoadResult, eligibleDurationSeconds: number) {
  if (result.status === "unavailable") return null;
  return result.status === "partial"
    ? result.sourceTimeCoverage
    : result.contributingDurationSeconds / eligibleDurationSeconds;
}

describe("running numerical trust import/live parity", () => {
  it.each(
    PARITY_CASES,
  )("keeps $name NGP, observations, and Load aligned without collapsing authority", ({
    name,
    vector,
  }) => {
    const source = materializeSource(vector.samples);
    const finishedAt = new Date(STARTED_AT.getTime() + source.elapsedSeconds * 1_000);
    const records = source.samples.map((sample) => ({
      timestamp: new Date(STARTED_AT.getTime() + sample.timestampSeconds * 1_000),
      ...(sample.speedMetersPerSecond === null ? {} : { speed: sample.speedMetersPerSecond }),
      ...(sample.elevationMeters === null ? {} : { altitude: sample.elevationMeters }),
    }));
    const metadata = collectActivityFileStreamMetadata(records);
    const runInclusionTimeline = source.samples.map((sample) => sample.included !== false);
    const importMetrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: source.distanceMeters,
      duration: source.elapsedSeconds,
      activeDuration: source.activeSeconds,
      movingDuration: source.activeSeconds,
      includedTimeline: runInclusionTimeline,
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
      activity_category: "run" as const,
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
          runThresholdMetersPerSecond: secondsPerKilometerToMetersPerSecond(
            vector.thresholdPaceSecondsPerKm,
          ),
          calculationVersion: "running-numerical-trust-threshold-v1",
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
    }).stress.common_load;
    if (!("activity_category" in derivedCommonLoad)) {
      throw new Error("A single imported running segment must have activity Common Load");
    }
    const finalCommonLoad = derivedCommonLoad;
    const finalObservation = quantifyCompletedActivityObservation({
      activityCategory: "run",
      source: {
        activityId: ACTIVITY_ID,
        segmentId: SEGMENT_ID,
        provider: null,
        externalId: null,
        artifactId: ARTIFACT_ID,
        capability: "activity_file",
        parserVersion: "running-numerical-trust-import-v1",
        decodedContractVersion: "running-numerical-trust-decoded-v1",
        materializerVersion: "running-numerical-trust-materializer-v1",
        segmentsRevision: 1,
        segmentRevision: 1,
        summaryVersion: 1,
        sourceSessionIndex: 0,
        sourceMessageIndex: null,
        rawType: null,
        rawSport: "running",
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
        averageSpeedMetersPerSecond: source.distanceMeters / source.activeSeconds,
        normalizedSpeedMetersPerSecond: importMetrics.normalizedSpeed,
      },
      commonLoad: finalCommonLoad,
    });
    const live = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "run",
        performanceTargets: performanceTargets(
          finishedAt.toISOString(),
          vector.thresholdPaceSecondsPerKm,
        ),
        recordingSessionId: `running-numerical-trust-${name.replaceAll(" ", "-")}`,
      },
      samples: source.samples.map((sample) => ({
        timestampMs: STARTED_AT.getTime() + sample.timestampSeconds * 1_000,
        moving: sample.included !== false,
        speedMps: sample.speedMetersPerSecond,
        altitudeMeters: sample.elevationMeters,
        distanceMeters: sample.distanceMeters,
      })),
    });

    const expectedContributingDuration = vector.expected.diagnostics.contributingDurationSeconds;
    const expectedCoverage = expectedContributingDuration / source.activeSeconds;
    const expectedFinalStatus = vector.expected.status === "partial" ? "partial" : "available";

    expect(source).toMatchObject({
      elapsedSeconds: vector.expected.elapsedDurationSeconds,
      activeSeconds: vector.expected.activeDurationSeconds,
    });
    expect(Math.abs(source.distanceMeters - vector.expected.distanceMeters)).toBeLessThanOrEqual(
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.tolerances.distanceMeters,
    );
    expect(importMetrics.normalizedSpeedDurationBasis).toBe("moving");
    expect(importMetrics.normalizedSpeedDurationSeconds).toBe(source.activeSeconds);
    expect(importMetrics.normalizedGradedPaceResult).toMatchObject({
      status: vector.expected.status,
      calculationVersion: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: vector.expected.diagnostics,
    });
    expect(live.normalizedGradedPaceResult).toMatchObject({
      status: vector.expected.status,
      calculationVersion: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: vector.expected.diagnostics,
    });
    const importNormalizedGradedSpeed =
      importMetrics.normalizedGradedPaceResult === null
        ? null
        : selectRunningNormalizedGradedSpeedMetersPerSecond(
            importMetrics.normalizedGradedPaceResult,
          );
    const liveNormalizedGradedSpeed =
      live.normalizedGradedPaceResult === null
        ? null
        : selectRunningNormalizedGradedSpeedMetersPerSecond(live.normalizedGradedPaceResult);
    expect(importNormalizedGradedSpeed).not.toBeNull();
    expect(liveNormalizedGradedSpeed).not.toBeNull();
    if (importNormalizedGradedSpeed === null || liveNormalizedGradedSpeed === null) {
      throw new Error(`Expected numeric import/live NGP for ${name}`);
    }
    expect(
      Math.abs(importNormalizedGradedSpeed - vector.expected.normalizedGradedSpeedMetersPerSecond),
    ).toBeLessThanOrEqual(
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.tolerances.normalizedGradedSpeedMetersPerSecond,
    );
    expect(Math.abs(liveNormalizedGradedSpeed - importNormalizedGradedSpeed)).toBeLessThanOrEqual(
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.tolerances.normalizedGradedSpeedMetersPerSecond,
    );
    expect(persistedSummary).toMatchObject({
      normalizedGradedPaceResult: {
        status: vector.expected.status,
        diagnostics: vector.expected.diagnostics,
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

    expect(getNormalizedIntensity(finalCommonLoad)).toBeCloseTo(
      vector.expected.normalizedIntensity,
      12,
    );
    expect(getNormalizedIntensity(live.commonLoad)).toBeCloseTo(
      vector.expected.normalizedIntensity,
      12,
    );
    expect(commonLoadCoverage(finalCommonLoad, source.activeSeconds)).toBeCloseTo(
      expectedCoverage,
      12,
    );
    expect(commonLoadCoverage(live.commonLoad, source.activeSeconds)).toBeCloseTo(
      expectedCoverage,
      12,
    );
    if (finalCommonLoad.status === "unavailable" || finalCommonLoad.load === null) {
      throw new Error(`Expected numeric final running Common Load for ${name}`);
    }
    if (live.commonLoad.status !== "partial" || live.commonLoad.load === null) {
      throw new Error(`Expected numeric provisional running Common Load for ${name}`);
    }
    expect(finalCommonLoad.load).toBeCloseTo(vector.expected.commonLoad, 10);
    expect(live.commonLoad.load).toBeCloseTo(vector.expected.commonLoad, 10);
    expect(finalCommonLoad.contributingDurationSeconds).toBe(expectedContributingDuration);
    expect(live.commonLoad.contributingDurationSeconds).toBe(expectedContributingDuration);
  });
});
