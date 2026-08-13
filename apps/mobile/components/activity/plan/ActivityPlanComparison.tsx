import {
  type ActivityObservationQuantificationBundle,
  type ActivityPlanDetail,
  calculateActivityPlanStats,
  deriveActivityPlanPresentation,
} from "@repo/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";
import { markEstimated } from "@/lib/estimatedMetrics";

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

// Helper function to calculate estimated duration from structure
function getPlanComparison(presentation: ReturnType<typeof deriveActivityPlanPresentation>) {
  if (!presentation) return { duration: 0 };
  const stats = calculateActivityPlanStats(presentation.compiled);
  return {
    duration: stats.duration.exactElapsedSeconds ?? 0,
  };
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
  const planComparison = getPlanComparison(presentation);
  const estimatedDuration = planComparison.duration;

  const actualDuration = actualMetrics.duration;
  const actualLoad = getActivityQuantificationPresentation(actualMetrics.observationQuantification);
  const plannedCommonLoad = activityPlan.metrics.find((metric) => metric.key === "common_load");
  const plannedIntensity = activityPlan.metrics.find(
    (metric) => metric.key === "normalized_intensity",
  );

  // Calculate variances
  const durationVariance =
    estimatedDuration > 0 ? ((actualDuration - estimatedDuration) / estimatedDuration) * 100 : 0;

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
              {estimatedDuration > 0 && (
                <Text
                  className={`text-xs ${durationVariance > 10 ? "text-yellow-600" : durationVariance < -10 ? "text-blue-600" : "text-green-600"}`}
                >
                  ({durationVariance > 0 ? "+" : ""}
                  {durationVariance.toFixed(0)}%)
                </Text>
              )}
            </View>
            {estimatedDuration > 0 && (
              <Text className="text-xs text-muted-foreground mt-1">
                Plan: {markEstimated(formatDuration(estimatedDuration))}
              </Text>
            )}
          </View>

          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">
              {actualLoad.commonLoad.label}
            </Text>
            <Text className="text-lg font-bold">{actualLoad.commonLoad.value}</Text>
            {plannedCommonLoad && plannedCommonLoad.status !== "unavailable" ? (
              <Text className="text-xs text-muted-foreground mt-1">
                Plan: {markEstimated(String(Math.round(plannedCommonLoad.value)))}
              </Text>
            ) : null}
          </View>

          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">
              {actualLoad.normalizedIntensity.label}
            </Text>
            <Text className="text-lg font-bold">{actualLoad.normalizedIntensity.value}</Text>
            {plannedIntensity && plannedIntensity.status !== "unavailable" ? (
              <Text className="text-xs text-muted-foreground mt-1">
                Plan: {markEstimated(plannedIntensity.value.toFixed(2))}
              </Text>
            ) : null}
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
