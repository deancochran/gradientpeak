/**
 * Baseline Profiles
 *
 * Functions for generating complete baseline performance profiles based on
 * athlete characteristics (experience level, weight, gender, age, sport).
 *
 * Used during onboarding to provide comprehensive baseline metrics when users
 * don't know their exact performance values. Supports:
 * - Beginner: Conservative defaults for new athletes
 * - Intermediate: Typical values for regular training
 * - Advanced: Competitive athlete values
 *
 * Creates complete profiles including heart rate metrics, sport-specific
 * performance metrics, and confidence levels.
 */

import {
  calculateVO2MaxFromHR,
  estimateLTHR,
  estimateMaxHRFromAge,
} from "./heart-rate";
import {
  estimateFTPFromWeight,
  estimateThresholdPaceFromGender,
  estimateCSSFromGender,
  type ExperienceLevel,
} from "./performance-estimates";

/**
 * Sport type for baseline profile generation.
 */
export type Sport = "cycling" | "running" | "swimming" | "triathlon" | "other";

/**
 * Complete baseline profile with all metrics.
 */
export interface BaselineProfile {
  // Heart rate metrics
  max_hr: number;
  resting_hr: number;
  lthr: number;
  vo2_max: number;

  // Performance metrics (sport-specific)
  ftp?: number; // cycling/triathlon
  threshold_pace_seconds_per_km?: number; // running/triathlon
  css_seconds_per_hundred_meters?: number; // swimming/triathlon

  // Metadata
  confidence: "high" | "medium" | "low";
  source: "baseline_beginner" | "baseline_intermediate" | "baseline_advanced";
}

/**
 * Gets a complete baseline profile for an athlete based on their characteristics.
 *
 * Generates conservative, realistic baseline values for:
 * - Heart rate metrics (max HR, resting HR, LTHR, VO2max)
 * - Sport-specific performance metrics (FTP, threshold pace, CSS)
 * - Confidence and source metadata
 *
 * Returns null for 'skip' or 'advanced' experience levels (no baseline needed).
 *
 * @param experienceLevel - Experience level: 'beginner', 'intermediate', 'advanced', 'skip'
 * @param weightKg - Athlete weight in kg
 * @param gender - Athlete gender
 * @param age - Athlete age in years
 * @param sport - Primary sport
 * @returns Complete baseline profile or null if not applicable
 *
 * @example
 * // Beginner cyclist
 * const profile = getBaselineProfile('beginner', 70, 'male', 30, 'cycling');
 * // Returns: {
 * //   max_hr: 190,
 * //   resting_hr: 70,
 * //   lthr: 162,
 * //   vo2_max: 41,
 * //   ftp: 140,
 * //   confidence: 'low',
 * //   source: 'baseline_beginner'
 * // }
 *
 * @example
 * // Intermediate triathlete
 * const profile = getBaselineProfile('intermediate', 65, 'female', 35, 'triathlon');
 * // Returns: {
 * //   max_hr: 185,
 * //   resting_hr: 65,
 * //   lthr: 157,
 * //   vo2_max: 44,
 * //   ftp: 146,
 * //   threshold_pace_seconds_per_km: 345,
 * //   css_seconds_per_hundred_meters: 110,
 * //   confidence: 'medium',
 * //   source: 'baseline_intermediate'
 * // }
 */
export function getBaselineProfile(
  experienceLevel: ExperienceLevel | "skip",
  weightKg: number,
  gender: "male" | "female" | "other",
  age: number,
  sport: Sport,
): BaselineProfile | null {
  // No baseline needed for skip or advanced (user will enter their own values)
  if (experienceLevel === "skip" || experienceLevel === "advanced") {
    return null;
  }

  // Validate inputs
  if (weightKg <= 0 || age <= 0) {
    throw new Error("Weight and age must be greater than 0");
  }

  // Calculate heart rate baselines
  const max_hr = estimateMaxHRFromAge(age);

  // Resting HR varies by experience level
  const restingHRBaselines = {
    beginner: {
      male: 70,
      female: 75,
      other: 72,
    },
    intermediate: {
      male: 60,
      female: 65,
      other: 62,
    },
  };

  const resting_hr = restingHRBaselines[experienceLevel][gender];

  // Calculate derived HR metrics
  const lthr = estimateLTHR(max_hr);
  const vo2_max = calculateVO2MaxFromHR(max_hr, resting_hr);

  // Calculate sport-specific performance metrics
  let ftp: number | undefined;
  let threshold_pace_seconds_per_km: number | undefined;
  let css_seconds_per_hundred_meters: number | undefined;

  // Cycling or triathlon: include FTP
  if (sport === "cycling" || sport === "triathlon") {
    ftp = estimateFTPFromWeight(weightKg, gender, experienceLevel);
  }

  // Running or triathlon: include threshold pace
  if (sport === "running" || sport === "triathlon") {
    threshold_pace_seconds_per_km = estimateThresholdPaceFromGender(
      gender,
      experienceLevel,
    );
  }

  // Swimming or triathlon: include CSS
  if (sport === "swimming" || sport === "triathlon") {
    css_seconds_per_hundred_meters = estimateCSSFromGender(
      gender,
      experienceLevel,
    );
  }

  // Determine confidence level
  const confidence = experienceLevel === "beginner" ? "low" : "medium";

  // Determine source
  const source =
    experienceLevel === "beginner"
      ? "baseline_beginner"
      : "baseline_intermediate";

  return {
    max_hr,
    resting_hr,
    lthr,
    vo2_max,
    ftp,
    threshold_pace_seconds_per_km,
    css_seconds_per_hundred_meters,
    confidence,
    source,
  };
}

/**
 * Validates a user-entered metric against the baseline for their profile.
 *
 * Compares the user's value to the expected baseline and provides feedback
 * on whether it's realistic, high, or low relative to their experience level.
 *
 * @param userValue - The value entered by the user
 * @param baselineValue - The baseline value for their profile
 * @param metricName - Name of the metric for error messages
 * @returns Validation result with feedback
 *
 * @example
 * // User claims 300W FTP, baseline suggests 193W
 * const result = validateAgainstBaseline(300, 193, 'FTP');
 * // Returns: {
 * //   isRealistic: false,
 * //   deviationPercent: 55,
 * //   feedback: 'significantly higher',
 * //   warning: 'Your FTP is 55% higher than typical for your profile...'
 * // }
 */
export function validateAgainstBaseline(
  userValue: number,
  baselineValue: number,
  metricName: string,
): {
  isRealistic: boolean;
  deviationPercent: number;
  feedback: "much lower" | "lower" | "typical" | "higher" | "much higher";
  warning?: string;
} {
  const deviation = (userValue - baselineValue) / baselineValue;
  const deviationPercent = Math.round(Math.abs(deviation) * 100);

  let isRealistic = true;
  let feedback: "much lower" | "lower" | "typical" | "higher" | "much higher";
  let warning: string | undefined;

  if (deviation > 0.5) {
    // 50%+ above baseline
    isRealistic = false;
    feedback = "much higher";
    warning = `Your ${metricName} is ${deviationPercent}% higher than typical for your profile. Please verify this value is correct.`;
  } else if (deviation > 0.3) {
    // 30-50% above baseline
    feedback = "higher";
    warning = `Your ${metricName} is ${deviationPercent}% higher than typical. This is great! Are you sure it's accurate?`;
  } else if (deviation > 0.15) {
    // 15-30% above baseline
    feedback = "higher";
  } else if (deviation < -0.5) {
    // 50%+ below baseline
    isRealistic = false;
    feedback = "much lower";
    warning = `Your ${metricName} is ${deviationPercent}% lower than typical for your profile. Is this correct?`;
  } else if (deviation < -0.3) {
    // 30-50% below baseline
    feedback = "lower";
    warning = `Your ${metricName} is ${deviationPercent}% lower than typical. You may want to retest this value.`;
  } else if (deviation < -0.15) {
    // 15-30% below baseline
    feedback = "lower";
  } else {
    // Within ±15%
    feedback = "typical";
  }

  return {
    isRealistic,
    deviationPercent,
    feedback,
    warning,
  };
}

/**
 * Merges user-entered metrics with baseline profile, prioritizing user input.
 *
 * Used during onboarding to fill in missing values from the baseline while
 * respecting any metrics the user explicitly provided.
 *
 * @param userMetrics - Metrics provided by the user (partial)
 * @param baseline - Complete baseline profile
 * @returns Merged profile with user values taking precedence
 *
 * @example
 * const userMetrics = { ftp: 250, max_hr: 190 };
 * const baseline = getBaselineProfile('intermediate', 70, 'male', 30, 'cycling');
 * const merged = mergeWithBaseline(userMetrics, baseline);
 * // Returns: {
 * //   ftp: 250,           // User value (overrides baseline 193)
 * //   max_hr: 190,        // User value (overrides baseline 190)
 * //   resting_hr: 60,     // From baseline
 * //   lthr: 162,          // From baseline
 * //   vo2_max: 48,        // From baseline
 * // }
 */
export function mergeWithBaseline(
  userMetrics: Partial<BaselineProfile>,
  baseline: BaselineProfile | null,
): Partial<BaselineProfile> {
  if (!baseline) {
    return userMetrics;
  }

  return {
    // Heart rate metrics
    max_hr: userMetrics.max_hr ?? baseline.max_hr,
    resting_hr: userMetrics.resting_hr ?? baseline.resting_hr,
    lthr: userMetrics.lthr ?? baseline.lthr,
    vo2_max: userMetrics.vo2_max ?? baseline.vo2_max,

    // Performance metrics
    ftp: userMetrics.ftp ?? baseline.ftp,
    threshold_pace_seconds_per_km:
      userMetrics.threshold_pace_seconds_per_km ??
      baseline.threshold_pace_seconds_per_km,
    css_seconds_per_hundred_meters:
      userMetrics.css_seconds_per_hundred_meters ??
      baseline.css_seconds_per_hundred_meters,

    // Metadata
    confidence: userMetrics.confidence ?? baseline.confidence,
    source: userMetrics.source ?? baseline.source,
  };
}

/**
 * Calculates age from date of birth.
 *
 * @param dob - Date of birth (ISO string or Date object)
 * @returns Age in years
 *
 * @example
 * const age = calculateAge('1990-01-01');
 * // Returns: 36 (as of 2026)
 */
export function calculateAge(dob: string | Date): number {
  const birthDate = typeof dob === "string" ? new Date(dob) : dob;
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  // Adjust if birthday hasn't occurred yet this year
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}
