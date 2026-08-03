import { z } from "zod";
import { commonLoadAggregateSchema, commonLoadResultSchema } from "../load/common-relative-load";
export const activityDerivedStressSchema = z
  .object({
    // A parent activity combines its segment results into a coverage-aware
    // aggregate, while a single segment retains the activity-level result.
    common_load: z.union([commonLoadResultSchema, commonLoadAggregateSchema]),
    trimp: z.number().nullable(),
    trimp_source: z.enum(["hr", "power_proxy"]).nullable(),
    training_effect: z.enum(["recovery", "base", "tempo", "threshold", "vo2max"]).nullable(),
  })
  .strict();

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
    common_load: z.union([commonLoadResultSchema, commonLoadAggregateSchema]),
    computed_as_of: z.string(),
  })
  .strict();

export type ActivityDerivedStress = z.infer<typeof activityDerivedStressSchema>;
export type ActivityZoneEntry = z.infer<typeof activityZoneEntrySchema>;
export type ActivityDerivedZones = z.infer<typeof activityDerivedZonesSchema>;
export type ActivityDerivedMetrics = z.infer<typeof activityDerivedMetricsSchema>;
export type ActivityListDerivedSummary = z.infer<typeof activityListDerivedSummarySchema>;
