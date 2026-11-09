import { Text } from "@repo/ui/components/text";
import { useCallback, useState } from "react";
import type {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
} from "react-native";
import { Pressable, View } from "react-native";
import { BarGroup, CartesianChart } from "victory-native";
import { InteractiveChartValueTray } from "@/components/charts/InteractiveChartValueTray";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import { ConsistencyStrip } from "./ConsistencyStrip";
import type { LedgerDayPresentation } from "./planningLedgerPresentation";

type LoadDatum = Record<string, unknown> & {
  completed: number | null;
  index: number;
  planned: number | null;
};
type LoadKey = "completed" | "planned";

const CHART_SIDE_PADDING = 12;

export function WeeklyLoadChart({
  days,
  onSelectDate,
  selectedDate,
}: {
  days: LedgerDayPresentation[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const colors = getPlanChartTheme(resolvedTheme);
  const [chartWidth, setChartWidth] = useState(320);
  const selectedIndex = Math.max(
    0,
    days.findIndex((day) => day.date === selectedDate),
  );
  const selectedDay = days[selectedIndex] ?? null;
  const chartData: LoadDatum[] = days.map((day, index) => ({
    completed: day.completed,
    index,
    planned: day.planned,
  }));
  const selectIndex = useCallback(
    (index: number) => {
      const day = days[Math.max(0, Math.min(days.length - 1, index))];
      if (day) onSelectDate(day.date);
    },
    [days, onSelectDate],
  );
  const selectAtPosition = (event: GestureResponderEvent) => {
    const usableWidth = Math.max(1, chartWidth - CHART_SIDE_PADDING * 2);
    const ratio = Math.max(
      0,
      Math.min(1, (event.nativeEvent.locationX - CHART_SIDE_PADDING) / usableWidth),
    );
    selectIndex(Math.round(ratio * Math.max(0, days.length - 1)));
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") selectIndex(selectedIndex + 1);
    if (event.nativeEvent.actionName === "decrement") selectIndex(selectedIndex - 1);
  };
  const onChartLayout = (event: LayoutChangeEvent) => {
    setChartWidth(event.nativeEvent.layout.width);
  };
  const summary = days.length
    ? `Weekly load chart. ${days.map((day) => day.accessibilityLabel).join(" ")}`
    : "Weekly load chart has no daily values.";

  if (!days.length) {
    return <Text className="text-sm text-muted-foreground">No daily records are available.</Text>;
  }

  return (
    <View className="gap-3" testID="planning-ledger-weekly-chart">
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.completed }} />
          <Text className="text-xs text-muted-foreground">Completed</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.planned }} />
          <Text className="text-xs text-muted-foreground">Planned</Text>
        </View>
      </View>

      <View
        className="h-44 overflow-hidden rounded-2xl border border-border bg-card p-2"
        onLayout={onChartLayout}
      >
        <CartesianChart<LoadDatum, "index", LoadKey>
          data={chartData}
          domainPadding={{ bottom: 0, left: CHART_SIDE_PADDING, right: CHART_SIDE_PADDING, top: 8 }}
          frame={{ lineColor: colors.frame, lineWidth: { bottom: 1, left: 0, right: 0, top: 0 } }}
          xKey="index"
          yKeys={["planned", "completed"]}
        >
          {({ chartBounds, points }) => (
            <BarGroup
              barCount={days.length}
              betweenGroupPadding={0.35}
              chartBounds={chartBounds}
              roundedCorners={{ topLeft: 3, topRight: 3 }}
              withinGroupPadding={0.18}
            >
              <BarGroup.Bar color={colors.planned} points={points.planned} />
              <BarGroup.Bar color={colors.completed} points={points.completed} />
            </BarGroup>
          )}
        </CartesianChart>
        <Pressable
          accessibilityActions={[
            { label: "Next day", name: "increment" },
            { label: "Previous day", name: "decrement" },
          ]}
          accessibilityLabel={`${summary} Select a day in the weekly load chart. Selected ${selectedDay?.dateLabel ?? "none"}.`}
          accessibilityRole="adjustable"
          className="absolute inset-0"
          onAccessibilityAction={onAccessibilityAction}
          onPress={selectAtPosition}
          testID="planning-ledger-weekly-chart-interaction"
        />
      </View>

      <ConsistencyStrip days={days} onSelectDate={onSelectDate} selectedDate={selectedDate} />

      {selectedDay ? (
        <InteractiveChartValueTray
          items={[
            { key: "day", label: "Day", value: selectedDay.dateLabel },
            {
              color: colors.completed,
              key: "completed",
              label: "Completed",
              value: selectedDay.completedLabel,
            },
            {
              color: colors.planned,
              key: "planned",
              label: "Planned",
              value: selectedDay.plannedLabel,
            },
            { key: "duration", label: "Duration", value: selectedDay.durationLabel },
            { key: "intensity", label: "Intensity", value: selectedDay.intensityLabel },
          ]}
          testID="planning-ledger-selected-day-values"
        />
      ) : null}
    </View>
  );
}
