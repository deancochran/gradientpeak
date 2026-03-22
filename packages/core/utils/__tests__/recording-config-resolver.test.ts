import { describe, expect, it } from "vitest";
import type { RecordingConfigInput } from "../../schemas/recording_config";
import type {
  RecordingLaunchIntent,
  RecordingSessionSnapshot,
} from "../../schemas/recording-session";
import { RecordingConfigResolver } from "../recording-config-resolver";

function buildInput(overrides: Partial<RecordingConfigInput> = {}): RecordingConfigInput {
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

  it("resolves configuration from a launch intent", () => {
    const intent: RecordingLaunchIntent = {
      activityCategory: "bike",
      mode: "planned",
      gpsMode: "on",
      eventId: null,
      activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
      routeId: "550e8400-e29b-41d4-a716-446655440001",
      sourcePreferences: [],
      controlPolicy: {
        trainerMode: "auto",
        autoAdvanceSteps: true,
      },
    };

    const config = RecordingConfigResolver.resolveFromLaunchIntent(intent, {
      plan: {
        hasStructure: true,
        hasRoute: true,
        stepCount: 4,
        requiresManualAdvance: false,
      },
      devices: {
        ftmsTrainer: {
          deviceId: "trainer-1",
          autoControlEnabled: true,
        },
        hasPowerMeter: false,
        hasHeartRateMonitor: true,
        hasCadenceSensor: true,
      },
      gpsAvailable: true,
    });

    expect(config.input.mode).toBe("planned");
    expect(config.capabilities.shouldShowTrainerControl).toBe(true);
    expect(config.capabilities.shouldAutoFollowTargets).toBe(true);
  });

  it("resolves configuration from a session snapshot", () => {
    const snapshot: RecordingSessionSnapshot = {
      identity: {
        sessionId: "session-1",
        revision: 1,
        startedAt: "2026-03-20T10:00:00Z",
      },
      activity: {
        category: "bike",
        mode: "planned",
        gpsMode: "off",
        eventId: null,
        activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
        routeId: null,
      },
      profileSnapshot: {
        defaultsApplied: [],
      },
      devices: {
        connected: [
          {
            deviceId: "power-meter-1",
            role: "power_meter",
            sourceTypes: ["power_meter"],
            controllable: false,
          },
          {
            deviceId: "trainer-1",
            role: "trainer",
            sourceTypes: ["trainer_power", "trainer_cadence"],
            controllable: true,
          },
        ],
        controllableTrainer: {
          deviceId: "trainer-1",
          sourceTypes: ["trainer_power", "trainer_cadence"],
          supportsAutoControl: true,
          supportsManualControl: true,
        },
        selectedSources: [],
      },
      capabilities: {
        canTrackLocation: false,
        canTrackPower: true,
        canTrackHeartRate: false,
        canTrackCadence: false,
        shouldShowMap: false,
        shouldShowSteps: true,
        shouldShowRouteOverlay: false,
        shouldShowTurnByTurn: false,
        shouldShowFollowAlong: false,
        shouldShowTrainerControl: true,
        canAutoAdvanceSteps: true,
        shouldAutoFollowTargets: true,
        primaryMetric: "power",
        isValid: true,
        errors: [],
        warnings: [],
      },
      policies: {
        sourcePolicy: {
          preferUserSelection: true,
          allowDerivedSpeed: true,
          allowDerivedDistance: true,
        },
        controlPolicy: {
          trainerMode: "auto",
          autoAdvanceSteps: true,
        },
        degradedModePolicy: {
          allowWithoutGps: true,
          allowWithoutSensors: true,
          exposeSourceWarnings: true,
        },
      },
    };

    const config = RecordingConfigResolver.resolveFromSessionSnapshot(snapshot);

    expect(config.input.gpsRecordingEnabled).toBe(false);
    expect(config.input.devices.ftmsTrainer?.deviceId).toBe("trainer-1");
    expect(config.input.devices.hasPowerMeter).toBe(true);
    expect(config.capabilities.primaryMetric).toBe("power");
  });
});
