import { Text } from "@repo/ui/components/text";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Pie, PolarChart } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import {
  type DurationCompositionPresentation,
  formatDurationSeconds,
} from "./planningLedgerPresentation";

type Category = DurationCompositionPresentation["categories"][number];
type ChartCategory = Category & { color: string; value: number };

function groupedCategories(categories: Category[], colors: string[]): ChartCategory[] {
  const useCompletedDuration = categories.some((category) => (category.completedDuration ?? 0) > 0);
  const ranked = categories
    .map((category) => ({
      ...category,
      value: useCompletedDuration
        ? (category.completedDuration ?? 0)
        : (category.plannedDuration ?? 0),
    }))
    .filter((category) => category.value > 0)
    .sort((left, right) => right.value - left.value);
  const visible = ranked.slice(0, 4);
  const overflow = ranked.slice(4);
  if (overflow.length) {
    const completedDuration = overflow.reduce(
      (total, category) => total + (category.completedDuration ?? 0),
      0,
    );
    const plannedDuration = overflow.reduce(
      (total, category) => total + (category.plannedDuration ?? 0),
      0,
    );
    visible.push({
      activityCategory: "other",
      completedDuration,
      completedLabel: formatDurationSeconds(completedDuration),
      label: "Other",
      plannedDuration,
      plannedLabel: formatDurationSeconds(plannedDuration),
      value: useCompletedDuration ? completedDuration : plannedDuration,
    });
  }
  return visible.map((category, index) => ({
    ...category,
    color: colors[index % colors.length] ?? "#888",
  }));
}

export function TrainingCompositionSummary({
  composition,
}: {
  composition: DurationCompositionPresentation;
}) {
  const { resolvedTheme } = useTheme();
  const theme = getPlanChartTheme(resolvedTheme);
  const categories = useMemo(
    () =>
      groupedCategories(composition.categories, [
        theme.chart1,
        theme.chart2,
        theme.chart3,
        theme.chart4,
        theme.chart5,
      ]),
    [composition.categories, theme.chart1, theme.chart2, theme.chart3, theme.chart4, theme.chart5],
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    categories[0]?.activityCategory ?? null,
  );
  const selected =
    categories.find((category) => category.activityCategory === selectedCategory) ?? categories[0];
  const activeCategory = selected?.activityCategory ?? null;

  if (!categories.length) {
    return (
      <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
        Duration composition is unavailable for this period.
      </Text>
    );
  }

  return (
    <View className="gap-3" testID="training-composition-summary">
      <View className="flex-row gap-5">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs text-muted-foreground">Completed duration</Text>
          <Text className="text-xl font-bold text-foreground">{composition.completedLabel}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-xs text-muted-foreground">Planned duration</Text>
          <Text className="text-xl font-bold text-foreground">{composition.plannedLabel}</Text>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel="Duration composition donut chart. Select a category below for details."
        accessibilityRole="image"
        className="h-48"
        testID="training-composition-duration-donut"
      >
        <PolarChart data={categories} labelKey="label" valueKey="value" colorKey="color">
          <Pie.Chart innerRadius="55%" />
        </PolarChart>
      </View>
      <View className="gap-1.5">
        {categories.map((category) => {
          const selected = category.activityCategory === activeCategory;
          return (
            <Pressable
              accessibilityLabel={`${category.label}. Completed ${category.completedLabel}. Planned ${category.plannedLabel}.`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="min-h-11 flex-row items-center gap-2 rounded-lg px-2"
              key={category.activityCategory}
              onPress={() => setSelectedCategory(category.activityCategory)}
              style={{ backgroundColor: selected ? theme.muted : "transparent" }}
              testID={`training-composition-${category.activityCategory}`}
            >
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <Text className="flex-1 text-sm font-medium text-foreground">{category.label}</Text>
              <Text className="text-xs text-muted-foreground">
                {category.completedLabel} · {category.plannedLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <View
          accessible
          accessibilityLabel={`Selected ${selected.label}. Completed ${selected.completedLabel}. Planned ${selected.plannedLabel}.`}
          className="rounded-xl bg-muted/20 px-3 py-2"
          testID="training-composition-selected-category"
        >
          <Text className="text-sm font-semibold text-foreground">{selected.label}</Text>
          <Text className="text-xs text-muted-foreground">
            {selected.completedLabel} completed · {selected.plannedLabel} planned
          </Text>
        </View>
      ) : null}
      {composition.sessionsLabel || composition.activeDaysLabel ? (
        <Text className="text-xs text-muted-foreground">
          {[composition.sessionsLabel, composition.activeDaysLabel].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}
