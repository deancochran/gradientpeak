import { selectRunningNormalizedGradedSpeedMetersPerSecond } from "@repo/core/calculations";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/running-numerical-trust";
import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/swimming-heart-rate-numerical-trust";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMetricsManager } from "./LiveMetricsManager";

vi.mock("expo-file-system", () => {
  class MockDirectory {
    uri: string;
    exists = false;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    create() {
      this.exists = true;
    }

    list() {
      return [];
    }

    delete() {
      this.exists = false;
    }
  }

  class MockFile {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    write() {}

    textSync() {
      return "{}";
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: "cache" },
  };
});

vi.mock("expo", () => {
  class MockEventEmitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    emit(eventName: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }

    on(eventName: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(eventName) ?? [];
      listeners.push(listener);
      this.listeners.set(eventName, listeners);
      return { remove: () => this.removeListener(eventName, listener) };
    }

    addListener(eventName: string, listener: (...args: unknown[]) => void) {
      return this.on(eventName, listener);
    }

    removeListener(eventName: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(
        eventName,
        (this.listeners.get(eventName) ?? []).filter((current) => current !== listener),
      );
    }

    removeAllListeners(eventName?: string) {
      if (eventName) {
        this.listeners.delete(eventName);
        return;
      }
      this.listeners.clear();
    }
  }

  return { EventEmitter: MockEventEmitter };
});

function bikePerformanceTargets(bikeThresholdWatts: number, lthrBpm = 170) {
  return buildPerformanceTargetFactsFixture({
    asOf: "2026-07-31T10:00:00.000Z",
    heartRateObservedAt: "2026-07-30T10:00:00.000Z",
    bikeThresholdWatts,
    lthrBpm: { bike: lthrBpm },
  });
}

function bikeHeartRatePerformanceTargets(lthrBpm: number) {
  return buildPerformanceTargetFactsFixture({
    asOf: "2026-07-31T10:00:00.000Z",
    heartRateObservedAt: "2026-07-30T10:00:00.000Z",
    lthrBpm: { bike: lthrBpm },
  });
}

function runPerformanceTargets(runThresholdSpeedMps: number) {
  return buildPerformanceTargetFactsFixture({
    asOf: "2026-07-31T10:00:00.000Z",
    runThresholdMetersPerSecond: runThresholdSpeedMps,
  });
}

const MOBILE_NORMALIZATION_REFERENCE_FIXTURE_V1 = {
  version: "mobile-normalized-power-boundary-v1",
  rationale:
    "The provisional recorder must use timestamp evidence and remain unavailable until the first complete 30-second window.",
  powerWatts: 250,
  beforeBoundaryMilliseconds: 29_000,
  boundaryMilliseconds: 30_000,
  expectedNormalizedPowerWatts: 250,
};

describe("LiveMetricsManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets cumulative session state when a new recording starts", async () => {
    const manager = new LiveMetricsManager({ id: "profile-1" });

    await manager.startRecording();
    manager.ingestSensorData({ metric: "power", dataType: "float", value: 200, timestamp: 1_000 });
    manager.ingestSensorData({ metric: "power", dataType: "float", value: 300, timestamp: 2_000 });

    expect(manager.getSessionStats().distance).toBeGreaterThan(0);
    expect(manager.getSessionStats().maxPower).toBe(300);

    await manager.finishRecording();
    await manager.startRecording();

    expect(manager.getSessionStats().distance).toBe(0);
    expect(manager.getSessionStats().maxPower).toBe(0);

    await manager.cleanup();
  });

  it("derives live zones only from explicit target facts and clears unavailable values", async () => {
    const manager = new LiveMetricsManager({ id: "profile-1" });
    const updates: Array<{
      profile: {
        bikeThresholdWatts?: number;
        lthrBpm?: number;
      };
      zones: { hrZones: number[]; powerZones: number[] };
    }> = [];
    manager.addListener("metricsUpdated", (update) => updates.push(update));

    manager.setActivityCategory("bike");
    manager.updatePerformanceTargets(bikePerformanceTargets(250));

    expect(updates.at(-1)).toEqual({
      profile: {
        bikeThresholdWatts: 250,
        lthrBpm: 170,
      },
      zones: {
        hrZones: [137.7, 153, 159.8, 170, Infinity],
        powerZones: [137.5, 190, 227.5, 265, 302.5, 377.5, Infinity],
      },
    });

    manager.updatePerformanceTargets(null);

    expect(updates.at(-1)).toEqual({
      profile: {},
      zones: { hrZones: [], powerZones: [] },
    });

    await manager.cleanup();
  });

  it("keeps stale primary thresholds usable and heart-rate capability separate", async () => {
    const manager = new LiveMetricsManager({ id: "profile-1" });
    const updates: Array<{
      profile: { bikeThresholdWatts?: number; lthrBpm?: number };
      zones: { hrZones: number[]; powerZones: number[] };
    }> = [];
    manager.addListener("metricsUpdated", (update) => updates.push(update));
    manager.setActivityCategory("bike");

    manager.updatePerformanceTargets(
      buildPerformanceTargetFactsFixture({
        asOf: "2026-07-31T10:00:00.000Z",
        thresholdEffectiveAt: "2025-01-01T10:00:00.000Z",
        bikeThresholdWatts: 260,
      }),
    );
    expect(updates.at(-1)?.profile).toEqual({ bikeThresholdWatts: 260 });

    manager.updatePerformanceTargets(bikeHeartRatePerformanceTargets(175));
    expect(updates.at(-1)?.profile).toEqual({ lthrBpm: 175 });
    expect(updates.at(-1)?.zones.powerZones).toEqual([]);

    await manager.cleanup();
  });

  it("continues and finishes with unavailable provisional Common Load", async () => {
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "power",
      dataType: "float",
      value: 250,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(60_000);

    const finished = await manager.finishRecording();
    const stats = manager.getSessionStats();
    expect(finished.finishedAt).toBeDefined();
    expect(stats.provisionalMetrics).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      commonLoad: { status: "unavailable", reason: "threshold_missing" },
    });
    expect(stats.provisionalMetrics?.observations.duration.value.moving).toMatchObject({
      status: "available",
      value: 60,
    });
    expect(manager.getSimplifiedMetrics().provisionalMetrics).toEqual(stats.provisionalMetrics);
    expect(JSON.stringify(stats)).not.toMatch(/trainingStressScore|intensityFactor|"tss"/i);
    expect(JSON.stringify(manager.getSimplifiedMetrics())).not.toMatch(
      /trainingStressScore|intensityFactor|"tss"/i,
    );

    await manager.cleanup();
  });

  it("uses shared timestamp normalization at the fixed 30-second boundary", async () => {
    const fixture = MOBILE_NORMALIZATION_REFERENCE_FIXTURE_V1;
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "power",
      dataType: "float",
      value: fixture.powerWatts,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(fixture.beforeBoundaryMilliseconds);
    expect(manager.getProvisionalMetricsSnapshot()).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      normalizedPowerResult: { status: "unavailable", valueWatts: null },
    });

    await vi.advanceTimersByTimeAsync(
      fixture.boundaryMilliseconds - fixture.beforeBoundaryMilliseconds,
    );
    expect(manager.getProvisionalMetricsSnapshot()).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      normalizedPowerResult: {
        status: "available",
        valueWatts: fixture.expectedNormalizedPowerWatts,
      },
    });

    await manager.finishRecording();
    await manager.cleanup();
  });

  it("retains the active session target facts while staging a later snapshot", async () => {
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");
    manager.updatePerformanceTargets(bikePerformanceTargets(250));

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "power",
      dataType: "float",
      value: 250,
      timestamp: Date.now(),
    });
    manager.updatePerformanceTargets(bikePerformanceTargets(500));
    await vi.advanceTimersByTimeAsync(60_000);

    const commonLoad = manager.getProvisionalMetricsSnapshot().commonLoad;
    expect(commonLoad).toMatchObject({
      status: "partial",
      method: "power_threshold",
      intensity: 1,
    });

    await manager.finishRecording();
    await manager.cleanup();
  });

  it("keeps paused time out of provisional moving duration", async () => {
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");
    manager.updatePerformanceTargets(bikePerformanceTargets(250));

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "power",
      dataType: "float",
      value: 250,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    manager.pauseRecording();
    await vi.advanceTimersByTimeAsync(120_000);
    manager.resumeRecording();
    await vi.advanceTimersByTimeAsync(30_000);

    const duration = manager.getProvisionalMetricsSnapshot().observations.duration.value;
    expect(duration.elapsed.status).toBe("available");
    expect(duration.moving.status).toBe("available");
    if (duration.elapsed.status !== "available" || duration.moving.status !== "available") {
      throw new Error("Expected live duration observations");
    }
    expect(duration.elapsed.value - duration.moving.value).toBe(120);
    expect(duration.moving.value).toBeGreaterThan(0);

    await manager.finishRecording();
    await manager.cleanup();
  });

  it("surfaces versioned running NGP and provisional Common Load from aligned live evidence", async () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour;
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("run");
    manager.updatePerformanceTargets(runPerformanceTargets(fixture.thresholdSpeedMetersPerSecond));

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "altitude",
      dataType: "float",
      value: 100,
      timestamp: Date.now(),
    });
    manager.ingestSensorData({
      metric: "speed",
      dataType: "float",
      value: fixture.thresholdSpeedMetersPerSecond,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(35_000);

    const snapshot = manager.getProvisionalMetricsSnapshot();
    expect(snapshot).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      normalizedGradedPaceResult: {
        status: "partial",
        calculationVersion: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
        diagnostics: {
          contributingDurationSeconds: 30,
          excludedMissingDurationSeconds: 5,
        },
      },
      commonLoad: {
        status: "partial",
        method: "run_pace_threshold",
        contributingDurationSeconds: 30,
        eligibleDurationSeconds: 35,
        sourceTimeCoverage: 30 / 35,
      },
    });
    const normalizedGradedPaceResult = snapshot.normalizedGradedPaceResult;
    if (normalizedGradedPaceResult === null) throw new Error(fixture.rationale);
    expect(
      selectRunningNormalizedGradedSpeedMetersPerSecond(normalizedGradedPaceResult),
    ).toBeCloseTo(fixture.expected.normalizedGradedSpeedMetersPerSecond, 12);
    if (snapshot.commonLoad.status !== "partial") throw new Error(fixture.rationale);
    expect(snapshot.commonLoad.intensity).toBeCloseTo(fixture.expected.normalizedIntensity, 12);
    expect(snapshot.commonLoad.load).toBeCloseTo(100 / 120, 12);
    expect(manager.getSimplifiedMetrics().provisionalMetrics).toEqual(snapshot);

    await manager.finishRecording();
    await manager.cleanup();
  });

  it("surfaces explicit provisional HR duration/zones without claiming final authority", async () => {
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");
    manager.updatePerformanceTargets(
      bikeHeartRatePerformanceTargets(
        SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lthrBpm,
      ),
    );

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "heartrate",
      dataType: "float",
      value: SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lthrBpm,
      timestamp: Date.now(),
    });
    for (let second = 1; second <= 35; second += 1) {
      await vi.advanceTimersByTimeAsync(1_000);
      manager.ingestSensorData({
        metric: "heartrate",
        dataType: "float",
        value: SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lthrBpm,
        timestamp: Date.now(),
      });
    }

    const snapshot = manager.getProvisionalMetricsSnapshot();
    expect(snapshot).toMatchObject({
      stage: "provisional",
      authority: "live_recording_only",
      heartRateEvidence: {
        status: "available",
        coverageSeconds: 35,
        eligibleDurationSeconds: 35,
      },
      heartRateZoneDuration: {
        status: "available",
        zoneSeconds: [0, 0, 0, 0, 35],
      },
      commonLoad: {
        status: "partial",
        method: "heart_rate_zones",
        intensity: 1,
        contributingDurationSeconds: 35,
        eligibleDurationSeconds: 35,
        sourceTimeCoverage: 1,
      },
    });
    expect(snapshot.commonLoad.status).not.toBe("available");

    await manager.finishRecording();
    await manager.cleanup();
  });

  it("turns a stale live HR reading into missing evidence instead of extending it", async () => {
    vi.setSystemTime("2026-07-31T10:00:00.000Z");
    const manager = new LiveMetricsManager({ id: "profile-1" });
    manager.setActivityCategory("bike");
    manager.updatePerformanceTargets(
      bikeHeartRatePerformanceTargets(
        SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lthrBpm,
      ),
    );

    await manager.startRecording();
    manager.ingestSensorData({
      metric: "heartrate",
      dataType: "float",
      value: SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1.heartRate.lthrBpm,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(35_000);

    const snapshot = manager.getProvisionalMetricsSnapshot();
    expect(snapshot.heartRateEvidence).toMatchObject({
      status: "partial",
      coverageSeconds: 5,
      eligibleDurationSeconds: 35,
      diagnostics: { excludedMissingDurationSeconds: 30 },
    });
    expect(snapshot.commonLoad).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      reason: "insufficient_coverage",
    });

    await manager.finishRecording();
    await manager.cleanup();
  });
});
