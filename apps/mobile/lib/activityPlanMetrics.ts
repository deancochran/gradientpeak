import { activityPrescriptionQuantificationBundleSchema } from "@repo/core/activity-quantification";
import {
  activityPlanDetailSchema,
  activityPlanSummarySchema,
  scheduledActivityPlanSummarySchema,
} from "@repo/core/contracts";

export function getActivityPlanQuantitySummary(value: unknown) {
  const projection = [
    activityPlanSummarySchema,
    activityPlanDetailSchema,
    scheduledActivityPlanSummarySchema,
  ]
    .map((schema) => schema.safeParse(value))
    .find((result) => result.success);
  if (projection?.success) {
    const metricValue = (
      key: "common_load" | "distance" | "elapsed_duration" | "normalized_intensity",
    ) => {
      const metric = projection.data.metrics.find((item) => item.key === key);
      return metric?.status === "available" ? metric.value : 0;
    };
    return {
      commonIntensity: metricValue("normalized_intensity"),
      commonLoad: metricValue("common_load"),
      distanceMeters: metricValue("distance"),
      durationSeconds: metricValue("elapsed_duration"),
    };
  }
  const candidate =
    value && typeof value === "object" && "prescriptionQuantification" in value
      ? value.prescriptionQuantification
      : value;
  const parsed = activityPrescriptionQuantificationBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      commonIntensity: 0,
      commonLoad: 0,
      distanceMeters: null,
      durationSeconds: 0,
    };
  }
  const summary = parsed.data.summary;
  return {
    commonIntensity: summary.commonLoad.status === "complete" ? summary.commonLoad.intensity : 0,
    commonLoad:
      summary.commonLoad.status === "complete" && summary.commonLoad.load !== null
        ? summary.commonLoad.load
        : 0,
    distanceMeters: summary.distance.status === "unavailable" ? null : summary.distance.value,
    durationSeconds:
      summary.duration.elapsed.status === "complete" ? summary.duration.elapsed.value : 0,
  };
}
