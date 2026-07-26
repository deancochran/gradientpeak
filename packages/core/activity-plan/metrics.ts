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

/** Strict boundary shape for consumers that receive an activity-plan metric payload. */
export const activityPlanMetricsContainerSchema = z
  .object({
    authoritative_metrics: activityPlanAuthoritativeMetricsSchema,
  })
  .strict();

export type ActivityPlanMetricValues = z.infer<typeof activityPlanMetricValuesSchema>;
export type ActivityPlanMetricProvenanceValue = z.infer<
  typeof activityPlanMetricProvenanceValueSchema
>;
export type ActivityPlanMetricProvenance = z.infer<typeof activityPlanMetricProvenanceSchema>;
export type ActivityPlanAuthoritativeMetrics = z.infer<
  typeof activityPlanAuthoritativeMetricsSchema
>;
export type ActivityPlanMetricsContainer = z.infer<typeof activityPlanMetricsContainerSchema>;

/**
 * The only metric container accepted by Core consumers. Metrics live beneath
 * `authoritative_metrics`; top-level metric keys are intentionally not modeled
 * so a stale persisted projection cannot be read by accident.
 */
export type ActivityPlanMetricsLike = {
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
 * Resolves canonical nested metrics. Explicit authoritative null means the
 * metric is unavailable. Missing canonical metrics remain unavailable.
 */
export function getAuthoritativeActivityPlanMetrics(
  plan: ActivityPlanMetricsLike | null | undefined,
): ResolvedActivityPlanMetrics {
  const authoritative = plan?.authoritative_metrics;

  return {
    estimated_duration: authoritative?.estimated_duration,
    estimated_tss: authoritative?.estimated_tss,
    intensity_factor: authoritative?.intensity_factor,
    estimated_distance: authoritative?.estimated_distance,
  };
}
