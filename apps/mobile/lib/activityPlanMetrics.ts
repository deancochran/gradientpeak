export type ActivityPlanMetricFields = {
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  estimated_distance?: number | null;
};

export type ActivityPlanRouteFields = {
  distance?: number | null;
  ascent?: number | null;
  descent?: number | null;
};

type ActivityPlanMetricsLike = {
  authoritative_metrics?: ActivityPlanMetricFields | null;
  route?: ActivityPlanRouteFields | null;
};

export function getAuthoritativeActivityPlanMetrics(
  plan: ActivityPlanMetricsLike | null | undefined,
) {
  return {
    estimated_duration: plan?.authoritative_metrics?.estimated_duration,
    estimated_tss: plan?.authoritative_metrics?.estimated_tss,
    intensity_factor: plan?.authoritative_metrics?.intensity_factor,
    estimated_distance: plan?.authoritative_metrics?.estimated_distance,
  };
}

export function getActivityPlanRoute(plan: ActivityPlanMetricsLike | null | undefined) {
  return {
    distance: plan?.route?.distance,
    ascent: plan?.route?.ascent,
    descent: plan?.route?.descent,
  };
}
