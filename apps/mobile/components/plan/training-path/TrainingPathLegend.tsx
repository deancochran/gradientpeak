import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import type { TrainingPathRange } from "./trainingPathTypes";

type LegendItem = {
  color: string;
  label: string;
  shape: "fill" | "line";
};

export function TrainingPathLegend({
  showUnavailableLoad = false,
  variant = "full",
}: {
  mode?: "daily" | "weekly";
  range: TrainingPathRange;
  /** Compatibility-only; Plan legends always describe rendered factual layers. */
  showTargetFitness?: boolean;
  /** Compatibility-only; Plan legends always describe rendered factual layers. */
  showTargetLoad?: boolean;
  showUnavailableLoad?: boolean;
  variant?: "full" | "primary";
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const colors = {
    completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
    fatigue: isDark ? "rgba(251, 146, 60, 0.95)" : "rgba(234, 88, 12, 0.95)",
    planned: isDark ? "rgba(59, 130, 246, 0.74)" : "rgba(37, 99, 235, 0.68)",
    plannedProjection: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
    plannedFatigue: isDark ? "rgba(251, 191, 36, 0.95)" : "rgba(217, 119, 6, 0.95)",
  };
  const workloadItems: LegendItem[] = [
    { label: "Completed", color: colors.completed, shape: "fill" },
    { label: "Planned", color: colors.planned, shape: "fill" },
  ];
  const stateItems: LegendItem[] = [
    { label: "Actual fitness", color: colors.completed, shape: "line" },
    { label: "Planned fitness projection", color: colors.plannedProjection, shape: "line" },
    { label: "Actual fatigue", color: colors.fatigue, shape: "line" },
    { label: "Planned fatigue projection", color: colors.plannedFatigue, shape: "line" },
  ];

  return (
    <View
      className="gap-2 px-1"
      testID={variant === "primary" ? "training-path-primary-legend" : "training-path-legend"}
    >
      <LegendGroup items={workloadItems} label="Workload" />
      <LegendGroup items={stateItems} label="Training state" />
      {showUnavailableLoad ? (
        <Text className="text-[10px] text-muted-foreground">
          A check marker means an activity was completed but its Common Load could not be
          calculated.
        </Text>
      ) : null}
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
