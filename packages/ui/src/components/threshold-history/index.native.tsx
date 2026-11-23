import { View } from "react-native";
import { CartesianChart, Line, Scatter } from "victory-native";
import { Text } from "../text/index.native";
import {
  buildThresholdHistoryChartData,
  formatThresholdDate,
  formatThresholdValue,
  type ThresholdHistoryChartProps,
  thresholdMetricLabel,
} from "./shared";

function ThresholdHistoryChart({ emptyMessage, series, testId }: ThresholdHistoryChartProps) {
  if (!series.points.length) {
    return <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>;
  }
  const latest = series.points.at(-1);
  const data = [...buildThresholdHistoryChartData(series.points)];
  return (
    <View
      accessible
      accessibilityLabel={`${thresholdMetricLabel(series.activityCategory, series.metric)} history with ${series.points.length} chronological records. Latest ${latest ? formatThresholdValue(latest.value, latest.unit, latest.activityCategory) : "unavailable"} on ${latest ? formatThresholdDate(latest.effectiveAt) : "unknown date"}.`}
      accessibilityRole="image"
      className="gap-2 rounded-xl border border-border bg-card p-3"
      testID={testId}
    >
      <View className="h-24">
        <CartesianChart
          data={data}
          domainPadding={{ bottom: 8, left: 8, right: 8, top: 8 }}
          frame={{ lineColor: "transparent", lineWidth: 0 }}
          xKey="timestamp"
          yKeys={["value"]}
        >
          {({ points }) => (
            <>
              <Line
                color="#2563eb"
                connectMissingData={false}
                points={points.value}
                strokeWidth={3}
              />
              <Scatter color="#2563eb" points={points.value} radius={2.5} />
            </>
          )}
        </CartesianChart>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">
          {formatThresholdDate(series.points[0]?.effectiveAt ?? "")}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {latest ? formatThresholdDate(latest.effectiveAt) : ""}
        </Text>
      </View>
    </View>
  );
}

export * from "./shared";
export { ThresholdHistoryChart };
