import { Text } from "@/components/ui/text";
import React from "react";
import { View } from "react-native";
import { CartesianChart, Line } from "victory-native";

export interface PerformanceDataPoint {
  date: string;
  activityId: string;
  activityName: string;
  avgSpeed: number | null; // m/s
  avgPower: number | null; // watts
  avgHeartRate: number | null; // bpm
  distance: number; // meters
  duration: number; // seconds
}

interface PerformanceTrendsChartProps {
  data: PerformanceDataPoint[];
  metric: "speed" | "power" | "heartrate";
  height?: number;
  showTrendline?: boolean;
}

export function PerformanceTrendsChart({
  data,
  metric,
  height = 300,
  showTrendline = true,
}: PerformanceTrendsChartProps) {
  // Filter data based on metric availability
  const filteredData =
    data && data.length > 0
      ? data.filter((point) => {
          switch (metric) {
            case "speed":
              return point.avgSpeed !== null && point.avgSpeed > 0;
            case "power":
              return point.avgPower !== null && point.avgPower > 0;
            case "heartrate":
              return point.avgHeartRate !== null && point.avgHeartRate > 0;
            default:
              return false;
          }
        })
      : [];

  const isEmpty = filteredData.length === 0;

  // Convert data for victory-native
  const chartData = filteredData.map((point, index) => {
    let value = 0;
    switch (metric) {
      case "speed":
        value = (point.avgSpeed || 0) * 3.6; // Convert m/s to km/h
        break;
      case "power":
        value = point.avgPower || 0;
        break;
      case "heartrate":
        value = point.avgHeartRate || 0;
        break;
    }

    return {
      index,
      value,
      label: point.activityName,
    };
  });

  // Get metric info
  const metricInfo = getMetricInfo(metric);

  // Calculate stats
  const values = chartData.map((d) => d.value);
  const avgValue = isEmpty
    ? 0
    : values.reduce((sum, v) => sum + v, 0) / values.length;
  const maxValue = isEmpty ? 0 : Math.max(...values);

  // Calculate improvement (first 20% vs last 20%)
  const improvement = isEmpty ? 0 : calculateImprovement(values);

  return (
    <View className="rounded-lg border bg-card border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        {metricInfo.title} Trends
      </Text>

      <View className="flex-row items-center gap-4 mb-2">
        <View className="flex-row items-center gap-1">
          <View className={`w-3 h-3 rounded ${metricInfo.color}`} />
          <Text className="text-xs text-muted-foreground">
            {metricInfo.label}
          </Text>
        </View>
      </View>

      <View style={{ height: height - 100 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              No {metric} data yet
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              Record activities with{" "}
              {metric === "heartrate" ? "heart rate" : metric} data to see your
              performance trends
            </Text>
          </View>
        ) : (
          <CartesianChart data={chartData} xKey="index" yKeys={["value"]}>
            {({ points }) => (
              <Line
                points={points.value}
                color={metricInfo.strokeColor}
                strokeWidth={2}
              />
            )}
          </CartesianChart>
        )}
      </View>

      {/* Summary stats */}
      {!isEmpty && (
        <View className="flex-row justify-around mt-2 pt-2 border-t border-border">
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Average</Text>
            <Text className="text-sm font-semibold text-foreground">
              {avgValue.toFixed(1)} {metricInfo.displayUnit}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Best</Text>
            <Text className="text-sm font-semibold text-foreground">
              {maxValue.toFixed(1)} {metricInfo.displayUnit}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Change</Text>
            <Text
              className={`text-sm font-semibold ${improvement >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {improvement >= 0 ? "+" : ""}
              {improvement.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Helper functions
function calculateImprovement(values: number[]) {
  if (values.length < 2) return 0;

  // Compare first 20% to last 20%
  const sampleSize = Math.max(1, Math.floor(values.length * 0.2));
  const firstSample = values.slice(0, sampleSize);
  const lastSample = values.slice(-sampleSize);

  const firstAvg =
    firstSample.reduce((sum, v) => sum + v, 0) / firstSample.length;
  const lastAvg = lastSample.reduce((sum, v) => sum + v, 0) / lastSample.length;

  return ((lastAvg - firstAvg) / firstAvg) * 100;
}

function getMetricInfo(metric: "speed" | "power" | "heartrate") {
  switch (metric) {
    case "speed":
      return {
        title: "Speed",
        label: "Avg Speed",
        unit: "Speed",
        displayUnit: "km/h",
        color: "bg-blue-500",
        strokeColor: "#3b82f6",
      };
    case "power":
      return {
        title: "Power",
        label: "Avg Power",
        unit: "Power (W)",
        displayUnit: "W",
        color: "bg-purple-500",
        strokeColor: "#a855f7",
      };
    case "heartrate":
      return {
        title: "Heart Rate",
        label: "Avg HR",
        unit: "HR (bpm)",
        displayUnit: "bpm",
        color: "bg-red-500",
        strokeColor: "#ef4444",
      };
  }
}
