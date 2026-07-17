import type { ActivityTarget, ActivityTargetType } from "../targets";

type TargetBearingStep = { targets?: readonly ActivityTarget[] };

/** Converts persisted/UI speed targets in km/h to runtime/export m/s. */
export function activityPlanSpeedKphToMetersPerSecond(speedKph: number): number {
  return speedKph / 3.6;
}

/** Converts runtime/import m/s to persisted/UI speed targets in km/h. */
export function activityPlanSpeedMetersPerSecondToKph(speedMetersPerSecond: number): number {
  return speedMetersPerSecond * 3.6;
}

// ==============================
// TARGET HELPER UTILITIES
// Runtime evaluation with dynamic tolerances
// ==============================

/**
 * Target builder helpers for fluent API
 */
export const Target = {
  ftp: (intensity: number): ActivityTarget => ({
    type: "%FTP",
    intensity,
  }),

  maxHR: (intensity: number): ActivityTarget => ({
    type: "%MaxHR",
    intensity,
  }),

  thresholdHR: (intensity: number): ActivityTarget => ({
    type: "%ThresholdHR",
    intensity,
  }),

  watts: (intensity: number): ActivityTarget => ({
    type: "watts",
    intensity,
  }),

  bpm: (intensity: number): ActivityTarget => ({
    type: "bpm",
    intensity,
  }),

  speed: (intensity: number): ActivityTarget => ({
    type: "speed",
    intensity,
  }),

  cadence: (intensity: number): ActivityTarget => ({
    type: "cadence",
    intensity,
  }),

  rpe: (intensity: number): ActivityTarget => ({
    type: "RPE",
    intensity,
  }),
};

/**
 * Get primary target from step
 */
export function getPrimaryTarget(step: TargetBearingStep): ActivityTarget | undefined {
  return step.targets?.[0];
}

/**
 * Check if step has a specific target type
 */
export function hasTargetType(step: TargetBearingStep, type: ActivityTargetType): boolean {
  return step.targets?.some((t) => t.type === type) ?? false;
}

/**
 * Get target by type from step
 */
export function getTargetByType(
  step: TargetBearingStep,
  type: ActivityTargetType,
): ActivityTarget | undefined {
  return step.targets?.find((t) => t.type === type);
}

/**
 * Validate if a value is within target range (runtime evaluation)
 * Uses dynamic tolerance based on target type
 *
 * NOTE: This is evaluated at runtime during recording.
 * Tolerances adapt to actual performance, handling GPS drift, pace changes, and pauses.
 */
export function isInTargetRange(value: number, target: ActivityTarget): boolean {
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
export function getTargetRange(target: ActivityTarget): [number, number] {
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
export function getRuntimeTargetIntensity(target: ActivityTarget): number {
  return target.type === "speed"
    ? activityPlanSpeedKphToMetersPerSecond(target.intensity)
    : target.intensity;
}

/**
 * Get unit for target type
 */
export function getTargetUnit(target: ActivityTarget): string {
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
export function getTargetDisplayName(type: ActivityTargetType): string {
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
export function formatTargetValue(target: ActivityTarget): string {
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
  target: ActivityTarget,
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
  target: ActivityTarget,
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

export function formatIntensityTarget(target: ActivityTarget): string {
  switch (target.type) {
    case "%FTP":
      return `${Math.round(target.intensity)}% FTP`;
    case "%MaxHR":
      return `${Math.round(target.intensity)}% MaxHR`;
    case "%ThresholdHR":
      return `${Math.round(target.intensity)}% ThresholdHR`;
    case "watts":
      return `${Math.round(target.intensity)}W`;
    case "bpm":
      return `${Math.round(target.intensity)} bpm`;
    case "speed":
      return `${target.intensity.toFixed(1)} km/h`;
    case "cadence":
      return `${Math.round(target.intensity)} rpm`;
    case "RPE":
      return `RPE ${target.intensity}/10`;
  }
}

export function getStepIntensityColor(step: TargetBearingStep): string {
  const target = step.targets?.[0];
  if (!target) return "#94a3b8";

  switch (target.type) {
    case "%FTP":
      if (target.intensity >= 106) return "#dc2626";
      if (target.intensity >= 91) return "#ea580c";
      if (target.intensity >= 76) return "#ca8a04";
      if (target.intensity >= 56) return "#16a34a";
      return "#06b6d4";
    case "%MaxHR":
    case "%ThresholdHR":
      if (target.intensity >= 95) return "#dc2626";
      if (target.intensity >= 85) return "#ea580c";
      if (target.intensity >= 75) return "#ca8a04";
      if (target.intensity >= 65) return "#16a34a";
      return "#06b6d4";
    case "RPE":
      if (target.intensity >= 9) return "#dc2626";
      if (target.intensity >= 7) return "#ea580c";
      if (target.intensity >= 5) return "#ca8a04";
      if (target.intensity >= 3) return "#16a34a";
      return "#06b6d4";
    default:
      return "#06b6d4";
  }
}

export function formatStepTargets(step: TargetBearingStep): string {
  return step.targets?.length ? step.targets.map(formatIntensityTarget).join(" + ") : "No targets";
}
