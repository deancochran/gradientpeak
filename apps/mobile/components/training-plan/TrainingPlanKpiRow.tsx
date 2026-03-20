import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";

type TrainingPlanKpiRowVariant = "compact" | "default";

interface TrainingPlanKpiItem {
  label: string;
  value: string;
}

interface TrainingPlanKpiRowProps {
  items: TrainingPlanKpiItem[];
  variant?: TrainingPlanKpiRowVariant;
}

const cardClassByVariant: Record<TrainingPlanKpiRowVariant, string> = {
  compact: "flex-1 bg-muted/50 rounded-lg p-2.5",
  default: "flex-1 bg-card border border-border rounded-lg p-3",
};

const labelClassByVariant: Record<TrainingPlanKpiRowVariant, string> = {
  compact: "text-xs text-muted-foreground mb-0.5",
  default: "text-xs text-muted-foreground mb-1",
};

const valueClassByVariant: Record<TrainingPlanKpiRowVariant, string> = {
  compact: "text-sm font-semibold",
  default: "text-lg font-bold",
};

export function TrainingPlanKpiRow({
  items,
  variant = "default",
}: TrainingPlanKpiRowProps) {
  return (
    <View className="flex-row gap-3">
      {items.map((item) => (
        <View key={item.label} className={cardClassByVariant[variant]}>
          <Text className={labelClassByVariant[variant]}>{item.label}</Text>
          <Text className={valueClassByVariant[variant]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}
