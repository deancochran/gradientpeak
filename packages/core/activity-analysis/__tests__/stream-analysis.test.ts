import { describe, expect, it } from "vitest";
import { analyzeActivityStreams } from "../stream-analysis";

const thresholds = {
  lthrBySport: { bike: 180, run: 180, swim: 180 },
  ftpWatts: 300,
  runThresholdSpeedMps: 4,
  swimThresholdSpeedMps: 1.5,
  identities: {
    ftpWatts: {
      source: "manual" as const,
      observed_at: "2026-07-01T00:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: null,
    },
  },
};

describe("analyzeActivityStreams", () => {
  it.each([
    [[0, 10, 10], "duplicate"],
    [[0, 10, 5], "reversed"],
  ])("rejects %s timestamps", (timestamps) => {
    const records = (timestamps as number[]).map((timestamp) => ({ timestamp, heartRate: 150 }));

    const result = analyzeActivityStreams({ records, sport: "bike", thresholds });

    expect(result.distributions.heart_rate.quality).toMatchObject({
      status: "insufficient",
      reason: "invalid_timestamps",
      integrated_seconds: 0,
    });
    expect(result.heart_rate_load).toMatchObject({ value: null, reason: "invalid_timestamps" });
  });

  it("drops gaps above the accepted bound and reports low coverage", () => {
    const result = analyzeActivityStreams({
      records: [
        { timestamp: 0, heartRate: 150 },
        { timestamp: 10, heartRate: 150 },
        { timestamp: 100, heartRate: 150 },
      ],
      sport: "bike",
      thresholds,
      maxAcceptedGapSeconds: 30,
      minimumCoverageRatio: 0.8,
    });

    expect(result.distributions.heart_rate.quality).toEqual({
      status: "insufficient",
      reason: "low_coverage",
      sample_count: 3,
      observed_span_seconds: 100,
      integrated_seconds: 10,
      coverage_ratio: 0.1,
      accepted_interval_count: 1,
      rejected_gap_count: 1,
      rejected_gap_seconds: 90,
    });
    expect(result.distributions.heart_rate.zones).toEqual([]);
  });

  it("treats zero heart rate as dropout while retaining zero power and speed", () => {
    const records = [
      { timestamp: 0, heartRate: 150, power: 0, speed: 0 },
      { timestamp: 10, heartRate: 0, power: 0, speed: 0 },
      { timestamp: 20, heartRate: 150, power: 100, speed: 1 },
    ];
    const bike = analyzeActivityStreams({ records, sport: "bike", thresholds });
    const run = analyzeActivityStreams({ records, sport: "run", thresholds });

    expect(bike.distributions.heart_rate.quality).toMatchObject({
      status: "insufficient",
      reason: "low_coverage",
      sample_count: 2,
      integrated_seconds: 10,
      coverage_ratio: 0.5,
    });
    expect(bike.distributions.heart_rate.zones).toEqual([]);
    expect(bike.heart_rate_load).toMatchObject({ value: null, reason: "low_coverage" });
    expect(bike.distributions.power).toMatchObject({
      time_weighted_average: 0,
      threshold_identity: thresholds.identities.ftpWatts,
    });
    expect(bike.distributions.power.zones[0]?.seconds).toBe(20);
    expect(run.distributions.run_pace.time_weighted_average).toBe(0);
    expect(run.distributions.run_pace.zones[0]?.seconds).toBe(20);
  });

  it("does not synthesize duration for the final sample and time-weights values", () => {
    const result = analyzeActivityStreams({
      records: [
        { timestamp: 0, heartRate: 100 },
        { timestamp: 10, heartRate: 180 },
        { timestamp: 20, heartRate: 250 },
      ],
      sport: "bike",
      thresholds,
    });

    expect(result.distributions.heart_rate.quality.integrated_seconds).toBe(20);
    expect(result.distributions.heart_rate.time_weighted_average).toBe(140);
    expect(result.distributions.heart_rate.zones.map(({ seconds }) => seconds)).toEqual([
      10, 0, 0, 0, 10,
    ]);
  });

  it("reports threshold absence after proving stream coverage", () => {
    const result = analyzeActivityStreams({
      records: [
        { timestamp: 0, heartRate: 150 },
        { timestamp: 10, heartRate: 155 },
      ],
      sport: "bike",
      thresholds: {},
    });

    expect(result.distributions.heart_rate.quality).toMatchObject({
      status: "insufficient",
      reason: "threshold_missing",
      coverage_ratio: 1,
    });
  });

  it("integrates all LTHR heart-rate zones", () => {
    const result = analyzeActivityStreams({
      records: [100, 150, 164, 170, 185, 185].map((heartRate, index) => ({
        timestamp: index * 10,
        heartRate,
      })),
      sport: "bike",
      thresholds,
    });

    expect(result.distributions.heart_rate.zones.map(({ seconds }) => seconds)).toEqual([
      10, 10, 10, 10, 10,
    ]);
  });

  it("integrates all bike power zones against FTP", () => {
    const result = analyzeActivityStreams({
      records: [150, 180, 240, 285, 330, 390, 480, 480].map((power, index) => ({
        timestamp: index * 10,
        power,
      })),
      sport: "bike",
      thresholds,
    });

    expect(result.distributions.power.zones.map(({ seconds }) => seconds)).toEqual([
      10, 10, 10, 10, 10, 10, 10,
    ]);
    expect(result.distributions.run_pace.quality.reason).toBe("sport_mismatch");
  });

  it("integrates all running pace zones against running threshold speed", () => {
    const result = analyzeActivityStreams({
      records: [3, 3.4, 3.7, 4, 4.4, 4.4].map((speed, index) => ({
        timestamp: index * 10,
        speed,
      })),
      sport: "run",
      thresholds,
    });

    expect(result.distributions.run_pace.zones.map(({ seconds }) => seconds)).toEqual([
      10, 10, 10, 10, 10,
    ]);
    expect(result.distributions.swim_pace.quality.reason).toBe("sport_mismatch");
  });

  it("integrates all swimming pace zones against CSS speed", () => {
    const result = analyzeActivityStreams({
      records: [1.1, 1.3, 1.4, 1.5, 1.6, 1.6].map((speed, index) => ({
        timestamp: index * 10,
        speed,
      })),
      sport: "swim",
      thresholds,
    });

    expect(result.distributions.swim_pace.zones.map(({ seconds }) => seconds)).toEqual([
      10, 10, 10, 10, 10,
    ]);
  });

  it("calculates continuous LTHR-normalized heart-rate load from integrated time only", () => {
    const result = analyzeActivityStreams({
      records: [100, 150, 164, 170, 185, 250].map((heartRate, index) => ({
        timestamp: index * 720,
        heartRate,
      })),
      sport: "bike",
      thresholds,
      maxAcceptedGapSeconds: 720,
    });

    expect(result.distributions.heart_rate.quality.integrated_seconds).toBe(3600);
    expect(result.heart_rate_load).toEqual({
      value: 75.63,
      reason: null,
      lthr_bpm: 180,
      calculation_version: "lthr_normalized_squared_v1",
      max_heart_rate_bpm: 250,
    });
  });

  it("is continuous at LTHR and anchors one hour at LTHR to exactly 100 load", () => {
    const loadAt = (heartRate: number) =>
      analyzeActivityStreams({
        records: [
          { timestamp: 0, heartRate },
          { timestamp: 3600, heartRate },
        ],
        sport: "bike",
        thresholds,
        maxAcceptedGapSeconds: 3600,
      }).heart_rate_load.value;

    expect(loadAt(180)).toBe(100);
    expect([loadAt(179.99), loadAt(180), loadAt(180.01)]).toEqual([99.989, 100, 100.011]);
  });

  it("caps implausibly high heart-rate samples at the documented bound", () => {
    const result = analyzeActivityStreams({
      records: [
        { timestamp: 0, heartRate: 300 },
        { timestamp: 3600, heartRate: 300 },
      ],
      sport: "bike",
      thresholds,
      maxAcceptedGapSeconds: 3600,
    });

    expect(result.heart_rate_load).toMatchObject({ value: 192.901, max_heart_rate_bpm: 250 });
  });
});
