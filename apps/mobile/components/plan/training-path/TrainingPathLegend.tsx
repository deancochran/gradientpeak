import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import type { TrainingPathRange } from "./trainingPathTypes";

export function TrainingPathLegend({
  mode = "weekly",
  range,
  showUnavailableLoad = false,
  variant = "full",
}: {
  mode?: "daily" | "weekly";
  range: TrainingPathRange;
  showUnavailableLoad?: boolean;
  variant?: "full" | "primary";
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const colors = {
    completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
    marker: isDark ? "#f8fafc" : "#020617",
    planned: isDark ? "rgba(59, 130, 246, 0.74)" : "rgba(37, 99, 235, 0.68)",
    projectedFitness: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
    selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
    target: isDark ? "rgba(148, 163, 184, 0.34)" : "rgba(100, 116, 139, 0.24)",
    targetFitness: isDark ? "rgba(248, 250, 252, 0.5)" : "rgba(15, 23, 42, 0.42)",
  };
  const unavailableItem = {
    label: "Completed, load unavailable",
    color: colors.completed,
    shape: "check",
  };
  const loadItems = [
    { label: "Completed", color: colors.completed, shape: "fill" },
    { label: "Planned", color: colors.planned, shape: "fill" },
    { label: "Target", color: colors.target, shape: "fill" },
  ];
  const pathItems = [
    { label: "Actual fitness", color: colors.completed, shape: "line" },
    { label: "Projected fitness", color: colors.projectedFitness, shape: "line" },
    { label: "Target fitness", color: colors.targetFitness, shape: "dotted" },
  ];
  const detailItems = [
    { label: "Today", color: colors.marker, shape: "today" },
    { label: "Goal", color: colors.marker, shape: "dotted" },
    { label: "Selected week", color: colors.selected, shape: "fill" },
  ];
  const dailyDetailItems = [{ label: "Selected day", color: colors.selected, shape: "fill" }];
  const primaryItems = [
    ...(range === "all" ? loadItems.slice(0, 1) : loadItems),
    ...(showUnavailableLoad ? [unavailableItem] : []),
  ];
  const fullItems = [
    ...(range === "all" ? loadItems.slice(0, 1) : loadItems),
    unavailableItem,
    ...pathItems,
    ...(mode === "daily" ? dailyDetailItems : detailItems),
  ];
  const items = variant === "primary" ? primaryItems : fullItems;

  return (
    <View
      className="flex-row flex-wrap gap-x-3 gap-y-1.5 px-1"
      testID={variant === "primary" ? "training-path-primary-legend" : "training-path-legend"}
    >
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View
            className={
              item.shape === "line"
                ? "h-0.5 w-4"
                : item.shape === "dotted"
                  ? "h-0 w-4 border-t-2"
                  : item.shape === "check"
                    ? "h-3 w-3 items-center justify-center"
                    : item.shape === "today"
                      ? "h-2.5 w-2.5 rounded-full"
                      : "h-2.5 w-2.5 rounded-sm"
            }
            style={{
              backgroundColor:
                item.shape === "check" || item.shape === "dotted" ? "transparent" : item.color,
              borderColor: item.color,
              borderStyle: item.shape === "dotted" ? "dotted" : "solid",
              borderWidth: 0,
            }}
          >
            {item.shape === "check" ? (
              <Text className="text-xs font-bold" style={{ color: item.color }}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text className="text-[11px] font-medium text-muted-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
