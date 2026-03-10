/**
 * Calibration Constants for Training Plan Calculations
 *
 * This file centralizes all magic numbers used in readiness score calculations,
 * demand CTL estimation, and other training plan computations.
 *
 * Each constant includes documentation explaining:
 * - What it controls
 * - Why this value was chosen (if known)
 * - Recommended range for tuning
 *
 * @module calibration-constants
 */

/**
 * Constants for goal readiness score calculation
 *
 * Goal readiness is a blend of:
 * - State readiness (CTL/ATL/TSB physiological state)
 * - Target attainment (how achievable the goal is)
 * - Alignment loss (multi-goal conflicts)
 */
export const READINESS_CALCULATION = {
  /**
   * Weight for physiological state component
   * Higher = readiness more influenced by current CTL/ATL/TSB
   * Range: 0.4-0.7
   */
  STATE_WEIGHT: 0.55,

  /**
   * Weight for goal attainability component
   * Higher = readiness more influenced by goal difficulty
   * Range: 0.3-0.6
   */
  ATTAINMENT_WEIGHT: 0.45,

  /**
   * Non-linear attainment scaling exponent
   *
   * Changed from 1.4 to 1.0 (linear) to fix counterintuitive behavior
   * where faster race goals showed LOWER readiness.
   *
   * Original: 1.4 (penalized ambitious goals exponentially)
   * New: 1.0 (linear relationship)
   *
   * Effect at 1.4:
   * - 100% attainment → 100% (no change)
   * - 80% attainment → 74% (-6%)
   * - 60% attainment → 52% (-8%)
   * - 40% attainment → 32% (-8%)
   *
   * Effect at 1.0:
   * - All attainments unchanged (linear)
   *
   * Range: 1.0-2.0 (1.0 = linear, 2.0 = quadratic penalty)
   */
  ATTAINMENT_EXPONENT: 1.0,

  /**
   * Elite synergy boost multiplier
   *
   * DEPRECATED: Set to 0 (disabled)
   *
   * Previously: 25 * (state/100)^2 * (attainment/100)^2
   * This added up to 25 points bonus for "elite" scenarios where
   * both state and attainment were very high.
   *
   * Removed because:
   * - No scientific rationale documented
   * - Arbitrary "25" constant with no justification
   * - Created confusing non-linear behavior
   * - Quadratic scaling was unexplained
   *
   * If you want to re-enable this, set to a value > 0 (e.g., 25)
   */
  SYNERGY_BOOST_MULTIPLIER: 0,

  /**
   * Alignment penalty weight
   * Applied when multiple goals conflict (within recovery window)
   * Range: 0.1-0.3
   */
  ALIGNMENT_PENALTY_WEIGHT: 0.2,
} as const;

/**
 * Constants for race distance to CTL demand conversion
 *
 * Formula: CTL = DISTANCE_CTL_BASE + DISTANCE_CTL_SCALE * log(1 + distanceKm)
 *
 * This logarithmic formula reflects diminishing returns:
 * - First 10km adds more CTL demand than 10-20km
 * - Marathon (42km) doesn't require 8x the CTL of 5km
 */
export const DISTANCE_TO_CTL = {
  /**
   * Base CTL required for any race distance
   * Represents minimum fitness for racing
   * Range: 20-35
   */
  DISTANCE_CTL_BASE: 28,

  /**
   * Logarithmic scaling factor for distance
   * Controls how much additional CTL each km adds
   * Range: 10-15
   */
  DISTANCE_CTL_SCALE: 13,
} as const;

/**
 * Constants for pace/speed to CTL boost conversion
 *
 * Faster race goals require higher fitness beyond just distance.
 * Formula: boost = (speedKph - baseline) * multiplier
 * Capped at PACE_BOOST_CAP to prevent extreme values.
 */
export const PACE_TO_CTL = {
  /**
   * Activity-specific pace baselines (km/h)
   *
   * Speed above this baseline adds CTL demand.
   * Below baseline = minimal/no boost.
   */
  BASELINES: {
    run: {
      sprint: 15, // < 5K races
      short: 12, // 5K-10K
      medium: 10, // Half marathon
      long: 9, // Marathon
      ultra: 8, // Ultra marathons
    },
    bike: {
      sprint: 35,
      short: 32,
      medium: 28,
      long: 25,
    },
    swim: {
      default: 3.5,
    },
  },

  /**
   * CTL boost per km/h above baseline
   * Higher = faster paces add more CTL demand
   * Range: 2.0-4.0
   */
  PACE_BOOST_MULTIPLIER: 3.2,

  /**
   * Maximum pace boost (prevents extreme values)
   * Elite speeds capped to avoid unrealistic CTL demands
   * Range: 20-30
   */
  PACE_BOOST_CAP: 24,
} as const;

/**
 * Constants for target-specific CTL demands
 *
 * Different goal types have different base CTL requirements
 */
export const TARGET_TYPE_CTL = {
  /**
   * Pace threshold test (e.g., lactate threshold run)
   */
  PACE_THRESHOLD: 56,

  /**
   * Power threshold test (e.g., FTP test on bike)
   */
  POWER_THRESHOLD: 60,

  /**
   * Heart rate threshold test
   */
  HR_THRESHOLD: 54,
} as const;

/**
 * Constants for projection point readiness timeline calculation
 *
 * These control how daily readiness scores are computed from CTL/ATL/TSB
 */
export const READINESS_TIMELINE = {
  /**
   * Optimal TSB (form) at goal date
   *
   * Changed to be event-duration-aware (see computeOptimalTsb function).
   * This is the default fallback value.
   *
   * Research shows optimal TSB varies by event:
   * - Sprint events (< 30min): TSB 15+ (high taper)
   * - Short events (30min-1.5hr): TSB 12
   * - Medium events (1.5-3hr): TSB 8
   * - Long events (3-5hr): TSB 5
   * - Ultra events (5hr+): TSB 3 (minimal taper)
   *
   * Range: 3-15
   */
  TARGET_TSB_DEFAULT: 8,

  /**
   * Form tolerance (how far from target TSB is acceptable)
   * Larger = more lenient form signal
   * Range: 15-25
   */
  FORM_TOLERANCE: 20,

  /**
   * Fatigue overflow scale
   * Controls penalty when ATL exceeds CTL
   * Range: 0.3-0.5
   */
  FATIGUE_OVERFLOW_SCALE: 0.4,

  /**
   * Plan feasibility blend weight
   *
   * DEPRECATED: Set to 0 (disabled)
   *
   * Previously blended plan-level feasibility (15%) into daily readiness.
   * This conflated "can I do this plan?" with "how ready am I today?"
   *
   * Now: Feasibility and readiness are separate metrics.
   */
  FEASIBILITY_BLEND_WEIGHT: 0,

  /**
   * Form signal weight in readiness calculation
   *
   * Changed to be dynamic based on training stage (see implementation).
   * This is the default fallback value.
   *
   * Original: 0.5 (50% weight on TSB/form)
   * New: Dynamic (lower early in plan, higher near goal)
   *
   * Readiness = form * weight + fitness * weight + fatigue * 0.2
   */
  FORM_SIGNAL_WEIGHT_DEFAULT: 0.5,

  /**
   * Minimum form signal weight (early in plan, focus on fitness)
   */
  FORM_SIGNAL_WEIGHT_MIN: 0.2,

  /**
   * Maximum form signal weight (near goal, focus on form)
   */
  FORM_SIGNAL_WEIGHT_MAX: 0.5,

  /**
   * Fitness signal weight (default if not using dynamic weighting)
   */
  FITNESS_SIGNAL_WEIGHT_DEFAULT: 0.3,

  /**
   * Fatigue signal weight (constant across training)
   */
  FATIGUE_SIGNAL_WEIGHT: 0.2,

  /**
   * Progressive fitness exponent
   * Controls how CTL progress is scaled
   * Range: 1.2-1.5
   */
  PROGRESSIVE_FITNESS_EXPONENT: 1.35,

  /**
   * Progressive fitness weight in fitness signal blend
   */
  PROGRESSIVE_FITNESS_WEIGHT: 0.7,

  /**
   * Absolute fitness weight in fitness signal blend
   */
  ABSOLUTE_FITNESS_WEIGHT: 0.3,

  /**
   * Peak CTL scaling factor for absolute fitness signal
   * Higher = harder to reach 100% fitness signal
   */
  PEAK_CTL_SCALING: 1.15,
} as const;

export interface NoHistoryStartingPrior {
  starting_ctl: number;
  starting_weekly_tss: number;
  recommended_sessions_per_week_range: {
    min: number;
    max: number;
  };
  max_single_session_duration_minutes: number;
  is_youth: boolean;
  age_band: "youth" | "adult" | "unknown";
  rationale_codes: string[];
}

interface AgeCurvePoint {
  age: number;
  value: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) {
    return 0;
  }

  const normalized = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function interpolateAgeCurve(
  points: AgeCurvePoint[],
  age?: number | null,
): number | undefined {
  if (age === undefined || age === null || !Number.isFinite(age)) {
    return undefined;
  }

  const sorted = [...points].sort((a, b) => a.age - b.age);
  if (age <= sorted[0]!.age) {
    return sorted[0]!.value;
  }

  const last = sorted[sorted.length - 1]!;
  if (age >= last.age) {
    return last.value;
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]!;
    const right = sorted[index]!;
    if (age > right.age) {
      continue;
    }

    const progress = smoothstep(left.age, right.age, age);
    return left.value + (right.value - left.value) * progress;
  }

  return last.value;
}

function interpolateContinuousCurve(
  points: Array<{ input: number; value: number }>,
  input: number | undefined,
): number | undefined {
  if (input === undefined || !Number.isFinite(input)) {
    return undefined;
  }

  const sorted = [...points].sort((a, b) => a.input - b.input);
  if (input <= sorted[0]!.input) {
    return sorted[0]!.value;
  }

  const last = sorted[sorted.length - 1]!;
  if (input >= last.input) {
    return last.value;
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]!;
    const right = sorted[index]!;
    if (input > right.input) {
      continue;
    }

    const progress = smoothstep(left.input, right.input, input);
    return left.value + (right.value - left.value) * progress;
  }

  return last.value;
}

export function isYouthAthlete(age?: number | null): boolean {
  return (
    typeof age === "number" && Number.isFinite(age) && age >= 0 && age < 18
  );
}

export function resolveNoHistoryStartingPrior(input: {
  age?: number | null;
}): NoHistoryStartingPrior {
  const ageKnown =
    typeof input.age === "number" && Number.isFinite(input.age)
      ? input.age
      : null;
  const sustainableCtl = getMaxSustainableCTL(ageKnown ?? undefined);
  const startingCtl = Math.round(clamp(sustainableCtl * 0.15, 16, 22));
  const sessionMax = Math.round(
    interpolateAgeCurve(
      [
        { age: 13, value: 4 },
        { age: 18, value: 4 },
        { age: 30, value: 5 },
        { age: 50, value: 4 },
        { age: 65, value: 4 },
      ],
      ageKnown,
    ) ?? 4,
  );
  const durationCap = Math.round(
    interpolateAgeCurve(
      [
        { age: 13, value: 75 },
        { age: 18, value: 90 },
        { age: 30, value: 105 },
        { age: 50, value: 95 },
        { age: 65, value: 90 },
      ],
      ageKnown,
    ) ?? 90,
  );

  if (isYouthAthlete(input.age)) {
    return {
      starting_ctl: startingCtl,
      starting_weekly_tss: startingCtl * 7,
      recommended_sessions_per_week_range: {
        min: 3,
        max: Math.max(4, sessionMax),
      },
      max_single_session_duration_minutes: durationCap,
      is_youth: true,
      age_band: "youth",
      rationale_codes: ["no_history_shared_prior", "youth_safe_prior_applied"],
    };
  }

  if (typeof input.age === "number" && Number.isFinite(input.age)) {
    return {
      starting_ctl: startingCtl,
      starting_weekly_tss: startingCtl * 7,
      recommended_sessions_per_week_range: {
        min: 3,
        max: Math.max(4, sessionMax),
      },
      max_single_session_duration_minutes: durationCap,
      is_youth: false,
      age_band: "adult",
      rationale_codes: [
        "no_history_shared_prior",
        "adult_conservative_prior_applied",
      ],
    };
  }

  return {
    starting_ctl: 18,
    starting_weekly_tss: 126,
    recommended_sessions_per_week_range: { min: 3, max: 4 },
    max_single_session_duration_minutes: 90,
    is_youth: false,
    age_band: "unknown",
    rationale_codes: [
      "no_history_shared_prior",
      "age_unknown_conservative_prior",
    ],
  };
}

/**
 * Helper function to get event-duration-aware optimal TSB
 *
 * Shorter races need more taper (higher TSB) for peak performance.
 * Longer races need less taper (lower TSB) to maintain endurance.
 *
 * @param durationHours - Event duration in hours
 * @returns Optimal TSB for this event duration
 */
export function computeOptimalTsb(durationHours: number | undefined): number {
  if (durationHours === undefined || durationHours <= 0) {
    return READINESS_TIMELINE.TARGET_TSB_DEFAULT;
  }

  return Math.round(
    interpolateContinuousCurve(
      [
        { input: 0.25, value: 15 },
        { input: 1, value: 12 },
        { input: 2.5, value: 8 },
        { input: 4.5, value: 5 },
        { input: 10, value: 3 },
      ],
      durationHours,
    ) ?? READINESS_TIMELINE.TARGET_TSB_DEFAULT,
  );
}

/**
 * Helper function to get activity and distance-specific pace baseline
 *
 * @param activityCategory - Activity type (run, bike, swim)
 * @param distanceKm - Event distance in kilometers
 * @returns Baseline speed in km/h
 */
export function getPaceBaseline(
  activityCategory: string,
  distanceKm: number,
): number {
  if (activityCategory === "run") {
    return Number(
      (
        interpolateContinuousCurve(
          [
            { input: 3, value: 14.5 },
            { input: 5, value: PACE_TO_CTL.BASELINES.run.short },
            { input: 10, value: 11.2 },
            { input: 21.1, value: PACE_TO_CTL.BASELINES.run.medium },
            { input: 42.2, value: PACE_TO_CTL.BASELINES.run.long },
            { input: 80, value: PACE_TO_CTL.BASELINES.run.ultra },
          ],
          distanceKm,
        ) ?? PACE_TO_CTL.BASELINES.run.medium
      ).toFixed(2),
    );
  }

  if (activityCategory === "bike" || activityCategory === "cycle") {
    return Number(
      (
        interpolateContinuousCurve(
          [
            { input: 20, value: 36 },
            { input: 40, value: PACE_TO_CTL.BASELINES.bike.sprint },
            { input: 100, value: PACE_TO_CTL.BASELINES.bike.short },
            { input: 160, value: PACE_TO_CTL.BASELINES.bike.medium },
            { input: 220, value: PACE_TO_CTL.BASELINES.bike.long },
          ],
          distanceKm,
        ) ?? PACE_TO_CTL.BASELINES.bike.medium
      ).toFixed(2),
    );
  }

  if (activityCategory === "swim") {
    return PACE_TO_CTL.BASELINES.swim.default;
  }

  // Default to run medium baseline for unknown activities
  return PACE_TO_CTL.BASELINES.run.medium;
}

/**
 * Helper function to compute dynamic form signal weight
 *
 * Early in training: prioritize fitness building (lower form weight)
 * Late in training: prioritize taper/form (higher form weight)
 *
 * @param daysUntilGoal - Days remaining until goal date
 * @returns Form signal weight (0.2-0.5)
 */
export function computeDynamicFormWeight(daysUntilGoal: number): number {
  const { FORM_SIGNAL_WEIGHT_MIN, FORM_SIGNAL_WEIGHT_MAX } = READINESS_TIMELINE;

  // Within 14 days: full form weight
  if (daysUntilGoal <= 14) {
    return FORM_SIGNAL_WEIGHT_MAX;
  }

  // Beyond 100 days: minimum form weight
  if (daysUntilGoal >= 100) {
    return FORM_SIGNAL_WEIGHT_MIN;
  }

  // Linear interpolation between 14 and 100 days
  const progress = (100 - daysUntilGoal) / (100 - 14);
  return (
    FORM_SIGNAL_WEIGHT_MIN +
    (FORM_SIGNAL_WEIGHT_MAX - FORM_SIGNAL_WEIGHT_MIN) * progress
  );
}

/**
 * Get age-adjusted ATL time constant.
 * Falls back to standard 7-day constant when age is unavailable.
 */
export function getAgeAdjustedATLTimeConstant(age?: number): number {
  return Math.round(
    interpolateAgeCurve(
      [
        { age: 13, value: 8 },
        { age: 18, value: 7 },
        { age: 30, value: 7 },
        { age: 40, value: 8 },
        { age: 50, value: 11 },
        { age: 65, value: 13 },
      ],
      age,
    ) ?? 7,
  );
}

/**
 * Get age-adjusted CTL time constant.
 * Falls back to standard 42-day constant when age is unavailable.
 */
export function getAgeAdjustedCTLTimeConstant(age?: number): number {
  return Math.round(
    interpolateAgeCurve(
      [
        { age: 13, value: 45 },
        { age: 18, value: 42 },
        { age: 40, value: 42 },
        { age: 50, value: 45 },
        { age: 65, value: 48 },
      ],
      age,
    ) ?? 42,
  );
}

/**
 * Age-adjusted sustainable CTL ceiling.
 */
export function getMaxSustainableCTL(age?: number): number {
  return Math.round(
    interpolateAgeCurve(
      [
        { age: 13, value: 75 },
        { age: 18, value: 110 },
        { age: 30, value: 150 },
        { age: 40, value: 130 },
        { age: 50, value: 110 },
        { age: 65, value: 90 },
      ],
      age,
    ) ?? 120,
  );
}

/**
 * Age-adjusted ramp rate multiplier.
 */
export function getAgeAdjustedRampRateMultiplier(age?: number): number {
  const value =
    interpolateAgeCurve(
      [
        { age: 13, value: 0.55 },
        { age: 18, value: 0.75 },
        { age: 30, value: 1 },
        { age: 40, value: 0.85 },
        { age: 50, value: 0.7 },
        { age: 65, value: 0.62 },
      ],
      age,
    ) ?? 0.8;
  return Math.round(value * 1000) / 1000;
}

/**
 * Get gender-adjusted fatigue time multiplier.
 *
 * ATL is a fatigue time constant: higher value means slower fatigue decay
 * (longer recovery window). Female adjustment increases ATL time constant.
 */
export function getGenderAdjustedFatigueTimeMultiplier(
  gender?: "male" | "female" | null,
): number {
  if (gender === "female") return 1.08;
  return 1;
}

export function getGenderAdjustedRecoveryLoadMultiplier(
  gender?: "male" | "female" | null,
): number {
  if (gender === "female") {
    return 1.04;
  }

  return 1;
}

/**
 * Combine age and gender ATL adjustments.
 */
export function getPersonalizedATLTimeConstant(
  age?: number,
  gender?: "male" | "female" | null,
): number {
  const base = getAgeAdjustedATLTimeConstant(age);
  const multiplier = getGenderAdjustedFatigueTimeMultiplier(gender);
  return Math.round(base * multiplier);
}
