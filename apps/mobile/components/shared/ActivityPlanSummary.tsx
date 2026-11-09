import type {
  ActivityPlanPresentationModel,
  ActivityPlanStructure,
  SemanticMetric,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceAttributionRow, ResourceMetricsRow } from "./ResourceCardPrimitives";

type ActivityPlanSummaryProps = {
  description?: string | null;
  headerAccessory?: ReactNode;
  owner?: EntityOwner | null;
  presentation?: ActivityPlanPresentationModel | null;
  projectionMetrics?: readonly SemanticMetric[];
  structure?: ActivityPlanStructure | unknown;
  subtitle?: string | null;
  testID?: string;
  title?: string | null;
  updatedAt?: string | Date | null;
  variant?: "embedded" | "standalone";
  showAttribution?: boolean;
};

const estimateOrder = ["distance", "elapsed_duration", "common_load"] as const;
const estimateLabels: Record<(typeof estimateOrder)[number], string> = {
  distance: "Distance",
  elapsed_duration: "Duration",
  common_load: "Load",
};

export function ActivityPlanMetricsRow({
  projectionMetrics,
}: Pick<ActivityPlanSummaryProps, "projectionMetrics">) {
  const availableMetrics = projectionMetrics ?? [];
  const byKey = new Map(availableMetrics.map((metric) => [metric.key, metric]));
  const metrics = estimateOrder.map((key) => {
    const metric = byKey.get(key);
    return {
      label: estimateLabels[key],
      value: formatActivityPlanHeadlineMetric(metric, key),
      ...(key === "common_load" ? { tone: "primary" as const } : {}),
    };
  });
  const objectiveIntensity = byKey.get("objective_intensity");
  metrics.push({
    label: "Intensity",
    value: formatActivityPlanHeadlineMetric(objectiveIntensity, "objective_intensity"),
    tone: "primary",
  });

  return <ResourceMetricsRow maxItems={4} metrics={metrics} testID="activity-plan-estimates" />;
}

export function ActivityPlanSummary({
  description,
  headerAccessory,
  owner,
  projectionMetrics,
  subtitle,
  testID,
  title,
  updatedAt,
  variant = "embedded",
  showAttribution = true,
}: ActivityPlanSummaryProps) {
  return (
    <View
      className={
        variant === "standalone"
          ? "gap-3"
          : "gap-3 rounded-2xl border border-border bg-muted/20 px-3 py-3"
      }
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1">
          {subtitle ? (
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
          <Text className="text-base font-semibold text-foreground">
            {title || "Untitled activity plan"}
          </Text>
          {description?.trim() ? (
            <Text className="text-xs leading-5 text-muted-foreground">{description.trim()}</Text>
          ) : null}
        </View>
        {headerAccessory}
      </View>

      {projectionMetrics !== undefined ? (
        <ActivityPlanMetricsRow projectionMetrics={projectionMetrics} />
      ) : null}

      {showAttribution ? (
        <ResourceAttributionRow
          compact={variant !== "standalone"}
          {...(owner !== undefined ? { owner } : {})}
          testID="activity-plan-attribution-row"
          {...(updatedAt !== undefined ? { timestamp: updatedAt } : {})}
        />
      ) : null}
    </View>
  );
}
