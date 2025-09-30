// ================================
// Time Calculations
// ================================

import { SelectActivityRecording } from "@/lib/db/schemas";
import { PublicActivityMetric, PublicActivityMetricDataType } from "@repo/core";

// Aggregated stream data
export interface AggregatedStream {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[];
  timestamps: number[];
  sampleCount: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
}

export function calculateElapsedTime(
  recording: SelectActivityRecording,
): number {
  if (!recording.startedAt || !recording.endedAt) return 0;
  return Math.floor(
    (new Date(recording.endedAt).getTime() -
      new Date(recording.startedAt).getTime()) /
      1000,
  );
}

export function calculateMovingTime(
  recording: SelectActivityRecording,
  aggregatedStreams: Map<string, AggregatedStream>,
): number {
  const movingStream = aggregatedStreams.get("moving");
  if (!movingStream) return calculateElapsedTime(recording);

  const movingValues = movingStream.values as boolean[];
  const movingCount = movingValues.filter((v) => v).length;

  // Estimate time based on sample rate (assuming ~1 sample per second)
  return movingCount;
}

// ================================
// Power Calculations
// ================================

export function calculateNormalizedPower(
  powerStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.values) return undefined;

  const powers = powerStream.values as number[];
  if (powers.length === 0) return undefined;

  // Proper NP calculation: rolling 30s average, then 4th power average
  const windowSize = 30; // 30 samples for 30 seconds (assuming 1Hz)
  const rollingAvgs: number[] = [];

  for (let i = 0; i < powers.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = powers.slice(start, i + 1);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAvgs.push(avg);
  }

  // Calculate 4th power average
  const fourthPowers = rollingAvgs.map((p) => Math.pow(p, 4));
  const avgFourthPower =
    fourthPowers.reduce((sum, p) => sum + p, 0) / fourthPowers.length;
  const np = Math.pow(avgFourthPower, 0.25);

  return Math.round(np);
}

export function calculateIntensityFactor(
  powerStream?: AggregatedStream,
  ftp?: number | null,
): number | undefined {
  if (!ftp) return undefined;
  const np = calculateNormalizedPower(powerStream);
  if (!np) return undefined;
  return Math.round((np / ftp) * 100) / 100; // Return as decimal (e.g., 0.85)
}

export function calculateTSS(
  powerStream: AggregatedStream | undefined,
  recording: SelectActivityRecording,
): number | undefined {
  if (!recording.profileFtp) return undefined;
  const np = calculateNormalizedPower(powerStream);
  const if_ = calculateIntensityFactor(powerStream, recording.profileFtp);
  if (!np || !if_) return undefined;

  const durationHours = calculateElapsedTime(recording) / 3600;
  return Math.round(durationHours * if_ * if_ * 100);
}

export function calculateVariabilityIndex(
  powerStream?: AggregatedStream,
  normalizedPower?: number,
): number | undefined {
  if (!powerStream?.avgValue || !normalizedPower) return undefined;
  return Math.round((normalizedPower / powerStream.avgValue) * 100) / 100;
}

export function calculateTotalWork(
  powerStream?: AggregatedStream,
  elapsedTime?: number,
): number | undefined {
  if (!powerStream?.avgValue || !elapsedTime) return undefined;
  // Work (kJ) = avg power (W) * time (s) / 1000
  return Math.round((powerStream.avgValue * elapsedTime) / 1000);
}

// ================================
// Heart Rate Calculations
// ================================

export function calculateHRZones(
  hrStream?: AggregatedStream,
  thresholdHR?: number | null,
): Record<string, number | undefined> {
  if (!hrStream?.values || !thresholdHR) {
    return {
      zone1: undefined,
      zone2: undefined,
      zone3: undefined,
      zone4: undefined,
      zone5: undefined,
    };
  }

  const hrs = hrStream.values as number[];
  const timestamps = hrStream.timestamps;

  // HR Zones based on threshold HR (LTHR)
  // Z1: < 81% | Z2: 81-89% | Z3: 90-93% | Z4: 94-99% | Z5: 100%+
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

  for (let i = 0; i < hrs.length; i++) {
    const pct = hrs[i] / thresholdHR;
    const timeInZone =
      i < timestamps.length - 1
        ? (timestamps[i + 1] - timestamps[i]) / 1000
        : 1; // Default 1 second

    if (pct < 0.81) zones.zone1 += timeInZone;
    else if (pct < 0.9) zones.zone2 += timeInZone;
    else if (pct < 0.94) zones.zone3 += timeInZone;
    else if (pct < 1.0) zones.zone4 += timeInZone;
    else zones.zone5 += timeInZone;
  }

  return {
    zone1: Math.round(zones.zone1),
    zone2: Math.round(zones.zone2),
    zone3: Math.round(zones.zone3),
    zone4: Math.round(zones.zone4),
    zone5: Math.round(zones.zone5),
  };
}

export function calculateMaxHRPercent(
  hrStream?: AggregatedStream,
  thresholdHR?: number | null,
): number | undefined {
  if (!hrStream?.maxValue || !thresholdHR) return undefined;
  return Math.round((hrStream.maxValue / thresholdHR) * 100) / 100;
}

// ================================
// Power Zone Calculations
// ================================

export function calculatePowerZones(
  powerStream?: AggregatedStream,
  ftp?: number | null,
): Record<string, number | undefined> {
  if (!powerStream?.values || !ftp) {
    return {
      zone1: undefined,
      zone2: undefined,
      zone3: undefined,
      zone4: undefined,
      zone5: undefined,
      zone6: undefined,
      zone7: undefined,
    };
  }

  const powers = powerStream.values as number[];
  const timestamps = powerStream.timestamps;

  // Power Zones based on FTP
  // Z1: < 55% | Z2: 56-75% | Z3: 76-90% | Z4: 91-105% | Z5: 106-120% | Z6: 121-150% | Z7: 150%+
  const zones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
    zone6: 0,
    zone7: 0,
  };

  for (let i = 0; i < powers.length; i++) {
    const pct = powers[i] / ftp;
    const timeInZone =
      i < timestamps.length - 1
        ? (timestamps[i + 1] - timestamps[i]) / 1000
        : 1;

    if (pct < 0.55) zones.zone1 += timeInZone;
    else if (pct < 0.76) zones.zone2 += timeInZone;
    else if (pct < 0.91) zones.zone3 += timeInZone;
    else if (pct < 1.06) zones.zone4 += timeInZone;
    else if (pct < 1.21) zones.zone5 += timeInZone;
    else if (pct < 1.51) zones.zone6 += timeInZone;
    else zones.zone7 += timeInZone;
  }

  return {
    zone1: Math.round(zones.zone1),
    zone2: Math.round(zones.zone2),
    zone3: Math.round(zones.zone3),
    zone4: Math.round(zones.zone4),
    zone5: Math.round(zones.zone5),
    zone6: Math.round(zones.zone6),
    zone7: Math.round(zones.zone7),
  };
}

// ================================
// Advanced Metrics
// ================================

export function calculateEfficiencyFactor(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.avgValue || !hrStream?.avgValue) return undefined;
  const np = calculateNormalizedPower(powerStream);
  if (!np) return undefined;
  return Math.round((np / hrStream.avgValue) * 100) / 100;
}

export function calculateDecoupling(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.values || !hrStream?.values) return undefined;

  const powers = powerStream.values as number[];
  const hrs = hrStream.values as number[];

  if (powers.length < 2 || hrs.length < 2) return undefined;

  // Split into first and second half
  const midpoint = Math.floor(powers.length / 2);

  const firstHalfPower =
    powers.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfPower =
    powers.slice(midpoint).reduce((a, b) => a + b, 0) /
    (powers.length - midpoint);

  const firstHalfHR =
    hrs.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfHR =
    hrs.slice(midpoint).reduce((a, b) => a + b, 0) / (hrs.length - midpoint);

  const firstHalfRatio = firstHalfPower / firstHalfHR;
  const secondHalfRatio = secondHalfPower / secondHalfHR;

  // Decoupling percentage
  return (
    Math.round(((secondHalfRatio - firstHalfRatio) / firstHalfRatio) * 10000) /
    100
  );
}

export function calculatePowerHeartRateRatio(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.avgValue || !hrStream?.avgValue) return undefined;
  return Math.round((powerStream.avgValue / hrStream.avgValue) * 100) / 100;
}

export function calculatePowerWeightRatio(
  powerStream?: AggregatedStream,
  weightKg?: number | null,
): number | undefined {
  if (!powerStream?.avgValue || !weightKg) return undefined;
  return Math.round((powerStream.avgValue / weightKg) * 100) / 100;
}

// ================================
// Elevation Calculations
// ================================

export function calculateElevationChanges(elevationStream?: AggregatedStream): {
  totalAscent: number;
  totalDescent: number;
} {
  if (!elevationStream?.values) return { totalAscent: 0, totalDescent: 0 };

  const elevations = elevationStream.values as number[];
  let totalAscent = 0;
  let totalDescent = 0;

  for (let i = 1; i < elevations.length; i++) {
    const change = elevations[i] - elevations[i - 1];
    if (change > 0) totalAscent += change;
    else if (change < 0) totalDescent += Math.abs(change);
  }

  return {
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
  };
}

export function calculateAverageGrade(
  gradientStream?: AggregatedStream,
): number | undefined {
  if (!gradientStream?.avgValue) return undefined;
  return Math.round(gradientStream.avgValue * 100) / 100;
}

export function calculateElevationGainPerKm(
  totalAscent: number,
  distanceStream?: AggregatedStream,
): number | undefined {
  if (!distanceStream?.maxValue || distanceStream.maxValue === 0)
    return undefined;
  const distanceKm = distanceStream.maxValue / 1000;
  return Math.round((totalAscent / distanceKm) * 100) / 100;
}

// ================================
// Calorie Calculations
// ================================

export function calculateCalories(
  recording: SelectActivityRecording,
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
  profile_dob?: string,
): number {
  // If power is available, use it (most accurate)
  if (powerStream?.avgValue) {
    const durationHours = calculateElapsedTime(recording) / 3600;
    return Math.round(powerStream.avgValue * durationHours * 3.6);
  }

  // Otherwise use HR-based estimation
  if (hrStream?.avgValue && recording.profileWeightKg && profile_dob) {
    const age = calculateAge(profile_dob) || 30;
    const weight = recording.profileWeightKg;
    const duration = calculateElapsedTime(recording) / 60; // minutes
    const avgHR = hrStream.avgValue;

    // Gender-specific calorie estimation (assuming male, adjust if you have gender data)
    const calories =
      ((age * 0.2017 + weight * 0.1988 + avgHR * 0.6309 - 55.0969) * duration) /
      4.184;
    return Math.round(calories);
  }

  return 0;
}

export function calculateAge(dob: string | null): number | undefined {
  if (!dob) return undefined;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
