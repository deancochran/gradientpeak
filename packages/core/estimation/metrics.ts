import type {
  EstimationResult,
  EstimationContext,
  MetricEstimations,
  ActivityType,
} from "./types";

/**
 * Estimate additional metrics (calories, distance, speed, HR, etc.)
 * based on primary TSS/duration/IF estimation
 */
export function estimateMetrics(
  baseEstimation: EstimationResult,
  context: EstimationContext,
): MetricEstimations {
  const { duration, intensityFactor, tss } = baseEstimation;
  const { profile, activityType, route } = context;

  // Estimate calories
  const calories = estimateCalories(
    duration,
    intensityFactor,
    tss,
    profile,
    activityType,
  );

  // Estimate distance
  const distance = estimateDistance(duration, intensityFactor, activityType, route);

  // Estimate average power
  const avgPower =
    profile.ftp && activityType === "bike"
      ? Math.round(profile.ftp * intensityFactor)
      : undefined;

  // Estimate average heart rate
  const avgHeartRate = estimateAvgHR(intensityFactor, profile);

  // Estimate average speed
  const avgSpeed = distance ? distance / duration : undefined;

  // Estimate moving time (typically 95-98% of duration for structured workouts)
  const movingTime = Math.round(duration * 0.96);

  // Elevation gain from route
  const elevationGain = route?.totalAscent;

  return {
    calories: Math.round(calories),
    distance: distance ? Math.round(distance) : undefined,
    avgPower,
    avgHeartRate: avgHeartRate ? Math.round(avgHeartRate) : undefined,
    avgSpeed: avgSpeed ? Math.round(avgSpeed * 100) / 100 : undefined,
    movingTime,
    elevationGain,
  };
}

/**
 * Estimate calories burned
 * Priority: Power-based > HR-based > TSS-based
 */
function estimateCalories(
  duration: number,
  intensityFactor: number,
  tss: number,
  profile: { ftp?: number; weightKg?: number; age?: number; thresholdHR?: number },
  activityType: ActivityType,
): number {
  // Method 1: Power-based (most accurate for cycling)
  if (profile.ftp && activityType === "bike") {
    const avgPower = profile.ftp * intensityFactor;
    const durationHours = duration / 3600;
    // kJ = watts * seconds / 1000, roughly 1 kJ = 1 kcal for cycling
    return avgPower * duration / 1000;
  }

  // Method 2: HR-based estimation
  if (profile.thresholdHR && profile.weightKg && profile.age) {
    const avgHR = estimateAvgHR(intensityFactor, profile);
    if (avgHR) {
      return estimateCaloriesFromHR(duration, avgHR, profile);
    }
  }

  // Method 3: TSS-based (rough approximation)
  // Research shows roughly 1 TSS ≈ 3-5 calories depending on FTP
  // Use 4 as middle ground
  return tss * 4;
}

/**
 * Estimate calories from heart rate
 */
function estimateCaloriesFromHR(
  duration: number,
  avgHR: number,
  profile: { weightKg: number; age: number },
): number {
  const durationMinutes = duration / 60;
  const weight = profile.weightKg;
  const age = profile.age;

  // Gender-specific calorie estimation
  // Using male formula as default (could be enhanced with gender data)
  // Formula: ((Age × 0.2017) + (Weight × 0.1988) + (HR × 0.6309) - 55.0969) × Time / 4.184
  const calories =
    ((age * 0.2017 + weight * 0.1988 + avgHR * 0.6309 - 55.0969) *
      durationMinutes) /
    4.184;

  return Math.max(0, calories); // Ensure non-negative
}

/**
 * Estimate average heart rate from intensity factor
 */
export function estimateAvgHR(
  intensityFactor: number,
  profile: { thresholdHR?: number; maxHR?: number; restingHR?: number },
): number | undefined {
  const { thresholdHR, maxHR, restingHR } = profile;

  if (!thresholdHR && !maxHR) return undefined;

  // Use threshold HR if available, otherwise estimate from max HR
  const lthr = thresholdHR || (maxHR ? maxHR * 0.9 : undefined);
  if (!lthr) return undefined;

  // IF to HR mapping (approximate)
  // IF 0.0 = resting HR
  // IF 1.0 = threshold HR
  // IF > 1.0 = approaching max HR

  const restHR = restingHR || 60; // Default resting HR

  let estimatedHR: number;

  if (intensityFactor <= 1.0) {
    // Linear interpolation between resting and threshold
    estimatedHR = restHR + intensityFactor * (lthr - restHR);
  } else {
    // Above threshold - approach max HR
    const maxHREstimate = maxHR || lthr / 0.9;
    const excessIF = intensityFactor - 1.0;
    // Each 0.1 IF above 1.0 adds 50% of remaining HR capacity
    const remainingCapacity = maxHREstimate - lthr;
    estimatedHR = lthr + excessIF * remainingCapacity * 0.5;
  }

  return Math.min(estimatedHR, maxHR || 220); // Cap at max HR
}

/**
 * Estimate distance based on activity type and effort
 */
function estimateDistance(
  duration: number,
  intensityFactor: number,
  activityType: ActivityType,
  route?: { distanceMeters: number },
): number | undefined {
  // If route provided, use route distance
  if (route) {
    return route.distanceMeters;
  }

  // Only estimate for run/bike/swim
  if (activityType === "strength" || activityType === "other") {
    return undefined;
  }

  // Typical speeds by activity type and effort level
  const effortLevel = getEffortLevel(intensityFactor);
  const speeds = getTypicalSpeeds(activityType, effortLevel);

  return speeds * duration; // distance in meters
}

/**
 * Get effort level from intensity factor
 */
function getEffortLevel(intensityFactor: number): "easy" | "moderate" | "hard" {
  if (intensityFactor < 0.7) return "easy";
  if (intensityFactor < 0.85) return "moderate";
  return "hard";
}

/**
 * Get typical speeds for activity types (m/s)
 */
function getTypicalSpeeds(
  activityType: ActivityType,
  effortLevel: "easy" | "moderate" | "hard",
): number {
  const speedTables = {
    run: {
      easy: 3.0, // ~5:33/km
      moderate: 3.5, // ~4:45/km
      hard: 4.2, // ~4:00/km
    },
    bike: {
      easy: 7.0, // ~25 km/h
      moderate: 8.5, // ~30 km/h
      hard: 10.0, // ~36 km/h
    },
    swim: {
      easy: 1.0, // ~1:40/100m
      moderate: 1.2, // ~1:25/100m
      hard: 1.4, // ~1:12/100m
    },
    strength: {
      easy: 0,
      moderate: 0,
      hard: 0,
    },
    other: {
      easy: 2.5,
      moderate: 3.0,
      hard: 3.5,
    },
  };

  return speedTables[activityType][effortLevel];
}

/**
 * Estimate zone distribution for HR and Power
 * This is a simplified estimation - actual distribution will vary
 */
export function estimateZoneDistribution(
  duration: number,
  intensityFactor: number,
  activityType: ActivityType,
): {
  powerZones?: number[]; // [z1-z7] in seconds
  hrZones?: number[]; // [z1-z5] in seconds
} {
  // For structured workouts, zones are calculated in strategies.ts
  // This is a fallback for template-based estimates

  if (activityType === "bike") {
    return {
      powerZones: estimatePowerZones(duration, intensityFactor),
      hrZones: estimateHRZones(duration, intensityFactor),
    };
  }

  if (activityType === "run") {
    return {
      hrZones: estimateHRZones(duration, intensityFactor),
    };
  }

  return {};
}

/**
 * Estimate power zone distribution
 */
function estimatePowerZones(duration: number, avgIF: number): number[] {
  // Simplified assumption: Most time spent near average IF
  // With some variation above and below

  const zones = [0, 0, 0, 0, 0, 0, 0]; // 7 power zones
  const avgFTPPercent = avgIF * 100;

  // Distribute time across zones (bell curve around average)
  if (avgFTPPercent < 55) {
    zones[0] = duration * 0.8;
    zones[1] = duration * 0.2;
  } else if (avgFTPPercent < 75) {
    zones[0] = duration * 0.2;
    zones[1] = duration * 0.6;
    zones[2] = duration * 0.2;
  } else if (avgFTPPercent < 90) {
    zones[1] = duration * 0.3;
    zones[2] = duration * 0.5;
    zones[3] = duration * 0.2;
  } else if (avgFTPPercent < 105) {
    zones[2] = duration * 0.2;
    zones[3] = duration * 0.6;
    zones[4] = duration * 0.2;
  } else {
    zones[3] = duration * 0.2;
    zones[4] = duration * 0.5;
    zones[5] = duration * 0.3;
  }

  return zones.map(Math.round);
}

/**
 * Estimate HR zone distribution
 */
function estimateHRZones(duration: number, avgIF: number): number[] {
  // Simplified assumption: Most time spent near average IF
  const zones = [0, 0, 0, 0, 0]; // 5 HR zones
  const avgThresholdPercent = avgIF * 100;

  // Distribute time across zones
  if (avgThresholdPercent < 81) {
    zones[0] = duration * 0.8;
    zones[1] = duration * 0.2;
  } else if (avgThresholdPercent < 90) {
    zones[0] = duration * 0.2;
    zones[1] = duration * 0.6;
    zones[2] = duration * 0.2;
  } else if (avgThresholdPercent < 94) {
    zones[1] = duration * 0.3;
    zones[2] = duration * 0.5;
    zones[3] = duration * 0.2;
  } else if (avgThresholdPercent < 100) {
    zones[2] = duration * 0.2;
    zones[3] = duration * 0.6;
    zones[4] = duration * 0.2;
  } else {
    zones[3] = duration * 0.3;
    zones[4] = duration * 0.7;
  }

  return zones.map(Math.round);
}
