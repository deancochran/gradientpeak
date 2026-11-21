import { View } from "react-native";
import { Text } from "../text/index.native";
import {
  getTrainingStateAccessibilityLabel,
  getTrainingStateMetric,
  getTrainingStateSourceLabel,
  type TrainingStateChartProps,
  type TrainingStateLegendProps,
  trainingStateHasValues,
} from "./shared";

function TrainingStateLegend({
  colors,
  metrics = ["fitness", "fatigue", "form"],
  sources,
  testId,
}: TrainingStateLegendProps) {
  return (
    <View
      accessibilityLabel="Training-state legend"
      className="flex-row flex-wrap gap-3"
      testID={testId}
    >
      {metrics.map((metric) => {
        const definition = getTrainingStateMetric(metric);
        return (
          <View className="flex-row items-center gap-1" key={definition.id}>
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors?.[metric] ?? definition.webColor }}
            />
            <Text className="text-xs text-muted-foreground">{definition.label}</Text>
          </View>
        );
      })}
      {sources?.map((source) => (
        <Text className="text-xs text-muted-foreground" key={source}>
          ━ {getTrainingStateSourceLabel(source)}
        </Text>
      ))}
    </View>
  );
}

/**
 * @repo/ui intentionally has no Victory dependency. This semantic shell keeps
 * accessibility and empty-state behavior shared while the app injects its
 * gesture/performance-sensitive native plot.
 */
function TrainingStateChart({
  children,
  className,
  description,
  emptyMessage,
  metric,
  source,
  testId,
  title,
  visual,
}: TrainingStateChartProps) {
  const hasValues = trainingStateHasValues(visual.points, metric, source);
  return (
    <View className={className} testID={testId}>
      {title ? (
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {title}
        </Text>
      ) : null}
      {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
      {hasValues ? (
        <View
          accessible
          accessibilityLabel={getTrainingStateAccessibilityLabel(visual, metric, source)}
          accessibilityRole="image"
          className="h-40 overflow-hidden rounded-2xl border border-border bg-card p-2"
        >
          {children}
        </View>
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </Text>
      )}
    </View>
  );
}

export * from "./shared";
export { TrainingStateChart, TrainingStateLegend };
