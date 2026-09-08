import {
  type ActivityObservationQuantificationBundle,
  type ActivityPlanDetail,
  deriveActivityPlanPresentation,
} from "@repo/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";

type ActivityPlanData = Pick<ActivityPlanDetail, "id" | "metrics" | "name" | "structure">;

interface ActivityMetrics {
  duration: number; // seconds
  observationQuantification?: ActivityObservationQuantificationBundle | null;
  [key: string]: unknown;
}

interface ActivityPlanComparisonProps {
  activityPlan: ActivityPlanData;
  actualMetrics: ActivityMetrics;
  compact?: boolean;
  onPress?: () => void;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function ActivityPlanComparison({
  activityPlan,
  actualMetrics,
  compact = false,
  onPress,
}: ActivityPlanComparisonProps) {
  // Calculate estimated values from structure
  const presentation = useMemo(
    () => deriveActivityPlanPresentation(activityPlan.structure),
    [activityPlan.structure],
  );
  const actualDuration = actualMetrics.duration;
  const actualLoad = getActivityQuantificationPresentation(actualMetrics.observationQuantification);
  const plannedDuration = activityPlan.metrics.find((metric) => metric.key === "elapsed_duration");
  const plannedCommonLoad = activityPlan.metrics.find((metric) => metric.key === "common_load");
  const plannedIntensity = activityPlan.metrics.find(
    (metric) => metric.key === "objective_intensity",
  );

  // Calculate variances
  const plannedDurationSeconds =
    plannedDuration?.status === "available" ? plannedDuration.value : null;
  const durationVariance =
    plannedDurationSeconds !== null && plannedDurationSeconds > 0
      ? ((actualDuration - plannedDurationSeconds) / plannedDurationSeconds) * 100
      : 0;

  const content = (
    <Card>
      <CardHeader>
        <CardTitle>Plan comparison</CardTitle>
        <Text className="text-sm text-muted-foreground mt-1">{activityPlan.name}</Text>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Metrics Comparison */}
        <View className="flex-row gap-2">
          {/* Duration */}
          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">Duration</Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-lg font-bold">{formatDuration(actualDuration)}</Text>
              {plannedDurationSeconds !== null && plannedDurationSeconds > 0 && (
                <Text
                  className={`text-xs ${durationVariance > 10 ? "text-yellow-600" : durationVariance < -10 ? "text-blue-600" : "text-green-600"}`}
                >
                  ({durationVariance > 0 ? "+" : ""}
                  {durationVariance.toFixed(0)}%)
                </Text>
              )}
            </View>
            <Text className="text-xs text-muted-foreground mt-1">
              Plan: {formatActivityPlanHeadlineMetric(plannedDuration, "elapsed_duration")}
            </Text>
          </View>

          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">
              {actualLoad.commonLoad.label}
            </Text>
            <Text className="text-lg font-bold">{actualLoad.commonLoad.value}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Plan: {formatActivityPlanHeadlineMetric(plannedCommonLoad, "common_load")}
            </Text>
          </View>

          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">
              Actual normalized intensity
            </Text>
            <Text className="text-lg font-bold">{actualLoad.normalizedIntensity.value}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Plan objective intensity:{" "}
              {formatActivityPlanHeadlineMetric(plannedIntensity, "objective_intensity")}
            </Text>
          </View>
        </View>

        {/* Timeline Chart */}
        {!compact && Boolean(activityPlan.structure) && (
          <View>
            <Text className="text-sm font-medium mb-2">Prescribed intensity</Text>
            <TimelineChart presentation={presentation} height={100} compact={true} />
          </View>
        )}
      </CardContent>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} testID="activity-detail-open-activity-plan">
      {content}
    </Pressable>
  );
}
