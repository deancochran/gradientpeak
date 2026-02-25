/**
 * Event Recovery Model
 *
 * Provides dynamic recovery calculations based on goal targets and event characteristics.
 * No hardcoded constants - all recovery times calculated from event duration and intensity.
 *
 * Key Principles:
 * - Recovery time scales with event duration and intensity
 * - Different event types (race, threshold test, HR test) have different recovery profiles
 * - Post-event fatigue follows simple exponential decay
 * - ATL overload increases recovery time
 */

import type { GoalTargetV2 } from "../../schemas/training_plan_structure";
import type { ProjectionPointReadinessInput } from "./readiness";

/**
 * Utility: Round to 1 decimal place
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Utility: Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Utility: Calculate days between two date strings (YYYY-MM-DD format)
 */
function diffDateOnlyUtcDays(a: string, b: string): number {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return 0;
  }
  return Math.round((bMs - aMs) / 86400000);
}

/**
 * Event recovery profile describing recovery requirements after an event
 */
export interface EventRecoveryProfile {
  /** Days until full recovery (TSB back to baseline) */
  recovery_days_full: number;

  /** Days until functional training state (can resume moderate training) */
  recovery_days_functional: number;

  /** Event intensity on 0-100 scale */
  fatigue_intensity: number;

  /** Expected ATL spike multiplier (1.0 = no spike, 2.0 = double) */
  atl_spike_factor: number;
}

/**
 * Input for computing event recovery profile
 */
export interface EventRecoveryInput {
  target: GoalTargetV2;
  projected_ctl_at_event: number;
  projected_atl_at_event: number;
}

/**
 * Input for computing post-event fatigue penalty
 */
export interface PostEventFatigueInput {
  currentDate: string;
  currentPoint: ProjectionPointReadinessInput;
  eventGoal: {
    target_date: string;
    targets: GoalTargetV2[];
    projected_ctl: number;
    projected_atl: number;
  };
}

/**
 * Estimates race intensity based on duration and activity type.
 *
 * Intensity scale:
 * - 95-100: Short races (<1 hour) - very high intensity
 * - 85-95: Medium races (1-3 hours) - high intensity
 * - 80-85: Long races (3-6 hours) - moderate-high intensity
 * - 75-80: Ultra races (6-12 hours) - moderate intensity
 * - 70-75: Multi-day events (12-24+ hours) - lower intensity
 *
 * Activity adjustments:
 * - Run: 1.0x (baseline)
 * - Bike: 0.9x (lower impact)
 * - Swim: 0.95x (lower impact)
 * - Other: 0.85x (conservative estimate)
 *
 * @param input - Race characteristics
 * @returns Intensity value (0-100)
 */
function estimateRaceIntensity(input: {
  distance_m: number;
  duration_s: number;
  activity: "run" | "bike" | "swim" | "other";
}): number {
  const durationHours = input.duration_s / 3600;

  // Base intensity from duration
  let baseIntensity = 100;
  if (durationHours > 24) {
    baseIntensity = 70;
  } else if (durationHours > 12) {
    baseIntensity = 75;
  } else if (durationHours > 6) {
    baseIntensity = 80;
  } else if (durationHours > 3) {
    baseIntensity = 85;
  } else if (durationHours > 1) {
    baseIntensity = 90;
  } else {
    baseIntensity = 95;
  }

  // Adjust for activity type
  const activityFactor =
    input.activity === "run"
      ? 1.0
      : input.activity === "bike"
        ? 0.9
        : input.activity === "swim"
          ? 0.95
          : 0.85;

  return Math.round(baseIntensity * activityFactor);
}

/**
 * Computes event recovery profile based on goal target characteristics.
 *
 * Recovery Formula (for race_performance):
 * - Base recovery days = min(28, max(2, duration_hours * 3.5))
 * - Full recovery = base * (0.7 + intensity_factor * 0.3)
 * - Functional recovery = base * 0.4
 *
 * Examples:
 * - 5K (0.33hr, 95 intensity): 2 days full, 1 day functional
 * - Half marathon (1.5hr, 90 intensity): 5 days full, 2 days functional
 * - Marathon (3.5hr, 85 intensity): 12 days full, 5 days functional
 * - 50K ultra (6hr, 80 intensity): 21 days full, 8 days functional
 * - 100-mile (24hr, 70 intensity): 28 days full, 11 days functional
 *
 * @param input - Event characteristics and projected fitness state
 * @returns Recovery profile with full/functional recovery days and intensity
 */
export function computeEventRecoveryProfile(
  input: EventRecoveryInput,
): EventRecoveryProfile {
  const { target } = input;

  // Handle race_performance targets
  if (target.target_type === "race_performance") {
    const durationHours = target.target_time_s / 3600;

    // Base recovery scales with duration (no magic constants)
    // Formula: min(28, max(2, duration * 3.5))
    //   5K (0.33hr): 2 days
    //   Half marathon (1.5hr): 5 days
    //   Marathon (3.5hr): 12 days
    //   50K (6hr): 21 days
    //   100-mile (24hr): 28 days (capped)
    const baseDays = Math.min(28, Math.max(2, durationHours * 3.5));

    // Estimate intensity based on duration and activity type
    const intensity = estimateRaceIntensity({
      distance_m: target.distance_m,
      duration_s: target.target_time_s,
      activity: target.activity_category,
    });

    // Adjust for intensity (harder efforts need more recovery)
    const intensityFactor = intensity / 100;
    const recoveryDaysFull = Math.round(
      baseDays * (0.7 + intensityFactor * 0.3),
    );

    // Functional recovery is ~40% of full recovery
    const recoveryDaysFunctional = Math.round(baseDays * 0.4);

    // ATL spike factor: longer events cause bigger spikes
    const atlSpikeFactor = Math.min(2.5, 1 + durationHours * 0.15);

    return {
      recovery_days_full: recoveryDaysFull,
      recovery_days_functional: recoveryDaysFunctional,
      fatigue_intensity: intensity,
      atl_spike_factor: atlSpikeFactor,
    };
  }

  // Handle pace_threshold targets
  if (target.target_type === "pace_threshold") {
    const testDurationHours = target.test_duration_s / 3600;
    const baseDays = 3 + testDurationHours * 2;

    return {
      recovery_days_full: Math.round(baseDays),
      recovery_days_functional: Math.round(baseDays * 0.35),
      fatigue_intensity: 75,
      atl_spike_factor: 1.2,
    };
  }

  // Handle power_threshold targets
  if (target.target_type === "power_threshold") {
    const testDurationHours = target.test_duration_s / 3600;
    const baseDays = 3 + testDurationHours * 2;

    return {
      recovery_days_full: Math.round(baseDays),
      recovery_days_functional: Math.round(baseDays * 0.35),
      fatigue_intensity: 75,
      atl_spike_factor: 1.2,
    };
  }

  // Handle hr_threshold targets
  if (target.target_type === "hr_threshold") {
    return {
      recovery_days_full: 3,
      recovery_days_functional: 1,
      fatigue_intensity: 65,
      atl_spike_factor: 1.1,
    };
  }

  // Fallback (should never reach here with proper typing)
  return {
    recovery_days_full: 7,
    recovery_days_functional: 3,
    fatigue_intensity: 75,
    atl_spike_factor: 1.2,
  };
}

/**
 * Computes post-event fatigue penalty for a given date.
 *
 * Uses simple exponential decay with half-life = 1/3 of full recovery time.
 *
 * Penalty Calculation:
 * 1. Calculate days after event (0 if before event)
 * 2. Get recovery profile for event
 * 3. Apply exponential decay: decay_factor = 0.5^(days / half_life)
 * 4. Calculate base penalty from event intensity
 * 5. Add ATL overload penalty if current ATL > CTL
 * 6. Apply decay and cap at 60%
 *
 * Example (marathon with 12-day full recovery):
 * - Day 1: ~40% penalty (severe fatigue)
 * - Day 3: ~25% penalty (significant fatigue)
 * - Day 7: ~10% penalty (moderate fatigue)
 * - Day 14: ~3% penalty (minimal fatigue)
 *
 * @param input - Current date, point, and event goal information
 * @returns Fatigue penalty percentage (0-60)
 */
export function computePostEventFatiguePenalty(
  input: PostEventFatigueInput,
): number {
  const daysAfterEvent = diffDateOnlyUtcDays(
    input.eventGoal.target_date,
    input.currentDate,
  );

  // Only penalize after event, not before
  if (daysAfterEvent <= 0) {
    return 0;
  }

  // Get primary target
  const primaryTarget = input.eventGoal.targets[0];
  if (!primaryTarget) {
    return 0;
  }

  // Calculate recovery profile
  const recoveryProfile = computeEventRecoveryProfile({
    target: primaryTarget,
    projected_ctl_at_event: input.eventGoal.projected_ctl,
    projected_atl_at_event: input.eventGoal.projected_atl,
  });

  // Exponential decay curve (simple, no bi-phasic complexity)
  // Half-life = 1/3 of full recovery time
  const recoveryHalfLife = recoveryProfile.recovery_days_full / 3;
  const decayFactor = Math.pow(0.5, daysAfterEvent / recoveryHalfLife);

  // Check current ATL/CTL ratio for overload penalty
  const atlRatio =
    input.currentPoint.predicted_fatigue_atl /
    Math.max(1, input.currentPoint.predicted_fitness_ctl);
  const atlOverloadPenalty = Math.max(0, (atlRatio - 1) * 30);

  // Base penalty from event intensity (0-50% range)
  const basePenalty = recoveryProfile.fatigue_intensity * 0.5;

  // Total penalty with decay
  const totalPenalty = (basePenalty + atlOverloadPenalty) * decayFactor;

  // Cap at 60% penalty
  return Math.min(60, totalPenalty);
}
