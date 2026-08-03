import { activityPrescriptionQuantificationBundleSchema } from "@repo/core/activity-quantification";

export function getActivityPlanQuantitySummary(value: unknown) {
  const candidate =
    value && typeof value === "object" && "prescriptionQuantification" in value
      ? value.prescriptionQuantification
      : value;
  const parsed = activityPrescriptionQuantificationBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      commonIntensity: null,
      commonLoad: null,
      distanceMeters: null,
      durationSeconds: null,
    };
  }
  const summary = parsed.data.summary;
  return {
    commonIntensity: summary.commonLoad.status === "complete" ? summary.commonLoad.intensity : null,
    commonLoad:
      summary.commonLoad.status === "complete" && summary.commonLoad.load !== null
        ? summary.commonLoad.load
        : null,
    distanceMeters: summary.distance.status === "unavailable" ? null : summary.distance.value,
    durationSeconds:
      summary.duration.elapsed.status === "unavailable" ? null : summary.duration.elapsed.value,
  };
}
