import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "./planChartTheme";

type LegendItem = {
  color: string;
  label: string;
  shape: "fill" | "line";
};

export function TrainingPathLegend({ mode = "daily" }: { mode?: "daily" | "weekly" }) {
  const { resolvedTheme } = useTheme();
  const colors = getPlanChartTheme(resolvedTheme);
  const workloadItems: LegendItem[] = [
    { label: "Completed", color: colors.completedLoad, shape: "fill" },
    { label: "Planned", color: colors.plannedLoad, shape: "fill" },
  ];
  const stateItems: LegendItem[] =
    mode === "weekly"
      ? [
          { label: "Current fitness", color: colors.completed, shape: "line" },
          {
            label: "Planned fitness projection",
            color: colors.projectedFitness,
            shape: "line",
          },
        ]
      : [
          { label: "Fitness", color: colors.fitness, shape: "line" },
          { label: "Fatigue", color: colors.fatigue, shape: "line" },
          { label: "Form", color: colors.form, shape: "line" },
        ];

  return (
    <View className="gap-2 px-1" testID="training-path-legend">
      <LegendGroup items={workloadItems} label="Workload" />
      <LegendGroup items={stateItems} label="Training state" />
    </View>
  );
}

function LegendGroup({ items, label }: { items: LegendItem[]; label: string }) {
  return (
    <View className="gap-1">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1.5">
        {items.map((item) => (
          <View key={item.label} className="flex-row items-center gap-1.5">
            <View
              className={item.shape === "fill" ? "h-2.5 w-2.5 rounded-sm" : "h-0 w-4 border-t-2"}
              style={{
                backgroundColor: item.shape === "fill" ? item.color : "transparent",
                borderColor: item.color,
                borderStyle: "solid",
              }}
            />
            <Text className="text-[11px] font-medium text-muted-foreground">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
