import { describe, expect, it } from "vitest";
import {
  calculateRecordingMetrics,
  createRecordingMetricsAccumulator,
  type RecordingMetricSample,
} from "../accumulator";

function constantSamples(input: {
  seconds: number;
  powerWatts?: number | null;
  heartRateBpm?: number | null;
  speedMps?: number | null;
  distanceMetersPerSecond?: number;
  altitudeMeters?: number;
}): RecordingMetricSample[] {
  return Array.from({ length: input.seconds + 1 }, (_, second) => ({
    timestampMs: second * 1000,
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

describe("recording metrics accumulator", () => {
  it("returns deterministic empty and one-sample snapshots", () => {
    expect(calculateRecordingMetrics({ samples: [] })).toMatchObject({
      elapsedSeconds: 0,
      movingSeconds: 0,
      averagePowerWatts: null,
      trainingStressScore: null,
      trainingStressScoreMethod: null,
      sampleCount: 0,
    });

    expect(
      calculateRecordingMetrics({ samples: [{ timestampMs: 1000, powerWatts: 250 }] }),
    ).toMatchObject({
      elapsedSeconds: 0,
      movingSeconds: 0,
      averagePowerWatts: null,
      sampleCount: 1,
      powerSampleCount: 0,
    });
  });

  it("ignores invalid, duplicate, and decreasing timestamps", () => {
    const snapshot = calculateRecordingMetrics({
      samples: [
        { timestampMs: Number.NaN, powerWatts: 250 },
        { timestampMs: 1000, powerWatts: 250 },
        { timestampMs: 1000, powerWatts: 400 },
        { timestampMs: 500, powerWatts: 400 },
        { timestampMs: 2000, powerWatts: 250 },
      ],
    });

    expect(snapshot.sampleCount).toBe(2);
    expect(snapshot.elapsedSeconds).toBe(1);
    expect(snapshot.movingSeconds).toBe(1);
    expect(snapshot.averagePowerWatts).toBe(250);
  });

  it("keeps raw duration while capping large gaps for metric contribution", () => {
    const snapshot = calculateRecordingMetrics({
      config: { ftpWatts: 250, maxGapSeconds: 5 },
      samples: [
        { timestampMs: 0, powerWatts: 250 },
        { timestampMs: 60_000, powerWatts: 250 },
      ],
    });

    expect(snapshot.elapsedSeconds).toBe(60);
    expect(snapshot.movingSeconds).toBe(60);
    expect(snapshot.workKilojoules).toBe(1.25);
    expect(snapshot.powerTrainingStressScore).toBeNull();
    expect(snapshot.trainingStressScore).toBeNull();
  });

  it("excludes paused intervals from moving and load metrics", () => {
    const snapshot = calculateRecordingMetrics({
      samples: [
        { timestampMs: 0, powerWatts: 250 },
        { timestampMs: 1000, moving: false, powerWatts: 250 },
        { timestampMs: 2000, powerWatts: 250 },
      ],
    });

    expect(snapshot.elapsedSeconds).toBe(2);
    expect(snapshot.movingSeconds).toBe(1);
    expect(snapshot.workKilojoules).toBe(0.25);
  });

  it("calculates exact power metrics for one hour at ftp", () => {
    const snapshot = calculateRecordingMetrics({
      config: { activityCategory: "bike", ftpWatts: 250 },
      samples: constantSamples({ seconds: 3600, powerWatts: 250 }),
    });

    expect(snapshot.averagePowerWatts).toBeCloseTo(250, 8);
    expect(snapshot.normalizedPowerWatts).toBeCloseTo(250, 8);
    expect(snapshot.intensityFactor).toBeCloseTo(1, 8);
    expect(snapshot.powerTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("power");
    expect(snapshot.variabilityIndex).toBeCloseTo(1, 8);
    expect(snapshot.workKilojoules).toBeCloseTo(900, 8);
  });

  it("treats zero watts as valid coasting", () => {
    const snapshot = calculateRecordingMetrics({
      config: { activityCategory: "bike", ftpWatts: 250 },
      samples: constantSamples({ seconds: 3600, powerWatts: 0 }),
    });

    expect(snapshot.averagePowerWatts).toBe(0);
    expect(snapshot.normalizedPowerWatts).toBe(0);
    expect(snapshot.workKilojoules).toBe(0);
    expect(snapshot.variabilityIndex).toBeNull();
    expect(snapshot.powerTrainingStressScore).toBeCloseTo(0, 8);
  });

  it("keeps NP available when FTP is missing", () => {
    const snapshot = calculateRecordingMetrics({
      config: { activityCategory: "bike" },
      samples: constantSamples({ seconds: 3600, powerWatts: 250 }),
    });

    expect(snapshot.normalizedPowerWatts).toBeCloseTo(250, 8);
    expect(snapshot.intensityFactor).toBeNull();
    expect(snapshot.powerTrainingStressScore).toBeNull();
    expect(snapshot.trainingStressScore).toBeNull();
  });

  it("does not project power TSS across missing power intervals", () => {
    const samples = constantSamples({ seconds: 3600, powerWatts: 250 }).map((sample) =>
      sample.timestampMs > 2880 * 1000 ? { ...sample, powerWatts: null } : sample,
    );
    const snapshot = calculateRecordingMetrics({
      config: { activityCategory: "bike", ftpWatts: 250 },
      samples,
    });

    expect(snapshot.powerTrainingStressScore).toBeCloseTo(80, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(80, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("power");
  });

  it("removes low coverage power TSS from primary selection and falls back to HR", () => {
    const samples = constantSamples({ seconds: 3600, powerWatts: 250, heartRateBpm: 170 }).map(
      (sample) => (sample.timestampMs > 1800 * 1000 ? { ...sample, powerWatts: null } : sample),
    );
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "bike",
        ftpWatts: 250,
        restingHeartRateBpm: 50,
        maxHeartRateBpm: 190,
        thresholdHeartRateBpm: 170,
      },
      samples,
    });

    expect(snapshot.powerTrainingStressScore).toBeCloseTo(50, 8);
    expect(snapshot.heartRateTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("heart_rate");
  });

  it("normalizes HR TSS so one hour at threshold HR equals 100", () => {
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "strength",
        restingHeartRateBpm: 50,
        maxHeartRateBpm: 190,
        thresholdHeartRateBpm: 170,
      },
      samples: constantSamples({ seconds: 3600, heartRateBpm: 170 }),
    });

    expect(snapshot.averageHeartRateBpm).toBeCloseTo(170, 8);
    expect(snapshot.heartRateTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("heart_rate");
  });

  it("calculates flat run GAP TSS at threshold speed", () => {
    const thresholdPaceSecondsPerKm = 300;
    const thresholdSpeedMps = 1000 / thresholdPaceSecondsPerKm;
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "run",
        thresholdPaceSecondsPerKm,
      },
      samples: constantSamples({
        seconds: 3600,
        speedMps: thresholdSpeedMps,
        distanceMetersPerSecond: thresholdSpeedMps,
        altitudeMeters: 100,
      }),
    });

    expect(snapshot.runGradeAdjustedPaceTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("run_grade_adjusted_pace");
  });

  it("calculates swim CSS TSS at threshold speed", () => {
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "swim",
        thresholdSwimPaceSecondsPer100m: 120,
      },
      samples: constantSamples({
        seconds: 3600,
        distanceMetersPerSecond: 3000 / 3600,
      }),
    });

    expect(snapshot.swimCriticalSpeedTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("swim_critical_speed");
  });

  it("does not inflate swim CSS TSS when distance coverage is partial", () => {
    const samples = constantSamples({
      seconds: 3600,
      distanceMetersPerSecond: 3000 / 3600,
    }).map((sample) =>
      sample.timestampMs > 2880 * 1000 ? { ...sample, distanceMeters: null } : sample,
    );
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "swim",
        thresholdSwimPaceSecondsPer100m: 120,
      },
      samples,
    });

    expect(snapshot.swimCriticalSpeedTrainingStressScore).toBeCloseTo(64, 8);
    expect(snapshot.trainingStressScore).toBeCloseTo(64, 8);
  });

  it("honors primary method override without disabling source-specific calculations", () => {
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "bike",
        ftpWatts: 250,
        restingHeartRateBpm: 50,
        maxHeartRateBpm: 190,
        thresholdHeartRateBpm: 170,
        preferredTrainingStressScoreMethods: ["heart_rate", "power"],
      },
      samples: constantSamples({ seconds: 3600, powerWatts: 250, heartRateBpm: 170 }),
    });

    expect(snapshot.powerTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.heartRateTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScoreMethod).toBe("heart_rate");
  });

  it("returns null selected TSS when explicit override is exhausted", () => {
    const snapshot = calculateRecordingMetrics({
      config: {
        activityCategory: "run",
        ftpWatts: 250,
        preferredTrainingStressScoreMethods: ["run_grade_adjusted_pace"],
      },
      samples: constantSamples({ seconds: 3600, powerWatts: 250 }),
    });

    expect(snapshot.powerTrainingStressScore).toBeCloseTo(100, 8);
    expect(snapshot.trainingStressScore).toBeNull();
    expect(snapshot.trainingStressScoreMethod).toBeNull();
  });

  it("matches incremental and replay calculation paths", () => {
    const samples = constantSamples({ seconds: 3600, powerWatts: 250, heartRateBpm: 170 });
    const config = {
      activityCategory: "bike" as const,
      ftpWatts: 250,
      restingHeartRateBpm: 50,
      maxHeartRateBpm: 190,
      thresholdHeartRateBpm: 170,
    };
    const replay = calculateRecordingMetrics({ config, samples });
    const accumulator = createRecordingMetricsAccumulator(config);

    for (const sample of samples) accumulator.addSample(sample);

    expect(accumulator.getSnapshot()).toEqual(replay);
  });
});
