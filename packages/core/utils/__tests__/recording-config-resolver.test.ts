import { describe, expect, it } from "vitest";
import type { RecordingConfigInput } from "../../schemas/recording_config";
import { RecordingConfigResolver } from "../recording-config-resolver";

function buildInput(
  overrides: Partial<RecordingConfigInput> = {},
): RecordingConfigInput {
  return {
    activityCategory: "run",
    gpsRecordingEnabled: false,
    mode: "unplanned",
    devices: {
      hasPowerMeter: false,
      hasHeartRateMonitor: false,
      hasCadenceSensor: false,
    },
    gpsAvailable: false,
    ...overrides,
  };
}

describe("RecordingConfigResolver", () => {
  it("tracks location only when GPS intent and availability are true", () => {
    const enabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const enabledButUnavailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );
    const disabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: true }),
    );

    expect(enabledAndAvailable.capabilities.canTrackLocation).toBe(true);
    expect(enabledButUnavailable.capabilities.canTrackLocation).toBe(false);
    expect(disabledAndAvailable.capabilities.canTrackLocation).toBe(false);
  });

  it("fails fast when GPS recording is enabled but unavailable", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );

    expect(config.capabilities.isValid).toBe(false);
    expect(config.capabilities.errors).toContain(
      "GPS recording is enabled, but GPS is unavailable. Please enable location services.",
    );
  });

  it("does not require GPS when GPS recording is disabled", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: false }),
    );

    expect(config.capabilities.isValid).toBe(true);
    expect(config.capabilities.errors).toHaveLength(0);
  });

  it("gates route overlay and turn-by-turn by GPS tracking and route", () => {
    const withGpsAndRoute = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );
    const withoutGpsTracking = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: false,
        gpsAvailable: true,
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );

    expect(withGpsAndRoute.capabilities.shouldShowRouteOverlay).toBe(true);
    expect(withGpsAndRoute.capabilities.shouldShowTurnByTurn).toBe(true);
    expect(withoutGpsTracking.capabilities.shouldShowRouteOverlay).toBe(false);
    expect(withoutGpsTracking.capabilities.shouldShowTurnByTurn).toBe(false);
  });

  it("uses distance as primary metric when GPS tracking is active", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );

    expect(config.capabilities.primaryMetric).toBe("distance");
  });

  it("prioritizes power metric when power is available", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        devices: {
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.capabilities.primaryMetric).toBe("power");
  });

  it("uses reps as primary metric for strength", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "strength",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        devices: {
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.capabilities.primaryMetric).toBe("reps");
  });
});
