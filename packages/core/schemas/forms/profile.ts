import { z } from "zod";
import {
  emptyStringToNull,
  optionalUrlSchema,
  optionalUsernameSchema,
  stringToNumber,
} from "./primitives";

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
export const genderSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);

/**
 * Optional gender
 */
export const optionalGenderSchema = z.preprocess(emptyStringToNull, genderSchema.nullable());

/**
 * Date of Birth validation
 * Must be at least 13 years ago and no more than 120 years ago
 */
export const dobSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date of birth")
  .refine((val) => {
    const dob = new Date(val);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 13;
  }, "You must be at least 13 years old")
  .refine((val) => {
    const dob = new Date(val);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age <= 120;
  }, "Invalid date of birth");

/**
 * Optional date of birth
 */
export const optionalDobSchema = z.preprocess(emptyStringToNull, dobSchema.nullable());

/**
 * Bio/description validation
 * Max 500 characters
 */
export const bioSchema = z.string().max(500, "Bio must be less than 500 characters").trim();

/**
 * Optional bio
 */
export const optionalBioSchema = z.preprocess(emptyStringToNull, bioSchema.nullable());

/**
 * Profile Settings Form Schema
 * Matches the actual database schema (public.profiles table)
 * Fields: username, bio, weight_kg, ftp, threshold_hr, dob, avatar_url, cover_url, preferred_units, language, onboarded
 */
export const profileSettingsFormSchema = z
  .object({
    username: optionalUsernameSchema,
    bio: optionalBioSchema,
    weight_kg: optionalWeightKgSchema,
    ftp: optionalFtpSchema,
    threshold_hr: optionalThresholdHrSchema,
    dob: optionalDobSchema,
    avatar_url: optionalUrlSchema,
    cover_url: optionalUrlSchema,
    preferred_units: z.enum(["metric", "imperial"]).optional().nullable(),
    language: z.string().max(10).optional().nullable(),
    onboarded: z.boolean().optional().nullable(),
  })
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
      message: "Power-to-weight ratio seems unrealistic. Please verify FTP and weight.",
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
  is_public: z.boolean().optional(),
});

export type ProfileQuickUpdateData = z.infer<typeof profileQuickUpdateSchema>;

/**
 * Avatar update schema (avatar only)
 */
export const profileAvatarUpdateSchema = z.object({
  avatar_url: z.string().url("Invalid avatar URL").nullable(),
  cover_url: z.string().url("Invalid cover URL").nullable().optional(),
});

export type ProfileAvatarUpdateData = z.infer<typeof profileAvatarUpdateSchema>;
