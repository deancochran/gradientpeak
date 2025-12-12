import { EmptyStateCard, TrendsOverviewSkeleton } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { Activity } from "lucide-react-native";
import React, { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import {
  PerformanceTrendsChart,
  type PerformanceDataPoint,
} from "../../app/(internal)/(tabs)/trends/components/charts";

interface PerformanceTabProps {
  performanceData: {
    dataPoints: PerformanceDataPoint[];
  } | null;
  performanceLoading: boolean;
  timeRange: string;
}

export function PerformanceTab({
  performanceData,
  performanceLoading,
  timeRange,
}: PerformanceTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<
    "speed" | "power" | "heartrate"
  >("speed");

  if (performanceLoading) {
    return <TrendsOverviewSkeleton />;
  }

  const dataPoints = performanceData?.dataPoints ?? [];

  // Check which metrics are available
  const hasSpeed = dataPoints.some((d) => d.avgSpeed !== null);
  const hasPower = dataPoints.some((d) => d.avgPower !== null);
  const hasHeartRate = dataPoints.some((d) => d.avgHeartRate !== null);

  // Auto-select first available metric
  React.useEffect(() => {
    if (selectedMetric === "speed" && !hasSpeed && hasPower) {
      setSelectedMetric("power");
    } else if (
      selectedMetric === "speed" &&
      !hasSpeed &&
      !hasPower &&
      hasHeartRate
    ) {
      setSelectedMetric("heartrate");
    }
  }, [hasSpeed, hasPower, hasHeartRate]);

  return (
    <View className="space-y-4">
      {/* Metric Selector */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-sm font-medium text-foreground mb-2">
          Select Metric
        </Text>
        <View className="flex-row gap-2">
          {hasSpeed && (
            <TouchableOpacity
              onPress={() => setSelectedMetric("speed")}
              className={`flex-1 py-2 px-3 rounded ${
                selectedMetric === "speed" ? "bg-blue-500" : "bg-muted"
              }`}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  selectedMetric === "speed"
                    ? "text-white"
                    : "text-muted-foreground"
                }`}
              >
                Speed
              </Text>
            </TouchableOpacity>
          )}
          {hasPower && (
            <TouchableOpacity
              onPress={() => setSelectedMetric("power")}
              className={`flex-1 py-2 px-3 rounded ${
                selectedMetric === "power" ? "bg-purple-500" : "bg-muted"
              }`}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  selectedMetric === "power"
                    ? "text-white"
                    : "text-muted-foreground"
                }`}
              >
                Power
              </Text>
            </TouchableOpacity>
          )}
          {hasHeartRate && (
            <TouchableOpacity
              onPress={() => setSelectedMetric("heartrate")}
              className={`flex-1 py-2 px-3 rounded ${
                selectedMetric === "heartrate" ? "bg-red-500" : "bg-muted"
              }`}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  selectedMetric === "heartrate"
                    ? "text-white"
                    : "text-muted-foreground"
                }`}
              >
                Heart Rate
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Performance Chart */}
      <PerformanceTrendsChart
        data={dataPoints}
        metric={selectedMetric}
        height={300}
        showTrendline={true}
      />

      {/* Best Performances */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Top 5 Activities ({timeRange})
        </Text>

        {/* Sort by selected metric */}
        {dataPoints
          .filter((d) => {
            switch (selectedMetric) {
              case "speed":
                return d.avgSpeed !== null;
              case "power":
                return d.avgPower !== null;
              case "heartrate":
                return d.avgHeartRate !== null;
            }
          })
          .sort((a, b) => {
            let aValue = 0;
            let bValue = 0;
            switch (selectedMetric) {
              case "speed":
                aValue = a.avgSpeed || 0;
                bValue = b.avgSpeed || 0;
                break;
              case "power":
                aValue = a.avgPower || 0;
                bValue = b.avgPower || 0;
                break;
              case "heartrate":
                aValue = a.avgHeartRate || 0;
                bValue = b.avgHeartRate || 0;
                break;
            }
            return bValue - aValue;
          })
          .slice(0, 5)
          .map((activity, index) => {
            let value = "";
            switch (selectedMetric) {
              case "speed":
                value = `${((activity.avgSpeed || 0) * 3.6).toFixed(1)} km/h`;
                break;
              case "power":
                value = `${activity.avgPower} W`;
                break;
              case "heartrate":
                value = `${activity.avgHeartRate} bpm`;
                break;
            }

            const date = new Date(activity.date).toLocaleDateString();

            return (
              <View key={activity.activityId}>
                <View className="flex-row items-center justify-between py-2">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      {index + 1}. {activity.activityName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {date}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-foreground">
                    {value}
                  </Text>
                </View>
                {index < 4 && <View className="h-px bg-border" />}
              </View>
            );
          })}
      </View>
    </View>
  );
}
