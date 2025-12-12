import { EmptyStateCard, TrendsOverviewSkeleton } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { Calendar } from "lucide-react-native";
import { View } from "react-native";
import {
  ConsistencyHeatmap,
  type ConsistencyData,
} from "../../app/(internal)/(tabs)/trends/components/charts";

interface ConsistencyTabProps {
  consistencyData: ConsistencyData | null;
  consistencyLoading: boolean;
  startDate: string;
  endDate: string;
}

export function ConsistencyTab({
  consistencyData,
  consistencyLoading,
  startDate,
  endDate,
}: ConsistencyTabProps) {
  if (consistencyLoading) {
    return <TrendsOverviewSkeleton />;
  }

  // Calculate additional metrics - handle null/empty data
  const trainingDaysPercentage =
    consistencyData && consistencyData.totalDays > 0
      ? (consistencyData.totalActivities / consistencyData.totalDays) * 100
      : 0;
  const restDaysPercentage = 100 - trainingDaysPercentage;

  // Calculate rest day distribution
  const weeklyRestDays = consistencyData ? 7 - consistencyData.weeklyAvg : 7;

  return (
    <View className="space-y-4">
      {/* Consistency Heatmap */}
      <ConsistencyHeatmap
        data={consistencyData}
        startDate={startDate}
        endDate={endDate}
      />

      {/* Training Frequency */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Training Frequency
        </Text>

        <View className="gap-3">
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-card-foreground">
                Training Days
              </Text>
              <Text className="text-sm font-medium text-foreground">
                {trainingDaysPercentage.toFixed(1)}%
              </Text>
            </View>
            <View className="h-3 bg-muted rounded-full overflow-hidden">
              <View
                className="h-full bg-green-500"
                style={{ width: `${trainingDaysPercentage}%` }}
              />
            </View>
            <Text className="text-xs text-muted-foreground mt-1">
              {consistencyData?.totalActivities ?? 0} of{" "}
              {consistencyData?.totalDays ?? 0} days
            </Text>
          </View>

          <View className="h-px bg-border" />

          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-card-foreground">Rest Days</Text>
              <Text className="text-sm font-medium text-foreground">
                {restDaysPercentage.toFixed(1)}%
              </Text>
            </View>
            <View className="h-3 bg-muted rounded-full overflow-hidden">
              <View
                className="h-full bg-gray-400"
                style={{ width: `${restDaysPercentage}%` }}
              />
            </View>
            <Text className="text-xs text-muted-foreground mt-1">
              {(consistencyData?.totalDays ?? 0) -
                (consistencyData?.totalActivities ?? 0)}{" "}
              of {consistencyData?.totalDays ?? 0} days
            </Text>
          </View>
        </View>
      </View>

      {/* Streak Insights */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Streak Insights
        </Text>

        <View className="gap-3">
          {consistencyData && consistencyData.currentStreak > 0 ? (
            <View className="p-3 bg-green-50 rounded-lg">
              <Text className="text-sm font-medium text-green-900 mb-1">
                🔥 Active Streak!
              </Text>
              <Text className="text-xs text-green-700">
                You've trained {consistencyData.currentStreak} days in a row.
                Keep it up!
              </Text>
            </View>
          ) : (
            <View className="p-3 bg-gray-50 rounded-lg">
              <Text className="text-sm font-medium text-gray-900 mb-1">
                No Active Streak
              </Text>
              <Text className="text-xs text-gray-700">
                Complete an activity today to start a new streak!
              </Text>
            </View>
          )}

          {consistencyData &&
            consistencyData.longestStreak > consistencyData.currentStreak && (
              <View className="p-3 bg-blue-50 rounded-lg">
                <Text className="text-sm font-medium text-blue-900 mb-1">
                  🏆 Longest Streak: {consistencyData.longestStreak} days
                </Text>
                <Text className="text-xs text-blue-700">
                  {consistencyData.currentStreak > 0
                    ? `${consistencyData.longestStreak - consistencyData.currentStreak} more days to beat your record!`
                    : "Try to beat your personal best!"}
                </Text>
              </View>
            )}
        </View>
      </View>

      {/* Weekly Pattern */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Weekly Training Pattern
        </Text>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-card-foreground">
              Average activities per week
            </Text>
            <Text className="text-lg font-semibold text-foreground">
              {consistencyData?.weeklyAvg.toFixed(1) ?? "0.0"}
            </Text>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-card-foreground">
              Average rest days per week
            </Text>
            <Text className="text-lg font-semibold text-foreground">
              {weeklyRestDays.toFixed(1)}
            </Text>
          </View>

          <View className="mt-2 p-3 bg-yellow-50 rounded-lg">
            <Text className="text-xs text-yellow-900">
              💡 Tip:{" "}
              {weeklyRestDays < 1
                ? "Consider adding at least 1-2 rest days per week for recovery."
                : weeklyRestDays >= 1 && weeklyRestDays <= 2
                  ? "Good balance! You're allowing adequate recovery time."
                  : "You have plenty of rest days. Consider adding more training if feeling good."}
            </Text>
          </View>
        </View>
      </View>

      {/* Consistency Score */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Consistency Rating
        </Text>

        <View className="items-center">
          <View className="w-32 h-32 rounded-full items-center justify-center border-8 border-green-500 bg-green-50">
            <Text className="text-4xl font-bold text-green-700">
              {trainingDaysPercentage.toFixed(0)}
            </Text>
            <Text className="text-sm text-green-600">out of 100</Text>
          </View>

          <Text className="text-center text-sm text-muted-foreground mt-4">
            {trainingDaysPercentage >= 80
              ? "Exceptional consistency! You're on fire! 🔥"
              : trainingDaysPercentage >= 60
                ? "Great consistency! Keep building the habit. 💪"
                : trainingDaysPercentage >= 40
                  ? "Good progress! Try to train more regularly. 👍"
                  : trainingDaysPercentage >= 20
                    ? "Room for improvement. Small steps add up! 🌱"
                    : "Just getting started? Build the habit gradually. 🎯"}
          </Text>
        </View>
      </View>
    </View>
  );
}
