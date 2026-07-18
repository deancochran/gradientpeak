import { z } from "zod";

const nullableNonnegativeMetricSchema = z.number().finite().nonnegative().nullable();

export const activityPlanMetricValuesSchema = z
  .object({
    /** Exact or estimated elapsed duration in seconds. */
    estimated_duration: nullableNonnegativeMetricSchema,
    estimated_tss: nullableNonnegativeMetricSchema,
    intensity_factor: nullableNonnegativeMetricSchema,
    /** Prescribed or estimated distance in meters. */
    estimated_distance: nullableNonnegativeMetricSchema,
  })
  .strict();

export const activityPlanMetricProvenanceValueSchema = z.enum([
  "estimated",
  "prescribed",
  "measured",
  "unknown",
]);

export const activityPlanMetricProvenanceSchema = z
  .object({
    estimated_duration: activityPlanMetricProvenanceValueSchema.nullable(),
    estimated_tss: activityPlanMetricProvenanceValueSchema.nullable(),
    intensity_factor: activityPlanMetricProvenanceValueSchema.nullable(),
    estimated_distance: activityPlanMetricProvenanceValueSchema.nullable(),
  })
  .strict();

export const activityPlanAuthoritativeMetricsSchema = activityPlanMetricValuesSchema
  .extend({ provenance: activityPlanMetricProvenanceSchema })
  .strict();

export type ActivityPlanMetricValues = z.infer<typeof activityPlanMetricValuesSchema>;
export type ActivityPlanMetricProvenanceValue = z.infer<
  typeof activityPlanMetricProvenanceValueSchema
>;
export type ActivityPlanMetricProvenance = z.infer<typeof activityPlanMetricProvenanceSchema>;
export type ActivityPlanAuthoritativeMetrics = z.infer<
  typeof activityPlanAuthoritativeMetricsSchema
>;

export type ActivityPlanMetricsLike = Partial<ActivityPlanMetricValues> & {
  authoritative_metrics?:
    | (Partial<ActivityPlanMetricValues> & {
        provenance?: Partial<ActivityPlanMetricProvenance> | null;
      })
    | null;
};

export type ResolvedActivityPlanMetrics = {
  [TKey in keyof ActivityPlanMetricValues]: ActivityPlanMetricValues[TKey] | undefined;
};

/**
 * Resolves canonical nested metrics while supporting legacy top-level fields.
 * Explicit authoritative null means the metric is unavailable and must not
 * fall back to a potentially stale legacy value.
 */
export function getAuthoritativeActivityPlanMetrics(
  plan: ActivityPlanMetricsLike | null | undefined,
): ResolvedActivityPlanMetrics {
  const authoritative = plan?.authoritative_metrics;

  return {
    estimated_duration:
      authoritative?.estimated_duration !== undefined
        ? authoritative.estimated_duration
        : plan?.estimated_duration,
    estimated_tss:
      authoritative?.estimated_tss !== undefined
        ? authoritative.estimated_tss
        : plan?.estimated_tss,
    intensity_factor:
      authoritative?.intensity_factor !== undefined
        ? authoritative.intensity_factor
        : plan?.intensity_factor,
    estimated_distance:
      authoritative?.estimated_distance !== undefined
        ? authoritative.estimated_distance
        : plan?.estimated_distance,
  };
}
