/**
 * Comprehensive Zod Validation Schemas Library
 *
 * Provides reusable, well-tested validation patterns for forms throughout the app.
 * Includes helpful error messages and proper handling of optional/nullable fields.
 *
 * NOTE: Many schemas have been moved to @repo/core/schemas/form-schemas.ts for reuse
 * across mobile and web apps. Import from there when possible.
 */

import { z } from "zod";

// Re-export commonly used schemas from core for convenience
export {
  activityPlanCreateFormSchema,
  activitySubmissionFormSchema,
  plannedActivityScheduleFormSchema,
  profileSettingsFormSchema,
  trainingPlanBasicInfoFormSchema,
  trainingPlanCreateFormSchema,
  trainingPlanPeriodizationFormSchema,
  trainingPlanWeeklyTargetsFormSchema,
  type ActivityPlanCreateFormData,
  type ActivitySubmissionFormData,
  type PlannedActivityScheduleFormData,
  type ProfileSettingsFormData,
  type TrainingPlanBasicInfoFormData,
  type TrainingPlanCreateFormData,
  type TrainingPlanPeriodizationFormData,
  type TrainingPlanWeeklyTargetsFormData,
} from "@repo/core";

// ============================================================================
// HELPER FUNCTIONS & PATTERNS
// ============================================================================

/**
 * Creates an optional number field that accepts undefined or number
 * Properly handles empty strings from inputs
 */
export const optionalNumber = (min?: number, max?: number) => {
  let schema = z.number().optional();

  if (min !== undefined) {
    schema = schema.refine((val) => val === undefined || val >= min, {
      message: `Must be at least ${min}`,
    }) as any;
  }

  if (max !== undefined) {
    schema = schema.refine((val) => val === undefined || val <= max, {
      message: `Must be less than ${max}`,
    }) as any;
  }

  return schema;
};

/**
 * Creates an optional string field that accepts undefined or non-empty string
 */
export const optionalString = (minLength?: number, maxLength?: number) => {
  let schema = z.string().optional().or(z.literal(""));

  if (minLength !== undefined) {
    schema = schema.refine((val) => !val || val.length >= minLength, {
      message: `Must be at least ${minLength} characters`,
    }) as any;
  }

  if (maxLength !== undefined) {
    schema = schema.refine((val) => !val || val.length <= maxLength, {
      message: `Must be less than ${maxLength} characters`,
    }) as any;
  }

  return schema;
};

// ============================================================================
// PROFILE VALIDATION SCHEMAS
// ============================================================================

/**
 * Profile settings form schema
 * Used in: app/(internal)/(tabs)/settings/index.tsx
 */
export const profileFormSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be less than 30 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, hyphens, and underscores",
      )
      .optional()
      .or(z.literal("")),

    weightKg: z
      .number({
        error: "Weight must be a number",
      })
      .min(30, "Weight must be at least 30kg")
      .max(300, "Weight must be less than 300kg")
      .optional()
      .nullable(),

    ftp: z
      .number({
        error: "FTP must be a number",
      })
      .min(50, "FTP must be at least 50 watts")
      .max(500, "FTP must be less than 500 watts")
      .optional()
      .nullable(),

    threshold_hr: z
      .number({
        error: "Threshold HR must be a number",
      })
      .min(100, "Threshold HR must be at least 100 bpm")
      .max(250, "Threshold HR must be less than 250 bpm")
      .optional()
      .nullable(),
    age: z
      .number({
        error: "Age must be a number",
      })
      .int("Age must be a whole number")
      .min(13, "Must be at least 13 years old")
      .max(99, "Must be less than 100 years old")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      return true;
    },
    {
      message: "Threshold HR must be less than Max HR",
      path: ["threshold_hr"],
    },
  );

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

// ============================================================================
// ACTIVITY SUBMISSION SCHEMAS
// ============================================================================

/**
 * Activity submission form schema
 * Used in: app/(internal)/record/submit.tsx
 */
export const activitySubmissionSchema = z.object({
  name: z
    .string()
    .min(1, "Activity name is required")
    .max(100, "Activity name must be less than 100 characters")
    .trim(),

  notes: z
    .string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional()
    .or(z.literal("")),

  perceivedEffort: z
    .number()
    .int("Perceived effort must be a whole number")
    .min(1, "Perceived effort must be at least 1")
    .max(10, "Perceived effort must be at most 10")
    .optional()
    .nullable(),
});

export type ActivitySubmissionFormValues = z.infer<
  typeof activitySubmissionSchema
>;

// ============================================================================
// ACTIVITY PLAN CREATION SCHEMAS
// ============================================================================

/**
 * Step duration validation (in minutes)
 */
const stepDurationSchema = z
  .number({
    error: "Duration must be a number",
  })
  .min(0.5, "Step duration must be at least 30 seconds")
  .max(120, "Step duration must be less than 2 hours");

/**
 * Power zone validation (percentage of FTP)
 */
const powerZoneSchema = z
  .number({
    error: "Power must be a number",
  })
  .min(0, "Power cannot be negative")
  .max(300, "Power cannot exceed 300% FTP");

/**
 * Heart rate zone validation (percentage of max HR)
 */
const heartRateZoneSchema = z
  .number({
    error: "Heart rate must be a number",
  })
  .min(0, "Heart rate cannot be negative")
  .max(100, "Heart rate cannot exceed 100% of max");

/**
 * Activity step schema
 * Used in activity plan creation
 */
export const activityStepSchema = z
  .object({
    duration: stepDurationSchema,

    targetPowerLow: powerZoneSchema.optional().nullable(),
    targetPowerHigh: powerZoneSchema.optional().nullable(),

    targetHrLow: heartRateZoneSchema.optional().nullable(),
    targetHrHigh: heartRateZoneSchema.optional().nullable(),

    description: z
      .string()
      .max(200, "Step description must be less than 200 characters")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      // If both power targets are set, low must be less than high
      if (data.targetPowerLow && data.targetPowerHigh) {
        return data.targetPowerLow <= data.targetPowerHigh;
      }
      return true;
    },
    {
      message:
        "Low power target must be less than or equal to high power target",
      path: ["targetPowerLow"],
    },
  )
  .refine(
    (data) => {
      // If both HR targets are set, low must be less than high
      if (data.targetHrLow && data.targetHrHigh) {
        return data.targetHrLow <= data.targetHrHigh;
      }
      return true;
    },
    {
      message: "Low HR target must be less than or equal to high HR target",
      path: ["targetHrLow"],
    },
  );

/**
 * Activity plan creation schema
 * Used in: app/(internal)/(tabs)/plan/create_activity_plan/index.tsx
 */
export const activityPlanCreationSchema = z
  .object({
    name: z
      .string()
      .min(3, "Plan name must be at least 3 characters")
      .max(100, "Plan name must be less than 100 characters")
      .trim(),

    description: z
      .string()
      .max(500, "Description must be less than 500 characters")
      .optional()
      .or(z.literal("")),

    activityType: z.enum(["run", "bike", "swim", "other"]),

    steps: z
      .array(activityStepSchema)
      .min(1, "Activity must have at least one step")
      .max(50, "Activity cannot have more than 50 steps"),

    estimatedDuration: z
      .number()
      .min(5, "Activity must be at least 5 minutes")
      .max(480, "Activity must be less than 8 hours")
      .optional(),
  })
  .refine(
    (data) => {
      // Calculate total duration from steps
      const totalDuration = data.steps.reduce(
        (sum, step) => sum + step.duration,
        0,
      );

      // Warn if total exceeds 8 hours
      return totalDuration <= 480;
    },
    {
      message: "Total activity duration cannot exceed 8 hours",
      path: ["steps"],
    },
  );

export type ActivityPlanCreationFormValues = z.infer<
  typeof activityPlanCreationSchema
>;

// ============================================================================
// PLANNED ACTIVITY CREATION SCHEMAS
// ============================================================================

/**
 * Planned activity (scheduling an activity plan) schema
 * Used in: app/(internal)/(tabs)/plan/create_planned_activity/index.tsx
 */
export const plannedActivityCreationSchema = z.object({
  activityPlanId: z.string().uuid("Invalid activity plan selected"),

  scheduledDate: z
    .date({
      error: "Scheduled date is required",
    })
    .refine(
      (date) => date >= new Date(new Date().setHours(0, 0, 0, 0)),
      "Cannot schedule activities in the past",
    ),

  notes: z
    .string()
    .max(500, "Notes must be less than 500 characters")
    .optional()
    .or(z.literal("")),
});

export type PlannedActivityCreationFormValues = z.infer<
  typeof plannedActivityCreationSchema
>;

// ============================================================================
// TRAINING PLAN CREATION SCHEMAS
// ============================================================================

/**
 * Training plan basic info schema (Step 1 of wizard)
 */
export const trainingPlanBasicInfoSchema = z
  .object({
    name: z
      .string()
      .min(3, "Plan name must be at least 3 characters")
      .max(100, "Plan name must be less than 100 characters")
      .trim(),

    goal: z.enum(["endurance", "speed", "strength", "general"]),

    startDate: z.date({
      error: "Start date is required",
    }),

    endDate: z.date({
      error: "End date is required",
    }),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const duration = data.endDate.getTime() - data.startDate.getTime();
      const weeks = duration / (1000 * 60 * 60 * 24 * 7);
      return weeks >= 1 && weeks <= 52;
    },
    {
      message: "Training plan must be between 1 and 52 weeks",
      path: ["endDate"],
    },
  );

/**
 * Training plan weekly targets schema (Step 2 of wizard)
 */
export const trainingPlanWeeklyTargetsSchema = z.object({
  weeklyDistanceKm: z
    .number({
      error: "Distance must be a number",
    })
    .min(5, "Weekly distance must be at least 5km")
    .max(500, "Weekly distance must be less than 500km"),

  weeklyTSS: z
    .number({
      error: "TSS must be a number",
    })
    .int("TSS must be a whole number")
    .min(50, "Weekly TSS must be at least 50")
    .max(2000, "Weekly TSS must be less than 2000"),

  activitiesPerWeek: z
    .number({
      error: "Activities per week must be a number",
    })
    .int("Activities per week must be a whole number")
    .min(1, "Must have at least 1 activity per week")
    .max(14, "Cannot have more than 14 activities per week"),
});

// ============================================================================
// COMMON VALIDATION HELPERS
// ============================================================================

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email must be less than 255 characters");

/**
 * Password validation
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  );

/**
 * Confirm password validation
 */
export const confirmPasswordSchema = (passwordField: string = "password") =>
  z
    .string()
    .min(1, "Please confirm your password")
    .refine(
      (check: string) => {
        return check === passwordField;
      },
      {
        message: "Passwords do not match",
      },
    );

/**
 * URL validation
 */
export const urlSchema = z
  .string()
  .url("Invalid URL format")
  .max(2048, "URL must be less than 2048 characters")
  .optional()
  .or(z.literal(""));

/**
 * Phone number validation (basic international format)
 */
export const phoneSchema = z
  .string()
  .regex(
    /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/,
    "Invalid phone number format",
  )
  .optional()
  .or(z.literal(""));

// ============================================================================
// FORM ERROR UTILITIES
// ============================================================================

/**
 * Extracts user-friendly error message from Zod validation error
 */
export function getFormErrorMessage(error: any): string {
  if (error?.issues && error.issues.length > 0) {
    return error.issues[0].message;
  }
  if (error?.message) {
    return error.message;
  }
  return "Validation failed";
}

/**
 * Checks if a form field has an error
 */
export function hasFieldError(fieldName: string, errors: any): boolean {
  return !!errors[fieldName];
}

/**
 * Gets error message for a specific field
 */
export function getFieldError(
  fieldName: string,
  errors: any,
): string | undefined {
  return errors[fieldName]?.message;
}
