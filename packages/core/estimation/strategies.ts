import type { PublicActivityCategory } from "@repo/supabase";
import {
  flattenPlanSteps,
  getDurationMs,
  type Step,
} from "../schemas/activity_plan_structure";
import {
  calculateStepIntensityFactor,
  type UserSettings,
} from "../utils/activity-defaults";
import type { EstimationContext, EstimationResult, Route } from "./types";

// ==============================
// Strategy 1: Structure-Based
// ==============================

/**
 * Estimate metrics from a structured workout plan
 * Highest accuracy for activities with defined step structure
 * Accuracy: 90-95% for power-based, 80-85% for HR-based
 */
export function estimateFromStructure(
  context: EstimationContext,
): EstimationResult {
  const { structure, profile, activityCategory } = context;

  if (!structure?.steps || structure.steps.length === 0) {
    throw new Error("Structure-based estimation requires steps");
  }

  const flatSteps = flattenPlanSteps(structure.steps);
  const userSettings: UserSettings = {
    ftp: profile.ftp ?? null,
    thresholdHR: profile.threshold_hr ?? null,
    restingHR: 60, // Default resting HR - not in current schema
  };

  let totalTSS = 0;
  let totalDuration = 0;
  let totalWeightedIF = 0;

  const hrZones = [0, 0, 0, 0, 0];
  const powerZones = [0, 0, 0, 0, 0, 0, 0];

  for (const step of flatSteps) {
    const stepDuration =
      step.duration && step.duration !== "untilFinished"
        ? getDurationMs(step.duration) / 1000
        : 300; // Default 5 minutes for untilFinished

    const stepIF = calculateStepIntensityFactor(step, userSettings);
    const stepTSS = (stepDuration / 3600) * Math.pow(stepIF, 2) * 100;

    totalTSS += stepTSS;
    totalDuration += stepDuration;
    totalWeightedIF += stepIF * stepDuration;

    // Distribute time into zones based on targets
    distributeStepIntoZones(
      step,
      stepDuration,
      hrZones,
      powerZones,
      userSettings,
    );
  }

  const avgIF = totalDuration > 0 ? totalWeightedIF / totalDuration : 0;

  const warnings: string[] = [];
  const factors = ["structure-based"];

  if (!profile.ftp && activityCategory === "bike") {
    warnings.push(
      "Missing FTP - using estimated values. Add FTP for better accuracy.",
    );
    factors.push("default-ftp");
  } else if (profile.ftp) {
    factors.push("user-ftp");
  }

  if (
    !profile.threshold_hr &&
    (activityCategory === "run" || activityCategory === "bike")
  ) {
    warnings.push(
      "Missing Threshold HR - heart rate estimates may be less accurate.",
    );
  } else if (profile.threshold_hr) {
    factors.push("user-threshold-hr");
  }

  return {
    tss: Math.round(totalTSS),
    duration: Math.round(totalDuration),
    intensityFactor: Math.round(avgIF * 100) / 100,
    estimatedHRZones: hrZones.map(Math.round),
    estimatedPowerZones: powerZones.map(Math.round),
    confidence: profile.ftp || profile.threshold_hr ? "high" : "medium",
    confidenceScore: profile.ftp ? 95 : profile.threshold_hr ? 85 : 75,
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Distribute step duration into HR and power zones based on targets
 */
function distributeStepIntoZones(
  step: Step,
  duration: number,
  hrZones: number[],
  powerZones: number[],
  profile: UserSettings,
): void {
  const primaryTarget = step.targets?.[0];
  if (!primaryTarget) return;

  // Determine power zone
  if (primaryTarget.type === "%FTP" || primaryTarget.type === "watts") {
    let ftpPercent = primaryTarget.intensity;

    if (primaryTarget.type === "watts" && profile.ftp) {
      ftpPercent = (primaryTarget.intensity / profile.ftp) * 100;
    }

    const powerZoneIndex = getPowerZoneIndex(ftpPercent);
    if (
      powerZoneIndex !== undefined &&
      powerZones[powerZoneIndex] !== undefined
    ) {
      powerZones[powerZoneIndex] += duration;
    }
  }

  // Determine HR zone
  if (
    primaryTarget.type === "%ThresholdHR" ||
    primaryTarget.type === "%MaxHR" ||
    primaryTarget.type === "bpm"
  ) {
    let hrPercent = 0;

    if (primaryTarget.type === "%ThresholdHR") {
      hrPercent = primaryTarget.intensity;
    } else if (primaryTarget.type === "%MaxHR") {
      // Convert MaxHR to ThresholdHR (approx: MaxHR * 0.9 = ThresholdHR)
      const estimatedThresholdPercent = (primaryTarget.intensity * 0.9) / 1;
      hrPercent = estimatedThresholdPercent;
    } else if (
      primaryTarget.type === "bpm" &&
      profile.thresholdHR &&
      profile.thresholdHR !== null
    ) {
      hrPercent = (primaryTarget.intensity / profile.thresholdHR) * 100;
    }

    const hrZoneIndex = getHRZoneIndex(hrPercent);
    if (hrZoneIndex !== undefined && hrZones[hrZoneIndex] !== undefined) {
      hrZones[hrZoneIndex] += duration;
    }
  }
}

/**
 * Get power zone index based on FTP percentage
 * Z1: < 55% | Z2: 56-75% | Z3: 76-90% | Z4: 91-105% | Z5: 106-120% | Z6: 121-150% | Z7: 150%+
 */
function getPowerZoneIndex(ftpPercent: number): number {
  if (ftpPercent < 55) return 0;
  if (ftpPercent < 76) return 1;
  if (ftpPercent < 91) return 2;
  if (ftpPercent < 106) return 3;
  if (ftpPercent < 121) return 4;
  if (ftpPercent < 151) return 5;
  return 6;
}

/**
 * Get HR zone index based on threshold HR percentage
 * Z1: < 81% | Z2: 81-89% | Z3: 90-93% | Z4: 94-99% | Z5: 100%+
 */
function getHRZoneIndex(thresholdPercent: number): number {
  if (thresholdPercent < 81) return 0;
  if (thresholdPercent < 90) return 1;
  if (thresholdPercent < 94) return 2;
  if (thresholdPercent < 100) return 3;
  return 4;
}

// ==============================
// Strategy 2: Route-Based
// ==============================

/**
 * Estimate metrics from route data (distance, elevation)
 * Medium accuracy for outdoor activities without structure
 * Accuracy: 70-80% depending on route detail
 */
export function estimateFromRoute(
  context: EstimationContext,
): EstimationResult {
  const { route, profile, activityCategory, fitnessState } = context;

  if (!route) {
    throw new Error("Route-based estimation requires route data");
  }

  // Estimate base speed based on activity type and fitness level
  const baseSpeed = estimateBaseSpeed(activityCategory, fitnessState);

  // Adjust for terrain
  const terrainAdjustment = calculateTerrainAdjustment(route, activityCategory);
  const effectiveSpeed = baseSpeed * terrainAdjustment;

  // Estimate duration
  const duration = route.distanceMeters / effectiveSpeed;

  // Estimate power/effort from elevation
  const avgPower = estimatePowerFromElevation(
    route.totalAscent,
    route.distanceMeters,
    profile.weight_kg || 70,
    profile.ftp,
    activityCategory,
  );

  // Calculate IF and TSS
  let IF = 0.75; // Default moderate effort
  if (profile.ftp && avgPower && activityCategory === "bike") {
    IF = avgPower / profile.ftp;
  } else if (activityCategory === "run") {
    // Running IF estimation based on route difficulty
    const climbingFactor = route.totalAscent / route.distanceMeters;
    IF = 0.7 + Math.min(0.25, climbingFactor * 10); // More climbing = higher effort
  }

  const tss = (duration / 3600) * Math.pow(IF, 2) * 100;

  const warnings: string[] = [];
  const factors = ["route-based", "terrain-adjusted"];

  if (!profile.ftp && activityCategory === "bike") {
    warnings.push("Missing FTP - using estimated effort level.");
  }
  if (!profile.weight_kg) {
    warnings.push("Missing weight - using default 70kg for calculations.");
  }

  if (profile.ftp) factors.push("user-ftp");
  if (profile.weight_kg) factors.push("user-weight");
  if (fitnessState) factors.push("fitness-adjusted");

  return {
    tss: Math.round(tss),
    duration: Math.round(duration),
    intensityFactor: Math.round(IF * 100) / 100,
    estimatedDistance: route.distanceMeters,
    confidence: "medium",
    confidenceScore: 75,
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Estimate base speed for activity type
 */
function estimateBaseSpeed(
  activityCategory: PublicActivityCategory,
  fitnessState?: { ctl: number },
): number {
  // Base speeds in m/s for moderate effort
  const baseSpeeds: Record<PublicActivityCategory, number> = {
    run: 3.5, // ~4:45/km pace
    bike: 8.5, // ~30 km/h
    swim: 1.2, // ~1:25/100m pace
    strength: 0, // Not applicable
    other: 3.0,
  };

  let speed = baseSpeeds[activityCategory];

  // Adjust for fitness level (CTL)
  if (fitnessState && fitnessState.ctl > 0) {
    // Higher fitness = faster base speed
    // CTL of 50 = baseline, CTL of 100 = 10% faster
    const fitnessMultiplier = 1 + (fitnessState.ctl - 50) / 500;
    speed = speed
      ? speed * Math.max(0.8, Math.min(1.2, fitnessMultiplier))
      : speed;
  }
  if (!speed) {
    throw new Error("Assumed Speed, found not");
  }

  return speed;
}

/**
 * Calculate terrain adjustment factor for speed
 */
function calculateTerrainAdjustment(
  route: Route,
  activityCategory: PublicActivityCategory,
): number {
  if (activityCategory === "strength" || activityCategory === "swim") {
    return 1.0; // No terrain adjustment
  }

  // Calculate climb rate (meters of climbing per km)
  const climbRate = route.totalAscent / (route.distanceMeters / 1000);

  // Flat route: 0-10 m/km
  // Rolling: 10-20 m/km
  // Hilly: 20-40 m/km
  // Mountainous: 40+ m/km

  let adjustment = 1.0;

  if (climbRate < 10) {
    adjustment = 1.0; // Flat
  } else if (climbRate < 20) {
    adjustment = 0.95; // Rolling
  } else if (climbRate < 40) {
    adjustment = 0.85; // Hilly
  } else {
    adjustment = 0.75; // Mountainous
  }

  // Cycling is more affected by hills than running
  if (activityCategory === "bike") {
    adjustment = adjustment * 0.9 + 0.1; // Scale adjustment more aggressively
  }

  return adjustment;
}

/**
 * Estimate average power from elevation gain
 */
function estimatePowerFromElevation(
  totalAscent: number,
  distanceMeters: number,
  weightKg: number,
  ftp?: number | null,
  activityCategory?: PublicActivityCategory,
): number | undefined {
  if (activityCategory !== "bike") return undefined;

  // Physics-based estimation:
  // Power = (weight * gravity * elevation) / time + rolling resistance + air resistance

  const gravity = 9.81;
  const climbingPower = (weightKg * gravity * totalAscent) / 1000; // kJ

  // Estimate total energy (climbing + flat riding)
  // Assume 200W for flat sections (rough estimate)
  const flatPower = 200; // watts baseline
  const durationEstimate = distanceMeters / 8; // seconds at 8 m/s

  const totalEnergy = climbingPower + (flatPower * durationEstimate) / 1000;
  const avgPower = (totalEnergy * 1000) / durationEstimate;

  return Math.round(avgPower);
}

// ==============================
// Strategy 3: Template-Based
// ==============================

/**
 * Estimate using activity type templates
 * Lowest accuracy - fallback for activities without structure/route
 * Accuracy: 50-65%
 */
export function estimateFromTemplate(
  context: EstimationContext,
): EstimationResult {
  const { activityCategory, fitnessState } = context;

  // Default templates for different activity types
  const templates: Record<
    PublicActivityCategory,
    { avgIF: number; avgDuration: number; avgTSS: number }
  > = {
    bike: { avgIF: 0.75, avgDuration: 3600, avgTSS: 60 },
    run: { avgIF: 0.8, avgDuration: 2700, avgTSS: 55 },
    swim: { avgIF: 0.7, avgDuration: 2400, avgTSS: 45 },
    strength: { avgIF: 0.65, avgDuration: 2700, avgTSS: 40 },
    other: { avgIF: 0.65, avgDuration: 1800, avgTSS: 30 },
  };

  const template = templates[activityCategory];

  // Adjust based on user fitness level (CTL)
  const fitnessMultiplier = fitnessState
    ? 1 + (fitnessState.ctl - 50) / 100
    : 1.0;

  const warnings = [
    "No structure or route provided - using default estimates.",
    "Add workout structure or select a route for better accuracy.",
  ];
  if (!template) {
    throw new Error("Assumed template, not found");
  }
  return {
    tss: Math.round(template.avgTSS * fitnessMultiplier),
    duration: template.avgDuration,
    intensityFactor: template.avgIF,
    confidence: "low",
    confidenceScore: 50,
    factors: ["template-based", "activity-type-default"],
    warnings,
  };
}
