import { z } from "zod";
import { canonicalSportSchema } from "../schemas/sport";
import {
  type ActivityTssIdentityMethod,
  activityTssCompatibleMethodsBySport,
  activityTssIdentityMethodValues,
  activityTssMethodValues,
} from "./calculation-policy";

export const activityStressUnavailableReasonValues = [
  "threshold_missing",
  "activity_data_missing",
  "invalid_data",
  "private_data",
] as const;
export const activityStressUnavailableReasonSchema = z.enum(activityStressUnavailableReasonValues);
const currentActivityTssMethodSchema = z.enum(activityTssMethodValues);

export const activityCalibrationQualitySchema = z.object({
  source: z.enum([
    "manual",
    "validated_test",
    "observed_effort",
    "provider",
    "modeled",
    "estimated",
    "unknown",
  ]),
  observed_at: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
  stale: z.boolean(),
  estimate: z.boolean(),
  calculation_version: z.string().nullable().optional(),
});

const activityTssCalibrationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ftp_watts"), value: z.number().positive() }).strict(),
  z.object({ type: z.literal("threshold_speed_mps"), value: z.number().positive() }).strict(),
  z.object({ type: z.literal("swim_threshold_speed_mps"), value: z.number().positive() }).strict(),
  z.object({ type: z.literal("lthr_bpm"), value: z.number().min(80).max(220) }).strict(),
  z
    .object({
      type: z.literal("heart_rate_reserve_bpm"),
      resting: z.number().positive(),
      maximum: z.number().positive(),
    })
    .strict()
    .refine(({ maximum, resting }) => maximum > resting),
]);

const activityTssIdentityBaseShape = {
  sport: canonicalSportSchema,
  source: z.literal("activity_analysis"),
  version: z.literal("1"),
  calibration: activityTssCalibrationSchema,
};

function validateTssIdentity(
  identity: {
    sport: z.infer<typeof canonicalSportSchema>;
    method: ActivityTssIdentityMethod;
    calibration: z.infer<typeof activityTssCalibrationSchema>;
  },
  context: z.RefinementCtx,
): void {
  const allowedMethods: readonly ActivityTssIdentityMethod[] =
    activityTssCompatibleMethodsBySport[identity.sport];
  if (!allowedMethods.includes(identity.method)) {
    context.addIssue({
      code: "custom",
      path: ["method"],
      message: "TSS method is not compatible with the activity sport",
    });
  }
  const expected =
    identity.method === "power_threshold"
      ? "ftp_watts"
      : identity.method === "run_pace_threshold"
        ? "threshold_speed_mps"
        : identity.method === "swim_pace_threshold"
          ? "swim_threshold_speed_mps"
          : identity.method === "heart_rate_threshold"
            ? "lthr_bpm"
            : "heart_rate_reserve_bpm";
  if (identity.calibration.type !== expected) {
    context.addIssue({
      code: "custom",
      path: ["calibration"],
      message: "TSS calibration must match its calculation method",
    });
  }
}

/** Append-only parser for current and historical calculation identities. */
export const activityTssIdentitySchema = z
  .object({
    ...activityTssIdentityBaseShape,
    method: z.enum(activityTssIdentityMethodValues),
  })
  .strict()
  .superRefine(validateTssIdentity);

const currentActivityTssIdentitySchema = z
  .object({
    ...activityTssIdentityBaseShape,
    method: currentActivityTssMethodSchema,
  })
  .strict()
  .superRefine(validateTssIdentity);

const methodAwareStressFields = {
  tss: z.number().nonnegative().nullable(),
  tss_identity: currentActivityTssIdentitySchema.nullable(),
  intensity_factor: z.number().min(0).max(1.5).nullable(),
  method: currentActivityTssMethodSchema.nullable(),
  unavailable_reason: activityStressUnavailableReasonSchema.nullable(),
  calibration_quality: activityCalibrationQualitySchema.nullable().optional(),
};

function validateMethodAwareStress(
  value: {
    tss: number | null;
    intensity_factor: number | null;
    method: (typeof activityTssMethodValues)[number] | null;
    unavailable_reason: (typeof activityStressUnavailableReasonValues)[number] | null;
    tss_identity: z.infer<typeof currentActivityTssIdentitySchema> | null;
  },
  context: z.RefinementCtx,
): void {
  const available = value.tss !== null && value.intensity_factor !== null;
  const unavailable = value.tss === null && value.intensity_factor === null;
  if (
    (!available && !unavailable) ||
    (available &&
      (value.method === null ||
        value.unavailable_reason !== null ||
        value.tss_identity === null ||
        value.tss_identity?.method !== value.method)) ||
    (unavailable &&
      (value.method !== null || value.unavailable_reason === null || value.tss_identity !== null))
  ) {
    context.addIssue({
      code: "custom",
      message: "Stress availability fields must describe one coherent result state",
    });
  }
}

export const activityDerivedStressSchema = z
  .object({
    ...methodAwareStressFields,
    trimp: z.number().nullable(),
    trimp_source: z.enum(["hr", "power_proxy"]).nullable().optional(),
    training_effect: z
      .enum(["recovery", "base", "tempo", "threshold", "vo2max"])
      .nullable()
      .optional(),
  })
  .superRefine(validateMethodAwareStress);

export const activityZoneEntrySchema = z.object({
  zone: z.number().int().positive(),
  seconds: z.number().int().nonnegative(),
  label: z.string(),
});

export const activityDerivedZonesSchema = z.object({
  hr: z.array(activityZoneEntrySchema),
  power: z.array(activityZoneEntrySchema),
});

export const activityDerivedMetricsSchema = z.object({
  stress: activityDerivedStressSchema,
  zones: activityDerivedZonesSchema,
  computed_as_of: z.string(),
});

export const activityListDerivedSummarySchema = z
  .object({
    ...methodAwareStressFields,
    computed_as_of: z.string(),
  })
  .superRefine(validateMethodAwareStress);

export type ActivityDerivedStress = z.infer<typeof activityDerivedStressSchema>;
export type ActivityTssIdentity = z.infer<typeof activityTssIdentitySchema>;
export type CurrentActivityTssIdentity = z.infer<typeof currentActivityTssIdentitySchema>;
export type ActivityZoneEntry = z.infer<typeof activityZoneEntrySchema>;
export type ActivityDerivedZones = z.infer<typeof activityDerivedZonesSchema>;
export type ActivityDerivedMetrics = z.infer<typeof activityDerivedMetricsSchema>;
export type ActivityListDerivedSummary = z.infer<typeof activityListDerivedSummarySchema>;
export type ActivityStressUnavailableReason = z.infer<typeof activityStressUnavailableReasonSchema>;
export type ActivityCalibrationQuality = z.infer<typeof activityCalibrationQualitySchema>;
