import { z } from "zod";
import { canonicalSportSchema } from "../schemas/sport";

export const activityTssIdentitySchema = z
  .object({
    sport: canonicalSportSchema,
    method: z.enum(["power_threshold", "run_pace_threshold", "heart_rate_reserve"]),
    source: z.literal("activity_analysis"),
    version: z.literal("1"),
    calibration: z.discriminatedUnion("type", [
      z.object({ type: z.literal("ftp_watts"), value: z.number().positive() }).strict(),
      z.object({ type: z.literal("threshold_speed_mps"), value: z.number().positive() }).strict(),
      z
        .object({
          type: z.literal("heart_rate_reserve_bpm"),
          resting: z.number().positive(),
          maximum: z.number().positive(),
        })
        .strict()
        .refine(({ maximum, resting }) => maximum > resting),
    ]),
  })
  .strict()
  .superRefine((identity, context) => {
    const expected =
      identity.method === "power_threshold"
        ? "ftp_watts"
        : identity.method === "run_pace_threshold"
          ? "threshold_speed_mps"
          : "heart_rate_reserve_bpm";
    if (identity.calibration.type !== expected) {
      context.addIssue({
        code: "custom",
        path: ["calibration"],
        message: "TSS calibration must match its calculation method",
      });
    }
  });

export const activityDerivedStressSchema = z.object({
  tss: z.number().nullable(),
  tss_identity: activityTssIdentitySchema.nullable().optional(),
  intensity_factor: z.number().nullable(),
  trimp: z.number().nullable(),
  trimp_source: z.enum(["hr", "power_proxy"]).nullable().optional(),
  training_effect: z
    .enum(["recovery", "base", "tempo", "threshold", "vo2max"])
    .nullable()
    .optional(),
});

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

export const activityListDerivedSummarySchema = z.object({
  tss: z.number().nullable(),
  tss_identity: activityTssIdentitySchema.nullable().optional(),
  intensity_factor: z.number().nullable(),
  computed_as_of: z.string(),
});

export type ActivityDerivedStress = z.infer<typeof activityDerivedStressSchema>;
export type ActivityTssIdentity = z.infer<typeof activityTssIdentitySchema>;
export type ActivityZoneEntry = z.infer<typeof activityZoneEntrySchema>;
export type ActivityDerivedZones = z.infer<typeof activityDerivedZonesSchema>;
export type ActivityDerivedMetrics = z.infer<typeof activityDerivedMetricsSchema>;
export type ActivityListDerivedSummary = z.infer<typeof activityListDerivedSummarySchema>;
