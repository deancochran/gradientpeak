// apps/mobile/app/(internal)/(tabs)/trends/components/charts/WeeklyProgressChart.tsx

import { Text } from "@/components/ui/text";
import { Dimensions, View } from "react-native";
import { BarChart } from "react-native-chart-kit";

export interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  plannedTSS: number;
  completedTSS: number;
  tssPercentage: number;
  status: "good" | "warning" | "poor";
}

export interface WeeklyProgressChartProps {
  data: WeeklyData[];
  height?: number;
}

export function WeeklyProgressChart({
  data,
  height = 280,
}: WeeklyProgressChartProps) {
  const screenWidth = Dimensions.get("window").width;

  if (!data || data.length === 0) {
    return (
      <View
        className="bg-white rounded-lg border border-gray-200 p-4"
        style={{ height }}
      >
        <Text className="text-base font-semibold text-gray-900 mb-2">
          Weekly Progress Chart
        </Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">No weekly data available</Text>
        </View>
      </View>
    );
  }

  // Show last 8 weeks for better readability
  const recentData = data.slice(-8);

  // Prepare chart data
  const chartData = {
    labels: recentData.map((_, index) => `W${recentData.length - index}`),
    datasets: [
      {
        data: recentData.map((week) => week.completedTSS),
        colors: recentData.map((week) => (opacity = 1) => {
          switch (week.status) {
            case "good":
              return `rgba(16, 185, 129, ${opacity})`;
            case "warning":
              return `rgba(245, 158, 11, ${opacity})`;
            case "poor":
              return `rgba(239, 68, 68, ${opacity})`;
            default:
              return `rgba(59, 130, 246, ${opacity})`;
          }
        }),
      },
    ],
  };

  const chartConfig = {
    backgroundColor: "#ffffff",
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: 8,
    },
    propsForBackgroundLines: {
      strokeDasharray: "",
      stroke: "#f3f4f6",
      strokeWidth: 1,
    },
    barPercentage: 0.7,
  };

  return (
    <View className="bg-white rounded-lg border border-gray-200 p-4">
      <Text className="text-base font-semibold text-gray-900 mb-2">
        Weekly TSS Progress
      </Text>
      <Text className="text-xs text-gray-500 mb-4">
        Completed Training Stress Score by week (last {recentData.length} weeks)
      </Text>

      <BarChart
        data={chartData}
        width={screenWidth - 64}
        height={height}
        chartConfig={chartConfig}
        style={{
          marginVertical: 8,
          borderRadius: 8,
        }}
        showBarTops={false}
        withHorizontalLabels={true}
        withVerticalLabels={true}
        fromZero={true}
        yAxisLabel=""
        yAxisSuffix=""
      />

      {/* Legend */}
      <View className="flex-row justify-center mt-2 space-x-4">
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-green-500 mr-1 rounded-sm" />
          <Text className="text-xs text-gray-600">Good</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-yellow-500 mr-1 rounded-sm" />
          <Text className="text-xs text-gray-600">Warning</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-red-500 mr-1 rounded-sm" />
          <Text className="text-xs text-gray-600">Poor</Text>
        </View>
      </View>

      {/* Completion rate comparison */}
      <View className="mt-4 p-3 bg-gray-50 rounded-lg">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium text-gray-900">
            Weekly Completion Rates
          </Text>
        </View>
        <View className="space-y-1">
          {recentData.slice(-3).map((week, index) => (
            <View key={index} className="flex-row items-center justify-between">
              <Text className="text-xs text-gray-600">
                Week {recentData.length - index}
              </Text>
              <View className="flex-row items-center">
                <View className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                  <View
                    className={`h-2 rounded-full ${
                      week.status === "good"
                        ? "bg-green-500"
                        : week.status === "warning"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(100, week.tssPercentage)}%`,
                    }}
                  />
                </View>
                <Text className="text-xs font-medium text-gray-900 w-8">
                  {week.tssPercentage}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Summary stats */}
      <View className="flex-row justify-around mt-4 pt-3 border-t border-gray-100">
        <View className="items-center">
          <Text className="text-xs text-gray-500">Avg Completion</Text>
          <Text className="text-sm font-semibold text-gray-900">
            {Math.round(
              recentData.reduce((sum, d) => sum + d.tssPercentage, 0) /
                recentData.length,
            )}
            %
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-gray-500">Best Week</Text>
          <Text className="text-sm font-semibold text-green-600">
            {Math.max(...recentData.map((d) => d.tssPercentage))}%
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-gray-500">Total TSS</Text>
          <Text className="text-sm font-semibold text-gray-900">
            {recentData.reduce((sum, d) => sum + d.completedTSS, 0)}
          </Text>
        </View>
      </View>
    </View>
  );
}
