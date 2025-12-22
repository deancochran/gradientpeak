/**
 * Form Validation Schemas
 *
 * Comprehensive form validation schemas for the mobile and web applications.
 * These schemas extend and build upon the supazod database schemas, adding
 * form-specific validation rules, preprocessing, and user-friendly error messages.
 *
 * @module form-schemas
 * @package @repo/core
 */

import { z } from "zod";

// ============================================================================
// REUSABLE VALIDATION PATTERNS
// ============================================================================

/**
 * Preprocessor to convert empty strings to null for optional numeric fields
 */
const emptyStringToNull = (val: unknown) => {
  if (typeof val === "string" && val.trim() === "") return null;
  return val;
};

/**
 * Preprocessor to convert empty strings to undefined for optional fields
 */
const emptyStringToUndefined = (val: unknown) => {
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
};

/**
 * Preprocessor to trim strings
 */
const trimString = (val: unknown) => {
  if (typeof val === "string") return val.trim();
  return val;
};

/**
 * Preprocessor to convert string numbers to actual numbers
 */
const stringToNumber = (val: unknown) => {
  if (typeof val === "string" && val.trim() !== "") {
    const num = Number(val);
    return isNaN(num) ? val : num;
  }
  return val;
};

/**
 * Email validation pattern
 */
export const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .toLowerCase()
  .trim();

/**
 * Optional email (allows empty string)
 */
export const optionalEmailSchema = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim()
    .nullable(),
);

/**
 * Phone number validation (international format)
 */
export const phoneSchema = z
  .string()
  .regex(
    /^\+?[1-9]\d{1,14}$/,
    "Please enter a valid phone number (e.g., +1234567890)",
  )
  .trim();

/**
 * Optional phone number
 */
export const optionalPhoneSchema = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      "Please enter a valid phone number (e.g., +1234567890)",
    )
    .trim()
    .nullable(),
);

/**
 * URL validation
 */
export const urlSchema = z.string().url("Please enter a valid URL").trim();

/**
 * Optional URL
 */
export const optionalUrlSchema = z.preprocess(
  emptyStringToNull,
  z.string().url("Please enter a valid URL").trim().nullable(),
);

/**
 * Username validation (8-30 characters, alphanumeric + underscore)
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be less than 30 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores",
  )
  .trim();

/**
 * Optional username
 */
export const optionalUsernameSchema = z.preprocess(
  emptyStringToNull,
  usernameSchema.nullable(),
);

/**
 * Date string validation (ISO 8601 format)
 */
export const dateStringSchema = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date format");

/**
 * Future date validation
 */
export const futureDateSchema = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
  .refine((val) => new Date(val) >= new Date(), "Date must be in the future");

/**
 * Past date validation
 */
export const pastDateSchema = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
  .refine((val) => new Date(val) <= new Date(), "Date must be in the past");

// ============================================================================
// PROFILE & SETTINGS FORM SCHEMAS
// ============================================================================

/**
 * Weight validation (in kilograms)
 * Range: 30kg - 300kg (covers children to heavyweight athletes)
 */
export const weightKgSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Weight must be a number",
    })
    .min(30, "Weight must be at least 30kg")
    .max(300, "Weight must be less than 300kg")
    .positive("Weight must be positive"),
);

/**
 * Optional weight (allows null/empty)
 */
export const optionalWeightKgSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .min(30, "Weight must be at least 30kg")
    .max(300, "Weight must be less than 300kg")
    .positive("Weight must be positive")
    .nullable(),
);

/**
 * FTP (Functional Threshold Power) validation in watts
 * Range: 50W - 1000W (covers beginners to elite cyclists)
 */
export const ftpSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "FTP must be a number",
    })
    .int("FTP must be a whole number")
    .min(50, "FTP must be at least 50 watts")
    .max(1000, "FTP must be less than 1000 watts")
    .positive("FTP must be positive"),
);

/**
 * Optional FTP
 */
export const optionalFtpSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("FTP must be a whole number")
    .min(50, "FTP must be at least 50 watts")
    .max(1000, "FTP must be less than 1000 watts")
    .positive("FTP must be positive")
    .nullable(),
);

/**
 * Threshold Heart Rate validation in BPM
 * Range: 100 - 220 BPM (covers all age groups)
 */
export const thresholdHrSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Threshold heart rate must be a number",
    })
    .int("Threshold heart rate must be a whole number")
    .min(100, "Threshold heart rate must be at least 100 bpm")
    .max(220, "Threshold heart rate must be less than 220 bpm")
    .positive("Threshold heart rate must be positive"),
);

/**
 * Optional threshold heart rate
 */
export const optionalThresholdHrSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Threshold heart rate must be a whole number")
    .min(100, "Threshold heart rate must be at least 100 bpm")
    .max(220, "Threshold heart rate must be less than 220 bpm")
    .positive("Threshold heart rate must be positive")
    .nullable(),
);

/**
 * Maximum Heart Rate validation in BPM
 * Range: 120 - 250 BPM
 */
export const maxHrSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Maximum heart rate must be a number",
    })
    .int("Maximum heart rate must be a whole number")
    .min(120, "Maximum heart rate must be at least 120 bpm")
    .max(250, "Maximum heart rate must be less than 250 bpm")
    .positive("Maximum heart rate must be positive"),
);

/**
 * Optional maximum heart rate
 */
export const optionalMaxHrSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Maximum heart rate must be a whole number")
    .min(120, "Maximum heart rate must be at least 120 bpm")
    .max(250, "Maximum heart rate must be less than 250 bpm")
    .positive("Maximum heart rate must be positive")
    .nullable(),
);

/**
 * Resting Heart Rate validation in BPM
 * Range: 30 - 100 BPM
 */
export const restingHrSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Resting heart rate must be a number",
    })
    .int("Resting heart rate must be a whole number")
    .min(30, "Resting heart rate must be at least 30 bpm")
    .max(100, "Resting heart rate must be less than 100 bpm")
    .positive("Resting heart rate must be positive"),
);

/**
 * Optional resting heart rate
 */
export const optionalRestingHrSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Resting heart rate must be a whole number")
    .min(30, "Resting heart rate must be at least 30 bpm")
    .max(100, "Resting heart rate must be less than 100 bpm")
    .positive("Resting heart rate must be positive")
    .nullable(),
);

/**
 * Age validation
 * Range: 13 - 120 years
 */
export const ageSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Age must be a number",
    })
    .int("Age must be a whole number")
    .min(13, "You must be at least 13 years old")
    .max(120, "Age must be less than 120")
    .positive("Age must be positive"),
);

/**
 * Optional age
 */
export const optionalAgeSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Age must be a whole number")
    .min(13, "You must be at least 13 years old")
    .max(120, "Age must be less than 120")
    .positive("Age must be positive")
    .nullable(),
);

/**
 * Gender validation
 */
export const genderSchema = z.enum([
  "male",
  "female",
  "other",
  "prefer_not_to_say",
]);

/**
 * Optional gender
 */
export const optionalGenderSchema = z.preprocess(
  emptyStringToNull,
  genderSchema.nullable(),
);

/**
 * Date of Birth validation
 * Must be at least 13 years ago and no more than 120 years ago
 */
export const dobSchema = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date of birth")
  .refine((val) => {
    const dob = new Date(val);
    const age = Math.floor(
      (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    return age >= 13;
  }, "You must be at least 13 years old")
  .refine((val) => {
    const dob = new Date(val);
    const age = Math.floor(
      (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    return age <= 120;
  }, "Invalid date of birth");

/**
 * Optional date of birth
 */
export const optionalDobSchema = z.preprocess(
  emptyStringToNull,
  dobSchema.nullable(),
);

/**
 * Bio/description validation
 * Max 500 characters
 */
export const bioSchema = z
  .string()
  .max(500, "Bio must be less than 500 characters")
  .trim();

/**
 * Optional bio
 */
export const optionalBioSchema = z.preprocess(
  emptyStringToNull,
  bioSchema.nullable(),
);

/**
 * Profile Settings Form Schema
 * Comprehensive schema for user profile settings with cross-field validation
 */
export const profileSettingsFormSchema = z
  .object({
    username: optionalUsernameSchema,
    bio: optionalBioSchema,
    weight_kg: optionalWeightKgSchema,
    ftp: optionalFtpSchema,
    threshold_hr: optionalThresholdHrSchema,
    max_hr: optionalMaxHrSchema,
    resting_hr: optionalRestingHrSchema,
    dob: optionalDobSchema,
    gender: optionalGenderSchema,
    avatar_url: optionalUrlSchema,
    preferred_units: z.enum(["metric", "imperial"]).optional().nullable(),
    language: z.string().max(10).optional().nullable(),
  })
  .refine(
    (data) => {
      // If both threshold HR and max HR are provided, threshold must be less than max
      if (data.threshold_hr && data.max_hr) {
        return data.threshold_hr < data.max_hr;
      }
      return true;
    },
    {
      message: "Threshold heart rate must be less than maximum heart rate",
      path: ["threshold_hr"],
    },
  )
  .refine(
    (data) => {
      // If both resting HR and threshold HR are provided, resting must be less than threshold
      if (data.resting_hr && data.threshold_hr) {
        return data.resting_hr < data.threshold_hr;
      }
      return true;
    },
    {
      message: "Resting heart rate must be less than threshold heart rate",
      path: ["resting_hr"],
    },
  )
  .refine(
    (data) => {
      // Power-to-weight ratio sanity check (if both provided)
      if (data.ftp && data.weight_kg) {
        const powerToWeight = data.ftp / data.weight_kg;
        // Reasonable range: 1.0 - 7.0 W/kg
        return powerToWeight >= 1.0 && powerToWeight <= 7.0;
      }
      return true;
    },
    {
      message:
        "Power-to-weight ratio seems unrealistic. Please verify FTP and weight.",
      path: ["ftp"],
    },
  );

export type ProfileSettingsFormData = z.infer<typeof profileSettingsFormSchema>;

/**
 * Minimal profile update schema (for quick edits)
 */
export const profileQuickUpdateSchema = z.object({
  username: optionalUsernameSchema,
  weight_kg: optionalWeightKgSchema,
  ftp: optionalFtpSchema,
  threshold_hr: optionalThresholdHrSchema,
});

export type ProfileQuickUpdateData = z.infer<typeof profileQuickUpdateSchema>;

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
 * Optional activity notes (nullable)
 */
export const optionalActivityNotesSchema = z.preprocess(
  (val) => trimString(emptyStringToNull(val)),
  z.string().max(5000, "Notes must be less than 5000 characters").nullable(),
);

/**
 * Activity Submission Form Schema
 * Used when submitting a recorded activity
 */
export const activitySubmissionFormSchema = z.object({
  name: activityNameSchema,
  notes: optionalActivityNotesSchema,
  is_private: z.boolean().optional().default(false),
});

export type ActivitySubmissionFormData = z.infer<
  typeof activitySubmissionFormSchema
>;

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
  z
    .string()
    .max(1000, "Description must be less than 1000 characters")
    .optional(),
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
  .pipe(
    z.string().max(2000, "Notes must be less than 2000 characters").nullable(),
  );

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
 * Estimated TSS validation
 * Range: 1 - 1000 (covers easy recovery to multi-hour epic rides)
 */
export const estimatedTssSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "TSS must be a number",
    })
    .min(1, "TSS must be at least 1")
    .max(1000, "TSS must be less than 1000")
    .positive("TSS must be positive"),
);

/**
 * Optional estimated TSS
 */
export const optionalEstimatedTssSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .min(1, "TSS must be at least 1")
    .max(1000, "TSS must be less than 1000")
    .positive("TSS must be positive")
    .nullable(),
);

/**
 * Activity location validation
 */
export const activityLocationSchema = z.enum(["outdoor", "indoor"]);

/**
 * Activity category validation
 */
export const activityCategorySchema = z.enum([
  "run",
  "bike",
  "swim",
  "strength",
  "other",
]);

/**
 * Activity Plan Create Form Schema
 * Used when creating a new activity plan
 * Note: estimated_duration and estimated_tss are calculated server-side
 */
export const activityPlanCreateFormSchema = z.object({
  name: activityPlanNameSchema,
  description: optionalActivityPlanDescriptionSchema,
  activity_location: activityLocationSchema,
  activity_category: activityCategorySchema,
  route_id: z.string().uuid().optional().nullable(),
  notes: activityPlanNotesSchema,
  structure: z.object({
    steps: z.array(z.any()).min(1, "Activity plan must have at least one step"), // Minimum 1 step required
  }),
});

export type ActivityPlanCreateFormData = z.infer<
  typeof activityPlanCreateFormSchema
>;

/**
 * Activity Plan Update Form Schema
 */
export const activityPlanUpdateFormSchema = activityPlanCreateFormSchema
  .partial()
  .extend({
    id: z.string().uuid("Invalid activity plan ID"),
  });

export type ActivityPlanUpdateFormData = z.infer<
  typeof activityPlanUpdateFormSchema
>;

// ============================================================================
// PLANNED ACTIVITY FORM SCHEMAS
// ============================================================================

/**
 * Planned Activity Schedule Form Schema
 * Used when scheduling an activity from a plan
 */
export const plannedActivityScheduleFormSchema = z.object({
  activity_plan_id: z.string().uuid("Please select an activity plan"),
  scheduled_date: dateStringSchema,
  notes: activityPlanNotesSchema,
  training_plan_id: z.string().uuid().optional().nullable(),
});

export type PlannedActivityScheduleFormData = z.infer<
  typeof plannedActivityScheduleFormSchema
>;

/**
 * Planned Activity Update Form Schema
 */
export const plannedActivityUpdateFormSchema = z.object({
  activity_plan_id: z
    .string()
    .uuid("Please select an activity plan")
    .optional(),
  scheduled_date: dateStringSchema.optional(),
  notes: activityPlanNotesSchema,
});

export type PlannedActivityUpdateFormData = z.infer<
  typeof plannedActivityUpdateFormSchema
>;

/**
 * Planned Activity Reschedule Form Schema
 */
export const plannedActivityRescheduleFormSchema = z.object({
  new_date: futureDateSchema,
  reason: z.preprocess(
    trimString,
    z.string().max(500, "Reason must be less than 500 characters").optional(),
  ),
});

export type PlannedActivityRescheduleFormData = z.infer<
  typeof plannedActivityRescheduleFormSchema
>;

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
  z
    .string()
    .max(1000, "Description must be less than 1000 characters")
    .nullable(),
);

/**
 * Weekly TSS target validation
 * Range: 50 - 2000 (covers recovery weeks to peak training)
 */
export const weeklyTssTargetSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      message: "Weekly TSS must be a number",
    })
    .int("Weekly TSS must be a whole number")
    .min(50, "Weekly TSS must be at least 50")
    .max(2000, "Weekly TSS must be less than 2000")
    .positive("Weekly TSS must be positive"),
);

/**
 * Optional weekly TSS target
 */
export const optionalWeeklyTssTargetSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .int("Weekly TSS must be a whole number")
    .min(50, "Weekly TSS must be at least 50")
    .max(2000, "Weekly TSS must be less than 2000")
    .positive("Weekly TSS must be positive")
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

export type TrainingPlanBasicInfoFormData = z.infer<
  typeof trainingPlanBasicInfoFormSchema
>;

/**
 * Training Plan Weekly Targets Form Schema
 * Step 2 of training plan creation wizard
 */
export const trainingPlanWeeklyTargetsFormSchema = z.object({
  weekly_tss_target: weeklyTssTargetSchema,
  weekly_duration_target: optionalEstimatedDurationSchema,
  workouts_per_week: z.preprocess(
    stringToNumber,
    z
      .number()
      .int("Workouts per week must be a whole number")
      .min(1, "At least 1 workout per week")
      .max(14, "Maximum 14 workouts per week")
      .positive(),
  ),
});

export type TrainingPlanWeeklyTargetsFormData = z.infer<
  typeof trainingPlanWeeklyTargetsFormSchema
>;

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
  recovery_week_tss_percentage: z.preprocess(
    stringToNumber,
    z
      .number()
      .min(30, "Recovery week TSS must be at least 30% of normal")
      .max(80, "Recovery week TSS must be at most 80% of normal")
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

export type TrainingPlanRecoveryRulesFormData = z.infer<
  typeof trainingPlanRecoveryRulesFormSchema
>;

/**
 * Training Plan Periodization Form Schema (Optional Step 3)
 */
export const trainingPlanPeriodizationFormSchema = z
  .object({
    use_periodization: z.boolean().default(false),
    starting_ctl: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(0, "Starting CTL must be at least 0")
        .max(200, "Starting CTL must be less than 200")
        .optional()
        .nullable(),
    ),
    target_ctl: z.preprocess(
      stringToNumber,
      z
        .number()
        .min(0, "Target CTL must be at least 0")
        .max(250, "Target CTL must be less than 250")
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
        if (!data.starting_ctl || !data.target_ctl) return false;
        return data.target_ctl > data.starting_ctl;
      }
      return true;
    },
    {
      message: "Target CTL must be greater than starting CTL",
      path: ["target_ctl"],
    },
  );

export type TrainingPlanPeriodizationFormData = z.infer<
  typeof trainingPlanPeriodizationFormSchema
>;

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
    tss_min: z.preprocess(
      stringToNumber,
      z
        .number({ message: "Min TSS must be a number" })
        .int("Min TSS must be a whole number")
        .min(50, "Min TSS must be at least 50")
        .max(1000, "Min TSS must be less than 1000"),
    ),
    tss_max: z.preprocess(
      stringToNumber,
      z
        .number({ message: "Max TSS must be a number" })
        .int("Max TSS must be a whole number")
        .min(100, "Max TSS must be at least 100")
        .max(1500, "Max TSS must be less than 1500"),
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
    starting_ctl: optionalWeeklyTssTargetSchema,
    target_ctl: optionalWeeklyTssTargetSchema,
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
  .refine((data) => data.tss_max > data.tss_min, {
    message: "Max TSS must be greater than min TSS",
    path: ["tss_max"],
  })
  .refine((data) => data.min_rest_days + data.max_consecutive_days <= 7, {
    message: "Training days + rest days must fit in a week (7 days)",
    path: ["min_rest_days"],
  })
  .refine(
    (data) => {
      if (data.use_periodization && data.starting_ctl && data.target_ctl) {
        return data.target_ctl > data.starting_ctl;
      }
      return true;
    },
    {
      message: "Target CTL must be greater than starting CTL",
      path: ["target_ctl"],
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
      // Validate reasonable TSS per activity (not too high)
      const avgTSS = (data.tss_min + data.tss_max) / 2;
      const avgPerActivity = avgTSS / data.activities_per_week;
      return avgPerActivity <= 500; // Max 500 TSS per activity
    },
    {
      message:
        "Average TSS per activity is unreasonably high (>500). Please adjust your targets.",
      path: ["tss_max"],
    },
  );

export type TrainingPlanCreateFormData = z.infer<
  typeof trainingPlanCreateFormSchema
>;

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
  ftp: ftpSchema,
  optionalFtp: optionalFtpSchema,
  threshold_hr: thresholdHrSchema,
  optionalThresholdHr: optionalThresholdHrSchema,
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
  plannedActivitySchedule: plannedActivityScheduleFormSchema,
  plannedActivityUpdate: plannedActivityUpdateFormSchema,
  plannedActivityReschedule: plannedActivityRescheduleFormSchema,

  // Activity plan schemas
  activityPlanCreate: activityPlanCreateFormSchema,
  activityPlanUpdate: activityPlanUpdateFormSchema,

  // Training plan schemas
  trainingPlanCreate: trainingPlanCreateFormSchema,
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
