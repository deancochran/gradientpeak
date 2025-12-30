import { EmptyStateCard, TrendsOverviewSkeleton } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { VolumeTrendsChart, type VolumeDataPoint } from "@/components/charts";

interface VolumeTrendsData {
  dataPoints: VolumeDataPoint[];
  totals: {
    totalDistance: number;
    totalTime: number;
    totalActivities: number;
  } | null;
}

interface VolumeTabProps {
  volumeData: VolumeTrendsData | null;
  volumeLoading: boolean;
  timeRange: string;
}

export function VolumeTab({
  volumeData,
  volumeLoading,
  timeRange,
}: VolumeTabProps) {
  if (volumeLoading) {
    return <TrendsOverviewSkeleton />;
  }

  const dataPoints = volumeData?.dataPoints ?? [];
  const totals = volumeData?.totals ?? null;

  // Calculate averages
  const avgDistance = totals
    ? totals.totalDistance / totals.totalActivities
    : 0;
  const avgTime = totals ? totals.totalTime / totals.totalActivities : 0;

  return (
    <View className="space-y-4">
      {/* Volume Chart */}
      <VolumeTrendsChart data={dataPoints} height={300} />

      {/* Summary Stats */}
      {totals && (
        <View className="bg-card rounded-lg border border-border p-4">
          <Text className="text-base font-semibold text-foreground mb-3">
            {timeRange} Summary
          </Text>

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">
                  Total Distance
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Avg: {(avgDistance / 1000).toFixed(1)} km per activity
                </Text>
              </View>
              <Text className="text-2xl font-bold text-blue-600">
                {(totals.totalDistance / 1000).toFixed(1)}
                <Text className="text-base text-muted-foreground"> km</Text>
              </Text>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">Total Time</Text>
                <Text className="text-xs text-muted-foreground">
                  Avg: {(avgTime / 3600).toFixed(1)} h per activity
                </Text>
              </View>
              <Text className="text-2xl font-bold text-green-600">
                {(totals.totalTime / 3600).toFixed(1)}
                <Text className="text-base text-muted-foreground"> h</Text>
              </Text>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">
                  Total Activities
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {dataPoints.length} weeks of data
                </Text>
              </View>
              <Text className="text-2xl font-bold text-orange-600">
                {totals.totalActivities}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Weekly Average */}
      {dataPoints.length > 0 && (
        <View className="bg-card rounded-lg border border-border p-4">
          <Text className="text-base font-semibold text-foreground mb-3">
            Weekly Averages
          </Text>

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-card-foreground">
                Distance per week
              </Text>
              <Text className="text-base font-semibold text-foreground">
                {(
                  dataPoints.reduce((sum, d) => sum + d.totalDistance, 0) /
                  dataPoints.length /
                  1000
                ).toFixed(1)}{" "}
                km
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-card-foreground">
                Time per week
              </Text>
              <Text className="text-base font-semibold text-foreground">
                {(
                  dataPoints.reduce((sum, d) => sum + d.totalTime, 0) /
                  dataPoints.length /
                  3600
                ).toFixed(1)}{" "}
                h
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-card-foreground">
                Activities per week
              </Text>
              <Text className="text-base font-semibold text-foreground">
                {(
                  dataPoints.reduce((sum, d) => sum + d.activityCount, 0) /
                  dataPoints.length
                ).toFixed(1)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
