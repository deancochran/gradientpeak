/**
 * SimplifiedMetrics - Clean, structured interface for activity metrics
 *
 * This provides a cleaner API on top of the existing LiveMetricsManager,
 * organizing metrics into logical groups and using zone arrays instead of
 * individual fields.
 *
 * Key benefits:
 * - Flat, reactive structure (no nested state)
 * - Zone arrays match database schema
 * - Easy to serialize for upload
 * - Clear separation of concerns
 */

// ================================
// Core Interfaces
// ================================

/**
 * Speed display format based on velocity
 */
export type SpeedDisplayFormat = "pace" | "speed";

export interface SimplifiedMetrics {
  /** Current sensor readings (latest values) */
  current: {
    power?: number;
    heartRate?: number;
    cadence?: number;
    speed?: number; // m/s
    temperature?: number;
    position?: {
      lat: number;
      lng: number;
      alt?: number;
      heading?: number;
    };
  };

  /** Display format recommendation for speed/pace */
  display: {
    format: SpeedDisplayFormat; // "pace" for running, "speed" for cycling
    value: number; // Either pace (min/km) or speed (km/h)
    unit: string; // "min/km" or "km/h"
  };

  /** Cumulative totals */
  totals: {
    elapsed: number; // seconds
    moving: number; // seconds
    distance: number; // meters
    work: number; // joules
    ascent: number; // meters
    descent: number; // meters
    calories: number;
  };

  /** Average values */
  avg: {
    power: number;
    heartRate: number;
    speed: number; // m/s
    cadence: number;
    grade: number; // %
    temperature: number;
  };

  /** Maximum values */
  max: {
    power: number;
    heartRate: number;
    speed: number; // m/s
    cadence: number;
    temperature: number;
  };

  /** Zone time distributions (in seconds) */
  zones: {
    hr: [number, number, number, number, number]; // 5 zones
    power: [number, number, number, number, number, number, number]; // 7 zones
  };

  /** Advanced metrics (requires sufficient data) */
  advanced?: {
    normalizedPower: number;
    tss: number;
    intensityFactor: number;
    variabilityIndex: number;
    efficiencyFactor: number;
    decoupling: number;
    powerWeightRatio: number;
    powerHrRatio: number;
  };

  /** Plan adherence (if following a plan) */
  plan?: {
    currentStepIndex: number;
    adherence: number; // % accuracy
  };
}

// ================================
// Sensor Validation
// ================================

export class SensorModel<T> {
  constructor(
    public metric: string,
    public validator: (value: T) => boolean,
    public defaultValue: T,
  ) {}

  validate(value: T): T | null {
    if (this.validator(value)) {
      return value;
    }
    console.warn(`[SensorModel] Invalid ${this.metric}:`, value);
    return null;
  }
}

/**
 * Sensor validation models with range checking
 */
export const sensorModels = {
  power: new SensorModel<number>(
    "power",
    (v: number) => v >= 0 && v <= 4000,
    0,
  ),
  heartrate: new SensorModel<number>(
    "heartrate",
    (v: number) => v >= 30 && v <= 250,
    0,
  ),
  cadence: new SensorModel<number>(
    "cadence",
    (v: number) => v >= 0 && v <= 255,
    0,
  ),
  speed: new SensorModel<number>("speed", (v: number) => v >= 0 && v <= 100, 0),
  temperature: new SensorModel<number>(
    "temperature",
    (v: number) => v >= -50 && v <= 60,
    0,
  ),
};

export function getSensorModel(
  metric: string,
): SensorModel<number> | undefined {
  return sensorModels[metric as keyof typeof sensorModels];
}

// ================================
// Zone Calculation Helpers
// ================================

/**
 * Calculate power zone index (0-6) based on FTP
 * Using Coggan 7-zone model
 */
export function getPowerZone(watts: number, ftp: number): number {
  const percent = (watts / ftp) * 100;
  if (percent < 55) return 0; // Active Recovery
  if (percent < 75) return 1; // Endurance
  if (percent < 90) return 2; // Tempo
  if (percent < 105) return 3; // Lactate Threshold
  if (percent < 120) return 4; // VO2 Max
  if (percent < 150) return 5; // Anaerobic Capacity
  return 6; // Neuromuscular Power
}

/**
 * Calculate heart rate zone index (0-4) based on threshold HR
 * Using 5-zone model
 */
export function getHRZone(bpm: number, threshold_hr: number): number {
  const percent = (bpm / threshold_hr) * 100;
  if (percent < 81) return 0; // Zone 1 - Recovery
  if (percent < 89) return 1; // Zone 2 - Aerobic
  if (percent < 94) return 2; // Zone 3 - Tempo
  if (percent < 100) return 3; // Zone 4 - Threshold
  return 4; // Zone 5 - Anaerobic
}

/**
 * Get zone names for display
 */
export const POWER_ZONE_NAMES = [
  "Active Recovery",
  "Endurance",
  "Tempo",
  "Threshold",
  "VO2 Max",
  "Anaerobic",
  "Neuromuscular",
] as const;

export const HR_ZONE_NAMES = [
  "Recovery",
  "Aerobic",
  "Tempo",
  "Threshold",
  "Anaerobic",
] as const;

/**
 * Calculate zone distribution percentages
 */
export function getZoneDistribution(
  zoneTimes: number[],
): Array<{ zone: number; seconds: number; percentage: number }> {
  const total = zoneTimes.reduce((sum, time) => sum + time, 0);

  return zoneTimes.map((seconds, index) => ({
    zone: index,
    seconds,
    percentage: total > 0 ? (seconds / total) * 100 : 0,
  }));
}

// ================================
// Speed/Pace Display Utilities
// ================================

/**
 * Threshold for switching between pace and speed display
 * 3.5 m/s = 12.6 km/h (typical running/cycling boundary)
 */
const SPEED_PACE_THRESHOLD_MPS = 3.5;

/**
 * Calculate display format and value based on current speed
 * @param speedMPS - Speed in meters per second
 * @returns Display object with format, value, and unit
 */
export function getSpeedDisplay(speedMPS: number | undefined): {
  format: SpeedDisplayFormat;
  value: number;
  unit: string;
} {
  // Default to speed format if no data
  if (!speedMPS || speedMPS === 0) {
    return {
      format: "speed",
      value: 0,
      unit: "km/h",
    };
  }

  // Use pace format for running speeds (< 3.5 m/s or 12.6 km/h)
  if (speedMPS < SPEED_PACE_THRESHOLD_MPS) {
    const paceMinPerKm = speedMPS > 0 ? 1000 / speedMPS / 60 : 0;
    return {
      format: "pace",
      value: paceMinPerKm,
      unit: "min/km",
    };
  }

  // Use speed format for cycling speeds (>= 3.5 m/s)
  const speedKmH = speedMPS * 3.6;
  return {
    format: "speed",
    value: speedKmH,
    unit: "km/h",
  };
}

/**
 * Format pace for display
 * @param paceMinPerKm - Pace in minutes per kilometer
 * @returns Formatted string like "5:30"
 */
export function formatPace(paceMinPerKm: number): string {
  if (!paceMinPerKm || paceMinPerKm === 0 || !isFinite(paceMinPerKm)) {
    return "--:--";
  }
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format speed for display
 * @param speedKmH - Speed in km/h
 * @returns Formatted string like "25.4"
 */
export function formatSpeed(speedKmH: number): string {
  if (!speedKmH || speedKmH === 0) {
    return "0.0";
  }
  return speedKmH.toFixed(1);
}

// ================================
// Conversion Utilities
// ================================

/**
 * Convert LiveMetricsState to SimplifiedMetrics
 * This is the bridge between the existing system and the new interface
 */
export function convertToSimplifiedMetrics(
  state: import("./types").LiveMetricsState,
  currentReadings: any,
  hasEnoughData: boolean,
  profile?: { ftp?: number; weight_kg?: number },
): SimplifiedMetrics {
  // Calculate dynamic speed/pace display
  const speedDisplay = getSpeedDisplay(currentReadings.speed);

  const metrics: SimplifiedMetrics = {
    current: {
      power: currentReadings.power,
      heartRate: currentReadings.heartRate,
      cadence: currentReadings.cadence,
      speed: currentReadings.speed,
      temperature: currentReadings.temperature,
      position: currentReadings.position,
    },
    display: speedDisplay,
    totals: {
      elapsed: state.elapsedTime,
      moving: state.movingTime,
      distance: state.distance,
      work: state.totalWork,
      ascent: state.totalAscent,
      descent: state.totalDescent,
      calories: state.calories,
    },
    avg: {
      power: state.avgPower,
      heartRate: state.avgHeartRate,
      speed: state.avgSpeed,
      cadence: state.avgCadence,
      grade: state.avgGrade,
      temperature: state.avgTemperature || 0,
    },
    max: {
      power: state.maxPower,
      heartRate: state.maxHeartRate,
      speed: state.maxSpeed,
      cadence: state.maxCadence,
      temperature: state.maxTemperature || 0,
    },
    zones: {
      hr: [
        state.hrZone1Time,
        state.hrZone2Time,
        state.hrZone3Time,
        state.hrZone4Time,
        state.hrZone5Time,
      ],
      power: [
        state.powerZone1Time,
        state.powerZone2Time,
        state.powerZone3Time,
        state.powerZone4Time,
        state.powerZone5Time,
        state.powerZone6Time,
        state.powerZone7Time,
      ],
    },
  };

  // Add advanced metrics if we have enough data
  if (hasEnoughData && state.normalizedPowerEst > 0) {
    metrics.advanced = {
      normalizedPower: state.normalizedPowerEst,
      tss: state.trainingStressScoreEst,
      intensityFactor: state.intensityFactorEst,
      variabilityIndex: state.variabilityIndexEst,
      efficiencyFactor: state.efficiencyFactorEst,
      decoupling: state.decouplingEst,
      powerWeightRatio:
        profile?.weight_kg && state.avgPower > 0
          ? state.avgPower / profile.weight_kg
          : 0,
      powerHrRatio: state.powerHeartRateRatio,
    };
  }

  // Add plan adherence if available
  if (state.adherenceCurrentStep > 0) {
    metrics.plan = {
      currentStepIndex: 0, // This would come from ActivityRecorderService
      adherence: state.adherenceCurrentStep,
    };
  }

  return metrics;
}
