import { calculateActivityPlanStats, deriveActivityPlanPresentation } from "@repo/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CheckCircle, XCircle } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/workout/TimelineChart";
import { getCommonLoadPresentation } from "@/lib/activity-load-presentation";
import { markEstimated } from "@/lib/estimatedMetrics";

interface ActivityPlanData {
  id: string;
  name: string;
  structure: unknown;
  common_load?: unknown;
}

interface ActivityMetrics {
  duration: number; // seconds
  common_load?: unknown;
  adherence_score?: number;
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
  const actualLoad = getCommonLoadPresentation(actualMetrics.common_load);
  const plannedLoad = getCommonLoadPresentation(activityPlan.common_load);
  const adherence = (actualMetrics.adherence_score || 0) * 100;

  // Calculate variances
  const durationVariance =
    estimatedDuration > 0 ? ((actualDuration - estimatedDuration) / estimatedDuration) * 100 : 0;

  // Determine if adherence is good (>= 85%)
  const goodAdherence = adherence >= 85;

  const content = (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <CardTitle>Activity Plan</CardTitle>
          <View className="flex-row items-center gap-1">
            <Icon
              as={goodAdherence ? CheckCircle : XCircle}
              size={16}
              className={goodAdherence ? "text-green-600" : "text-yellow-600"}
            />
            <Text
              className={`text-sm font-semibold ${goodAdherence ? "text-green-600" : "text-yellow-600"}`}
            >
              {adherence.toFixed(0)}% adherence
            </Text>
          </View>
        </View>
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

          {(actualLoad?.load || actualLoad?.unavailableText || plannedLoad?.load) && (
            <View className="flex-1 p-3 bg-muted rounded-lg">
              <Text className="text-xs text-muted-foreground uppercase mb-1">Load</Text>
              <Text className="text-lg font-bold">
                {actualLoad?.load ?? actualLoad?.unavailableText ?? "--"}
              </Text>
              {plannedLoad?.load && (
                <Text className="text-xs text-muted-foreground mt-1">
                  Plan: {markEstimated(plannedLoad.load)}
                </Text>
              )}
            </View>
          )}

          {(actualLoad?.intensity || plannedLoad?.intensity) && (
            <View className="flex-1 p-3 bg-muted rounded-lg">
              <Text className="text-xs text-muted-foreground uppercase mb-1">Intensity</Text>
              <Text className="text-lg font-bold">{actualLoad?.intensity ?? "--"}</Text>
              {plannedLoad?.intensity && (
                <Text className="text-xs text-muted-foreground mt-1">
                  Plan: {markEstimated(plannedLoad.intensity)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Timeline Chart */}
        {!compact && Boolean(activityPlan.structure) && (
          <View>
            <Text className="text-sm font-medium mb-2">Planned Intensity</Text>
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
