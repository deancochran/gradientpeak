import { ChartSkeleton, EmptyStateCard } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { Calendar } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { WeeklyProgressChart } from "../../app/(internal)/(tabs)/trends/components/charts";

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  plannedTSS: number;
  completedTSS: number;
  tssPercentage: number;
  plannedActivities: number;
  completedActivities: number;
  activityPercentage: number;
  status: "good" | "warning" | "poor";
}

interface WeeklyTabProps {
  weeklySummary: WeeklySummary[] | null;
  weeklyLoading: boolean;
  onWeekPress: (config: {
    title: string;
    subtitle?: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
}

export function WeeklyTab({
  weeklySummary,
  weeklyLoading,
  onWeekPress,
}: WeeklyTabProps) {
  if (weeklyLoading) {
    return <ChartSkeleton height={280} />;
  }

  if (!weeklySummary || weeklySummary.length === 0) {
    return (
      <EmptyStateCard
        icon={Calendar}
        title="No Weekly Data"
        description="Complete activities throughout the week to see your weekly progress and statistics."
        iconColor="text-green-500"
      />
    );
  }

  return (
    <View className="space-y-4">
      {/* Weekly Progress Chart */}
      <WeeklyProgressChart
        data={weeklySummary.map((week) => ({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          plannedTSS: week.plannedTSS,
          completedTSS: week.completedTSS,
          tssPercentage: week.tssPercentage,
          status: week.status,
        }))}
        height={280}
      />

      {/* Weekly Summary Cards */}
      <View className="space-y-3">
        {weeklySummary.map((week, index) => {
          const statusColor =
            week.status === "good"
              ? "border-green-200 bg-green-50"
              : week.status === "warning"
                ? "border-yellow-200 bg-yellow-50"
                : "border-red-200 bg-red-50";

          const statusIcon =
            week.status === "good"
              ? "✓"
              : week.status === "warning"
                ? "⚠️"
                : "❌";

          return (
            <Pressable
              key={index}
              onPress={() => {
                onWeekPress({
                  title: `Week ${weeklySummary.length - index} Activities`,
                  subtitle: `${new Date(week.weekStart).toLocaleDateString()} - ${new Date(week.weekEnd).toLocaleDateString()}`,
                  dateFrom: week.weekStart,
                  dateTo: week.weekEnd,
                });
              }}
              className={`p-4 rounded-lg border ${statusColor} active:opacity-70`}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-sm font-semibold text-gray-900">
                    Week {weeklySummary.length - index}
                  </Text>
                  <Text className="text-xs text-gray-600">
                    {new Date(week.weekStart).toLocaleDateString()} -{" "}
                    {new Date(week.weekEnd).toLocaleDateString()}
                  </Text>
                </View>
                <Text className="text-2xl">{statusIcon}</Text>
              </View>

              <View className="space-y-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-600">TSS</Text>
                  <Text className="text-sm font-medium text-gray-900">
                    {week.completedTSS} / {week.plannedTSS} (
                    {week.tssPercentage}%)
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-600">Activities</Text>
                  <Text className="text-sm font-medium text-gray-900">
                    {week.completedActivities} / {week.plannedActivities} (
                    {week.activityPercentage}%)
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
