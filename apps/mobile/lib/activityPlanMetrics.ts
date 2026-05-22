export type ActivityPlanMetricFields = {
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  estimated_distance?: number | null;
  provenance?: {
    estimated_duration?: "estimated" | "prescribed" | "measured" | "unknown";
    estimated_tss?: "estimated" | "prescribed" | "measured" | "unknown";
    intensity_factor?: "estimated" | "prescribed" | "measured" | "unknown";
    estimated_distance?: "estimated" | "prescribed" | "measured" | "unknown";
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
  return {
    estimated_duration: plan?.authoritative_metrics?.estimated_duration ?? plan?.estimated_duration,
    estimated_tss: plan?.authoritative_metrics?.estimated_tss ?? plan?.estimated_tss,
    intensity_factor: plan?.authoritative_metrics?.intensity_factor ?? plan?.intensity_factor,
    estimated_distance: plan?.authoritative_metrics?.estimated_distance ?? plan?.estimated_distance,
  };
}

export function getActivityPlanRoute(plan: ActivityPlanMetricsLike | null | undefined) {
  return {
    distance: plan?.route?.distance,
    ascent: plan?.route?.ascent,
    descent: plan?.route?.descent,
  };
}
