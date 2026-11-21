import type { SemanticMetric } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";
import { View } from "react-native";

type ActivityPlanEstimatePresentationProps = {
  metrics: readonly SemanticMetric[];
};

/**
 * Draft metadata only makes claims backed by the current structure; unknown
 * estimates stay absent instead of consuming space as placeholder dashes.
 */
export function ActivityPlanEstimatePresentation({
  metrics,
}: ActivityPlanEstimatePresentationProps) {
  const labels: Record<string, string> = {
    common_load: "Load",
    distance: "Distance",
    elapsed_duration: "Duration",
    objective_intensity: "Intensity",
  };
  const items = metrics.flatMap((metric) => {
    if (metric.status !== "available" || !labels[metric.key]) return [];
    const value = formatActivityPlanHeadlineMetric(metric, metric.key as never);
    return value === "—" ? [] : [`${labels[metric.key]} ${value}`];
  });
  if (!items.length) return null;
  return (
    <View accessibilityLabel={`Plan estimates: ${items.join(", ")}`}>
      <Text className="text-sm text-muted-foreground">{items.join(" · ")}</Text>
    </View>
  );
}
