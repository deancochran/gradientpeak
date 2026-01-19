/**
 * PredictiveResistanceCalculator
 *
 * Calculates resistance level from target power and current cadence/rate
 * using the power-torque-resistance relationship with aggressive smoothing
 * to prevent over-adjustment by the trainer.
 *
 * Algorithm:
 * Power (W) = (2π / 60) × Cadence (rpm) × Torque (Nm)
 * Torque = (Power × 60) / (2π × Cadence)
 * Resistance = Torque / DeviceSpecificConstant
 */

import { RollingBuffer } from "./RollingBuffer";
import type { FTMSFeatures } from "@repo/core/ftms-types";

export type FTMSDeviceType = "bike" | "rower" | "elliptical" | "treadmill";

/**
 * Device-specific constants for torque-to-resistance mapping
 */
const DEVICE_CONSTANTS = {
  bike: {
    torquePerResistanceLevel: 10.0, // Nm per resistance unit
    standardCadence: 85, // rpm (fallback when cadence unavailable)
  },
  rower: {
    torquePerResistanceLevel: 8.0,
    standardCadence: 22, // spm (strokes per minute)
  },
  elliptical: {
    torquePerResistanceLevel: 6.0,
    standardCadence: 60, // strides per minute
  },
  treadmill: {
    torquePerResistanceLevel: 10.0,
    standardCadence: 80, // steps per minute
  },
};

export class PredictiveResistanceCalculator {
  // Configuration
  private readonly SMOOTHING_WINDOW_MS = 2500; // 2.5s rolling average
  private readonly MAX_RESISTANCE_CHANGE_RATE = 2.0; // Max 2 levels per second
  private readonly MIN_CADENCE_THRESHOLD = 30; // RPM/SPM below this = use fallback

  // Buffers for smoothing
  private cadenceBuffer: RollingBuffer<number>;
  private resistanceHistory: Array<{ value: number; timestamp: number }> = [];
  private lastUpdateTime: number = 0;

  constructor() {
    this.cadenceBuffer = new RollingBuffer<number>(100);
  }

  /**
   * Calculate resistance from target power and current cadence
   *
   * @param targetPower - Target power in watts
   * @param currentCadence - Current cadence/rate from sensor (rpm, spm, strokes/min)
   * @param deviceType - Type of FTMS device
   * @param deviceFeatures - Device-specific features (resistance range, etc.)
   * @returns Resistance level (0-100 or device-specific range)
   */
  calculateResistance(
    targetPower: number,
    currentCadence: number,
    deviceType: FTMSDeviceType,
    deviceFeatures?: FTMSFeatures,
  ): number {
    const now = Date.now();

    // Step 1: Smooth cadence with rolling average
    const smoothedCadence = this.smoothCadence(currentCadence, now);

    // Step 2: Check for zero/low cadence edge case
    if (smoothedCadence < this.MIN_CADENCE_THRESHOLD) {
      return this.getFallbackResistance(targetPower, deviceType, deviceFeatures);
    }

    // Step 3: Calculate required torque from power equation
    // Power = (2π / 60) × Cadence × Torque
    // Torque = (Power × 60) / (2π × Cadence)
    const requiredTorque =
      (targetPower * 60) / (2 * Math.PI * smoothedCadence);

    // Step 4: Map torque to resistance level using device-specific curve
    let resistance = this.torqueToResistance(requiredTorque, deviceType);

    // Step 5: Apply resistance limits from device features
    resistance = this.applyDeviceLimits(resistance, deviceFeatures);

    // Step 6: Rate limit resistance changes (prevent sudden jumps)
    resistance = this.rateLimitResistance(resistance, now);

    return resistance;
  }

  /**
   * Smooth cadence using 2.5s rolling average with weighted samples
   * Recent samples have higher weight to balance responsiveness and smoothing
   */
  private smoothCadence(rawCadence: number, timestamp: number): number {
    this.cadenceBuffer.add(rawCadence, timestamp);

    // Get samples within smoothing window
    const samples = this.cadenceBuffer.getSamples(this.SMOOTHING_WINDOW_MS);

    if (samples.length === 0) return rawCadence;

    // Calculate weighted average (more recent samples have higher weight)
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < samples.length; i++) {
      const weight = (i + 1) / samples.length; // Linear weighting: 0.1, 0.2, ..., 1.0
      weightedSum += samples[i].value * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Rate limit resistance changes to prevent abrupt trainer responses
   */
  private rateLimitResistance(
    newResistance: number,
    timestamp: number,
  ): number {
    if (this.resistanceHistory.length === 0) {
      this.resistanceHistory.push({ value: newResistance, timestamp });
      this.lastUpdateTime = timestamp;
      return newResistance;
    }

    const lastResistance =
      this.resistanceHistory[this.resistanceHistory.length - 1].value;
    const timeSinceLastChange = (timestamp - this.lastUpdateTime) / 1000; // Convert to seconds

    // Calculate max allowed change based on time elapsed
    const maxChange =
      this.MAX_RESISTANCE_CHANGE_RATE * Math.max(timeSinceLastChange, 0.1);

    // Clamp new resistance to max change
    const clampedResistance = this.clamp(
      newResistance,
      lastResistance - maxChange,
      lastResistance + maxChange,
    );

    this.resistanceHistory.push({ value: clampedResistance, timestamp });
    this.lastUpdateTime = timestamp;

    // Keep only last 10 values
    if (this.resistanceHistory.length > 10) {
      this.resistanceHistory.shift();
    }

    return clampedResistance;
  }

  /**
   * Fallback when cadence is too low or unavailable
   * Use a conservative resistance based on target power at standard cadence
   */
  private getFallbackResistance(
    targetPower: number,
    deviceType: FTMSDeviceType,
    deviceFeatures?: FTMSFeatures,
  ): number {
    // Use last known resistance if available
    if (this.resistanceHistory.length > 0) {
      return this.resistanceHistory[this.resistanceHistory.length - 1].value;
    }

    // Otherwise calculate as if user were at standard cadence
    const constants = DEVICE_CONSTANTS[deviceType];
    const standardCadence = constants.standardCadence;

    const requiredTorque =
      (targetPower * 60) / (2 * Math.PI * standardCadence);
    let resistance = this.torqueToResistance(requiredTorque, deviceType);

    return this.applyDeviceLimits(resistance, deviceFeatures);
  }

  /**
   * Device-specific torque-to-resistance mapping
   * This is where device differences are handled
   */
  private torqueToResistance(
    torque: number,
    deviceType: FTMSDeviceType,
  ): number {
    const constants = DEVICE_CONSTANTS[deviceType];
    return torque / constants.torquePerResistanceLevel;
  }

  /**
   * Apply device-specific resistance limits
   */
  private applyDeviceLimits(
    resistance: number,
    features?: FTMSFeatures,
  ): number {
    const range = features?.resistanceRange;

    if (range) {
      return this.clamp(resistance, range.min, range.max);
    }

    // Default 0-100 range
    return this.clamp(resistance, 0, 100);
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Reset calculator state (call when starting new workout or changing devices)
   */
  reset(): void {
    this.cadenceBuffer.clear();
    this.resistanceHistory = [];
    this.lastUpdateTime = 0;
  }

  /**
   * Get current smoothed cadence (for debugging/monitoring)
   */
  getCurrentSmoothedCadence(): number | undefined {
    const samples = this.cadenceBuffer.getSamples(this.SMOOTHING_WINDOW_MS);
    if (samples.length === 0) return undefined;

    return this.smoothCadence(
      samples[samples.length - 1].value,
      samples[samples.length - 1].timestamp,
    );
  }
}
