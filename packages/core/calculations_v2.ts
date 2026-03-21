/**
 * Compatibility surface for V2 structured-workout helpers.
 *
 * Canonical duration and zone ownership lives in `duration/` and `zones/`.
 * Keep this file as a thin adapter while callers migrate.
 */
import {
  calculateTotalDurationFromIntervals,
  getDurationSeconds as getCanonicalDurationSeconds,
} from "./duration";
import type {
  ActivityPlanStructureV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
} from "./schemas/activity_plan_v2";
import { getStepIntensityColor } from "./schemas/activity_plan_v2";
import { getFiveIntensityZone } from "./zones";

// ================================
// TYPES
// ================================

export interface ActivityProfilePointV2 {
  index: number;
  name: string;
  description?: string;
  notes?: string;
  intensity: number;
  intensityType?: IntensityTargetV2["type"];
  duration: number; // in seconds
  color: string;
  targets?: IntensityTargetV2[];
  cumulativeTime: number; // in seconds
  segmentName?: string;
  segmentIndex?: number;
}

export interface ActivityStatsV2 {
  totalSteps: number;
  totalDuration: number; // in seconds
  avgPower: number; // %FTP or watts
  maxPower: number; // %FTP or watts
  intervalCount: number; // Count of high-intensity intervals
  estimatedTSS: number;
  estimatedCalories: number;
  intensityZones: {
    z1: number; // duration in seconds
    z2: number;
    z3: number;
    z4: number;
    z5: number;
  };
}

// ================================
// HELPER FUNCTIONS
// ================================

// ================================
// PUBLIC API
// ================================

/**
 * Extract activity profile data for visualization (V2)
 * Works with interval-based V2 structure
 */
export function extractActivityProfileV2(
  structure: ActivityPlanStructureV2,
  options?: {
    paceSecondsPerKm?: number;
    secondsPerRep?: number;
  },
): ActivityProfilePointV2[] {
  const intervals = structure.intervals;
  let cumulativeTime = 0;
  const points: ActivityProfilePointV2[] = [];
  let globalIndex = 0;

  // Iterate through each interval
  for (const interval of intervals) {
    // Repeat each interval based on repetitions
    for (let rep = 0; rep < interval.repetitions; rep++) {
      // Process each step in the interval
      for (const step of interval.steps) {
        const primaryTarget = step.targets?.[0];
        const intensity = primaryTarget?.intensity ?? 0;
        const duration = getCanonicalDurationSeconds(step.duration, options);

        const point: ActivityProfilePointV2 = {
          index: globalIndex,
          name: step.name || `Step ${globalIndex + 1}`,
          description: step.description,
          notes: step.notes,
          intensity,
          intensityType: primaryTarget?.type,
          duration,
          color: getStepIntensityColor(step),
          targets: step.targets,
          cumulativeTime,
          segmentName: interval.name,
          segmentIndex: rep,
        };

        cumulativeTime += duration;
        points.push(point);
        globalIndex++;
      }
    }
  }

  return points;
}

/**
 * Calculate comprehensive activity statistics (V2)
 * Works with interval-based V2 structure
 */
export function calculateActivityStatsV2(
  structure: ActivityPlanStructureV2,
  options?: {
    paceSecondsPerKm?: number;
    secondsPerRep?: number;
    ftpWatts?: number; // for converting watts to FTP%
  },
): ActivityStatsV2 {
  const intervals = structure.intervals;
  const ftpWatts = options?.ftpWatts ?? 250; // Default FTP for calculations

  // Count total steps across all intervals × repetitions
  const totalSteps = intervals.reduce((total, interval) => {
    return total + interval.steps.length * interval.repetitions;
  }, 0);

  const stats: ActivityStatsV2 = {
    totalSteps,
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

  // Iterate through each interval and its repetitions
  for (const interval of intervals) {
    for (let rep = 0; rep < interval.repetitions; rep++) {
      for (const step of interval.steps) {
        // Calculate duration
        const duration = getCanonicalDurationSeconds(step.duration, options);
        stats.totalDuration += duration;

        // Analyze targets
        step.targets?.forEach((target) => {
          if (target.type === "%FTP" || target.type === "watts") {
            const intensity = target.intensity;

            // Convert watts to FTP% for consistent analysis
            const ftpPercent = target.type === "watts" ? (intensity / ftpWatts) * 100 : intensity;

            totalIntensity += ftpPercent * duration; // Weight by duration
            totalIntensityTime += duration;

            if (ftpPercent > stats.maxPower) stats.maxPower = ftpPercent;
            if (ftpPercent > 85) stats.intervalCount++; // High intensity intervals

            // Track intensity zones weighted by duration
            const zone = getFiveIntensityZone(ftpPercent);
            stats.intensityZones[zone] += duration;
          }
        });
      }
    }
  }

  // Calculate weighted averages
  stats.avgPower = totalIntensityTime > 0 ? totalIntensity / totalIntensityTime : 0;

  // Estimate TSS (Training Stress Score)
  // TSS = (duration in hours) × (avg intensity as FTP decimal)² × 100
  const durationHours = stats.totalDuration / 3600;
  const avgIntensityDecimal = stats.avgPower / 100;
  stats.estimatedTSS = durationHours * Math.pow(avgIntensityDecimal, 2) * 100;

  // Rough calorie estimate (1 TSS ≈ 4 calories)
  stats.estimatedCalories = Math.round(stats.estimatedTSS * 4);

  return stats;
}

/**
 * Calculate total duration for all steps in seconds
 */
export function calculateTotalDurationSecondsV2(
  intervals: IntervalV2[],
  options?: {
    paceSecondsPerKm?: number;
    secondsPerRep?: number;
  },
): number {
  return calculateTotalDurationFromIntervals(intervals, options);
}

/**
 * Get step at a specific time point in the activity
 */
export function getStepAtTimeV2(
  structure: ActivityPlanStructureV2,
  elapsedSeconds: number,
  options?: {
    paceSecondsPerKm?: number;
    secondsPerRep?: number;
  },
): {
  step: IntervalStepV2;
  stepIndex: number;
  stepProgress: number; // 0-1
  stepElapsed: number; // seconds into this step
} | null {
  const intervals = structure.intervals;
  let cumulativeTime = 0;
  let globalStepIndex = 0;

  // Iterate through each interval and its repetitions
  for (const interval of intervals) {
    for (let rep = 0; rep < interval.repetitions; rep++) {
      for (const step of interval.steps) {
        const duration = getCanonicalDurationSeconds(step.duration, options);

        if (elapsedSeconds < cumulativeTime + duration) {
          const stepElapsed = elapsedSeconds - cumulativeTime;
          const stepProgress = duration > 0 ? stepElapsed / duration : 0;

          return {
            step,
            stepIndex: globalStepIndex,
            stepProgress,
            stepElapsed,
          };
        }

        cumulativeTime += duration;
        globalStepIndex++;
      }
    }
  }

  return null; // Activity completed
}
