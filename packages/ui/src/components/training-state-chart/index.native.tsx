import { View } from "react-native";
import { Text } from "../text/index.native";
import type { TrainingStateLegendProps } from "./shared";
import { getTrainingStateMetric, getTrainingStateSourceLabel } from "./shared";

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

export * from "./shared";
export { TrainingStateLegend };
