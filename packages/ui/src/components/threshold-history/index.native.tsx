import { View } from "react-native";
import { Text } from "../text/index.native";
import {
  formatThresholdDate,
  formatThresholdValue,
  type ThresholdHistoryChartProps,
  thresholdMetricLabel,
} from "./shared";

function ThresholdHistoryChart({ emptyMessage, series, testId }: ThresholdHistoryChartProps) {
  if (!series.points.length) {
    return <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>;
  }
  const values = series.points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, Math.abs(maximum) * 0.05, 1);
  const latest = series.points.at(-1);
  return (
    <View
      accessible
      accessibilityLabel={`${thresholdMetricLabel(series.activityCategory, series.metric)} history with ${series.points.length} chronological records. Latest ${latest ? formatThresholdValue(latest.value, latest.unit, latest.activityCategory) : "unavailable"} on ${latest ? formatThresholdDate(latest.effectiveAt) : "unknown date"}.`}
      accessibilityRole="image"
      className="gap-2 rounded-xl border border-border bg-card p-3"
      testID={testId}
    >
      <View className="h-24 flex-row items-end gap-1">
        {series.points.map((point) => (
          <View
            accessibilityElementsHidden
            className="min-w-2 flex-1 rounded-t-sm bg-primary/70"
            importantForAccessibility="no-hide-descendants"
            key={point.thresholdId}
            style={{ height: 12 + ((point.value - minimum) / span) * 76 }}
            testID={`threshold-history-point-${point.thresholdId}`}
          />
        ))}
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
