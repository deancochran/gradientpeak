/**
 * Form Validation Schemas
 *
 * Comprehensive form validation schemas for the mobile and web applications.
 * These schemas extend and build upon package-owned database-aligned shapes, adding
 * form-specific validation rules, preprocessing, and user-friendly error messages.
 *
 * @module form-schemas
 * @package @repo/core
 */

import { z } from "zod";
import { activityPlanStructureSchema } from "../activity-plan";
import { canonicalActivityCategorySchema } from "./activity-category";
import { contentVisibilitySchema } from "./content_visibility";
import {
  completionTimeHmsSchema,
  dateStringSchema,
  distanceKmSchema,
  emailSchema,
  emptyStringToNull,
  futureDateSchema,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalUrlSchema,
  optionalUsernameSchema,
  paceMmSsSchema,
  pastDateSchema,
  phoneSchema,
  stringToNumber,
  trimString,
  urlSchema,
  usernameSchema,
} from "./forms/primitives";
import {
  ageSchema,
  bioSchema,
  dobSchema,
  genderSchema,
  optionalAgeSchema,
  optionalBioSchema,
  optionalDobSchema,
  optionalGenderSchema,
  optionalMaxHrSchema,
  optionalRestingHrSchema,
  optionalWeightKgSchema,
  profileQuickUpdateSchema,
  profileSettingsFormSchema,
  restingHrSchema,
  weightKgSchema,
} from "./forms/profile";
import { trainingPlanGoalTargetSchema } from "./training-plan-structure";

export {
  completionTimeHmsSchema,
  completionTimeHmsToSecondsSchema,
  dateStringSchema,
  distanceKmSchema,
  distanceKmToMetersSchema,
  emailSchema,
  emptyStringToNull,
  emptyStringToUndefined,
  futureDateSchema,
  isFutureDateString,
  isPastDateString,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalUrlSchema,
  optionalUsernameSchema,
  paceMmSsSchema,
  paceMmSsToMpsSchema,
  pastDateSchema,
  phoneSchema,
  stringToNumber,
  trimString,
  urlSchema,
  usernameSchema,
} from "./forms/primitives";
export type {
  ProfileAvatarUpdateData,
  ProfilePatch,
  ProfilePatchInput,
  ProfileQuickUpdateData,
  ProfileSettingsFormData,
} from "./forms/profile";
export {
  ageSchema,
  bioSchema,
  dobSchema,
  genderSchema,
  maxHrSchema,
  optionalAgeSchema,
  optionalBioSchema,
  optionalDobSchema,
  optionalGenderSchema,
  optionalMaxHrSchema,
  optionalRestingHrSchema,
  optionalWeightKgSchema,
  profileAvatarUpdateSchema,
  profilePatchInputSchema,
  profileQuickUpdateSchema,
  profileSettingsFormSchema,
  restingHrSchema,
  weightKgSchema,
} from "./forms/profile";

// ============================================================================
// REUSABLE VALIDATION PATTERNS
// ============================================================================

// Generic preprocessing, contact, date, pace, and distance schemas live in
// ./forms/primitives. They are re-exported here to preserve the public module API.

const activityInsertShapeSchema = z.object({
  content_visibility: contentVisibilitySchema.optional(),
  name: z.string(),
  notes: z.string().nullable().optional(),
});

const activityPlanInsertShapeSchema = z
  .object({
    description: z.string().nullable().optional(),
    name: z.string(),
    notes: z.string().nullable().optional(),
    structure: activityPlanStructureSchema,
  })
  .strict();

// ============================================================================
// ACTIVITY SUBMISSION FORM SCHEMAS
// ============================================================================

/**
 * Activity name validation
 */
export const activityNameSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, "Activity name is required")
    .max(100, "Activity name must be less than 100 characters"),
);

/**
 * Activity notes validation
 */
export const activityNotesSchema = z.preprocess(
  trimString,
  z.string().max(5000, "Notes must be less than 5000 characters").optional(),
);

/**
 * Optional activity notes (nullable and optional)
 * Handles undefined, null, empty strings, and actual content
 */
export const optionalActivityNotesSchema = z
  .union([z.string().max(5000, "Notes must be less than 5000 characters"), z.literal(""), z.null()])
  .optional()
  .transform((val) => {
    // Handle undefined, null, or empty string - normalize to null
    if (val === undefined || val === null || val === "") return null;
    // Trim the string
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  });

/**
 * Activity Submission Form Schema
 * Used when submitting a recorded activity
 * Picks relevant fields from the shared insert shape and adds form-specific validations
 *
 * Fields:
 * - name: required, 1-100 characters
 * - notes: optional, max 5000 characters
 * - content_visibility: optional explicit visibility; omitted inherits profile default
 */
export const activitySubmissionFormSchema = activityInsertShapeSchema
  .pick({
    name: true,
    notes: true,
    content_visibility: true,
  })
  .extend({
    // Override name with stricter validation
    name: activityNameSchema,
    // Override notes with length limit
    notes: optionalActivityNotesSchema,
  });

export type ActivitySubmissionFormData = z.infer<typeof activitySubmissionFormSchema>;

/**
 * Activity Update Schema (for editing existing activities)
 * Allows partial updates to name, notes, and privacy
 * All fields optional since it's for updates
 */
export const activityUpdateFormSchema = activitySubmissionFormSchema.partial();

export type ActivityUpdateFormData = z.infer<typeof activityUpdateFormSchema>;

// ============================================================================
// ACTIVITY PLAN FORM SCHEMAS
// ============================================================================

/**
 * Activity plan name validation
 */
export const activityPlanNameSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, "Activity plan name is required")
    .max(100, "Activity plan name must be less than 100 characters"),
);

/**
 * Activity plan description validation
 */
export const activityPlanDescriptionSchema = z.preprocess(
  trimString,
  z.string().max(1000, "Description must be less than 1000 characters").optional(),
);

/**
 * Optional activity plan description (nullable)
 */
export const optionalActivityPlanDescriptionSchema = z
  .string()
  .nullable()
  .transform((val) => trimString(emptyStringToNull(val)))
  .pipe(z.string().max(1000, "Description must be less than 1000 characters"));

/**
 * Activity plan notes validation
 */
export const activityPlanNotesSchema = z
  .string()
  .nullable()
  .transform((val) => trimString(emptyStringToNull(val)))
  .pipe(z.string().max(2000, "Notes must be less than 2000 characters").nullable());

/**
 * Estimated duration validation (in seconds)
 * Range: 60 seconds (1 min) to 28800 seconds (8 hours)
 */
export const estimatedDurationSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Duration must be a number",
    })
    .int("Duration must be a whole number")
    .min(60, "Duration must be at least 1 minute")
    .max(28800, "Duration must be less than 8 hours")
    .positive("Duration must be positive"),
);

/**
 * Optional estimated duration
 */
export const optionalEstimatedDurationSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Duration must be a whole number")
    .min(60, "Duration must be at least 1 minute")
    .max(28800, "Duration must be less than 8 hours")
    .positive("Duration must be positive")
    .nullable(),
);

/**
 * Estimated Common Load validation
 * Range: 1 - 1000 (covers easy recovery to multi-hour epic rides)
 */
export const estimatedCommonLoadSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Common Load must be a number",
    })
    .min(1, "Common Load must be at least 1")
    .max(1000, "Common Load must be less than 1000")
    .positive("Common Load must be positive"),
);

/**
 * Optional estimated Common Load
 */
export const optionalEstimatedLoadSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .min(1, "Common Load must be at least 1")
    .max(1000, "Common Load must be less than 1000")
    .positive("Common Load must be positive")
    .nullable(),
);

/**
 * GPS recording intent validation
 */
export const gpsRecordingEnabledSchema = z.boolean();

/**
 * Activity activity_category validation
 */
export const activityCategorySchema = canonicalActivityCategorySchema;

/**
 * Activity Plan Create Form Schema
 * Used when creating a new activity plan
 * Extends the shared insert shape with form-specific validations
 *
 * Fields from the shared insert shape:
 * - name: required string (enhanced: 1-100 chars)
 * - description: optional nullable string (enhanced: max 1000 chars)
 * - notes: optional nullable string (enhanced: max 2000 chars)
 * - structure: required current structure
 */
const activityPlanFormFieldsBaseSchema = activityPlanInsertShapeSchema
  .pick({
    name: true,
    description: true,
    notes: true,
    structure: true,
  })
  .extend({
    // Override with stricter validations
    name: activityPlanNameSchema,
    description: z.preprocess(
      trimString,
      z.string().max(1000, "Description must be less than 1000 characters").nullable().optional(),
    ),
    notes: activityPlanNotesSchema,
    structure: activityPlanStructureSchema,
  })
  .strict();

export const activityPlanCreateFormSchema = activityPlanFormFieldsBaseSchema;

export type ActivityPlanCreateFormData = z.infer<typeof activityPlanCreateFormSchema>;

/**
 * Activity Plan Update Form Schema
 */
export const activityPlanUpdateFormSchema = activityPlanFormFieldsBaseSchema.partial().safeExtend({
  id: z.string().uuid("Invalid activity plan ID"),
});

export type ActivityPlanUpdateFormData = z.infer<typeof activityPlanUpdateFormSchema>;

// ============================================================================
// TRAINING PLAN FORM SCHEMAS
// ============================================================================

/**
 * Training plan name validation
 */
export const trainingPlanNameSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, "Training plan name is required")
    .max(100, "Training plan name must be less than 100 characters"),
);

/**
 * Training plan description validation
 */
export const optionalTrainingPlanDescriptionSchema = z.preprocess(
  (val) => trimString(emptyStringToNull(val)),
  z.string().max(1000, "Description must be less than 1000 characters").nullable(),
);

export const trainingPlanGoalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Target date must use YYYY-MM-DD format");

export const trainingPlanGoalPrioritySchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Priority must be a number",
    })
    .int("Priority must be a whole number")
    .min(0, "Priority must be at least 0")
    .max(10, "Priority must be at most 10"),
);

export const trainingPlanGoalTargetFormSchema = trainingPlanGoalTargetSchema;

export const trainingPlanMinimalGoalFormSchema = z.object({
  goal_name: trainingPlanNameSchema,
  target_date: trainingPlanGoalDateSchema,
});

export type TrainingPlanMinimalGoalFormData = z.infer<typeof trainingPlanMinimalGoalFormSchema>;

export const trainingPlanAdvancedGoalFormSchema = trainingPlanMinimalGoalFormSchema.extend({
  priority: trainingPlanGoalPrioritySchema.optional(),
  targets: z.array(trainingPlanGoalTargetFormSchema).min(1),
});

export type TrainingPlanAdvancedGoalFormData = z.infer<typeof trainingPlanAdvancedGoalFormSchema>;

export const trainingPlanMinimalSubmitFormSchema = z.object({
  goals: z
    .array(
      z.object({
        name: trainingPlanNameSchema,
        target_date: trainingPlanGoalDateSchema,
        priority: trainingPlanGoalPrioritySchema.optional().default(5),
        targets: z.array(trainingPlanGoalTargetFormSchema).min(1),
      }),
    )
    .min(1),
});

export type TrainingPlanMinimalSubmitFormData = z.infer<typeof trainingPlanMinimalSubmitFormSchema>;

/**
 * Weekly Common Load target validation
 * Range: 50 - 2000 (covers recovery weeks to peak training)
 */
export const weeklyLoadTargetSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Weekly Common Load must be a number",
    })
    .int("Weekly Common Load must be a whole number")
    .min(50, "Weekly Common Load must be at least 50")
    .max(2000, "Weekly Common Load must be less than 2000")
    .positive("Weekly Common Load must be positive"),
);

/**
 * Optional weekly Common Load target
 */
export const optionalWeeklyLoadTargetSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Weekly Common Load must be a whole number")
    .min(50, "Weekly Common Load must be at least 50")
    .max(2000, "Weekly Common Load must be less than 2000")
    .positive("Weekly Common Load must be positive")
    .nullable(),
);

/**
 * Training Plan Basic Info Form Schema
 * Step 1 of training plan creation wizard
 */
export const trainingPlanBasicInfoFormSchema = z.object({
  name: trainingPlanNameSchema,
  description: optionalTrainingPlanDescriptionSchema,
  start_date: futureDateSchema.optional(),
  end_date: futureDateSchema.optional(),
});

export type TrainingPlanBasicInfoFormData = z.infer<typeof trainingPlanBasicInfoFormSchema>;

/**
 * Training Plan Weekly Targets Form Schema
 * Step 2 of training plan creation wizard
 */
export const trainingPlanWeeklyTargetsFormSchema = z.object({
  weekly_load_target: weeklyLoadTargetSchema,
  weekly_duration_target: optionalEstimatedDurationSchema,
  activities_per_week: z.preprocess(
    stringToNumber,
    z
      .number()
      .int("Activities per week must be a whole number")
      .min(1, "At least 1 activity per week")
      .max(14, "Maximum 14 activities per week")
      .positive(),
  ),
});

export type TrainingPlanWeeklyTargetsFormData = z.infer<typeof trainingPlanWeeklyTargetsFormSchema>;

/**
 * Training Plan Recovery Rules Form Schema
 * Step 3 of training plan creation wizard
 */
export const trainingPlanRecoveryRulesFormSchema = z.object({
  recovery_week_frequency: z.preprocess(
    stringToNumber,
    z
      .number()
      .int("Recovery week frequency must be a whole number")
      .min(2, "Recovery week must occur at least every 2 weeks")
      .max(8, "Recovery week must occur at least every 8 weeks")
      .positive(),
  ),
  recovery_week_load_percentage: z.preprocess(
    stringToNumber,
    z
      .number()
      .min(30, "Recovery week Common Load must be at least 30% of normal")
      .max(80, "Recovery week Common Load must be at most 80% of normal")
      .positive(),
  ),
  rest_days_per_week: z.preprocess(
    stringToNumber,
    z
      .number()
      .int("Rest days must be a whole number")
      .min(0, "Rest days cannot be negative")
      .max(6, "Maximum 6 rest days per week"),
  ),
});

export type TrainingPlanRecoveryRulesFormData = z.infer<typeof trainingPlanRecoveryRulesFormSchema>;

/**
 * Training Plan Periodization Form Schema (Optional Step 3)
 */
export const trainingPlanPeriodizationFormSchema = z
  .object({
    use_periodization: z.boolean().default(false),
    starting_longTermLoad: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(0, "Starting LongTermLoad must be at least 0")
        .max(200, "Starting LongTermLoad must be less than 200")
        .optional()
        .nullable(),
    ),
    target_longTermLoad: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(0, "Target LongTermLoad must be at least 0")
        .max(250, "Target LongTermLoad must be less than 250")
        .optional()
        .nullable(),
    ),
    ramp_rate: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(1, "Ramp rate must be at least 1 per week")
        .max(20, "Ramp rate must be less than 20 per week")
        .optional()
        .nullable(),
    ),
  })
  .refine(
    (data) => {
      if (data.use_periodization) {
        if (!data.starting_longTermLoad || !data.target_longTermLoad) return false;
        return data.target_longTermLoad > data.starting_longTermLoad;
      }
      return true;
    },
    {
      message: "Target LongTermLoad must be greater than starting LongTermLoad",
      path: ["target_longTermLoad"],
    },
  );

export type TrainingPlanPeriodizationFormData = z.infer<typeof trainingPlanPeriodizationFormSchema>;

/**
 * Complete Training Plan Creation Form Schema
 * Combines all wizard steps
 */
export const trainingPlanCreateFormSchema = z
  .object({
    // Step 1: Basic Info
    name: trainingPlanNameSchema,
    description: optionalTrainingPlanDescriptionSchema,

    // Step 2: Weekly Targets
    load_min: z.preprocess(
      stringToNumber,
      z
        .number({ message: "Min Common Load must be a number" })
        .int("Min Common Load must be a whole number")
        .min(50, "Min Common Load must be at least 50")
        .max(1000, "Min Common Load must be less than 1000"),
    ),
    load_max: z.preprocess(
      stringToNumber,
      z
        .number({ message: "Max Common Load must be a number" })
        .int("Max Common Load must be a whole number")
        .min(100, "Max Common Load must be at least 100")
        .max(1500, "Max Common Load must be less than 1500"),
    ),
    activities_per_week: z.preprocess(
      stringToNumber,
      z
        .number()
        .int("Activities per week must be a whole number")
        .min(1, "At least 1 activity per week")
        .max(14, "Maximum 14 activities per week"),
    ),

    // Step 3: Recovery Rules
    max_consecutive_days: z.preprocess(
      stringToNumber,
      z
        .number()
        .int("Max consecutive days must be a whole number")
        .min(1, "At least 1 consecutive day")
        .max(7, "Maximum 7 consecutive days"),
    ),
    min_rest_days: z.preprocess(
      stringToNumber,
      z
        .number()
        .int("Min rest days must be a whole number")
        .min(0, "Rest days cannot be negative")
        .max(7, "Maximum 7 rest days per week"),
    ),

    // Step 4: Periodization (Optional)
    use_periodization: z.boolean().optional().default(false),
    starting_longTermLoad: optionalWeeklyLoadTargetSchema,
    target_longTermLoad: optionalWeeklyLoadTargetSchema,
    ramp_rate: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(0.01, "Ramp rate must be at least 0.01")
        .max(1, "Ramp rate must be at most 1 (100%)")
        .optional()
        .nullable(),
    ),
  })
  .refine((data) => data.load_max > data.load_min, {
    message: "Max Common Load must be greater than min Common Load",
    path: ["load_max"],
  })
  .refine((data) => data.min_rest_days + data.max_consecutive_days <= 7, {
    message: "Training days + rest days must fit in a week (7 days)",
    path: ["min_rest_days"],
  })
  .refine(
    (data) => {
      if (data.use_periodization && data.starting_longTermLoad && data.target_longTermLoad) {
        return data.target_longTermLoad > data.starting_longTermLoad;
      }
      return true;
    },
    {
      message: "Target LongTermLoad must be greater than starting LongTermLoad",
      path: ["target_longTermLoad"],
    },
  )
  .refine(
    (data) => {
      // Validate that activities per week is achievable with rest days
      if (data.activities_per_week > 7 - data.min_rest_days) {
        return false;
      }
      return true;
    },
    {
      message: "Activities per week must fit within available training days",
      path: ["activities_per_week"],
    },
  )
  .refine(
    (data) => {
      // Validate reasonable Common Load per activity (not too high)
      const avgCommonLoad = (data.load_min + data.load_max) / 2;
      const avgPerActivity = avgCommonLoad / data.activities_per_week;
      return avgPerActivity <= 500; // Max 500 Common Load per activity
    },
    {
      message:
        "Average Common Load per activity is unreasonably high (>500). Please adjust your targets.",
      path: ["load_max"],
    },
  );

export type TrainingPlanCreateFormData = z.infer<typeof trainingPlanCreateFormSchema>;

// ============================================================================
// STEP VALIDATION SCHEMAS
// ============================================================================

/**
 * Step duration validation (in seconds)
 * Range: 30 seconds to 2 hours
 */
export const stepDurationSecondsSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Duration must be a number",
    })
    .int("Duration must be a whole number")
    .min(30, "Step duration must be at least 30 seconds")
    .max(7200, "Step duration must be less than 2 hours")
    .positive("Duration must be positive"),
);

/**
 * Repetition count validation
 * Range: 1 - 99 repetitions
 */
export const repetitionCountSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Repetition count must be a number",
    })
    .int("Repetition count must be a whole number")
    .min(1, "At least 1 repetition required")
    .max(99, "Maximum 99 repetitions")
    .positive("Repetition count must be positive"),
);

/**
 * Intensity percentage validation (0-200%)
 * Used for % FTP, % Max HR, % Threshold HR
 */
export const intensityPercentageSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Intensity must be a number",
    })
    .min(0, "Intensity cannot be negative")
    .max(200, "Intensity cannot exceed 200%"),
);

/**
 * Power zone validation (1-7)
 */
export const powerZoneSchema = z.preprocess(
  stringToNumber,
  z
    .number()
    .int("Power zone must be a whole number")
    .min(1, "Power zone must be at least 1")
    .max(7, "Power zone must be at most 7"),
);

/**
 * Heart rate zone validation (1-5)
 */
export const heartRateZoneSchema = z.preprocess(
  stringToNumber,
  z
    .number()
    .int("Heart rate zone must be a whole number")
    .min(1, "Heart rate zone must be at least 1")
    .max(5, "Heart rate zone must be at most 5"),
);

/**
 * RPE (Rate of Perceived Exertion) validation (1-10)
 */
export const rpeSchema = z.preprocess(
  stringToNumber,
  z
    .number()
    .int("RPE must be a whole number")
    .min(1, "RPE must be at least 1")
    .max(10, "RPE must be at most 10"),
);

/**
 * Cadence validation (RPM)
 * Range: 30 - 200 RPM
 */
export const cadenceSchema = z.preprocess(
  stringToNumber,
  z
    .number()
    .int("Cadence must be a whole number")
    .min(30, "Cadence must be at least 30 RPM")
    .max(200, "Cadence must be at most 200 RPM"),
);

/**
 * Speed validation (m/s)
 * Range: 0.5 - 20 m/s (1.8 km/h - 72 km/h)
 */
export const speedSchema = z.preprocess(
  stringToNumber,
  z
    .number()
    .min(0.5, "Speed must be at least 0.5 m/s")
    .max(20, "Speed must be at most 20 m/s")
    .positive("Speed must be positive"),
);

// ============================================================================
// EXPORT ALL SCHEMAS
// ============================================================================

export const formSchemas = {
  // Reusable patterns
  email: emailSchema,
  optionalEmail: optionalEmailSchema,
  phone: phoneSchema,
  optionalPhone: optionalPhoneSchema,
  url: urlSchema,
  optionalUrl: optionalUrlSchema,
  username: usernameSchema,
  optionalUsername: optionalUsernameSchema,
  dateString: dateStringSchema,
  futureDate: futureDateSchema,
  pastDate: pastDateSchema,

  // Profile fields
  weightKg: weightKgSchema,
  optionalWeightKg: optionalWeightKgSchema,
  optionalMaxHr: optionalMaxHrSchema,
  restingHr: restingHrSchema,
  optionalRestingHr: optionalRestingHrSchema,
  age: ageSchema,
  optionalAge: optionalAgeSchema,
  gender: genderSchema,
  optionalGender: optionalGenderSchema,
  dob: dobSchema,
  optionalDob: optionalDobSchema,
  bio: bioSchema,
  optionalBio: optionalBioSchema,

  // Form schemas
  profileSettings: profileSettingsFormSchema,
  profileQuickUpdate: profileQuickUpdateSchema,
  activitySubmission: activitySubmissionFormSchema,

  // Activity plan schemas
  activityPlanCreate: activityPlanCreateFormSchema,
  activityPlanUpdate: activityPlanUpdateFormSchema,

  // Training plan schemas
  trainingPlanCreate: trainingPlanCreateFormSchema,
  trainingPlanMinimalGoal: trainingPlanMinimalGoalFormSchema,
  trainingPlanAdvancedGoal: trainingPlanAdvancedGoalFormSchema,
  trainingPlanMinimalSubmit: trainingPlanMinimalSubmitFormSchema,
  distanceKm: distanceKmSchema,
  completionTimeHms: completionTimeHmsSchema,
  paceMmSs: paceMmSsSchema,
  trainingPlanBasicInfo: trainingPlanBasicInfoFormSchema,
  trainingPlanWeeklyTargets: trainingPlanWeeklyTargetsFormSchema,
  trainingPlanRecoveryRules: trainingPlanRecoveryRulesFormSchema,
  trainingPlanPeriodization: trainingPlanPeriodizationFormSchema,

  // Step validation
  stepDurationSeconds: stepDurationSecondsSchema,
  repetitionCount: repetitionCountSchema,
  intensityPercentage: intensityPercentageSchema,
  powerZone: powerZoneSchema,
  heartRateZone: heartRateZoneSchema,
  rpe: rpeSchema,
  cadence: cadenceSchema,
  speed: speedSchema,
};
