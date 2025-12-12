import { Text } from "@/components/ui/text";
import React from "react";
import { View } from "react-native";
import { CartesianChart, Bar } from "victory-native";
import { useFont } from "@shopify/react-native-skia";

export interface ZoneDistributionWeekData {
  weekStart: string;
  totalTSS: number;
  zones: {
    recovery: number; // percentage
    endurance: number;
    tempo: number;
    threshold: number;
    vo2max: number;
    anaerobic: number;
    neuromuscular: number;
  };
}

interface ZoneDistributionOverTimeChartProps {
  data: ZoneDistributionWeekData[];
  height?: number;
}

export function ZoneDistributionOverTimeChart({
  data,
  height = 350,
}: ZoneDistributionOverTimeChartProps) {
  const isEmpty = !data || data.length === 0;

  // Zone colors
  const zoneColors = {
    recovery: "#22c55e", // green
    endurance: "#3b82f6", // blue
    tempo: "#eab308", // yellow
    threshold: "#f97316", // orange
    vo2max: "#ef4444", // red
    anaerobic: "#dc2626", // dark red
    neuromuscular: "#991b1b", // darkest red
  };

  // Zone labels
  const zoneLabels = {
    recovery: "Recovery",
    endurance: "Endurance",
    tempo: "Tempo",
    threshold: "Threshold",
    vo2max: "VO2max",
    anaerobic: "Anaerobic",
    neuromuscular: "Neuro",
  };

  // Transform data for stacked bar chart
  const chartData = isEmpty
    ? []
    : data.map((week, index) => ({
        index,
        recovery: week.zones.recovery,
        endurance: week.zones.endurance,
        tempo: week.zones.tempo,
        threshold: week.zones.threshold,
        vo2max: week.zones.vo2max,
        anaerobic: week.zones.anaerobic,
        neuromuscular: week.zones.neuromuscular,
      }));

  // Calculate average distribution
  const avgDistribution = isEmpty
    ? {
        recovery: 0,
        endurance: 0,
        tempo: 0,
        threshold: 0,
        vo2max: 0,
        anaerobic: 0,
        neuromuscular: 0,
      }
    : {
        recovery:
          data.reduce((sum, w) => sum + w.zones.recovery, 0) / data.length,
        endurance:
          data.reduce((sum, w) => sum + w.zones.endurance, 0) / data.length,
        tempo: data.reduce((sum, w) => sum + w.zones.tempo, 0) / data.length,
        threshold:
          data.reduce((sum, w) => sum + w.zones.threshold, 0) / data.length,
        vo2max: data.reduce((sum, w) => sum + w.zones.vo2max, 0) / data.length,
        anaerobic:
          data.reduce((sum, w) => sum + w.zones.anaerobic, 0) / data.length,
        neuromuscular:
          data.reduce((sum, w) => sum + w.zones.neuromuscular, 0) / data.length,
      };

  const easyPercentage = avgDistribution.recovery + avgDistribution.endurance;
  const hardPercentage =
    avgDistribution.threshold +
    avgDistribution.vo2max +
    avgDistribution.anaerobic +
    avgDistribution.neuromuscular;

  return (
    <View className="rounded-lg border bg-card border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        Zone Distribution Over Time
      </Text>

      {/* Legend */}
      <View className="flex-row flex-wrap gap-2 mb-2">
        {Object.entries(zoneLabels).map(([key, label]) => (
          <View key={key} className="flex-row items-center gap-1">
            <View
              className="w-3 h-3 rounded"
              style={{
                backgroundColor: zoneColors[key as keyof typeof zoneColors],
              }}
            />
            <Text className="text-xs text-muted-foreground">{label}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: height - 150 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              No zone distribution data yet
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              Record activities with power or heart rate zones to see your
              training intensity distribution
            </Text>
          </View>
        ) : (
          <CartesianChart
            data={chartData}
            xKey="index"
            yKeys={[
              "recovery",
              "endurance",
              "tempo",
              "threshold",
              "vo2max",
              "anaerobic",
              "neuromuscular",
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                {/* Render stacked bars for each zone */}
                <Bar
                  points={points.recovery}
                  chartBounds={chartBounds}
                  color={zoneColors.recovery}
                />
                <Bar
                  points={points.endurance}
                  chartBounds={chartBounds}
                  color={zoneColors.endurance}
                />
                <Bar
                  points={points.tempo}
                  chartBounds={chartBounds}
                  color={zoneColors.tempo}
                />
                <Bar
                  points={points.threshold}
                  chartBounds={chartBounds}
                  color={zoneColors.threshold}
                />
                <Bar
                  points={points.vo2max}
                  chartBounds={chartBounds}
                  color={zoneColors.vo2max}
                />
                <Bar
                  points={points.anaerobic}
                  chartBounds={chartBounds}
                  color={zoneColors.anaerobic}
                />
                <Bar
                  points={points.neuromuscular}
                  chartBounds={chartBounds}
                  color={zoneColors.neuromuscular}
                />
              </>
            )}
          </CartesianChart>
        )}
      </View>

      {/* Summary stats */}
      {!isEmpty && (
        <View className="mt-2 pt-2 border-t border-border">
          <Text className="text-sm font-medium text-foreground mb-2">
            Average Distribution
          </Text>
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Easy Training
              </Text>
              <Text className="text-sm font-semibold text-green-600">
                {easyPercentage.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                (Recovery + Endurance)
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Moderate</Text>
              <Text className="text-sm font-semibold text-yellow-600">
                {avgDistribution.tempo.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                (Tempo)
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Hard Training
              </Text>
              <Text className="text-sm font-semibold text-red-600">
                {hardPercentage.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                (Threshold+)
              </Text>
            </View>
          </View>

          {/* Polarization assessment */}
          <View className="mt-3 p-2 bg-blue-50 rounded">
            <Text className="text-xs text-gray-700">
              {easyPercentage >= 70
                ? "✅ Good polarization: ~80% easy, 20% hard is ideal"
                : easyPercentage < 50
                  ? "⚠️ Too much hard training. Consider adding more easy volume."
                  : "💡 Moderate polarization. Consider shifting toward 80/20 split."}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
