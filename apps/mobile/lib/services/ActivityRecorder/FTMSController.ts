import {
    BLE_SERVICE_UUIDS,
    FTMS_CHARACTERISTICS,
    FTMS_OPCODES
} from "@repo/core";
import { Buffer } from "buffer";
import { Device } from "react-native-ble-plx";

export enum ControlMode {
  ERG = "erg",
  SIM = "sim",
  RESISTANCE = "resistance",
}

export interface FTMSFeatures {
  supportsERG: boolean;
  supportsSIM: boolean;
  supportsResistance: boolean;
  maxPower?: number;
  minPower?: number;
}

export interface FTMSControlEvent {
  timestamp: number;
  controlType: "power_target" | "simulation" | "resistance";
  targetValue: number;
  actualValue?: number;
  success: boolean;
  errorMessage?: string;
}

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

      const buffer = Buffer.from(characteristic.value, "base64");
      const view = new DataView(buffer.buffer);

      // Parse features from bytes 0-7 (64-bit flags)
      const featuresLow = view.getUint32(0, true);
      const featuresHigh = view.getUint32(4, true);

      this.features = {
        supportsERG: !!(featuresLow & 0x00004000), // Bit 14: Power Target Setting
        supportsSIM: !!(featuresLow & 0x00800000), // Bit 23: Indoor Bike Simulation Parameters
        supportsResistance: !!(featuresLow & 0x00002000), // Bit 13: Resistance Target Setting
      };

      console.log("[FTMS] Features:", this.features);
      return this.features;
    } catch (error) {
      console.error("[FTMS] Failed to read features:", error);
      throw error;
    }
  }

  /**
   * Request control of the trainer
   * Must be called before sending any control commands
   */
  async requestControl(): Promise<boolean> {
    const buffer = new Uint8Array([FTMS_OPCODES.REQUEST_CONTROL]);

    try {
      const success = await this.writeControlPoint(buffer);
      if (success) {
        console.log("[FTMS] Control granted");
      }
      return success;
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
      const success = await this.writeControlPoint(buffer);
      if (success) {
        console.log("[FTMS] Trainer reset");
        this.currentControlMode = undefined;
      }
      return success;
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
    if (!this.features?.supportsERG) {
      console.warn("[FTMS] Trainer does not support ERG mode");
      return false;
    }

    // Validate power range
    const targetPower = Math.max(0, Math.min(watts, 4000));

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

      const success = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "power_target",
        targetValue: targetPower,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set power target: ${targetPower}W`);
      }

      return success;
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
    if (!this.features?.supportsSIM) {
      console.warn("[FTMS] Trainer does not support SIM mode");
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

      const success = await this.writeControlPoint(buffer);

      // Log control event (using grade as primary value)
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "simulation",
        targetValue: params.grade,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set simulation: ${params.grade}% grade`);
      }

      return success;
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
    if (!this.features?.supportsResistance) {
      console.warn("[FTMS] Trainer does not support resistance mode");
      return false;
    }

    // Validate resistance range
    const targetResistance = Math.max(0, Math.min(level, 100));

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

      const success = await this.writeControlPoint(buffer);

      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: "resistance",
        targetValue: targetResistance,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set resistance: ${targetResistance}%`);
      }

      return success;
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

  // ==================== Control Point Write ====================

  /**
   * Write to FTMS Control Point characteristic with blocking
   * Prevents multiple simultaneous writes
   */
  private async writeControlPoint(
    buffer: Uint8Array,
    retries = 3,
  ): Promise<boolean> {
    // Check if control point is blocked
    if (this.isBlocked) {
      console.warn("[FTMS] Control point blocked, rejecting write");
      return false;
    }

    // Block control point
    this.isBlocked = true;

    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          await this.device.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.CONTROL_POINT,
            Buffer.from(buffer).toString("base64"),
          );

          // Unblock after successful write
          setTimeout(() => {
            this.isBlocked = false;
          }, 500); // 500ms delay before accepting next command

          return true;
        } catch (error) {
          console.warn(`[FTMS] Write attempt ${attempt + 1} failed:`, error);

          if (attempt < retries - 1) {
            // Exponential backoff: 500ms, 1s, 2s
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      return false;
    } finally {
      // Ensure control point is unblocked even on error
      setTimeout(() => {
        this.isBlocked = false;
      }, 1000);
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

          const buffer = Buffer.from(characteristic.value, "base64");
          const opCode = buffer[0];

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
            statusMessages[opCode] || `Unknown status (0x${opCode.toString(16)})`;
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
