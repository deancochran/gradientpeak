import type { EstimationContext, EstimationResult, MetricEstimations } from "./types";

/**
 * Retain ancillary facts that can be derived without inventing effort, speed,
 * mass, or physiological inputs.
 */
export function estimateMetrics(
  baseEstimation: EstimationResult,
  context: EstimationContext,
): MetricEstimations {
  const routeDistance = context.route?.distanceMeters;
  const distance =
    baseEstimation.estimatedDistance ??
    (routeDistance !== undefined && Number.isFinite(routeDistance) && routeDistance > 0
      ? routeDistance
      : undefined);
  const duration = baseEstimation.duration;
  const avgSpeed =
    distance !== undefined && duration !== null && duration > 0 ? distance / duration : undefined;
  const routeAscent = context.route?.totalAscent;
  const elevationGain =
    routeAscent !== undefined && Number.isFinite(routeAscent) && routeAscent >= 0
      ? routeAscent
      : undefined;

  return {
    distance: distance === undefined ? undefined : Math.round(distance),
    avgSpeed: avgSpeed === undefined ? undefined : Math.round(avgSpeed * 100) / 100,
    elevationGain,
  };
}
