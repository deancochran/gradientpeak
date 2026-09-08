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
      key: "common_load" | "distance" | "elapsed_duration" | "objective_intensity",
    ) => {
      const metric = projection.data.metrics.find((item) => item.key === key);
      return metric?.status === "available" ? metric.value : null;
    };
    return {
      objectiveIntensity: metricValue("objective_intensity"),
      commonLoad: metricValue("common_load"),
      distanceMeters: metricValue("distance"),
      durationSeconds: metricValue("elapsed_duration"),
    };
  }
  return {
    objectiveIntensity: null,
    commonLoad: null,
    distanceMeters: null,
    durationSeconds: null,
  };
}
