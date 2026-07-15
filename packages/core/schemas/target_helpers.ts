import {
  activityPlanSpeedKphToMetersPerSecond,
  type IntensityTargetV2,
  type PlanStepV2,
} from "./activity_plan_v2";

// ==============================
// TARGET HELPER UTILITIES V2
// Runtime evaluation with dynamic tolerances
// ==============================

/**
 * Target builder helpers for fluent API
 */
export const Target = {
  ftp: (intensity: number): IntensityTargetV2 => ({
    type: "%FTP",
    intensity,
  }),

  maxHR: (intensity: number): IntensityTargetV2 => ({
    type: "%MaxHR",
    intensity,
  }),

  thresholdHR: (intensity: number): IntensityTargetV2 => ({
    type: "%ThresholdHR",
    intensity,
  }),

  watts: (intensity: number): IntensityTargetV2 => ({
    type: "watts",
    intensity,
  }),

  bpm: (intensity: number): IntensityTargetV2 => ({
    type: "bpm",
    intensity,
  }),

  speed: (intensity: number): IntensityTargetV2 => ({
    type: "speed",
    intensity,
  }),

  cadence: (intensity: number): IntensityTargetV2 => ({
    type: "cadence",
    intensity,
  }),

  rpe: (intensity: number): IntensityTargetV2 => ({
    type: "RPE",
    intensity,
  }),
};

/**
 * Get primary target from step
 */
export function getPrimaryTarget(step: PlanStepV2): IntensityTargetV2 | undefined {
  return step.targets?.[0];
}

/**
 * Check if step has a specific target type
 */
export function hasTargetType(step: PlanStepV2, type: IntensityTargetV2["type"]): boolean {
  return step.targets?.some((t) => t.type === type) ?? false;
}

/**
 * Get target by type from step
 */
export function getTargetByType(
  step: PlanStepV2,
  type: IntensityTargetV2["type"],
): IntensityTargetV2 | undefined {
  return step.targets?.find((t) => t.type === type);
}

/**
 * Validate if a value is within target range (runtime evaluation)
 * Uses dynamic tolerance based on target type
 *
 * NOTE: This is evaluated at runtime during recording.
 * Tolerances adapt to actual performance, handling GPS drift, pace changes, and pauses.
 */
export function isInTargetRange(value: number, target: IntensityTargetV2): boolean {
  const runtimeIntensity = getRuntimeTargetIntensity(target);

  // Default tolerance: ±5% for percentage-based, ±5 absolute for others
  let tolerance: number;

  switch (target.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      tolerance = 5; // ±5% points (e.g., 90% ±5 = 85-95%)
      break;
    case "watts":
      tolerance = runtimeIntensity * 0.05; // ±5% of watts
      break;
    case "bpm":
      tolerance = 5; // ±5 bpm
      break;
    case "speed":
      tolerance = runtimeIntensity * 0.05; // ±5% of speed in m/s
      break;
    case "cadence":
      tolerance = 5; // ±5 rpm
      break;
    case "RPE":
      tolerance = 1; // ±1 RPE point
      break;
  }

  return value >= runtimeIntensity - tolerance && value <= runtimeIntensity + tolerance;
}

/**
 * Get target range with tolerance
 * Returns [min, max] values based on dynamic tolerance
 */
export function getTargetRange(target: IntensityTargetV2): [number, number] {
  const runtimeIntensity = getRuntimeTargetIntensity(target);
  let tolerance: number;

  switch (target.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      tolerance = 5;
      break;
    case "watts":
      tolerance = runtimeIntensity * 0.05;
      break;
    case "bpm":
      tolerance = 5;
      break;
    case "speed":
      tolerance = runtimeIntensity * 0.05;
      break;
    case "cadence":
      tolerance = 5;
      break;
    case "RPE":
      tolerance = 1;
      break;
  }

  return [runtimeIntensity - tolerance, runtimeIntensity + tolerance];
}

/** Returns a target intensity in the units used by live metrics and exports. */
export function getRuntimeTargetIntensity(target: IntensityTargetV2): number {
  return target.type === "speed"
    ? activityPlanSpeedKphToMetersPerSecond(target.intensity)
    : target.intensity;
}

/**
 * Get unit for target type
 */
export function getTargetUnit(target: IntensityTargetV2): string {
  switch (target.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return "%";
    case "watts":
      return "W";
    case "bpm":
      return " bpm";
    case "speed":
      return " m/s";
    case "cadence":
      return " rpm";
    case "RPE":
      return "/10";
  }
}

/**
 * Get display name for target type
 */
export function getTargetDisplayName(type: IntensityTargetV2["type"]): string {
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
  }
}

/**
 * Format target value for display
 */
export function formatTargetValue(target: IntensityTargetV2): string {
  switch (target.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return `${Math.round(target.intensity)}%`;
    case "watts":
      return `${Math.round(target.intensity)}W`;
    case "bpm":
      return `${Math.round(target.intensity)} bpm`;
    case "speed":
      return `${target.intensity.toFixed(1)} km/h`;
    case "cadence":
      return `${Math.round(target.intensity)} rpm`;
    case "RPE":
      return `${target.intensity}/10`;
  }
}

/**
 * Get guidance text based on current vs target
 */
export function getTargetGuidance(
  current: number,
  target: IntensityTargetV2,
): {
  status: "below" | "within" | "above";
  message: string;
} {
  const inRange = isInTargetRange(current, target);
  const runtimeIntensity = getRuntimeTargetIntensity(target);

  if (inRange) {
    return {
      status: "within",
      message: "Perfect! Stay in this zone.",
    };
  }

  if (current < runtimeIntensity) {
    const difference = Math.abs(runtimeIntensity - current);
    return {
      status: "below",
      message: `Increase by ${Math.round(difference)}${getTargetUnit(target)}`,
    };
  }

  const difference = Math.abs(current - runtimeIntensity);
  return {
    status: "above",
    message: `Decrease by ${Math.round(difference)}${getTargetUnit(target)}`,
  };
}

/**
 * Convert percentage-based targets to absolute values using profile
 */
export function convertTargetToAbsolute(
  target: IntensityTargetV2,
  profile: { ftp?: number; threshold_hr?: number },
): { intensity: number; unit: string; label: string } | null {
  switch (target.type) {
    case "%FTP":
      if (profile.ftp) {
        return {
          intensity: Math.round((target.intensity / 100) * profile.ftp),
          unit: "W",
          label: "Power",
        };
      }
      return null;

    case "%ThresholdHR":
      if (profile.threshold_hr) {
        return {
          intensity: Math.round((target.intensity / 100) * profile.threshold_hr),
          unit: "bpm",
          label: "Heart Rate",
        };
      }
      return null;

    case "speed":
      return {
        intensity: getRuntimeTargetIntensity(target),
        unit: "m/s",
        label: "Speed",
      };

    default:
      // Already absolute
      return {
        intensity: target.intensity,
        unit: getTargetUnit(target),
        label: getTargetDisplayName(target.type),
      };
  }
}
