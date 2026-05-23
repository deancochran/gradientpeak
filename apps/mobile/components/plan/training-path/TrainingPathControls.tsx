import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import type { TrainingPathRange } from "./trainingPathTypes";
import { trainingPathRangeOptions } from "./trainingPathUtils";

type TrainingPathControlsProps = {
  range: TrainingPathRange;
  onRangeChange: (range: TrainingPathRange) => void;
};

export function TrainingPathControls({ range, onRangeChange }: TrainingPathControlsProps) {
  return (
    <View testID="training-path-controls">
      <View className="flex-row gap-1 rounded-full border border-border bg-background p-1">
        {trainingPathRangeOptions.map((option) => {
          const isSelected = option.value === range;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              activeOpacity={0.85}
              className={`rounded-full px-2 py-1.5 ${isSelected ? "bg-primary" : "bg-transparent"}`}
              onPress={() => onRangeChange(option.value)}
              testID={`training-path-range-${option.value}`}
            >
              <Text
                className={`text-[10px] font-semibold ${
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
