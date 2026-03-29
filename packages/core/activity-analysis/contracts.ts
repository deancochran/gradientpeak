import { z } from "zod";

export const activityDerivedStressSchema = z.object({
  tss: z.number().nullable(),
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
  intensity_factor: z.number().nullable(),
  computed_as_of: z.string(),
});

export type ActivityDerivedStress = z.infer<typeof activityDerivedStressSchema>;
export type ActivityZoneEntry = z.infer<typeof activityZoneEntrySchema>;
export type ActivityDerivedZones = z.infer<typeof activityDerivedZonesSchema>;
export type ActivityDerivedMetrics = z.infer<typeof activityDerivedMetricsSchema>;
export type ActivityListDerivedSummary = z.infer<typeof activityListDerivedSummarySchema>;
