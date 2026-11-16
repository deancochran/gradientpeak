import type { SemanticMetric } from "@repo/core";
import { View } from "react-native";
import { ActivityPlanMetricsRow } from "../shared/ActivityPlanSummary";

type ActivityPlanEstimatePresentationProps = {
  metrics: readonly SemanticMetric[];
};

/**
 * Composer estimates use the same four-metric row as resource summaries. This
 * retains unavailable values so an incomplete draft does not appear to lack a
 * distance, duration, load, or intensity estimate.
 */
export function ActivityPlanEstimatePresentation({
  metrics,
}: ActivityPlanEstimatePresentationProps) {
  return (
    <View accessibilityLabel="Plan estimates" className="gap-2">
      <ActivityPlanMetricsRow projectionMetrics={metrics} />
    </View>
  );
}
