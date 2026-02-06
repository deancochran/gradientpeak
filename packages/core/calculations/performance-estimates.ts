/**
 * Performance Estimations
 *
 * Functions for estimating performance metrics based on athlete characteristics
 * (weight, gender, age, training level). Used during onboarding to provide
 * reasonable baseline values when users don't know their exact metrics.
 *
 * These are conservative estimates based on population averages for recreational
 * athletes. Actual values can vary significantly based on:
 * - Training history and experience
 * - Genetics and body composition
 * - Sport-specific technique
 * - Current fitness level
 */

/**
 * Experience levels for performance estimation.
 */
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/**
 * Training level classification for W' estimation.
 */
export type TrainingLevel = "recreational" | "trained" | "elite";

/**
 * Validation result for performance metrics.
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  percentileEstimate?: number;
}

/**
 * Estimates FTP (Functional Threshold Power) from weight and gender.
 *
 * Uses conservative W/kg ratios for recreational cyclists:
 * - Beginner male: 2.0 W/kg
 * - Beginner female: 1.5 W/kg
 * - Intermediate male: 2.75 W/kg
 * - Intermediate female: 2.25 W/kg
 * - Advanced male: 3.5 W/kg
 * - Advanced female: 3.0 W/kg
 *
 * @param weightKg - Athlete weight in kg
 * @param gender - Athlete gender
 * @param experienceLevel - Experience level (default: 'intermediate')
 * @returns Estimated FTP in watts
 * @throws Error if weight is invalid
 *
 * @example
 * const ftp = estimateFTPFromWeight(70, 'male', 'intermediate');
 * // Returns: 193W (2.75 W/kg × 70kg)
 *
 * @example
 * const ftp = estimateFTPFromWeight(60, 'female', 'beginner');
 * // Returns: 90W (1.5 W/kg × 60kg)
 */
export function estimateFTPFromWeight(
  weightKg: number,
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  if (weightKg <= 0) {
    throw new Error("Weight must be greater than 0");
  }

  if (weightKg < 30 || weightKg > 200) {
    throw new Error("Weight must be between 30 and 200 kg");
  }

  // W/kg ratios by experience level and gender
  const wattPerKg: Record<
    ExperienceLevel,
    Record<"male" | "female" | "other", number>
  > = {
    beginner: {
      male: 2.0,
      female: 1.5,
      other: 1.75,
    },
    intermediate: {
      male: 2.75,
      female: 2.25,
      other: 2.5,
    },
    advanced: {
      male: 3.5,
      female: 3.0,
      other: 3.25,
    },
  };

  const ratio = wattPerKg[experienceLevel][gender];
  return Math.round(weightKg * ratio);
}

/**
 * Estimates threshold pace (seconds per km) from gender and experience level.
 *
 * Baseline paces for recreational runners:
 * - Beginner male: 6:30/km (390 s/km)
 * - Beginner female: 7:00/km (420 s/km)
 * - Intermediate male: 5:15/km (315 s/km)
 * - Intermediate female: 5:45/km (345 s/km)
 * - Advanced male: 4:30/km (270 s/km)
 * - Advanced female: 5:00/km (300 s/km)
 *
 * @param gender - Athlete gender
 * @param experienceLevel - Experience level (default: 'intermediate')
 * @returns Estimated threshold pace in seconds per kilometer
 *
 * @example
 * const pace = estimateThresholdPaceFromGender('male', 'intermediate');
 * // Returns: 315 (5:15/km)
 *
 * @example
 * const pace = estimateThresholdPaceFromGender('female', 'beginner');
 * // Returns: 420 (7:00/km)
 */
export function estimateThresholdPaceFromGender(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  // Threshold pace in seconds per km
  const paces: Record<
    ExperienceLevel,
    Record<"male" | "female" | "other", number>
  > = {
    beginner: {
      male: 390, // 6:30/km
      female: 420, // 7:00/km
      other: 405, // 6:45/km
    },
    intermediate: {
      male: 315, // 5:15/km
      female: 345, // 5:45/km
      other: 330, // 5:30/km
    },
    advanced: {
      male: 270, // 4:30/km
      female: 300, // 5:00/km
      other: 285, // 4:45/km
    },
  };

  return paces[experienceLevel][gender];
}

/**
 * Estimates CSS (Critical Swim Speed) from gender and experience level.
 *
 * Baseline CSS values (seconds per 100m) for pool swimmers:
 * - Beginner male: 2:00/100m (120 s/100m)
 * - Beginner female: 2:15/100m (135 s/100m)
 * - Intermediate male: 1:40/100m (100 s/100m)
 * - Intermediate female: 1:50/100m (110 s/100m)
 * - Advanced male: 1:20/100m (80 s/100m)
 * - Advanced female: 1:30/100m (90 s/100m)
 *
 * @param gender - Athlete gender
 * @param experienceLevel - Experience level (default: 'intermediate')
 * @returns Estimated CSS in seconds per 100 meters
 *
 * @example
 * const css = estimateCSSFromGender('male', 'intermediate');
 * // Returns: 100 (1:40/100m)
 *
 * @example
 * const css = estimateCSSFromGender('female', 'beginner');
 * // Returns: 135 (2:15/100m)
 */
export function estimateCSSFromGender(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  // CSS in seconds per 100m
  const cssPaces: Record<
    ExperienceLevel,
    Record<"male" | "female" | "other", number>
  > = {
    beginner: {
      male: 120, // 2:00/100m
      female: 135, // 2:15/100m
      other: 127, // ~2:07/100m
    },
    intermediate: {
      male: 100, // 1:40/100m
      female: 110, // 1:50/100m
      other: 105, // 1:45/100m
    },
    advanced: {
      male: 80, // 1:20/100m
      female: 90, // 1:30/100m
      other: 85, // ~1:25/100m
    },
  };

  return cssPaces[experienceLevel][gender];
}

/**
 * Validates if a performance metric is realistic for the given athlete profile.
 *
 * Checks if the value falls within reasonable ranges and provides warnings
 * for outliers. Uses percentile estimates based on population data.
 *
 * @param metric - Metric type ('ftp', 'threshold_pace', 'css', 'vo2_max')
 * @param value - Metric value to validate
 * @param context - Additional context (weight, age, gender, experience)
 * @returns Validation result with warnings and confidence level
 *
 * @example
 * const result = validatePerformanceMetric('ftp', 350, {
 *   weightKg: 70,
 *   gender: 'male',
 *   experienceLevel: 'intermediate',
 * });
 * // Returns: {
 * //   isValid: false,
 * //   warnings: ['FTP of 350W (5.0 W/kg) is exceptionally high...'],
 * //   confidence: 'low',
 * //   percentileEstimate: 95,
 * // }
 */
export function validatePerformanceMetric(
  metric: "ftp" | "threshold_pace" | "css" | "vo2_max",
  value: number,
  context: {
    weightKg?: number;
    age?: number;
    gender?: "male" | "female" | "other";
    experienceLevel?: ExperienceLevel;
  },
): ValidationResult {
  const warnings: string[] = [];
  let isValid = true;
  let confidence: "high" | "medium" | "low" = "high";
  let percentileEstimate: number | undefined;

  const {
    weightKg,
    gender = "other",
    experienceLevel = "intermediate",
  } = context;

  switch (metric) {
    case "ftp": {
      if (!weightKg) {
        warnings.push("Cannot validate FTP without weight information");
        confidence = "low";
        break;
      }

      const wattPerKg = value / weightKg;

      // FTP validation ranges (W/kg)
      if (wattPerKg < 1.0) {
        warnings.push(
          `FTP of ${value}W (${wattPerKg.toFixed(1)} W/kg) is very low. Are you sure this is correct?`,
        );
        confidence = "low";
        isValid = false;
      } else if (wattPerKg < 1.5) {
        warnings.push(
          `FTP of ${value}W (${wattPerKg.toFixed(1)} W/kg) is below typical beginner values.`,
        );
        confidence = "medium";
        percentileEstimate = 10;
      } else if (wattPerKg > 5.0) {
        warnings.push(
          `FTP of ${value}W (${wattPerKg.toFixed(1)} W/kg) is exceptionally high (professional level). Please verify this value.`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 99;
      } else if (wattPerKg > 4.0) {
        warnings.push(
          `FTP of ${value}W (${wattPerKg.toFixed(1)} W/kg) is very high (competitive level).`,
        );
        confidence = "medium";
        percentileEstimate = 95;
      }

      // Estimate percentile for typical values
      if (confidence === "high") {
        if (wattPerKg < 2.0) percentileEstimate = 25;
        else if (wattPerKg < 2.75) percentileEstimate = 50;
        else if (wattPerKg < 3.5) percentileEstimate = 75;
        else percentileEstimate = 90;
      }

      break;
    }

    case "threshold_pace": {
      // Threshold pace validation (seconds per km)
      // Reasonable range: 3:00/km (180s) to 8:00/km (480s)

      if (value < 180) {
        warnings.push(
          `Threshold pace of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/km is exceptionally fast (sub-3:00/km). Please verify.`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 99;
      } else if (value < 240) {
        warnings.push(
          `Threshold pace of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/km is very fast (competitive level).`,
        );
        confidence = "medium";
        percentileEstimate = 95;
      } else if (value > 480) {
        warnings.push(
          `Threshold pace of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/km is very slow. Are you sure this is correct?`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 5;
      } else if (value > 420) {
        warnings.push(
          `Threshold pace of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/km is slower than typical beginner values.`,
        );
        confidence = "medium";
        percentileEstimate = 15;
      }

      // Estimate percentile for typical values
      if (confidence === "high") {
        if (value > 390)
          percentileEstimate = 25; // Slower than 6:30/km
        else if (value > 315)
          percentileEstimate = 50; // Slower than 5:15/km
        else if (value > 270)
          percentileEstimate = 75; // Slower than 4:30/km
        else percentileEstimate = 90;
      }

      break;
    }

    case "css": {
      // CSS validation (seconds per 100m)
      // Reasonable range: 1:00/100m (60s) to 3:00/100m (180s)

      if (value < 60) {
        warnings.push(
          `CSS of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/100m is exceptionally fast (sub-1:00). Please verify.`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 99;
      } else if (value < 80) {
        warnings.push(
          `CSS of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/100m is very fast (competitive level).`,
        );
        confidence = "medium";
        percentileEstimate = 95;
      } else if (value > 180) {
        warnings.push(
          `CSS of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/100m is very slow. Are you sure this is correct?`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 5;
      } else if (value > 150) {
        warnings.push(
          `CSS of ${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}/100m is slower than typical beginner values.`,
        );
        confidence = "medium";
        percentileEstimate = 15;
      }

      // Estimate percentile for typical values
      if (confidence === "high") {
        if (value > 120)
          percentileEstimate = 25; // Slower than 2:00/100m
        else if (value > 100)
          percentileEstimate = 50; // Slower than 1:40/100m
        else if (value > 90)
          percentileEstimate = 75; // Slower than 1:30/100m
        else percentileEstimate = 90;
      }

      break;
    }

    case "vo2_max": {
      // VO2max validation (ml/kg/min)
      // Reasonable range: 20-85 ml/kg/min for general population

      if (value < 20) {
        warnings.push(
          `VO2max of ${value.toFixed(1)} ml/kg/min is very low. This may indicate health concerns.`,
        );
        confidence = "low";
        isValid = false;
      } else if (value < 30) {
        warnings.push(
          `VO2max of ${value.toFixed(1)} ml/kg/min is below average fitness.`,
        );
        confidence = "medium";
        percentileEstimate = 20;
      } else if (value > 80) {
        warnings.push(
          `VO2max of ${value.toFixed(1)} ml/kg/min is exceptionally high (elite athlete level). Please verify.`,
        );
        confidence = "low";
        isValid = false;
        percentileEstimate = 99;
      } else if (value > 65) {
        warnings.push(
          `VO2max of ${value.toFixed(1)} ml/kg/min is very high (competitive athlete level).`,
        );
        confidence = "medium";
        percentileEstimate = 95;
      }

      // Estimate percentile for typical values
      if (confidence === "high") {
        if (value < 40) percentileEstimate = 40;
        else if (value < 50) percentileEstimate = 60;
        else if (value < 60) percentileEstimate = 80;
        else percentileEstimate = 90;
      }

      break;
    }
  }

  return {
    isValid,
    warnings,
    confidence,
    percentileEstimate,
  };
}
