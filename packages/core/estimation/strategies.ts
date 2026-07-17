import { compileActivityPlanV3 } from "../activity-plan";
import { calculateActivityPlanStats } from "../activity-plan-calculations";
import type { CanonicalSport } from "../schemas/sport";
import {
  getSportRouteBaseSpeed,
  getSportTemplateDefaults,
  getSportThresholdToEndurancePaceMultiplier,
} from "../sports";
import type { EstimationContext, EstimationResult, Route } from "./types";

// ==============================
// Strategy 1: Structure-Based
// ==============================

/**
 * Estimate metrics from a structured activity plan
 * Highest accuracy for activities with defined step structure
 * Accuracy: 90-95% for power-based, 80-85% for HR-based
 */
export function estimateFromStructure(context: EstimationContext): EstimationResult {
  if (!context.structure) throw new Error("Structure-based estimation requires a V3 structure");
  const stats = calculateActivityPlanStats(compileActivityPlanV3(context.structure), {
    cyclingFtpWatts: context.ftp ?? undefined,
  });
  const categoryDoses = stats.categoryDoses.map((dose) => ({
    category: dose.category,
    timedActiveSeconds: dose.timedActiveSeconds,
    distanceMeters: dose.distanceMeters,
    repetitionCount: dose.repetitionCount,
    openOccurrenceCount: dose.openOccurrenceCount,
    tss: dose.cyclingPower?.complete === true ? Math.round(dose.cyclingPower.estimatedTss) : null,
    intensityFactor:
      dose.cyclingPower?.complete === true
        ? Math.round(dose.cyclingPower.averageFtpPercent) / 100
        : null,
    cyclingPowerEvidenceCoverage: dose.cyclingPower?.evidenceCoverage ?? null,
  }));
  const soleDose = categoryDoses.length === 1 ? categoryDoses[0] : undefined;
  const warnings = categoryDoses
    .filter((dose) => dose.tss === null)
    .map((dose) => `No supported load evidence for ${dose.category} segments.`);
  if (stats.duration.exactElapsedSeconds === null) {
    warnings.push("Exact elapsed duration is unavailable for non-time prescriptions.");
  }

  return {
    tss: soleDose?.tss ?? null,
    duration: stats.duration.exactElapsedSeconds,
    intensityFactor: soleDose?.intensityFactor ?? null,
    categoryDoses,
    estimatedDistance:
      stats.duration.distanceMeters > 0 ? stats.duration.distanceMeters : undefined,
    confidence:
      soleDose?.tss != null && stats.duration.exactElapsedSeconds !== null ? "high" : "low",
    confidenceScore: soleDose?.tss != null ? 90 : 40,
    factors: ["compiled-v3-occurrences", "sport-isolated-dose"],
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get power zone index based on FTP percentage
 * Z1: < 55% | Z2: 56-75% | Z3: 76-90% | Z4: 91-105% | Z5: 106-120% | Z6: 121-150% | Z7: 150%+
 */
// ==============================
// Strategy 2: Route-Based
// ==============================

/**
 * Estimate metrics from route data (distance, elevation)
 * Medium accuracy for GPS-enabled activities without structure
 * Accuracy: 70-80% depending on route detail
 */
export function estimateFromRoute(context: EstimationContext): EstimationResult {
  const {
    route,
    activityCategory = "other",
    fitnessState,
    ftp,
    weightKg,
    thresholdPaceSecondsPerKm,
  } = context;

  if (!route) {
    throw new Error("Route-based estimation requires route data");
  }

  // Estimate base speed based on activity type and fitness level
  let baseSpeed = estimateBaseSpeed(activityCategory, fitnessState);
  if (activityCategory === "run" && thresholdPaceSecondsPerKm) {
    const endurancePaceSecondsPerKm =
      thresholdPaceSecondsPerKm * getSportThresholdToEndurancePaceMultiplier(activityCategory);
    baseSpeed = 1000 / endurancePaceSecondsPerKm;
  }

  // Adjust for terrain
  const terrainAdjustment = calculateTerrainAdjustment(route, activityCategory);
  const effectiveSpeed = baseSpeed * terrainAdjustment;

  // Estimate duration
  const duration = route.distanceMeters / effectiveSpeed;

  // Estimate power/effort from elevation
  const avgPower = estimatePowerFromElevation(
    route.totalAscent,
    route.distanceMeters,
    weightKg || 70,
    ftp,
    activityCategory,
  );

  // Calculate IF and TSS
  let IF = 0.75; // Default moderate effort
  if (ftp && avgPower && activityCategory === "bike") {
    IF = avgPower / ftp;
  } else if (activityCategory === "run") {
    // Running IF estimation based on route difficulty
    const climbingFactor = route.totalAscent / route.distanceMeters;
    IF = 0.7 + Math.min(0.25, climbingFactor * 10); // More climbing = higher effort
  }

  const tss = (duration / 3600) * IF ** 2 * 100;

  const warnings: string[] = [];
  const factors = ["route-based", "terrain-adjusted"];

  if (!ftp && activityCategory === "bike") {
    warnings.push("Missing FTP - using estimated effort level.");
  }
  if (!weightKg) {
    warnings.push("Missing weight - using default 70kg for calculations.");
  }

  if (ftp) factors.push("user-ftp");
  if (weightKg) factors.push("user-weight");
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
  activityCategory: CanonicalSport,
  fitnessState?: { ctl: number },
): number {
  // Base speeds in m/s for moderate effort
  let speed = getSportRouteBaseSpeed(activityCategory);

  // Adjust for fitness level (CTL)
  if (fitnessState && fitnessState.ctl > 0) {
    // Higher fitness = faster base speed
    // CTL of 50 = baseline, CTL of 100 = 10% faster
    const fitnessMultiplier = 1 + (fitnessState.ctl - 50) / 500;
    speed = speed ? speed * Math.max(0.8, Math.min(1.2, fitnessMultiplier)) : speed;
  }
  if (!speed) {
    throw new Error("Assumed Speed, found not");
  }

  return speed;
}

/**
 * Calculate terrain adjustment factor for speed
 */
function calculateTerrainAdjustment(route: Route, activityCategory: CanonicalSport): number {
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
  _ftp?: number | null,
  activityCategory?: CanonicalSport,
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
export function estimateFromTemplate(context: EstimationContext): EstimationResult {
  const { activityCategory = "other", fitnessState } = context;

  const template = getSportTemplateDefaults(activityCategory);

  // Adjust based on user fitness level (CTL)
  const fitnessMultiplier = fitnessState ? 1 + (fitnessState.ctl - 50) / 100 : 1.0;

  const warnings = [
    "No structure or route provided - using default estimates.",
    "Add activity structure or select a route for better accuracy.",
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
