import { Text } from "@/components/ui/text";
import React from "react";
import { View } from "react-native";
import { CartesianChart, Bar, Line } from "victory-native";

export interface VolumeDataPoint {
  date: string;
  totalDistance: number; // in meters
  totalTime: number; // in seconds
  activityCount: number;
}

interface VolumeTrendsChartProps {
  data: VolumeDataPoint[];
  height?: number;
  showDistance?: boolean;
  showTime?: boolean;
  showCount?: boolean;
}

export function VolumeTrendsChart({
  data,
  height = 300,
  showDistance = true,
  showTime = true,
  showCount = true,
}: VolumeTrendsChartProps) {
  // // Load font for axes (optional - can be omitted for basic chart)
  // const font = useFont(require("@/assets/fonts/Inter-Regular.ttf"), 12);

  // Transform data for chart - convert to numbers for x-axis
  // If no data, use empty array to show skeleton chart
  const chartData =
    data && data.length > 0
      ? data.map((point, index) => ({
          index,
          distance: point.totalDistance / 1000, // Convert to km
          time: point.totalTime / 3600, // Convert to hours
          count: point.activityCount,
          label: point.date,
        }))
      : [];

  const isEmpty = !data || data.length === 0;

  return (
    <View className="rounded-lg border bg-card border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        Volume Trends
      </Text>

      <View className="flex-row items-center gap-4 mb-2">
        {showDistance && (
          <View className="flex-row items-center gap-1">
            <View className="w-3 h-3 rounded bg-blue-500" />
            <Text className="text-xs text-muted-foreground">Distance (km)</Text>
          </View>
        )}
        {showTime && (
          <View className="flex-row items-center gap-1">
            <View className="w-3 h-3 rounded bg-green-500" />
            <Text className="text-xs text-muted-foreground">Time (h)</Text>
          </View>
        )}
        {showCount && (
          <View className="flex-row items-center gap-1">
            <View className="w-3 h-3 rounded bg-orange-500" />
            <Text className="text-xs text-muted-foreground">Activities</Text>
          </View>
        )}
      </View>

      <View style={{ height: height - 100 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              No volume data yet
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              Record activities to see your distance, time, and activity count
              trends
            </Text>
          </View>
        ) : (
          <CartesianChart
            data={chartData}
            xKey="index"
            yKeys={["distance", "time", "count"]}
          >
            {({ points, chartBounds }) => (
              <>
                {showDistance && (
                  <Bar
                    points={points.distance}
                    chartBounds={chartBounds}
                    color="#3b82f6"
                    barWidth={8}
                    roundedCorners={{ topLeft: 4, topRight: 4 }}
                  />
                )}
                {showTime && (
                  <Bar
                    points={points.time}
                    chartBounds={chartBounds}
                    color="#22c55e"
                    barWidth={8}
                    roundedCorners={{ topLeft: 4, topRight: 4 }}
                  />
                )}
                {showCount && (
                  <Line points={points.count} color="#f97316" strokeWidth={2} />
                )}
              </>
            )}
          </CartesianChart>
        )}
      </View>

      {/* Summary stats */}
      {!isEmpty && (
        <View className="flex-row justify-around mt-2 pt-2 border-t border-border">
          {showDistance && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Total Distance
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {(
                  data.reduce((sum, d) => sum + d.totalDistance, 0) / 1000
                ).toFixed(1)}{" "}
                km
              </Text>
            </View>
          )}
          {showTime && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Total Time</Text>
              <Text className="text-sm font-semibold text-foreground">
                {(data.reduce((sum, d) => sum + d.totalTime, 0) / 3600).toFixed(
                  1,
                )}{" "}
                h
              </Text>
            </View>
          )}
          {showCount && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Activities</Text>
              <Text className="text-sm font-semibold text-foreground">
                {data.reduce((sum, d) => sum + d.activityCount, 0)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
