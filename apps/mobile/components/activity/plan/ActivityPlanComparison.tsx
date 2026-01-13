import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { CheckCircle, XCircle } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ActivityPlanData {
  id: string;
  name: string;
  structure: any; // ActivityPlanStructureV2
}

interface ActivityMetrics {
  duration: number; // seconds
  tss?: number;
  if?: number;
  intensity_factor?: number;
  adherence_score?: number;
}

interface ActivityPlanComparisonProps {
  activityPlan: ActivityPlanData;
  actualMetrics: ActivityMetrics;
  compact?: boolean;
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
function calculateEstimatedDuration(structure: any): number {
  if (!structure || !structure.intervals) return 0;

  // Sum up all interval durations
  return structure.intervals.reduce((total: number, interval: any) => {
    return total + (interval.duration || 0);
  }, 0);
}

// Helper function to calculate estimated TSS from structure
function calculateEstimatedTSS(structure: any): number {
  if (!structure || !structure.intervals) return 0;

  // Basic TSS estimation: sum of (duration in hours * normalized power factor^2 * 100)
  // This is a simplified calculation
  return structure.intervals.reduce((total: number, interval: any) => {
    const durationHours = (interval.duration || 0) / 3600;
    const intensity = (interval.target_power_percent || 50) / 100; // Default to 50% FTP
    return total + durationHours * intensity * intensity * 100;
  }, 0);
}

export function ActivityPlanComparison({
  activityPlan,
  actualMetrics,
  compact = false,
}: ActivityPlanComparisonProps) {
  // Calculate estimated values from structure
  const estimatedDuration = calculateEstimatedDuration(activityPlan.structure);
  const estimatedTSS = calculateEstimatedTSS(activityPlan.structure);

  const actualDuration = actualMetrics.duration;
  const actualTSS = actualMetrics.tss || 0;
  const actualIF = actualMetrics.intensity_factor ?? actualMetrics.if ?? 0;
  const adherence = (actualMetrics.adherence_score || 0) * 100;

  // Calculate variances
  const durationVariance =
    estimatedDuration > 0
      ? ((actualDuration - estimatedDuration) / estimatedDuration) * 100
      : 0;
  const tssVariance =
    estimatedTSS > 0 ? ((actualTSS - estimatedTSS) / estimatedTSS) * 100 : 0;

  // Determine if adherence is good (>= 85%)
  const goodAdherence = adherence >= 85;

  return (
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
        <Text className="text-sm text-muted-foreground mt-1">
          {activityPlan.name}
        </Text>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Metrics Comparison */}
        <View className="flex-row gap-2">
          {/* Duration */}
          <View className="flex-1 p-3 bg-muted rounded-lg">
            <Text className="text-xs text-muted-foreground uppercase mb-1">
              Duration
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-lg font-bold">
                {formatDuration(actualDuration)}
              </Text>
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
                Plan: {formatDuration(estimatedDuration)}
              </Text>
            )}
          </View>

          {/* TSS */}
          {actualTSS > 0 && (
            <View className="flex-1 p-3 bg-muted rounded-lg">
              <Text className="text-xs text-muted-foreground uppercase mb-1">
                TSS
              </Text>
              <View className="flex-row items-baseline gap-1">
                <Text className="text-lg font-bold">
                  {actualTSS.toFixed(0)}
                </Text>
                {estimatedTSS > 0 && (
                  <Text
                    className={`text-xs ${tssVariance > 10 ? "text-yellow-600" : tssVariance < -10 ? "text-blue-600" : "text-green-600"}`}
                  >
                    ({tssVariance > 0 ? "+" : ""}
                    {tssVariance.toFixed(0)}%)
                  </Text>
                )}
              </View>
              {estimatedTSS > 0 && (
                <Text className="text-xs text-muted-foreground mt-1">
                  Plan: {estimatedTSS.toFixed(0)}
                </Text>
              )}
            </View>
          )}

          {/* Intensity Factor */}
          {actualIF > 0 && (
            <View className="flex-1 p-3 bg-muted rounded-lg">
              <Text className="text-xs text-muted-foreground uppercase mb-1">
                IF
              </Text>
              <Text className="text-lg font-bold">
                {(actualIF / 100).toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {/* Timeline Chart */}
        {!compact && activityPlan.structure && (
          <View>
            <Text className="text-sm font-medium mb-2">Planned Intensity</Text>
            <TimelineChart
              structure={activityPlan.structure}
              height={100}
              compact={true}
            />
          </View>
        )}
      </CardContent>
    </Card>
  );
}
