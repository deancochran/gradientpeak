import {
  calculateProvisionalRecordingMetrics as calculateFromRoot,
  provisionalRecordingMetricsSnapshotSchema as schemaFromRoot,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/running-numerical-trust-v1";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import { selectRunningNormalizedGradedSpeedMetersPerSecond } from "../../calculations/normalized-graded-pace";
import { selectCyclingNormalizedPowerWatts } from "../../calculations/normalized-power";
import { getNormalizedIntensity } from "../../load";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "../../performance-model";
import {
  calculateProvisionalRecordingMetrics,
  createProvisionalRecordingMetricsAccumulator,
  type RecordingMetricSample,
  type RecordingMetricsConfig,
} from "../accumulator";
import { provisionalRecordingMetricsSnapshotSchema } from "../contracts";

const STARTED_AT = "2026-07-31T10:00:00.000Z";
const STARTED_AT_MS = Date.parse(STARTED_AT);

function performanceTargets(options: {
  planningThresholdPowerWatts?: number;
  bikeLthrBpm?: number;
  runLthrBpm?: number;
  planningThresholdPaceSecondsPerKm?: number;
  swimmingCssSecondsPer100m?: number;
}): AthletePerformanceTargetFacts {
  const unavailable = createUnavailableAthletePerformanceTargetFacts(STARTED_AT);
  const target = <T extends { value: number | null }>(
    fact: T,
    value: number | undefined,
    evidenceId: string,
  ) =>
    value === undefined
      ? fact
      : {
          ...fact,
          status: "available" as const,
          value,
          calculationVersion: "recording-metrics-test-v1",
          sourceEvidenceIds: [evidenceId],
          evidenceTime: {
            observedFrom: "2026-07-30T10:00:00.000Z",
            observedThrough: "2026-07-30T10:00:00.000Z",
            computedAt: STARTED_AT,
          },
          confidence: "high" as const,
          expiresAt: "2026-10-29T10:00:00.000Z",
          reasons: [],
        };
  const lthr = (activityCategory: "bike" | "run", valueBpm: number | undefined) =>
    valueBpm === undefined
      ? unavailable.heartRate[activityCategory].lthr
      : {
          ...unavailable.heartRate[activityCategory].lthr,
          status: "available" as const,
          valueBpm,
          observedAt: "2026-07-30T10:00:00.000Z",
          expiresAt: "2026-10-28T10:00:00.000Z",
          sourceEvidenceId: `${activityCategory}-lthr`,
          sourceActivityId: `${activityCategory}-activity`,
          source: "activity_file" as const,
          method: "activity_file_lthr_detection" as const,
          calculationVersion: "activity-file-lthr-v1" as const,
          reason: null,
        };
  return athletePerformanceTargetFactsSchema.parse({
    ...unavailable,
    cycling: {
      planningThresholdPower: target(
        unavailable.cycling.planningThresholdPower,
        options.planningThresholdPowerWatts,
        "cycling-planning-threshold-power",
      ),
    },
    running: {
      planningThresholdPace: target(
        unavailable.running.planningThresholdPace,
        options.planningThresholdPaceSecondsPerKm,
        "running-planning-threshold-pace",
      ),
    },
    swimming: {
      css: target(unavailable.swimming.css, options.swimmingCssSecondsPer100m, "swimming-css"),
    },
    heartRate: {
      ...unavailable.heartRate,
      bike: { ...unavailable.heartRate.bike, lthr: lthr("bike", options.bikeLthrBpm) },
      run: { ...unavailable.heartRate.run, lthr: lthr("run", options.runLthrBpm) },
    },
  });
}

function constantSamples(input: {
  seconds: number;
  powerWatts?: number | null;
  heartRateBpm?: number | null;
  speedMps?: number | null;
  distanceMetersPerSecond?: number;
  altitudeMeters?: number;
}): RecordingMetricSample[] {
  return Array.from({ length: input.seconds + 1 }, (_, second) => ({
    timestampMs: STARTED_AT_MS + second * 1000,
    powerWatts: input.powerWatts,
    heartRateBpm: input.heartRateBpm,
    speedMps: input.speedMps,
    distanceMeters:
      input.distanceMetersPerSecond === undefined
        ? undefined
        : input.distanceMetersPerSecond * second,
    altitudeMeters: input.altitudeMeters,
  }));
}

function bikeConfig(performanceTargets: AthletePerformanceTargetFacts): RecordingMetricsConfig {
  return {
    activityCategory: "bike",
    performanceTargets,
    recordingSessionId: "recording-session-1",
  };
}

describe("provisional recording metrics accumulator", () => {
  it("exports the provisional contract and calculator without compatibility aliases", () => {
    expect(calculateFromRoot).toBe(calculateProvisionalRecordingMetrics);
    expect(schemaFromRoot).toBe(provisionalRecordingMetricsSnapshotSchema);
  });

  it("returns explicit provisional, non-authoritative empty and one-sample observations", () => {
    const empty = calculateProvisionalRecordingMetrics({ samples: [] });
    expect(empty).toMatchObject({
      schemaVersion: 1,
      stage: "provisional",
      authority: "live_recording_only",
      commonLoad: { status: "unavailable", reason: "duration_missing" },
      normalizedPowerResult: { status: "unavailable", valueWatts: null, reason: "no_samples" },
      sampleCount: 0,
    });
    expect(empty.observations.duration.value.elapsed).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "not_observed",
    });
    expect(empty.observations.distance.value).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "not_observed",
    });

    const one = calculateProvisionalRecordingMetrics({
      samples: [{ timestampMs: STARTED_AT_MS, powerWatts: 250, distanceMeters: 0 }],
    });
    expect(one.observations.duration.value).toMatchObject({
      elapsed: { status: "available", value: 0 },
      moving: { status: "available", value: 0 },
    });
    expect(one.observations.distance.value).toMatchObject({ status: "available", value: 0 });
  });

  it("keeps recording observations available when provisional Common Load is unavailable", () => {
    const snapshot = calculateProvisionalRecordingMetrics({
      config: bikeConfig(createUnavailableAthletePerformanceTargetFacts(STARTED_AT)),
      samples: constantSamples({
        seconds: 60,
        powerWatts: 250,
        distanceMetersPerSecond: 8,
      }),
    });

    expect(snapshot.commonLoad).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
      reason: "threshold_missing",
    });
    expect(getNormalizedIntensity(snapshot.commonLoad)).toBeNull();
    expect(snapshot.observations.duration.value.moving).toMatchObject({
      status: "available",
      value: 60,
    });
    expect(snapshot.observations.distance.value).toMatchObject({
      status: "available",
      value: 480,
    });
  });

  it("emits one-hour threshold work only as provisional Common Load", () => {
    const snapshot = calculateProvisionalRecordingMetrics({
      config: bikeConfig(performanceTargets({ planningThresholdPowerWatts: 250 })),
      samples: constantSamples({ seconds: 3600, powerWatts: 250 }),
    });

    expect(snapshot.averagePowerWatts).toBeCloseTo(250, 8);
    expect(selectCyclingNormalizedPowerWatts(snapshot.normalizedPowerResult)).toBeCloseTo(250, 8);
    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      method: "power_threshold",
      load: 100,
      intensity: 1,
      contributingDurationSeconds: 3600,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 1,
      reason: "duration_partial",
    });
    expect(getNormalizedIntensity(snapshot.commonLoad)).toBe(1);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /trainingStressScore|intensityFactor|powerTrainingStressScore|heartRateTrainingStressScore|"tss"/i,
    );
  });

  it("excludes explicitly paused rest from cycling NP duration and provisional Common Load", () => {
    const samples = constantSamples({ seconds: 3_600, powerWatts: 250 }).map((sample, second) => ({
      ...sample,
      moving: second <= 1_800,
    }));
    const snapshot = calculateProvisionalRecordingMetrics({
      config: bikeConfig(performanceTargets({ planningThresholdPowerWatts: 250 })),
      samples,
    });

    expect(snapshot.observations.duration.value).toMatchObject({
      elapsed: { status: "available", value: 3_600 },
      active: { status: "available", value: 1_800 },
      moving: { status: "available", value: 1_800 },
    });
    expect(selectCyclingNormalizedPowerWatts(snapshot.normalizedPowerResult)).toBe(250);
    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      load: 50,
      intensity: 1,
      contributingDurationSeconds: 1_800,
      eligibleDurationSeconds: 1_800,
      sourceTimeCoverage: 1,
    });
  });

  it("retains partial source coverage without projecting across missing power", () => {
    const samples = constantSamples({ seconds: 3600, powerWatts: 250 }).map((sample) =>
      sample.timestampMs > STARTED_AT_MS + 2880 * 1000 ? { ...sample, powerWatts: null } : sample,
    );
    const snapshot = calculateProvisionalRecordingMetrics({
      config: bikeConfig(performanceTargets({ planningThresholdPowerWatts: 250 })),
      samples,
    });

    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      method: "power_threshold",
      load: 80,
      intensity: 1,
      contributingDurationSeconds: 2880,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 0.8,
    });
    expect(snapshot.normalizedPowerResult).toMatchObject({
      status: "partial",
      valueWatts: 250,
      reason: "source_incomplete",
      diagnostics: { excludedMissingDurationSeconds: 720 },
    });
  });

  it("falls back from low-coverage power to covered heart-rate Common Load", () => {
    const samples = constantSamples({ seconds: 3600, powerWatts: 250, heartRateBpm: 170 }).map(
      (sample) =>
        sample.timestampMs > STARTED_AT_MS + 1800 * 1000 ? { ...sample, powerWatts: null } : sample,
    );
    const snapshot = calculateProvisionalRecordingMetrics({
      config: bikeConfig(
        performanceTargets({ planningThresholdPowerWatts: 250, bikeLthrBpm: 170 }),
      ),
      samples,
    });

    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      load: 100,
      intensity: 1,
      sourceTimeCoverage: 1,
    });
    expect(snapshot.heartRateEvidence).toMatchObject({
      status: "available",
      coverageSeconds: 3_600,
      eligibleDurationSeconds: 3_600,
    });
    expect(snapshot.heartRateZoneDuration).toMatchObject({
      status: "available",
      zoneSeconds: [0, 0, 0, 0, 3_600],
    });
  });

  it("keeps low-quality and missing live HR evidence explicitly unavailable", () => {
    const fixture = SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lowCoverage;
    const lowCoverage = calculateProvisionalRecordingMetrics({
      config: {
        ...bikeConfig(performanceTargets({ bikeLthrBpm: 160 })),
        preferredCommonLoadMethods: ["heart_rate_zones"],
      },
      samples: fixture.samples.map((sample) => ({
        timestampMs: STARTED_AT_MS + sample.timestampSeconds * 1_000,
        heartRateBpm: sample.heartRateBpm,
        moving: !("included" in sample) || sample.included !== false,
      })),
    });
    expect(lowCoverage.heartRateEvidence).toMatchObject(fixture.expected);
    expect(lowCoverage.commonLoad).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      reason: "insufficient_coverage",
      sourceTimeCoverage: fixture.expected.sourceTimeCoverage,
    });

    const missing = calculateProvisionalRecordingMetrics({
      config: {
        ...bikeConfig(performanceTargets({ bikeLthrBpm: 160 })),
        preferredCommonLoadMethods: ["heart_rate_zones"],
      },
      samples: SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.allMissing.samples.map(
        (sample) => ({
          timestampMs: STARTED_AT_MS + sample.timestampSeconds * 1_000,
          heartRateBpm: sample.heartRateBpm,
        }),
      ),
    });
    expect(missing.heartRateEvidence).toMatchObject({
      status: "unavailable",
      reason: "no_contributing_intervals",
    });
    expect(missing.heartRateZoneDuration).toMatchObject({
      status: "unavailable",
      reason: "heart_rate_unavailable",
      zoneSeconds: null,
    });
    expect(missing.commonLoad).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      reason: "activity_data_missing",
    });
  });

  it("adapts run threshold pace into provisional Common Load", () => {
    const thresholdPaceSecondsPerKm = 300;
    const thresholdSpeedMps = 1000 / thresholdPaceSecondsPerKm;
    const snapshot = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "run",
        performanceTargets: performanceTargets({
          planningThresholdPaceSecondsPerKm: thresholdPaceSecondsPerKm,
        }),
        recordingSessionId: "run-session",
      },
      samples: constantSamples({
        seconds: 3600,
        speedMps: thresholdSpeedMps,
        distanceMetersPerSecond: thresholdSpeedMps,
        altitudeMeters: 100,
      }),
    });

    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      method: "run_pace_threshold",
    });
    expect(snapshot.normalizedGradedPaceResult).toMatchObject({
      status: "available",
      calculationVersion: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: { contributingDurationSeconds: 3600 },
    });
    if (snapshot.normalizedGradedPaceResult === null) throw new Error("Expected running NGP");
    expect(
      selectRunningNormalizedGradedSpeedMetersPerSecond(snapshot.normalizedGradedPaceResult),
    ).toBeCloseTo(thresholdSpeedMps, 12);
    if (snapshot.commonLoad.status !== "partial") throw new Error("Expected partial Common Load");
    expect(snapshot.commonLoad.load).toBeCloseTo(100, 10);
    expect(snapshot.commonLoad.intensity).toBeCloseTo(1, 10);
  });

  it("keeps running NGP available while threshold-missing Common Load safely abstains", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.flat;
    const snapshot = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "run",
        performanceTargets: createUnavailableAthletePerformanceTargetFacts(STARTED_AT),
      },
      samples: fixture.samples.map((sample) => ({
        timestampMs: STARTED_AT_MS + sample.timestampSeconds * 1_000,
        speedMps: sample.speedMetersPerSecond,
        altitudeMeters: sample.elevationMeters,
        distanceMeters: sample.timestampSeconds * 4,
      })),
    });

    expect(snapshot.normalizedGradedPaceResult).toMatchObject({
      status: "available",
      valueMetersPerSecond: fixture.expected.normalizedGradedSpeedMetersPerSecond,
    });
    expect(snapshot.commonLoad).toMatchObject({
      status: "unavailable",
      method: "run_pace_threshold",
      reason: "threshold_missing",
    });
  });

  it("excludes known running rest and keeps incomplete elevation coverage partial", () => {
    for (const fixture of [
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.paused,
      RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation,
    ]) {
      let distanceMeters = 0;
      let previousAcceptedTimestamp: number | null = null;
      const samples = fixture.samples.map((sample) => {
        if (
          previousAcceptedTimestamp !== null &&
          sample.timestampSeconds > previousAcceptedTimestamp &&
          (!("included" in sample) || sample.included !== false) &&
          sample.speedMetersPerSecond !== null
        ) {
          distanceMeters +=
            (sample.timestampSeconds - previousAcceptedTimestamp) * sample.speedMetersPerSecond;
        }
        if (
          previousAcceptedTimestamp === null ||
          sample.timestampSeconds > previousAcceptedTimestamp
        ) {
          previousAcceptedTimestamp = sample.timestampSeconds;
        }
        return {
          timestampMs: STARTED_AT_MS + sample.timestampSeconds * 1_000,
          moving: !("included" in sample) || sample.included !== false,
          speedMps: sample.speedMetersPerSecond,
          altitudeMeters: sample.elevationMeters,
          distanceMeters,
        };
      });
      const snapshot = calculateProvisionalRecordingMetrics({
        config: {
          activityCategory: "run",
          performanceTargets: performanceTargets({
            planningThresholdPaceSecondsPerKm: fixture.thresholdPaceSecondsPerKm,
          }),
          recordingSessionId: `run-${fixture.expected.status}`,
        },
        samples,
      });

      expect(snapshot.observations.duration.value).toMatchObject({
        elapsed: { value: fixture.expected.elapsedDurationSeconds },
        active: { value: fixture.expected.activeDurationSeconds },
        moving: { value: fixture.expected.movingDurationSeconds },
      });
      expect(snapshot.normalizedGradedPaceResult).toMatchObject({
        status: fixture.expected.status,
        diagnostics: fixture.expected.diagnostics,
      });
      const normalizedGradedPaceResult = snapshot.normalizedGradedPaceResult;
      if (normalizedGradedPaceResult === null) {
        throw new Error(fixture.rationale);
      }
      const normalizedGradedSpeedMetersPerSecond =
        selectRunningNormalizedGradedSpeedMetersPerSecond(normalizedGradedPaceResult);
      expect(normalizedGradedSpeedMetersPerSecond).not.toBeNull();
      if (normalizedGradedSpeedMetersPerSecond === null) throw new Error(fixture.rationale);
      expect(
        Math.abs(
          normalizedGradedSpeedMetersPerSecond -
            fixture.expected.normalizedGradedSpeedMetersPerSecond,
        ),
      ).toBeLessThanOrEqual(
        RUNNING_NUMERICAL_TRUST_FIXTURES_V1.tolerances.normalizedGradedSpeedMetersPerSecond,
      );
      expect(snapshot.commonLoad).toMatchObject({
        status: "partial",
        method: "run_pace_threshold",
        contributingDurationSeconds: fixture.expected.diagnostics.contributingDurationSeconds,
        eligibleDurationSeconds: fixture.expected.activeDurationSeconds,
      });
      if (snapshot.commonLoad.status !== "partial") throw new Error(fixture.rationale);
      expect(snapshot.commonLoad.intensity).toBeCloseTo(fixture.expected.normalizedIntensity, 12);
      expect(snapshot.commonLoad.load).toBeCloseTo(fixture.expected.commonLoad, 12);
    }
  });

  it("marks partial swim distance coverage rather than treating missing time as zero effort", () => {
    const samples = constantSamples({
      seconds: 3600,
      distanceMetersPerSecond: 3000 / 3600,
    }).map((sample) =>
      sample.timestampMs > STARTED_AT_MS + 2880 * 1000
        ? { ...sample, distanceMeters: null }
        : sample,
    );
    const snapshot = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "swim",
        performanceTargets: performanceTargets({ swimmingCssSecondsPer100m: 120 }),
        recordingSessionId: "swim-session",
      },
      samples,
    });

    expect(snapshot.commonLoad).toMatchObject({
      status: "partial",
      method: "swim_pace_threshold",
      load: 80,
      intensity: 1,
      contributingDurationSeconds: 2880,
      sourceTimeCoverage: 0.8,
    });
  });

  it("keeps unsupported and out-of-range live calculations non-fatal", () => {
    const unsupported = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "strength",
        performanceTargets: performanceTargets({ runLthrBpm: 170 }),
      },
      samples: constantSamples({ seconds: 60, heartRateBpm: 170 }),
    });
    expect(unsupported.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "unsupported_modality",
    });

    const outOfRange = calculateProvisionalRecordingMetrics({
      config: bikeConfig(performanceTargets({ planningThresholdPowerWatts: 100 })),
      samples: constantSamples({ seconds: 60, powerWatts: 200 }),
    });
    expect(outOfRange.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "intensity_out_of_range",
    });
    expect(outOfRange.observations.duration.value.moving).toMatchObject({
      status: "available",
      value: 60,
    });
  });

  it("restores observed duration and distance without inventing recovered load evidence", () => {
    const accumulator = createProvisionalRecordingMetricsAccumulator(
      bikeConfig(performanceTargets({ planningThresholdPowerWatts: 250 })),
    );
    accumulator.restoreObservations({
      elapsedSeconds: 120,
      movingSeconds: 90,
      distanceMeters: 750,
      observedAtMs: STARTED_AT_MS + 120_000,
    });

    const restored = accumulator.getSnapshot();
    expect(restored.observations.duration.value).toMatchObject({
      elapsed: { status: "available", value: 120 },
      moving: { status: "available", value: 90 },
    });
    expect(restored.observations.distance.value).toMatchObject({
      status: "available",
      value: 750,
    });
    expect(restored.commonLoad).toMatchObject({
      status: "partial",
      load: null,
      intensity: null,
      reason: "activity_data_partial",
    });
  });

  it("retains its immutable performance-target copy and matches incremental replay", () => {
    const sourcePerformanceTargets = performanceTargets({ planningThresholdPowerWatts: 250 });
    const config = bikeConfig(sourcePerformanceTargets);
    const samples = constantSamples({ seconds: 3600, powerWatts: 250 });
    const accumulator = createProvisionalRecordingMetricsAccumulator(config);
    sourcePerformanceTargets.cycling.planningThresholdPower.value = 500;

    for (const sample of samples) accumulator.addSample(sample);
    const incremental = accumulator.getSnapshot();
    const replay = calculateProvisionalRecordingMetrics({
      config: bikeConfig(performanceTargets({ planningThresholdPowerWatts: 250 })),
      samples,
    });

    expect(incremental).toEqual(replay);
    expect(incremental.commonLoad).toMatchObject({ intensity: 1, load: 100 });
    accumulator.reset();
    expect(accumulator.getSnapshot().commonLoad).toMatchObject({
      status: "unavailable",
      reason: "duration_missing",
    });
  });
});
