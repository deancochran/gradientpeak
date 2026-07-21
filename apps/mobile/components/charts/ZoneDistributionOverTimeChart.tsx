import { getIntensityZoneColor } from "@repo/core/constants";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import { CartesianChart, StackedBar } from "victory-native";

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

const zoneKeys = [
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
  "neuromuscular",
] as const;

type ZoneKey = (typeof zoneKeys)[number];

type ZoneChartDatum = Record<string, unknown> &
  Record<ZoneKey, number> & {
    index: number;
  };

const zoneColors: Record<ZoneKey, string> = {
  recovery: getIntensityZoneColor("RECOVERY"),
  endurance: getIntensityZoneColor("ENDURANCE"),
  tempo: getIntensityZoneColor("TEMPO"),
  threshold: getIntensityZoneColor("THRESHOLD"),
  vo2max: getIntensityZoneColor("VO2MAX"),
  anaerobic: getIntensityZoneColor("ANAEROBIC"),
  neuromuscular: getIntensityZoneColor("NEUROMUSCULAR"),
};

const zoneLabels: Record<ZoneKey, string> = {
  recovery: "Recovery",
  endurance: "Endurance",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO2max",
  anaerobic: "Anaerobic",
  neuromuscular: "Neuro",
};

const emptyDistribution: Record<ZoneKey, number> = {
  recovery: 0,
  endurance: 0,
  tempo: 0,
  threshold: 0,
  vo2max: 0,
  anaerobic: 0,
  neuromuscular: 0,
};

export function ZoneDistributionOverTimeChart({
  data,
  height = 350,
}: ZoneDistributionOverTimeChartProps) {
  const isEmpty = !data || data.length === 0;

  // Transform data for stacked bar chart
  const chartData = useMemo<ZoneChartDatum[]>(
    () =>
      isEmpty
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
          })),
    [data, isEmpty],
  );

  // Calculate average distribution
  const avgDistribution = useMemo<Record<ZoneKey, number>>(() => {
    if (isEmpty) return emptyDistribution;

    const distribution = { ...emptyDistribution };
    for (const zone of zoneKeys) {
      distribution[zone] = data.reduce((sum, week) => sum + week.zones[zone], 0) / data.length;
    }
    return distribution;
  }, [data, isEmpty]);

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
        {zoneKeys.map((key) => (
          <View key={key} className="flex-row items-center gap-1">
            <View
              className="w-3 h-3 rounded"
              style={{
                backgroundColor: zoneColors[key],
              }}
            />
            <Text className="text-xs text-muted-foreground">{zoneLabels[key]}</Text>
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
              Record activities with power or heart rate zones to see your training intensity
              distribution
            </Text>
          </View>
        ) : (
          <CartesianChart<ZoneChartDatum, "index", ZoneKey>
            data={chartData}
            xKey="index"
            yKeys={[...zoneKeys]}
            domain={{ y: [0, 100] }}
            domainPadding={{ left: 12, right: 12, top: 2, bottom: 0 }}
            padding={{ left: 4, right: 4, top: 4, bottom: 4 }}
          >
            {({ points, chartBounds }) => (
              <StackedBar
                points={zoneKeys.map((zone) => points[zone])}
                chartBounds={chartBounds}
                colors={zoneKeys.map((zone) => zoneColors[zone])}
                innerPadding={0.24}
                animate={{ type: "timing", duration: 220 }}
                barOptions={({ isTop }) => ({
                  roundedCorners: isTop ? { topLeft: 4, topRight: 4 } : undefined,
                })}
              />
            )}
          </CartesianChart>
        )}
      </View>

      {/* Summary stats */}
      {!isEmpty && (
        <View className="mt-2 pt-2 border-t border-border">
          <Text className="text-sm font-medium text-foreground mb-2">Average Distribution</Text>
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Easy Training</Text>
              <Text className="text-sm font-semibold text-green-600">
                {easyPercentage.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">(Recovery + Endurance)</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Moderate</Text>
              <Text className="text-sm font-semibold text-yellow-600">
                {avgDistribution.tempo.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">(Tempo)</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Hard Training</Text>
              <Text className="text-sm font-semibold text-red-600">
                {hardPercentage.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">(Threshold+)</Text>
            </View>
          </View>

          {/* Polarization assessment */}
          <View className="mt-3 rounded bg-blue-50 p-2 dark:bg-blue-950/30">
            <Text className="text-xs text-blue-900 dark:text-blue-100">
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
