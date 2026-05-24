import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

export interface InteractiveChartValueTrayItem {
  key: string;
  label: string;
  value: string;
  color?: string;
}

interface InteractiveChartValueTrayProps {
  items: InteractiveChartValueTrayItem[];
  testID?: string;
}

export function InteractiveChartValueTray({ items, testID }: InteractiveChartValueTrayProps) {
  if (items.length === 0) {
    return null;
  }

  const accessibilityLabel = items.map((item) => `${item.label}: ${item.value}`).join(", ");

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      className="mt-2 rounded-lg bg-muted p-2"
      testID={testID}
    >
      <View className="flex-row flex-wrap gap-3">
        {items.map((item) => (
          <View key={item.key} className="flex-row items-center gap-1">
            {item.color ? (
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            ) : null}
            <Text className="text-xs font-medium text-muted-foreground">{item.label}</Text>
            <Text className="text-xs font-semibold text-foreground">{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
