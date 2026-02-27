import {
  BLE_SERVICE_UUIDS,
  FTMS_CHARACTERISTICS,
  FTMS_OPCODES,
  FTMS_FEATURE_BITS,
  FTMS_TARGET_SETTING_BITS,
  FTMS_RESULT_CODES,
  // Import FTMS types from core
  type FTMSFeatures,
  type FTMSResponse,
  type FTMSControlEvent,
  ControlMode,
} from "@repo/core";
import { Buffer } from "buffer";
import { Device } from "react-native-ble-plx";
import { decodeBase64ToBytes, toDataView } from "./ble-bytes";

// Re-export for backwards compatibility
export { ControlMode };
export type { FTMSFeatures, FTMSResponse, FTMSControlEvent };

export interface SimulationParams {
  windSpeed: number; // m/s
  grade: number; // percentage (-100 to 100)
  crr: number; // coefficient of rolling resistance (0.0001 to 0.01)
  windResistance: number; // kg/m (0.01 to 2.55)
}

export class FTMSController {
  private device: Device;
  private isBlocked = false;
  private currentControlMode?: ControlMode;
  private features?: FTMSFeatures;
  public controlEvents: FTMSControlEvent[] = [];

  constructor(device: Device) {
    this.device = device;
  }

  // ==================== Setup & Feature Detection ====================

  /**
   * Read FTMS features to determine trainer capabilities
   * Must be called after connection before sending control commands
   *
   * Parses all 64 bits according to FTMS spec Section 4.3.1:
   * - Bytes 0-3: Fitness Machine Features
   * - Bytes 4-7: Target Setting Features
   */
  async readFeatures(): Promise<FTMSFeatures> {
    try {
      const characteristic = await this.device.readCharacteristicForService(
        BLE_SERVICE_UUIDS.FITNESS_MACHINE,
        FTMS_CHARACTERISTICS.FEATURE,
      );

      if (!characteristic.value) {
        throw new Error("Failed to read FTMS features");
      }

      const view = toDataView(decodeBase64ToBytes(characteristic.value));
      if (view.byteLength < 8) {
        throw new Error("Malformed FTMS features payload");
      }

      // Parse Fitness Machine Features (Bytes 0-3)
      const machineFeatures = view.getUint32(0, true);

      // Parse Target Setting Features (Bytes 4-7)
      const targetFeatures = view.getUint32(4, true);

      // Helper to check if bit is set
      const checkBit = (value: number, bit: number): boolean =>
        !!(value & (1 << bit));

      this.features = {
        // Fitness Machine Features (Bytes 0-3)
        averageSpeedSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.AVERAGE_SPEED_SUPPORTED,
        ),
        cadenceSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.CADENCE_SUPPORTED,
        ),
        totalDistanceSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.TOTAL_DISTANCE_SUPPORTED,
        ),
        inclinationSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.INCLINATION_SUPPORTED,
        ),
        elevationGainSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.ELEVATION_GAIN_SUPPORTED,
        ),
        paceSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.PACE_SUPPORTED,
        ),
        stepCountSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.STEP_COUNT_SUPPORTED,
        ),
        resistanceLevelSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.RESISTANCE_LEVEL_SUPPORTED,
        ),
        strideCountSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.STRIDE_COUNT_SUPPORTED,
        ),
        expendedEnergySupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.EXPENDED_ENERGY_SUPPORTED,
        ),
        heartRateMeasurementSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.HEART_RATE_MEASUREMENT_SUPPORTED,
        ),
        metabolicEquivalentSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.METABOLIC_EQUIVALENT_SUPPORTED,
        ),
        elapsedTimeSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.ELAPSED_TIME_SUPPORTED,
        ),
        remainingTimeSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.REMAINING_TIME_SUPPORTED,
        ),
        powerMeasurementSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.POWER_MEASUREMENT_SUPPORTED,
        ),
        forceOnBeltSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.FORCE_ON_BELT_SUPPORTED,
        ),
        userDataRetentionSupported: checkBit(
          machineFeatures,
          FTMS_FEATURE_BITS.USER_DATA_RETENTION_SUPPORTED,
        ),

        // Target Setting Features (Bytes 4-7)
        speedTargetSettingSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.SPEED_TARGET_SETTING_SUPPORTED,
        ),
        inclinationTargetSettingSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.INCLINATION_TARGET_SETTING_SUPPORTED,
        ),
        resistanceTargetSettingSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.RESISTANCE_TARGET_SETTING_SUPPORTED,
        ),
        powerTargetSettingSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.POWER_TARGET_SETTING_SUPPORTED,
        ),
        heartRateTargetSettingSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.HEART_RATE_TARGET_SETTING_SUPPORTED,
        ),
        targetedExpendedEnergySupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_EXPENDED_ENERGY_SUPPORTED,
        ),
        targetedStepNumberSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_STEP_NUMBER_SUPPORTED,
        ),
        targetedStrideNumberSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_STRIDE_NUMBER_SUPPORTED,
        ),
        targetedDistanceSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_DISTANCE_SUPPORTED,
        ),
        targetedTrainingTimeSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_TRAINING_TIME_SUPPORTED,
        ),
        targetedTimeTwoHRZonesSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_TIME_TWO_HR_ZONES_SUPPORTED,
        ),
        targetedTimeThreeHRZonesSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_TIME_THREE_HR_ZONES_SUPPORTED,
        ),
        targetedTimeFiveHRZonesSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_TIME_FIVE_HR_ZONES_SUPPORTED,
        ),
        indoorBikeSimulationSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.INDOOR_BIKE_SIMULATION_SUPPORTED,
        ),
        wheelCircumferenceSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.WHEEL_CIRCUMFERENCE_SUPPORTED,
        ),
        spinDownControlSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.SPIN_DOWN_CONTROL_SUPPORTED,
        ),
        targetedCadenceSupported: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.TARGETED_CADENCE_SUPPORTED,
        ),

        // Legacy properties (for backwards compatibility)
        supportsERG: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.POWER_TARGET_SETTING_SUPPORTED,
        ),
        supportsSIM: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.INDOOR_BIKE_SIMULATION_SUPPORTED,
        ),
        supportsResistance: checkBit(
          targetFeatures,
          FTMS_TARGET_SETTING_BITS.RESISTANCE_TARGET_SETTING_SUPPORTED,
        ),
      };

      console.log("[FTMS] Features detected:", {
        power: this.features.powerTargetSettingSupported,
        speed: this.features.speedTargetSettingSupported,
        inclination: this.features.inclinationTargetSettingSupported,
        resistance: this.features.resistanceTargetSettingSupported,
        heartRate: this.features.heartRateTargetSettingSupported,
        simulation: this.features.indoorBikeSimulationSupported,
        cadence: this.features.targetedCadenceSupported,
      });

      // Read supported ranges if available
      await this.readSupportedRanges();

      return this.features;
    } catch (error) {
      console.error("[FTMS] Failed to read features:", error);
      throw error;
    }
  }

  /**
   * Read supported ranges for target settings
   * Called automatically by readFeatures()
   */
  private async readSupportedRanges(): Promise<void> {
    if (!this.features) return;

    try {
      // Read power range if supported
      if (this.features.powerTargetSettingSupported) {
        const powerChar = await this.device
          .readCharacteristicForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.SUPPORTED_POWER_RANGE,
          )
          .catch(() => null);

        if (powerChar?.value) {
          const view = toDataView(decodeBase64ToBytes(powerChar.value));
          if (view.byteLength < 6) {
            console.warn("[FTMS] Malformed supported power range payload");
          } else {
            this.features.powerRange = {
              min: view.getInt16(0, true),
              max: view.getInt16(2, true),
              increment: view.getUint16(4, true),
            };
            console.log("[FTMS] Power range:", this.features.powerRange);
          }
        }
      }

      // Read speed range if supported
      if (this.features.speedTargetSettingSupported) {
        const speedChar = await this.device
          .readCharacteristicForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.SUPPORTED_SPEED_RANGE,
          )
          .catch(() => null);

        if (speedChar?.value) {
          const view = toDataView(decodeBase64ToBytes(speedChar.value));
          if (view.byteLength < 6) {
            console.warn("[FTMS] Malformed supported speed range payload");
          } else {
            this.features.speedRange = {
              min: view.getUint16(0, true) * 0.01, // Convert to km/h
              max: view.getUint16(2, true) * 0.01,
              increment: view.getUint16(4, true) * 0.01,
            };
            console.log("[FTMS] Speed range:", this.features.speedRange);
          }
        }
      }

      // Read inclination range if supported
      if (this.features.inclinationTargetSettingSupported) {
        const inclinationChar = await this.device
          .readCharacteristicForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.SUPPORTED_INCLINATION_RANGE,
          )
          .catch(() => null);

        if (inclinationChar?.value) {
          const view = toDataView(decodeBase64ToBytes(inclinationChar.value));
          if (view.byteLength < 6) {
            console.warn(
              "[FTMS] Malformed supported inclination range payload",
            );
          } else {
            this.features.inclinationRange = {
              min: view.getInt16(0, true) * 0.1, // Convert to percent
              max: view.getInt16(2, true) * 0.1,
              increment: view.getUint16(4, true) * 0.1,
            };
            console.log(
              "[FTMS] Inclination range:",
              this.features.inclinationRange,
            );
          }
        }
      }

      // Read resistance range if supported
      if (this.features.resistanceTargetSettingSupported) {
        const resistanceChar = await this.device
          .readCharacteristicForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.SUPPORTED_RESISTANCE_LEVEL_RANGE,
          )
          .catch(() => null);

        if (resistanceChar?.value) {
          const view = toDataView(decodeBase64ToBytes(resistanceChar.value));
          if (view.byteLength < 6) {
            console.warn("[FTMS] Malformed supported resistance range payload");
          } else {
            this.features.resistanceRange = {
              min: view.getInt16(0, true) * 0.1,
              max: view.getInt16(2, true) * 0.1,
              increment: view.getUint16(4, true) * 0.1,
            };
            console.log(
              "[FTMS] Resistance range:",
              this.features.resistanceRange,
            );
          }
        }
      }

      // Read heart rate range if supported
      if (this.features.heartRateTargetSettingSupported) {
        const hrChar = await this.device
          .readCharacteristicForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.SUPPORTED_HEART_RATE_RANGE,
          )
          .catch(() => null);

        if (hrChar?.value) {
          const view = toDataView(decodeBase64ToBytes(hrChar.value));
          if (view.byteLength < 3) {
            console.warn("[FTMS] Malformed supported heart rate range payload");
          } else {
            this.features.heartRateRange = {
              min: view.getUint8(0),
              max: view.getUint8(1),
              increment: view.getUint8(2),
            };
            console.log(
              "[FTMS] Heart rate range:",
              this.features.heartRateRange,
            );
          }
        }
      }
    } catch (error) {
      console.warn("[FTMS] Failed to read some supported ranges:", error);
      // Non-fatal, continue without ranges
    }
  }

  /**
   * Request control of the trainer
   * Must be called before sending any control commands
   */
  async requestControl(): Promise<boolean> {
    const buffer = new Uint8Array([FTMS_OPCODES.REQUEST_CONTROL]);

    try {
      const response = await this.writeControlPoint(buffer);
      if (response.success) {
        console.log("[FTMS] Control granted");
      } else {
        console.warn("[FTMS] Control request failed:", response.resultCodeName);
      }
      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to request control:", error);
      return false;
    }
  }

  /**
   * Reset trainer to neutral state
   * Recommended when switching control modes
   */
  async reset(): Promise<boolean> {
    const buffer = new Uint8Array([FTMS_OPCODES.RESET]);

    try {
      const response = await this.writeControlPoint(buffer);
      if (response.success) {
        console.log("[FTMS] Trainer reset");
        this.currentControlMode = undefined;
      } else {
        console.warn("[FTMS] Reset failed:", response.resultCodeName);
      }
      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to reset:", error);
      return false;
    }
  }

  // ==================== ERG Mode (Power Target) ====================

  /**
   * Set target power in ERG mode
   * Trainer will automatically adjust resistance to maintain this power
   *
   * @param watts - Target power (0-4000W)
   */
  async setPowerTarget(watts: number): Promise<boolean> {
    if (!this.features?.powerTargetSettingSupported) {
      console.warn("[FTMS] Trainer does not support power target setting");
      return false;
    }

    // Validate power range
    const range = this.features.powerRange;
    const targetPower = range
      ? Math.max(range.min, Math.min(watts, range.max))
      : Math.max(0, Math.min(watts, 4000));

    // Op code 0x05 = Set Target Power
    // Power in watts (signed 16-bit, resolution 1W)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_POWER;
    buffer[1] = targetPower & 0xff; // Low byte
    buffer[2] = (targetPower >> 8) & 0xff; // High byte

    try {
      // Switch to ERG mode if needed
      if (this.currentControlMode !== ControlMode.ERG) {
        await this.reset();
        this.currentControlMode = ControlMode.ERG;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetPower,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(`[FTMS] Set power target: ${targetPower}W`);
      } else {
        console.warn(
          `[FTMS] Failed to set power target: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set power target:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetPower,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== SIM Mode (Terrain Simulation) ====================

  /**
   * Set indoor bike simulation parameters
   * Trainer will simulate real-world conditions
   *
   * @param params - Simulation parameters
   */
  async setSimulation(params: SimulationParams): Promise<boolean> {
    if (!this.features?.indoorBikeSimulationSupported) {
      console.warn("[FTMS] Trainer does not support indoor bike simulation");
      return false;
    }

    // Op code 0x11 = Set Indoor Bike Simulation Parameters
    const buffer = new Uint8Array(7);
    buffer[0] = FTMS_OPCODES.SET_INDOOR_BIKE_SIMULATION;

    // Wind speed (m/s, signed 16-bit, resolution 0.001 m/s)
    const windSpeed = Math.round(params.windSpeed * 1000);
    buffer[1] = windSpeed & 0xff;
    buffer[2] = (windSpeed >> 8) & 0xff;

    // Grade (percentage, signed 16-bit, resolution 0.01%)
    const grade = Math.round(params.grade * 100);
    buffer[3] = grade & 0xff;
    buffer[4] = (grade >> 8) & 0xff;

    // Crr (coefficient of rolling resistance, 8-bit, resolution 0.0001)
    buffer[5] = Math.round(params.crr * 10000) & 0xff;

    // Wind resistance (kg/m, 8-bit, resolution 0.01 kg/m)
    buffer[6] = Math.round(params.windResistance * 100) & 0xff;

    try {
      // Switch to SIM mode if needed
      if (this.currentControlMode !== ControlMode.SIM) {
        await this.reset();
        this.currentControlMode = ControlMode.SIM;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event (using grade as primary value)
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "simulation",
        targetValue: params.grade,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(`[FTMS] Set simulation: ${params.grade}% grade`);
      } else {
        console.warn(
          `[FTMS] Failed to set simulation: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set simulation:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "simulation",
        targetValue: params.grade,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Resistance Mode ====================

  /**
   * Set target resistance level
   * User's power output will vary with cadence
   *
   * @param level - Resistance level (0-100, unitless)
   */
  async setResistanceTarget(level: number): Promise<boolean> {
    if (!this.features?.resistanceTargetSettingSupported) {
      console.warn("[FTMS] Trainer does not support resistance target setting");
      return false;
    }

    // Validate resistance range
    const range = this.features.resistanceRange;
    const targetResistance = range
      ? Math.max(range.min, Math.min(level, range.max))
      : Math.max(0, Math.min(level, 100));

    // Op code 0x04 = Set Target Resistance Level
    // Resistance level (unitless, signed 16-bit, resolution 0.1)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_RESISTANCE;
    const resistanceValue = Math.round(targetResistance * 10);
    buffer[1] = resistanceValue & 0xff;
    buffer[2] = (resistanceValue >> 8) & 0xff;

    try {
      // Switch to resistance mode if needed
      if (this.currentControlMode !== ControlMode.RESISTANCE) {
        await this.reset();
        this.currentControlMode = ControlMode.RESISTANCE;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "resistance",
        targetValue: targetResistance,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(`[FTMS] Set resistance: ${targetResistance}`);
      } else {
        console.warn(
          `[FTMS] Failed to set resistance: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set resistance:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "resistance",
        targetValue: targetResistance,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Speed Target Mode ====================

  /**
   * Set target speed
   * Trainer will adjust resistance to maintain target speed
   *
   * @param speedKph - Target speed in km/h
   */
  async setTargetSpeed(speedKph: number): Promise<boolean> {
    if (!this.features?.speedTargetSettingSupported) {
      console.warn("[FTMS] Trainer does not support speed target setting");
      return false;
    }

    // Validate speed range
    const range = this.features.speedRange;
    const targetSpeed = range
      ? Math.max(range.min, Math.min(speedKph, range.max))
      : Math.max(0, Math.min(speedKph, 60)); // Default max 60 km/h

    // Op code 0x02 = Set Target Speed
    // Speed in km/h (uint16, resolution 0.01 km/h)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_SPEED;
    const speedValue = Math.round(targetSpeed * 100);
    buffer[1] = speedValue & 0xff; // Low byte
    buffer[2] = (speedValue >> 8) & 0xff; // High byte

    try {
      // Switch to speed mode if needed
      if (this.currentControlMode !== ControlMode.SPEED) {
        await this.reset();
        this.currentControlMode = ControlMode.SPEED;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target", // Reusing existing type for logging
        targetValue: targetSpeed,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(`[FTMS] Set speed target: ${targetSpeed.toFixed(1)} km/h`);
      } else {
        console.warn(
          `[FTMS] Failed to set speed target: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set speed target:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetSpeed,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Inclination Target Mode ====================

  /**
   * Set target inclination
   * Controls treadmill incline or trainer grade
   *
   * @param percent - Target inclination in percent (-10 to +40)
   */
  async setTargetInclination(percent: number): Promise<boolean> {
    if (!this.features?.inclinationTargetSettingSupported) {
      console.warn(
        "[FTMS] Trainer does not support inclination target setting",
      );
      return false;
    }

    // Validate inclination range
    const range = this.features.inclinationRange;
    const targetInclination = range
      ? Math.max(range.min, Math.min(percent, range.max))
      : Math.max(-10, Math.min(percent, 40)); // Default range

    // Op code 0x03 = Set Target Inclination
    // Inclination in percent (sint16, resolution 0.1%)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_INCLINATION;
    const inclinationValue = Math.round(targetInclination * 10);
    buffer[1] = inclinationValue & 0xff; // Low byte
    buffer[2] = (inclinationValue >> 8) & 0xff; // High byte

    try {
      // Switch to inclination mode if needed
      if (this.currentControlMode !== ControlMode.INCLINATION) {
        await this.reset();
        this.currentControlMode = ControlMode.INCLINATION;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "simulation", // Similar to grade in simulation
        targetValue: targetInclination,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(
          `[FTMS] Set inclination target: ${targetInclination.toFixed(1)}%`,
        );
      } else {
        console.warn(
          `[FTMS] Failed to set inclination target: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set inclination target:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "simulation",
        targetValue: targetInclination,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Heart Rate Target Mode ====================

  /**
   * Set target heart rate
   * Trainer will adjust resistance to maintain target heart rate
   *
   * @param bpm - Target heart rate in beats per minute
   */
  async setTargetHeartRate(bpm: number): Promise<boolean> {
    if (!this.features?.heartRateTargetSettingSupported) {
      console.warn("[FTMS] Trainer does not support heart rate target setting");
      return false;
    }

    // Validate heart rate range
    const range = this.features.heartRateRange;
    const targetHR = range
      ? Math.max(range.min, Math.min(bpm, range.max))
      : Math.max(60, Math.min(bpm, 200)); // Default range

    // Op code 0x06 = Set Target Heart Rate
    // Heart rate in bpm (uint8, resolution 1 bpm)
    const buffer = new Uint8Array(2);
    buffer[0] = FTMS_OPCODES.SET_TARGET_HEART_RATE;
    buffer[1] = Math.round(targetHR) & 0xff;

    try {
      // Switch to heart rate mode if needed
      if (this.currentControlMode !== ControlMode.HEART_RATE) {
        await this.reset();
        this.currentControlMode = ControlMode.HEART_RATE;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target", // Reusing for logging
        targetValue: targetHR,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(
          `[FTMS] Set heart rate target: ${Math.round(targetHR)} bpm`,
        );
      } else {
        console.warn(
          `[FTMS] Failed to set heart rate target: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set heart rate target:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetHR,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Cadence Target Mode ====================

  /**
   * Set target cadence
   * Trainer will adjust to maintain target cadence
   *
   * @param rpm - Target cadence in revolutions per minute
   */
  async setTargetCadence(rpm: number): Promise<boolean> {
    if (!this.features?.targetedCadenceSupported) {
      console.warn("[FTMS] Trainer does not support cadence target setting");
      return false;
    }

    // Validate cadence range
    const targetCadence = Math.max(0, Math.min(rpm, 200)); // Reasonable range

    // Op code 0x14 = Set Targeted Cadence
    // Cadence in 1/minute (uint16, resolution 0.5 1/minute)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGETED_CADENCE;
    const cadenceValue = Math.round(targetCadence * 2); // 0.5 resolution
    buffer[1] = cadenceValue & 0xff; // Low byte
    buffer[2] = (cadenceValue >> 8) & 0xff; // High byte

    try {
      // Switch to cadence mode if needed
      if (this.currentControlMode !== ControlMode.CADENCE) {
        await this.reset();
        this.currentControlMode = ControlMode.CADENCE;
      }

      const response = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target", // Reusing for logging
        targetValue: targetCadence,
        success: response.success,
        errorMessage: response.success ? undefined : response.resultCodeName,
      });

      if (response.success) {
        console.log(
          `[FTMS] Set cadence target: ${Math.round(targetCadence)} rpm`,
        );
      } else {
        console.warn(
          `[FTMS] Failed to set cadence target: ${response.resultCodeName}`,
        );
      }

      return response.success;
    } catch (error) {
      console.error("[FTMS] Failed to set cadence target:", error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetCadence,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Control Point Write ====================

  /**
   * Write to FTMS Control Point characteristic with blocking and response validation
   * Prevents multiple simultaneous writes and validates responses according to FTMS spec
   */
  private async writeControlPoint(
    buffer: Uint8Array,
    retries = 3,
  ): Promise<FTMSResponse> {
    // Check if control point is blocked
    if (this.isBlocked) {
      console.warn("[FTMS] Control point blocked, rejecting write");
      return {
        requestOpCode: buffer[0],
        resultCode: FTMS_RESULT_CODES.OPERATION_FAILED,
        resultCodeName: "Blocked",
        success: false,
      };
    }

    // Block control point
    this.isBlocked = true;

    const requestOpCode = buffer[0];

    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          let abortResponseWait: (() => void) | undefined;

          const responsePromise = new Promise<FTMSResponse>(
            (resolve, reject) => {
              let settled = false;
              let subscription: { remove: () => void } | undefined;
              let timeout: ReturnType<typeof setTimeout> | undefined;

              const cleanup = () => {
                if (timeout) {
                  clearTimeout(timeout);
                  timeout = undefined;
                }
                if (subscription) {
                  subscription.remove();
                  subscription = undefined;
                }
              };

              const succeed = (response: FTMSResponse) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(response);
              };

              const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
              };

              timeout = setTimeout(() => {
                fail(new Error("Response timeout"));
              }, 2000);

              abortResponseWait = () => {
                fail(new Error("Control point write aborted"));
              };

              subscription = this.device.monitorCharacteristicForService(
                BLE_SERVICE_UUIDS.FITNESS_MACHINE,
                FTMS_CHARACTERISTICS.CONTROL_POINT,
                (error, characteristic) => {
                  if (error) {
                    fail(
                      error instanceof Error ? error : new Error(String(error)),
                    );
                    return;
                  }

                  if (!characteristic?.value) return;

                  const responseBytes = decodeBase64ToBytes(
                    characteristic.value,
                  );

                  if (responseBytes.byteLength < 1) {
                    return;
                  }

                  const responseOpCode = responseBytes[0];
                  if (responseOpCode !== FTMS_OPCODES.RESPONSE_CODE) {
                    return;
                  }

                  if (responseBytes.byteLength < 3) {
                    fail(new Error("Malformed FTMS response payload"));
                    return;
                  }

                  const receivedRequestOpCode = responseBytes[1];
                  if (receivedRequestOpCode !== requestOpCode) {
                    console.warn(
                      `[FTMS] Ignoring response for opcode 0x${receivedRequestOpCode.toString(16)} while waiting for 0x${requestOpCode.toString(16)}`,
                    );
                    return;
                  }

                  const resultCode = responseBytes[2];
                  succeed({
                    requestOpCode,
                    resultCode,
                    resultCodeName: this.getResultCodeName(resultCode),
                    success: resultCode === FTMS_RESULT_CODES.SUCCESS,
                    parameters:
                      responseBytes.byteLength > 3
                        ? responseBytes.slice(3)
                        : undefined,
                  });
                },
              );
            },
          );

          try {
            await this.device.writeCharacteristicWithResponseForService(
              BLE_SERVICE_UUIDS.FITNESS_MACHINE,
              FTMS_CHARACTERISTICS.CONTROL_POINT,
              Buffer.from(buffer).toString("base64"),
            );
          } catch (writeError) {
            abortResponseWait?.();
            throw writeError;
          }

          const response = await responsePromise;
          return response;
        } catch (error) {
          console.warn(`[FTMS] Write attempt ${attempt + 1} failed:`, error);

          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      return {
        requestOpCode,
        resultCode: FTMS_RESULT_CODES.OPERATION_FAILED,
        resultCodeName: "All retries failed",
        success: false,
      };
    } finally {
      setTimeout(() => {
        this.isBlocked = false;
      }, 500);
    }
  }

  /**
   * Get human-readable name for FTMS result code
   */
  private getResultCodeName(code: number): string {
    switch (code) {
      case FTMS_RESULT_CODES.SUCCESS:
        return "Success";
      case FTMS_RESULT_CODES.NOT_SUPPORTED:
        return "Not Supported";
      case FTMS_RESULT_CODES.INVALID_PARAMETER:
        return "Invalid Parameter";
      case FTMS_RESULT_CODES.OPERATION_FAILED:
        return "Operation Failed";
      case FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED:
        return "Control Not Permitted";
      default:
        return `Unknown (0x${code.toString(16)})`;
    }
  }

  // ==================== Status Monitoring ====================

  /**
   * Subscribe to FTMS status characteristic
   * Monitors trainer state changes and responses
   */
  async subscribeStatus(callback: (status: string) => void): Promise<void> {
    try {
      this.device.monitorCharacteristicForService(
        BLE_SERVICE_UUIDS.FITNESS_MACHINE,
        FTMS_CHARACTERISTICS.STATUS,
        (error, characteristic) => {
          if (error) {
            console.error("[FTMS] Status monitoring error:", error);
            return;
          }

          if (!characteristic?.value) return;

          const bytes = decodeBase64ToBytes(characteristic.value);
          if (bytes.byteLength < 1) {
            return;
          }

          const opCode = bytes[0];

          const statusMessages: Record<number, string> = {
            0x01: "Reset",
            0x02: "Stopped by user",
            0x03: "Stopped by safety key",
            0x04: "Started by user",
            0x07: "Target resistance changed",
            0x08: "Target power changed",
            0x12: "Indoor bike simulation parameters changed",
          };

          const message =
            statusMessages[opCode] ||
            `Unknown status (0x${opCode.toString(16)})`;
          console.log("[FTMS] Status:", message);
          callback(message);
        },
      );
    } catch (error) {
      console.error("[FTMS] Failed to subscribe to status:", error);
    }
  }

  // ==================== Getters ====================

  getFeatures(): FTMSFeatures | undefined {
    return this.features;
  }

  getCurrentMode(): ControlMode | undefined {
    return this.currentControlMode;
  }

  getControlEvents(): FTMSControlEvent[] {
    return this.controlEvents;
  }

  clearControlEvents(): void {
    this.controlEvents = [];
  }
}
