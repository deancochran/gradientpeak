import { z } from "zod";

/** Preprocessor to convert empty strings to null for optional numeric fields. */
export const emptyStringToNull = (val: unknown) => {
  if (typeof val === "string" && val.trim() === "") return null;
  return val;
};

/** Preprocessor to convert empty strings to undefined for optional fields. */
export const emptyStringToUndefined = (val: unknown) => {
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
};

/** Preprocessor to trim strings. */
export const trimString = (val: unknown) => {
  if (typeof val === "string") return val.trim();
  return val;
};

/** Preprocessor to convert string numbers to actual numbers. */
export const stringToNumber = (val: unknown) => {
  if (typeof val === "string" && val.trim() !== "") {
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }
  return val;
};

/**
 * Strict decimal distance input in kilometers.
 * Accepts numbers or plain decimal strings only (no scientific notation).
 */
export const distanceKmSchema = z.preprocess(
  (val) => {
    if (typeof val === "number") return val;
    if (typeof val !== "string") return val;

    const trimmed = val.trim();
    if (trimmed === "") return val;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return val;
    return Number(trimmed);
  },
  z
    .number({ message: "Distance must be a decimal number in km" })
    .positive("Distance must be greater than 0 km"),
);

export const distanceKmToMetersSchema = distanceKmSchema.transform((km) => Math.round(km * 1000));

/** Strict completion time input in h:mm:ss format. */
export const completionTimeHmsSchema = z
  .string()
  .trim()
  .regex(/^\d+:[0-5]\d:[0-5]\d$/, "Completion time must use h:mm:ss format");

export const completionTimeHmsToSecondsSchema = completionTimeHmsSchema.transform((value) => {
  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
});

/** Strict pace input in mm:ss format. */
export const paceMmSsSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}:[0-5]\d$/, "Pace must use mm:ss format")
  .refine((value) => {
    const [minutes = 0, seconds = 0] = value.split(":").map(Number);
    return minutes > 0 || seconds > 0;
  }, "Pace must be greater than 00:00");

export const paceMmSsToMpsSchema = paceMmSsSchema.transform((value) => {
  const [minutes = 0, seconds = 0] = value.split(":").map(Number);
  const totalSecondsPerKm = minutes * 60 + seconds;
  return 1000 / totalSecondsPerKm;
});

/** Email validation pattern. */
export const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .toLowerCase()
  .trim();

/** Optional email; allows empty string. */
export const optionalEmailSchema = z.preprocess(
  emptyStringToNull,
  z.string().email("Please enter a valid email address").toLowerCase().trim().nullable(),
);

/** Phone number validation in international format. */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number (e.g., +1234567890)")
  .trim();

/** Optional phone number. */
export const optionalPhoneSchema = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number (e.g., +1234567890)")
    .trim()
    .nullable(),
);

/** URL validation. */
export const urlSchema = z.string().url("Please enter a valid URL").trim();

/** Optional URL. */
export const optionalUrlSchema = z.preprocess(
  emptyStringToNull,
  z.string().url("Please enter a valid URL").trim().nullable(),
);

/** Username validation; 3-30 characters, alphanumeric plus underscore. */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be less than 30 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
  .trim();

/** Optional username. */
export const optionalUsernameSchema = z.preprocess(emptyStringToNull, usernameSchema.nullable());

/** Date string validation; ISO 8601 parseable. */
export const dateStringSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date format");

export const isFutureDateString = (val: string, now: Date = new Date()) =>
  !Number.isNaN(Date.parse(val)) && new Date(val) >= now;

export const isPastDateString = (val: string, now: Date = new Date()) =>
  !Number.isNaN(Date.parse(val)) && new Date(val) <= now;

/** Future date validation. Uses current wall-clock time at parse time. */
export const futureDateSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date format")
  .refine((val) => isFutureDateString(val), "Date must be in the future");

/** Past date validation. Uses current wall-clock time at parse time. */
export const pastDateSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date format")
  .refine((val) => isPastDateString(val), "Date must be in the past");
