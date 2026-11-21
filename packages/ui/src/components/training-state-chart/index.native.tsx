import { View } from "react-native";
import { CartesianChart, Line } from "victory-native";
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
              style={{ backgroundColor: colors?.[metric] ?? "#6b7280" }}
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
  className,
  colors,
  description,
  emptyMessage,
  metric,
  source,
  testId,
  title,
  visual,
}: TrainingStateChartProps) {
  const hasValues = visual.points.some((point) =>
    ["fitness", "fatigue", "form"].some(
      (selectedMetric) =>
        point.recorded[selectedMetric as typeof metric] !== null ||
        point.projected[selectedMetric as typeof metric] !== null,
    ),
  );
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
          accessibilityLabel={
            description ?? getTrainingStateAccessibilityLabel(visual, metric, source)
          }
          accessibilityRole="image"
          className="h-40 overflow-hidden rounded-2xl border border-border bg-card p-2"
        >
          <CartesianChart
            data={visual.points.map((point) => ({
              actualFatigue: point.recorded.fatigue,
              actualFitness: point.recorded.fitness,
              actualForm: point.recorded.form,
              index: point.index,
              projectedFatigue: point.projected.fatigue,
              projectedFitness: point.projected.fitness,
              projectedForm: point.projected.form,
            }))}
            domainPadding={{ bottom: 8, left: 8, right: 8, top: 8 }}
            frame={{ lineColor: "transparent", lineWidth: 0 }}
            xKey="index"
            yKeys={[
              "actualFitness",
              "actualFatigue",
              "actualForm",
              "projectedFitness",
              "projectedFatigue",
              "projectedForm",
            ]}
          >
            {({ points }) => (
              <>
                <Line
                  color={colors?.fitness ?? "#2563eb"}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualFitness}
                  strokeWidth={3}
                />
                <Line
                  color={colors?.fatigue ?? "#d97706"}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualFatigue}
                  strokeWidth={2.5}
                />
                <Line
                  color={colors?.form ?? "#7c3aed"}
                  connectMissingData={false}
                  curveType="natural"
                  points={points.actualForm}
                  strokeWidth={2}
                />
                <Line
                  color={colors?.fitness ?? "#2563eb"}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedFitness}
                  strokeWidth={3}
                />
                <Line
                  color={colors?.fatigue ?? "#d97706"}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedFatigue}
                  strokeWidth={2.5}
                />
                <Line
                  color={colors?.form ?? "#7c3aed"}
                  connectMissingData={false}
                  curveType="natural"
                  opacity={0.45}
                  points={points.projectedForm}
                  strokeWidth={2}
                />
              </>
            )}
          </CartesianChart>
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
