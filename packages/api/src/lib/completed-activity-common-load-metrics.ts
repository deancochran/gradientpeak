import {
  activityObservationQuantificationBundleSchema,
  createSemanticMetric,
  getKnownNormalizedIntensity,
  type SemanticMetric,
} from "@repo/core";

function unavailableMetrics(reason: string): SemanticMetric[] {
  return [
    createSemanticMetric({
      key: "common_load",
      label: "Load",
      status: "unavailable",
      value: null,
      unit: "score",
      reason,
    }),
    createSemanticMetric({
      key: "normalized_intensity",
      label: "Intensity",
      status: "unavailable",
      value: null,
      unit: "ratio",
      reason,
    }),
  ];
}

/**
 * Projects the canonical completed-activity Common Load envelope into paired
 * presentation metrics without permitting a numeric Load without Intensity.
 */
export function projectCompletedActivityCommonLoadMetrics(value: unknown): SemanticMetric[] {
  const quantification = activityObservationQuantificationBundleSchema.safeParse(value);
  if (!quantification.success) return unavailableMetrics("quantification_unavailable");

  const commonLoad = quantification.data.summary.commonLoad;
  if (commonLoad.status === "unavailable" || commonLoad.load === null) {
    return unavailableMetrics(
      "reason" in commonLoad ? commonLoad.reason : "quantification_unavailable",
    );
  }

  const intensity = getKnownNormalizedIntensity(commonLoad);
  if (intensity === null) return unavailableMetrics("quantification_unavailable");

  const partial = commonLoad.status === "partial";
  return [
    createSemanticMetric({
      key: "common_load",
      label: "Load",
      status: partial ? "partial" : "available",
      value: commonLoad.load,
      unit: "score",
      reason: partial ? "quantification_partial" : null,
    }),
    createSemanticMetric({
      key: "normalized_intensity",
      label: "Intensity",
      status: partial ? "partial" : "available",
      value: intensity,
      unit: "ratio",
      reason: partial ? "quantification_partial" : null,
    }),
  ];
}
