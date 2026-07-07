// apps/mobile/app/(internal)/(tabs)/trends/components/charts/WeeklyProgressChart.tsx

import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import { Bar, CartesianChart } from "victory-native";
import { formatEstimatedTss } from "@/lib/estimatedMetrics";

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

type WeeklyChartDatum = Record<string, unknown> & {
  index: number;
  completedTSS: number;
  label: string;
  status: WeeklyData["status"];
  weekStart: string;
};

export function WeeklyProgressChart({ data, height = 280 }: WeeklyProgressChartProps) {
  const recentData = useMemo(() => data?.slice(-8) ?? [], [data]);
  const chartData = useMemo<WeeklyChartDatum[]>(
    () =>
      recentData.map((week, index) => ({
        index,
        completedTSS: week.completedTSS,
        label: `W${recentData.length - index}`,
        status: week.status,
        weekStart: week.weekStart,
      })),
    [recentData],
  );
  const maxCompletedTss = useMemo(
    () => Math.max(1, ...chartData.map((week) => week.completedTSS)),
    [chartData],
  );

  if (!data || data.length === 0) {
    return (
      <View className="bg-card rounded-lg border border-border p-4" style={{ height }}>
        <Text className="text-base font-semibold text-foreground mb-2">Weekly Progress Chart</Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">No weekly data available</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">Weekly TSS Progress</Text>
      <Text className="text-xs text-muted-foreground mb-4">
        Completed Training Stress Score by week (last {recentData.length} weeks)
      </Text>

      <View style={{ height, marginVertical: 8 }}>
        <CartesianChart<WeeklyChartDatum, "index", "completedTSS">
          data={chartData}
          xKey="index"
          yKeys={["completedTSS"]}
          domain={{ y: [0, maxCompletedTss] }}
          domainPadding={{ left: 18, right: 18, top: 16 }}
          padding={{ left: 4, right: 4, top: 4, bottom: 4 }}
        >
          {({ points, chartBounds }) => (
            <>
              {chartData.map((week, index) => (
                <Bar
                  key={week.weekStart}
                  points={points.completedTSS.filter((_, pointIndex) => pointIndex === index)}
                  chartBounds={chartBounds}
                  color={weeklyStatusColor(week.status)}
                  roundedCorners={{ topLeft: 4, topRight: 4 }}
                />
              ))}
            </>
          )}
        </CartesianChart>
      </View>

      {/* Legend */}
      <View className="flex-row justify-center mt-2 space-x-4">
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-green-500 mr-1 rounded-sm" />
          <Text className="text-xs text-muted-foreground">Good</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-yellow-500 mr-1 rounded-sm" />
          <Text className="text-xs text-muted-foreground">Warning</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 bg-red-500 mr-1 rounded-sm" />
          <Text className="text-xs text-muted-foreground">Poor</Text>
        </View>
      </View>

      {/* Completion rate comparison */}
      <View className="mt-4 p-3 bg-muted rounded-lg">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium text-foreground">Weekly Completion Rates</Text>
        </View>
        <View className="space-y-1">
          {recentData.slice(-3).map((week, index) => (
            <View key={week.weekStart} className="flex-row items-center justify-between">
              <Text className="text-xs text-muted-foreground">
                Week {recentData.length - index}
              </Text>
              <View className="flex-row items-center">
                <View className="w-16 bg-background rounded-full h-2 mr-2">
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
                <Text className="text-xs font-medium text-foreground w-8">
                  {week.tssPercentage}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Summary stats */}
      <View className="flex-row justify-around mt-4 pt-3 border-t border-border">
        <View className="items-center">
          <Text className="text-xs text-muted-foreground">Avg Completion</Text>
          <Text className="text-sm font-semibold text-foreground">
            {Math.round(
              recentData.reduce((sum, d) => sum + d.tssPercentage, 0) / recentData.length,
            )}
            %
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-muted-foreground">Best Week</Text>
          <Text className="text-sm font-semibold text-green-600">
            {Math.max(...recentData.map((d) => d.tssPercentage))}%
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-muted-foreground">Total TSS</Text>
          <Text className="text-sm font-semibold text-foreground">
            {formatEstimatedTss(
              recentData.reduce((sum, d) => sum + d.completedTSS, 0),
              { includeUnit: false },
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

function weeklyStatusColor(status: WeeklyData["status"]) {
  switch (status) {
    case "good":
      return "#10b981";
    case "warning":
      return "#f59e0b";
    case "poor":
      return "#ef4444";
    default:
      return "#3b82f6";
  }
}
