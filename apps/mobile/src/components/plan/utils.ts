import {
  ActivityPlanStructure,
  Step,
  StepOrRepetition,
  IntensityTarget,
  Duration,
} from "@repo/core";

// ================================
// Types
// ================================

export interface FlattenedStep extends Step {
  index: number;
  fromRepetition?: number;
  originalRepetitionIndex?: number;
}

export interface WorkoutProfilePoint {
  index: number;
  name: string;
  description?: string;
  intensity: number;
  intensityType?: string;
  duration: number; // in seconds
  color: string;
  targets?: IntensityTarget[];
  cumulativeTime: number;
}

export interface WorkoutStats {
  totalSteps: number;
  totalDuration: number; // in seconds
  avgPower: number;
  maxPower: number;
  intervalCount: number;
  estimatedTSS: number;
  estimatedCalories: number;
  intensityZones: {
    z1: number; // Recovery (0-55% FTP)
    z2: number; // Aerobic (56-75% FTP)
    z3: number; // Tempo (76-90% FTP)
    z4: number; // Threshold (91-105% FTP)
    z5: number; // VO2 Max (106%+ FTP)
  };
}

// ================================
// Plan Processing Functions
// ================================

/**
 * Flatten a nested plan structure into a sequential array of steps
 */
export function flattenPlanSteps(
  steps: StepOrRepetition[],
  parentRep: number | null = null,
  acc: FlattenedStep[] = [],
): FlattenedStep[] {
  for (const step of steps) {
    if (step.type === "step") {
      acc.push({
        ...step,
        index: acc.length,
        fromRepetition: parentRep ?? undefined,
        originalRepetitionIndex: parentRep,
      });
    } else if (step.type === "repetition") {
      for (let i = 0; i < step.repeat; i++) {
        flattenPlanSteps(step.steps, i, acc);
      }
    }
  }
  return acc;
}

/**
 * Convert duration to milliseconds
 */
export function getDurationMs(duration: Duration): number {
  if (duration === "untilFinished") return 0;

  switch (duration.unit) {
    case "seconds":
      return duration.value * 1000;
    case "minutes":
      return duration.value * 60 * 1000;
    case "meters":
    case "km":
      // For distance-based, estimate based on activity type
      // This is a rough estimate - could be enhanced with user's typical pace
      return duration.value * 60 * 1000; // Assume 1 unit = 1 minute
    case "reps":
      // For rep-based, estimate time per rep
      return duration.value * 30 * 1000; // Assume 30 seconds per rep
    default:
      return 0;
  }
}

/**
 * Extract intensity value from a target for visualization
 */
export function getIntensityValue(target: IntensityTarget): number {
  // Return the primary value for visualization purposes
  if (target.target !== undefined) return target.target;
  if (target.min !== undefined && target.max !== undefined) {
    return (target.min + target.max) / 2;
  }
  if (target.min !== undefined) return target.min;
  if (target.max !== undefined) return target.max;
  return 0;
}

/**
 * Get color for intensity visualization based on type and value
 */
export function getIntensityColor(intensity: number, type?: string): string {
  if (!intensity || intensity === 0) return "#94a3b8"; // gray for rest/unknown

  switch (type) {
    case "%FTP":
      if (intensity >= 106) return "#dc2626"; // Z5 - Red
      if (intensity >= 91) return "#ea580c"; // Z4 - Orange
      if (intensity >= 76) return "#ca8a04"; // Z3 - Yellow
      if (intensity >= 56) return "#16a34a"; // Z2 - Green
      return "#06b6d4"; // Z1 - Light Blue

    case "watts":
      // Assuming 250W FTP for color coding - could be personalized
      const ftpPercent = (intensity / 250) * 100;
      return getIntensityColor(ftpPercent, "%FTP");

    case "%MaxHR":
    case "%ThresholdHR":
      if (intensity >= 95) return "#dc2626"; // Very High
      if (intensity >= 85) return "#ea580c"; // High
      if (intensity >= 75) return "#ca8a04"; // Moderate
      if (intensity >= 65) return "#16a34a"; // Light
      return "#06b6d4"; // Very Light

    default:
      // Generic intensity color coding
      if (intensity >= 90) return "#dc2626";
      if (intensity >= 70) return "#ea580c";
      if (intensity >= 50) return "#ca8a04";
      if (intensity >= 30) return "#16a34a";
      return "#06b6d4";
  }
}

/**
 * Determine intensity zone from FTP percentage
 */
export function getIntensityZone(
  ftpPercent: number,
): keyof WorkoutStats["intensityZones"] {
  if (ftpPercent >= 106) return "z5";
  if (ftpPercent >= 91) return "z4";
  if (ftpPercent >= 76) return "z3";
  if (ftpPercent >= 56) return "z2";
  return "z1";
}

/**
 * Extract workout profile data for visualization
 */
export function extractWorkoutProfile(
  structure: ActivityPlanStructure,
): WorkoutProfilePoint[] {
  const flattenedSteps = flattenPlanSteps(structure.steps);
  let cumulativeTime = 0;

  return flattenedSteps.map((step, index) => {
    const primaryTarget = step.targets?.[0]; // Get main intensity target
    const intensity = primaryTarget ? getIntensityValue(primaryTarget) : 0;
    const duration =
      step.duration && step.duration !== "untilFinished"
        ? getDurationMs(step.duration) / 1000
        : 300; // Default 5 minutes for untilFinished

    const point: WorkoutProfilePoint = {
      index,
      name: step.name || `Step ${index + 1}`,
      description: step.description,
      intensity,
      intensityType: primaryTarget?.type,
      duration,
      color: getIntensityColor(intensity, primaryTarget?.type),
      targets: step.targets,
      cumulativeTime,
    };

    cumulativeTime += duration;
    return point;
  });
}

/**
 * Calculate comprehensive workout statistics
 */
export function calculateWorkoutStats(
  structure: ActivityPlanStructure,
): WorkoutStats {
  const flattenedSteps = flattenPlanSteps(structure.steps);

  const stats: WorkoutStats = {
    totalSteps: flattenedSteps.length,
    totalDuration: 0,
    avgPower: 0,
    maxPower: 0,
    intervalCount: 0,
    estimatedTSS: 0,
    estimatedCalories: 0,
    intensityZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
  };

  let totalIntensity = 0;
  let totalIntensityTime = 0;

  flattenedSteps.forEach((step) => {
    // Calculate duration
    const duration =
      step.duration && step.duration !== "untilFinished"
        ? getDurationMs(step.duration) / 1000
        : 300; // Default 5 minutes
    stats.totalDuration += duration;

    // Analyze targets
    step.targets?.forEach((target) => {
      if (target.type === "%FTP" || target.type === "watts") {
        const intensity = getIntensityValue(target);

        // Convert watts to FTP% for consistent analysis (assuming 250W FTP)
        const ftpPercent =
          target.type === "watts" ? (intensity / 250) * 100 : intensity;

        totalIntensity += ftpPercent * duration; // Weight by duration
        totalIntensityTime += duration;

        if (ftpPercent > stats.maxPower) stats.maxPower = ftpPercent;
        if (ftpPercent > 85) stats.intervalCount++; // High intensity intervals

        // Track intensity zones weighted by duration
        const zone = getIntensityZone(ftpPercent);
        stats.intensityZones[zone] += duration;
      }
    });
  });

  // Calculate weighted averages
  stats.avgPower =
    totalIntensityTime > 0 ? totalIntensity / totalIntensityTime : 0;

  // Estimate TSS (Training Stress Score)
  // TSS = (duration in hours) × (avg intensity as FTP decimal)² × 100
  const durationHours = stats.totalDuration / 3600;
  const avgIntensityDecimal = stats.avgPower / 100;
  stats.estimatedTSS = durationHours * Math.pow(avgIntensityDecimal, 2) * 100;

  // Rough calorie estimate (1 TSS ≈ 4 calories)
  stats.estimatedCalories = stats.estimatedTSS * 4;

  return stats;
}

// ================================
// Target Analysis Functions
// ================================

/**
 * Check if current value is within target range
 */
export function isValueInTargetRange(
  current: number,
  target: IntensityTarget,
): boolean {
  if (target.min !== undefined && current < target.min) return false;
  if (target.max !== undefined && current > target.max) return false;

  // If only target is specified, use ±5% tolerance
  if (
    target.target !== undefined &&
    target.min === undefined &&
    target.max === undefined
  ) {
    const tolerance = target.target * 0.05;
    return (
      current >= target.target - tolerance &&
      current <= target.target + tolerance
    );
  }

  return true;
}

/**
 * Calculate adherence percentage to target
 */
export function calculateAdherence(
  current: number,
  target: IntensityTarget,
): number {
  const targetValue =
    target.target || ((target.min || 0) + (target.max || 0)) / 2;
  if (targetValue === 0) return 0;

  const difference = Math.abs(current - targetValue);
  const tolerance = targetValue * 0.1; // 10% tolerance

  return Math.max(0, Math.min(100, (1 - difference / tolerance) * 100));
}

/**
 * Format target range for display
 */
export function formatTargetRange(target: IntensityTarget): string {
  const unit = getTargetUnit(target.type);

  if (target.target !== undefined) {
    return `${target.target}${unit}`;
  }

  if (target.min !== undefined && target.max !== undefined) {
    return `${target.min}-${target.max}${unit}`;
  }

  if (target.min !== undefined) {
    return `>${target.min}${unit}`;
  }

  if (target.max !== undefined) {
    return `<${target.max}${unit}`;
  }

  return "No target";
}

/**
 * Get unit for target type
 */
export function getTargetUnit(type: string): string {
  switch (type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return "%";
    case "watts":
      return "W";
    case "bpm":
      return " bpm";
    case "speed":
      return " km/h";
    case "cadence":
      return " rpm";
    case "RPE":
      return "/10";
    default:
      return "";
  }
}

/**
 * Get display name for metric type
 */
export function getMetricDisplayName(type: string): string {
  switch (type) {
    case "%FTP":
      return "Power (FTP)";
    case "%MaxHR":
      return "Heart Rate (Max)";
    case "%ThresholdHR":
      return "Heart Rate (LT)";
    case "watts":
      return "Power";
    case "bpm":
      return "Heart Rate";
    case "speed":
      return "Speed";
    case "cadence":
      return "Cadence";
    case "RPE":
      return "Effort (RPE)";
    default:
      return type;
  }
}

/**
 * Format metric value for display
 */
export function formatMetricValue(value: number, type: string): string {
  const unit = getTargetUnit(type);

  switch (type) {
    case "speed":
      return `${value.toFixed(1)}${unit}`;
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return `${Math.round(value)}${unit}`;
    default:
      return `${Math.round(value)}${unit}`;
  }
}

/**
 * Get guidance text based on current vs target
 */
export function getTargetGuidanceText(
  target: IntensityTarget,
  current?: number,
): string {
  if (!current) return "Waiting for data...";

  const inRange = isValueInTargetRange(current, target);
  const targetValue =
    target.target || ((target.min || 0) + (target.max || 0)) / 2;

  if (inRange) {
    return "Perfect! Stay in this zone.";
  }

  if (current < targetValue) {
    const difference = targetValue - current;
    return `Increase by ${Math.round(difference)}${getTargetUnit(target.type)}`;
  } else {
    const difference = current - targetValue;
    return `Decrease by ${Math.round(difference)}${getTargetUnit(target.type)}`;
  }
}

// ================================
// Time Formatting
// ================================

/**
 * Format duration in seconds to readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

/**
 * Format duration for compact display
 */
export function formatDurationCompact(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${Math.floor(seconds)}s`;
  }
}
