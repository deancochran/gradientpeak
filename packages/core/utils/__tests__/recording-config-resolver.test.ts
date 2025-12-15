/**
 * Recording Configuration Resolver Tests
 *
 * Tests all permutations of recording configurations to ensure
 * correct capabilities are computed and validation works.
 */

import type { RecordingConfigInput } from "../../schemas/recording_config";
import { RecordingConfigResolver } from "../recording-config-resolver";

describe("RecordingConfigResolver", () => {
  describe("Outdoor Activities", () => {
    it("outdoor run with GPS - shows map, tracks location", () => {
      const input: RecordingConfigInput = {
        activityType: "outdoor_run",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: true,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.canTrackLocation).toBe(true);
      expect(config.capabilities.shouldShowMap).toBe(true);
      expect(config.capabilities.shouldShowSteps).toBe(false);
      expect(config.capabilities.primaryMetric).toBe("distance");
      expect(config.capabilities.isValid).toBe(true);
      expect(config.capabilities.errors).toHaveLength(0);
    });

    it("outdoor run without GPS - validation error", () => {
      const input: RecordingConfigInput = {
        activityType: "outdoor_run",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.isValid).toBe(false);
      expect(config.capabilities.errors).toContain(
        "GPS is required for outdoor activities. Please enable location services.",
      );
    });

    it("outdoor bike with structured plan and GPS - shows map and steps", () => {
      const input: RecordingConfigInput = {
        activityType: "outdoor_bike",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 5,
          requiresManualAdvance: false,
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: true,
          hasCadenceSensor: false,
        },
        gpsAvailable: true,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(true);
      expect(config.capabilities.shouldShowSteps).toBe(true);
      expect(config.capabilities.shouldShowRouteOverlay).toBe(true);
      expect(config.capabilities.shouldShowTurnByTurn).toBe(true);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(true);
      expect(config.capabilities.canTrackHeartRate).toBe(true);
    });
  });

  describe("Indoor Trainer Activities", () => {
    it("indoor trainer without plan - shows trainer control, no auto control", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "unplanned",
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            features: { powerTargetSettingSupported: true } as any,
            autoControlEnabled: true,
          },
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(false);
      expect(config.capabilities.shouldShowSteps).toBe(false);
      expect(config.capabilities.shouldShowTrainerControl).toBe(true); // Trainer control card should show for quick start
      expect(config.capabilities.shouldAutoFollowTargets).toBe(false); // No plan/route = no auto control
      expect(config.capabilities.canTrackPower).toBe(true);
      expect(config.capabilities.primaryMetric).toBe("power");
      expect(config.capabilities.warnings).toContain(
        "Auto ERG requires a structured plan or route with grade data. You can still manually control the trainer.",
      );
    });

    it("indoor trainer with structured plan - shows steps, power target, auto control", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 10,
          requiresManualAdvance: false,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            features: { powerTargetSettingSupported: true } as any,
            autoControlEnabled: true,
          },
          hasPowerMeter: true,
          hasHeartRateMonitor: true,
          hasCadenceSensor: true,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(false);
      expect(config.capabilities.shouldShowSteps).toBe(true);
      expect(config.capabilities.shouldShowTrainerControl).toBe(true);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(true);
      expect(config.capabilities.shouldAutoFollowTargets).toBe(true);
      expect(config.capabilities.canTrackPower).toBe(true);
      expect(config.capabilities.canTrackHeartRate).toBe(true);
      expect(config.capabilities.canTrackCadence).toBe(true);
      expect(config.capabilities.primaryMetric).toBe("power");
      expect(config.capabilities.isValid).toBe(true);
    });

    it("indoor trainer with route (visualization) - shows map but no navigation", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 8,
          requiresManualAdvance: false,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            features: {} as any,
            autoControlEnabled: true,
          },
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(true); // Show for visualization
      expect(config.capabilities.shouldShowRouteOverlay).toBe(false); // No GPS = no overlay
      expect(config.capabilities.shouldShowTurnByTurn).toBe(false); // No GPS = no navigation
      expect(config.capabilities.canTrackLocation).toBe(false);
    });

    it("indoor trainer with manual advance steps", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 5,
          requiresManualAdvance: true, // Has "untilFinished" steps
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowSteps).toBe(true);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(false); // Manual advance required
    });

    it("indoor trainer with route only (no structured plan) - shows map, trainer control, auto-erg via grade", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: false, // No structured workout steps
          hasRoute: true, // But has a route with elevation/grade
          stepCount: 0,
          requiresManualAdvance: false,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            features: { simulationModeSupported: true } as any,
            autoControlEnabled: true,
          },
          hasPowerMeter: false,
          hasHeartRateMonitor: true,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(true); // Show map to visualize route progress
      expect(config.capabilities.shouldShowSteps).toBe(false); // No structured plan steps
      expect(config.capabilities.shouldShowTrainerControl).toBe(true); // Trainer control card visible
      expect(config.capabilities.shouldAutoFollowTargets).toBe(true); // Can auto-adjust resistance based on route grade
      expect(config.capabilities.shouldShowRouteOverlay).toBe(false); // No GPS outdoors
      expect(config.capabilities.shouldShowTurnByTurn).toBe(false); // No GPS navigation
      expect(config.capabilities.canTrackPower).toBe(true);
      expect(config.capabilities.primaryMetric).toBe("power");
      expect(config.capabilities.isValid).toBe(true);
      expect(config.capabilities.warnings).toHaveLength(0); // No warnings - route provides grade targets
    });
  });

  describe("Indoor Treadmill Activities", () => {
    it("treadmill with structured plan - shows steps, time-based", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_treadmill",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 6,
          requiresManualAdvance: false,
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: true,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(false);
      expect(config.capabilities.shouldShowSteps).toBe(true);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(true);
      expect(config.capabilities.primaryMetric).toBe("time");
      expect(config.capabilities.isValid).toBe(true);
    });
  });

  describe("Strength Training", () => {
    it("strength with structured plan - reps-based, shows steps", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_strength",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 12,
          requiresManualAdvance: true, // Reps require manual advance
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowMap).toBe(false);
      expect(config.capabilities.shouldShowSteps).toBe(true);
      expect(config.capabilities.shouldShowFollowAlong).toBe(false);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(false); // Manual for reps
      expect(config.capabilities.primaryMetric).toBe("reps");
    });
  });

  describe("Swimming", () => {
    it("swim activity - requires follow-along", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_swim",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 4,
          requiresManualAdvance: false,
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowFollowAlong).toBe(true);
      expect(config.capabilities.shouldShowMap).toBe(false);
      expect(config.capabilities.primaryMetric).toBe("time");
    });
  });

  describe("Planned vs Unplanned", () => {
    it("planned without structure - warns and acts as unplanned", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: false, // No structure!
          hasRoute: false,
          stepCount: 0,
          requiresManualAdvance: false,
        },
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowSteps).toBe(false);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(false);
      expect(config.capabilities.warnings).toContain(
        "Selected plan has no structure. Recording as unplanned.",
      );
    });
  });

  describe("Device Connectivity", () => {
    it("no sensors for continuous activity - info warning", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.warnings).toContain(
        "No sensors connected. Metrics will be limited.",
      );
    });

    it("with heart rate sensor - can track heart rate", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_treadmill",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: true,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.canTrackHeartRate).toBe(true);
      expect(config.capabilities.warnings).toHaveLength(0); // Has at least one sensor
    });
  });

  describe("Primary Metric Selection", () => {
    it("prioritizes reps for step-based activities", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_strength",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 5,
          requiresManualAdvance: true,
        },
        devices: {
          hasPowerMeter: true, // Even with power
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: true, // And GPS
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.primaryMetric).toBe("reps"); // Reps wins for strength
    });

    it("prioritizes power when available", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "unplanned",
        devices: {
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.primaryMetric).toBe("power");
    });

    it("falls back to distance when GPS available", () => {
      const input: RecordingConfigInput = {
        activityType: "outdoor_run",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: true,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.primaryMetric).toBe("distance");
    });

    it("falls back to time when nothing else available", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_treadmill",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.primaryMetric).toBe("time");
    });
  });

  describe("Edge Cases", () => {
    it("handles undefined plan gracefully", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "unplanned",
        devices: {
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldShowSteps).toBe(false);
      expect(config.capabilities.canAutoAdvanceSteps).toBe(false);
      expect(config.capabilities.isValid).toBe(true);
    });

    it("handles FTMS trainer with auto control disabled", () => {
      const input: RecordingConfigInput = {
        activityType: "indoor_bike_trainer",
        mode: "planned",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 5,
          requiresManualAdvance: false,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            features: {} as any,
            autoControlEnabled: false, // Disabled
          },
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
        gpsAvailable: false,
      };

      const config = RecordingConfigResolver.resolve(input);

      expect(config.capabilities.shouldAutoFollowTargets).toBe(false);
      expect(config.capabilities.shouldShowTrainerControl).toBe(true); // Still show targets
    });
  });
});
