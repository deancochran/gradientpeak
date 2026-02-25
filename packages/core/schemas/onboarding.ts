/**
 * Onboarding Schemas
 *
 * Zod validation schemas for the smart onboarding flow. Defines input validation
 * for each step of the onboarding process and the complete onboarding payload.
 *
 * Used by:
 * - tRPC procedures for type-safe API validation
 * - Mobile app for client-side form validation
 * - Type inference for TypeScript interfaces
 */

import { z } from "zod";

/**
 * Experience level for onboarding.
 * Determines which baseline profile to use and which UI flows to show.
 */
export const experienceLevelSchema = z.enum([
  "beginner", // New to sport, auto-apply conservative defaults
  "intermediate", // Regular training, validate estimates
  "advanced", // Knows metrics, manual entry
  "skip", // Minimal setup, configure later
]);

export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

/**
 * Sport/activity type for primary sport selection.
 */
export const sportSchema = z.enum([
  "cycling",
  "running",
  "swimming",
  "triathlon",
  "other",
]);

export type Sport = z.infer<typeof sportSchema>;

/**
 * Training frequency categories.
 */
// export const trainingFrequencySchema = z.enum(["1-2", "3-4", "5-6", "7+"]);

// export type TrainingFrequency = z.infer<typeof trainingFrequencySchema>;

/**
 * Step 1: Basic Profile (Required)
 *
 * Essential information collected from all users regardless of experience level.
 * Used to calculate age and baseline performance estimates.
 */
export const onboardingStep1Schema = z.object({
  // Experience level (NEW - determines flow)
  experience_level: experienceLevelSchema,

  // Basic profile data
  dob: z
    .string()
    .datetime({
      message: "Date of birth must be a valid ISO 8601 datetime string",
    })
    .optional(),
  weight_kg: z
    .number()
    .positive({ message: "Weight must be positive" })
    .max(500, { message: "Weight must be less than 500kg" })
    .optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
});

export type OnboardingStep1 = z.infer<typeof onboardingStep1Schema>;

/**
 * Step 2: Heart Rate Metrics (Optional)
 *
 * Heart rate data for cardiovascular fitness assessment.
 * Can be skipped for beginners (auto-estimated) or entered manually for advanced users.
 */
export const onboardingStep2Schema = z.object({
  max_hr: z
    .number()
    .int({ message: "Max HR must be an integer" })
    .min(100, { message: "Max HR must be at least 100 bpm" })
    .max(250, { message: "Max HR must be at most 250 bpm" })
    .optional(),

  resting_hr: z
    .number()
    .int({ message: "Resting HR must be an integer" })
    .min(30, { message: "Resting HR must be at least 30 bpm" })
    .max(120, { message: "Resting HR must be at most 120 bpm" })
    .optional(),

  lthr: z
    .number()
    .int({ message: "LTHR must be an integer" })
    .min(80, { message: "LTHR must be at least 80 bpm" })
    .max(220, { message: "LTHR must be at most 220 bpm" })
    .optional(),
});

export type OnboardingStep2 = z.infer<typeof onboardingStep2Schema>;

/**
 * Step 3: Performance Metrics (Optional, Sport-Specific)
 *
 * Sport-specific performance data. Which fields are shown depends on primary_sport:
 * - Cycling/Triathlon: FTP
 * - Running/Triathlon: Threshold pace
 * - Swimming/Triathlon: CSS
 * - All: VO2max
 *
 * Can be auto-estimated for beginners/intermediate or entered manually for advanced.
 */
export const onboardingStep3Schema = z.object({
  // Cycling: FTP (Functional Threshold Power)
  ftp: z
    .number()
    .positive({ message: "FTP must be positive" })
    .max(1000, { message: "FTP must be less than 1000W" })
    .optional(),

  // Running: Threshold Pace (seconds per km)
  threshold_pace_seconds_per_km: z
    .number()
    .positive({ message: "Threshold pace must be positive" })
    .min(120, { message: "Pace must be slower than 2:00/km" })
    .max(600, { message: "Pace must be faster than 10:00/km" })
    .optional(),

  // Swimming: Critical Swim Speed (seconds per 100m)
  css_seconds_per_hundred_meters: z
    .number()
    .positive({ message: "CSS must be positive" })
    .min(60, { message: "CSS must be slower than 1:00/100m" })
    .max(300, { message: "CSS must be faster than 5:00/100m" })
    .optional(),

  // General: VO2max
  vo2max: z
    .number()
    .positive({ message: "VO2max must be positive" })
    .min(20, { message: "VO2max must be at least 20 ml/kg/min" })
    .max(100, { message: "VO2max must be at most 100 ml/kg/min" })
    .optional(),
});

export type OnboardingStep3 = z.infer<typeof onboardingStep3Schema>;

/**
 * Step 4: Training Context (Optional)
 *
 * Additional context about training habits and goals.
 * Used for future personalization and recommendations.
 */
// export const onboardingStep4Schema = z.object({
//   training_frequency: trainingFrequencySchema.optional(),

//   equipment: z
//     .array(z.string())
//     .max(10, { message: "Maximum 10 equipment items" })
//     .optional(),

//   goals: z.array(z.string()).max(5, { message: "Maximum 5 goals" }).optional(),
// });

// export type OnboardingStep4 = z.infer<typeof onboardingStep4Schema>;

/**
 * Complete Onboarding Schema
 *
 * Combines all steps into a single payload for the completeOnboarding mutation.
 * All fields except Step 1 are optional.
 */
export const completeOnboardingSchema = onboardingStep1Schema
  .merge(onboardingStep2Schema)
  .merge(onboardingStep3Schema);

export type CompleteOnboarding = z.infer<typeof completeOnboardingSchema>;

/**
 * Estimate Metrics Input Schema
 *
 * Input for the estimateMetrics query. Used to provide real-time estimates
 * as the user fills out the onboarding form.
 */
export const estimateMetricsInputSchema = z.object({
  weight_kg: z.number().positive(),
  gender: z.enum(["male", "female", "other"]),
  age: z.number().int().positive().min(10).max(100),
  experience_level: experienceLevelSchema.optional(),

  // Optional: for more accurate VO2max estimation
  max_hr: z.number().int().min(100).max(250).optional(),
  resting_hr: z.number().int().min(30).max(120).optional(),
});

export type EstimateMetricsInput = z.infer<typeof estimateMetricsInputSchema>;

/**
 * Estimate Metrics Output Schema
 *
 * Output from the estimateMetrics query.
 */
export const estimateMetricsOutputSchema = z.object({
  // Heart rate estimates
  estimated_max_hr: z.number().int(),
  estimated_resting_hr: z.number().int(),
  estimated_lthr: z.number().int(),
  estimated_vo2max: z.number(),

  // Performance estimates (sport-specific)
  estimated_ftp: z.number().optional(),
  estimated_threshold_pace: z.number().optional(),
  estimated_css: z.number().optional(),

  // Metadata
  confidence: z.enum(["high", "medium", "low"]),
});

export type EstimateMetricsOutput = z.infer<typeof estimateMetricsOutputSchema>;

/**
 * Validation helpers for cross-field validation.
 */

/**
 * Validates that max_hr is greater than resting_hr if both are provided.
 */
export function validateHeartRates(data: OnboardingStep2): {
  valid: boolean;
  error?: string;
} {
  if (data.max_hr && data.resting_hr) {
    if (data.max_hr <= data.resting_hr) {
      return {
        valid: false,
        error: "Max HR must be greater than resting HR",
      };
    }
  }

  if (data.lthr && data.max_hr) {
    if (data.lthr >= data.max_hr) {
      return {
        valid: false,
        error: "LTHR must be less than max HR",
      };
    }
  }

  return { valid: true };
}

/**
 * Validates that at least one performance metric is provided for the given sport.
 */
export function validateSportMetrics(
  sport: Sport,
  metrics: OnboardingStep3,
): {
  valid: boolean;
  error?: string;
} {
  switch (sport) {
    case "cycling":
      if (!metrics.ftp) {
        return {
          valid: false,
          error: "FTP is required for cycling",
        };
      }
      break;

    case "running":
      if (!metrics.threshold_pace_seconds_per_km) {
        return {
          valid: false,
          error: "Threshold pace is required for running",
        };
      }
      break;

    case "swimming":
      if (!metrics.css_seconds_per_hundred_meters) {
        return {
          valid: false,
          error: "CSS is required for swimming",
        };
      }
      break;

    case "triathlon":
      // Triathlon requires at least one metric from any sport
      if (
        !metrics.ftp &&
        !metrics.threshold_pace_seconds_per_km &&
        !metrics.css_seconds_per_hundred_meters
      ) {
        return {
          valid: false,
          error:
            "At least one performance metric is required for triathlon (FTP, threshold pace, or CSS)",
        };
      }
      break;

    case "other":
      // No specific requirements for "other" sport
      break;
  }

  return { valid: true };
}
