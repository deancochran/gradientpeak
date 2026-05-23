import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import type { TrainingPathRange } from "./trainingPathTypes";

const loadItems = [
  { label: "Completed", color: "rgba(22, 163, 74, 0.86)", shape: "fill" },
  { label: "Planned", color: "rgba(37, 99, 235, 0.68)", shape: "fill" },
  { label: "Ideal Load", color: "rgba(100, 116, 139, 0.24)", shape: "fill" },
];

const pathItems = [
  { label: "Fitness Trend", color: "rgba(22, 163, 74, 0.95)", shape: "line" },
  { label: "Scheduled Fitness", color: "rgba(37, 99, 235, 0.95)", shape: "line" },
  { label: "Ideal Fitness", color: "rgba(15, 23, 42, 0.42)", shape: "line" },
  { label: "Today", color: "#020617", shape: "line" },
  { label: "Goal", color: "#020617", shape: "line" },
  { label: "Selected week", color: "rgba(15, 23, 42, 0.08)", shape: "fill" },
];

export function TrainingPathLegend({ range }: { range: TrainingPathRange }) {
  const items = range === "all" ? [loadItems[0], ...pathItems] : [...loadItems, ...pathItems];

  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1.5" testID="training-path-legend">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View
            className={item.shape === "line" ? "h-0.5 w-4" : "h-2.5 w-2.5 rounded-sm"}
            style={{
              backgroundColor: item.shape === "outline" ? "transparent" : item.color,
              borderColor: item.color,
              borderWidth: item.shape === "outline" ? 1 : 0,
            }}
          />
          <Text className="text-[10px] font-medium text-muted-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
