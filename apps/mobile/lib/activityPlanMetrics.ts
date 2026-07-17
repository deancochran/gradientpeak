export type ActivityPlanMetricFields = {
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  estimated_distance?: number | null;
  provenance?: {
    estimated_duration?: "estimated" | "prescribed" | "measured" | "unknown" | null;
    estimated_tss?: "estimated" | "prescribed" | "measured" | "unknown" | null;
    intensity_factor?: "estimated" | "prescribed" | "measured" | "unknown" | null;
    estimated_distance?: "estimated" | "prescribed" | "measured" | "unknown" | null;
  } | null;
};

export type ActivityPlanRouteFields = {
  distance?: number | null;
  ascent?: number | null;
  descent?: number | null;
};

type ActivityPlanMetricsLike = {
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  estimated_distance?: number | null;
  authoritative_metrics?: ActivityPlanMetricFields | null;
  route?: ActivityPlanRouteFields | null;
};

export function getAuthoritativeActivityPlanMetrics(
  plan: ActivityPlanMetricsLike | null | undefined,
) {
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

export function getActivityPlanRoute(plan: ActivityPlanMetricsLike | null | undefined) {
  return {
    distance: plan?.route?.distance,
    ascent: plan?.route?.ascent,
    descent: plan?.route?.descent,
  };
}
