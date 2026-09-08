import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { TouchableOpacity, View } from "react-native";
import { G, Line, Polyline, Rect } from "react-native-svg";
import { useProductAnalytics } from "@/lib/analytics/productAnalytics";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { useTheme } from "@/lib/stores/theme-store";
import type { DailyTrainingAdjustmentPoint } from "../training-path/DailyTrainingAdjustmentChart";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import type { PlanTrainingMetric } from "../training-path/planDashboardPresentation";
import { ResponsivePlanChartShell } from "./ResponsivePlanChartShell";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function actualValue(point: DailyTrainingAdjustmentPoint, metric: PlanTrainingMetric) {
  if (metric === "fitness") return point.fitnessCtl ?? null;
  if (metric === "fatigue") return point.actualFatigueAtl ?? null;
  if (metric === "form") return point.formTsb ?? null;
  return point.effectiveCompletedLoad ?? point.completedLoad ?? null;
}

function projectedValue(point: DailyTrainingAdjustmentPoint, metric: PlanTrainingMetric) {
  if (metric === "fitness") return point.scheduledFitnessCtl ?? null;
  if (metric === "fatigue") return point.scheduledFatigueAtl ?? null;
  if (metric === "form") return point.scheduledFormTsb ?? point.recommendedFormTsb ?? null;
  return null;
}

function plannedLoad(point: DailyTrainingAdjustmentPoint) {
  return point.plannedLoad ?? null;
}

function display(value: number | null | undefined) {
  return finite(value) ? Math.round(value).toString() : "—";
}

function displayActual(point: DailyTrainingAdjustmentPoint, metric: PlanTrainingMetric) {
  return display(actualValue(point, metric));
}

function lineSegments(
  values: readonly (number | null)[],
  xForIndex: (index: number) => number,
  yForValue: (value: number) => number,
) {
  const segments: string[][] = [];
  let segment: string[] = [];
  values.forEach((value, index) => {
    if (finite(value)) segment.push(`${xForIndex(index)},${yForValue(value)}`);
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  });
  if (segment.length) segments.push(segment);
  return segments;
}

const labels: Record<PlanTrainingMetric, string> = {
  fatigue: "Fatigue",
  fitness: "Fitness",
  form: "Form",
  load: "Load",
};

export function PlanTrainingInsight({
  goalDate,
  metric,
  onAdd,
  onNextSelectedDate,
  onOpenDetails,
  onPreviousSelectedDate,
  onSelectDate,
  points,
  selectedDate,
  todayKey,
  window,
}: {
  goalDate: string | null;
  metric: PlanTrainingMetric;
  onAdd: (date: string) => void;
  onNextSelectedDate: () => void;
  onOpenDetails: (date: string) => void;
  onPreviousSelectedDate: () => void;
  onSelectDate?: (date: string) => void;
  points: readonly DailyTrainingAdjustmentPoint[];
  selectedDate: string;
  todayKey: string;
  window: { end: string; start: string };
}) {
  const productAnalytics = useProductAnalytics();
  const { resolvedTheme } = useTheme();
  const theme = getPlanChartTheme(resolvedTheme);
  const visible = points.filter((point) => point.date >= window.start && point.date <= window.end);
  const selected =
    visible.find((point) => point.date === selectedDate) ??
    points.find((point) => point.date === selectedDate) ??
    visible[0] ??
    null;
  const values = visible.flatMap((point) => {
    const observed = actualValue(point, metric);
    const projected = metric === "load" ? null : projectedValue(point, metric);
    const planned = metric === "load" ? plannedLoad(point) : null;
    return [observed, projected, planned].filter(finite);
  });
  const minimum = metric === "form" && values.length ? Math.min(0, ...values) : 0;
  const maximum = values.length ? Math.max(1, ...values) : 1;
  const span = Math.max(1, maximum - minimum);
  const todayIndex = visible.findIndex((point) => point.date === todayKey);
  const goalIndex = goalDate ? visible.findIndex((point) => point.date === goalDate) : -1;
  const positionForIndex = (index: number) =>
    visible.length <= 1 ? 0.5 : index / (visible.length - 1);
  const chartSummary = `${labels[metric]} chart from ${window.start} to ${window.end}. ${
    metric === "load"
      ? "Completed is solid and planned is outlined."
      : "Observed values are solid. Scheduled or recommended values are dashed. Missing values remain gaps."
  }`;

  return (
    <View className="gap-3" testID={`plan-training-${metric}-insight`}>
      <ResponsivePlanChartShell
        axisLabel={labels[metric]}
        emptyLabel="No training values are available in this range."
        endLabel={window.end}
        goalColor={theme.target}
        goalPosition={goalIndex >= 0 ? positionForIndex(goalIndex) : undefined}
        gridColor={theme.grid}
        legend={
          metric === "load" ? (
            <>
              <Text className="text-xs text-foreground">■ Completed Load</Text>
              <Text className="text-xs text-foreground">□ Planned Load</Text>
            </>
          ) : (
            <>
              <Text className="text-xs text-foreground">━ Observed {labels[metric]}</Text>
              <Text className="text-xs text-foreground">
                ┄ Scheduled / recommended {labels[metric]}
              </Text>
            </>
          )
        }
        onNearestX={(x, geometry) => {
          if (!visible.length) return;
          const ratio = (x - geometry.left) / Math.max(1, geometry.right - geometry.left);
          const index = Math.round(Math.max(0, Math.min(1, ratio)) * (visible.length - 1));
          const nearest = visible[index];
          if (nearest) {
            productAnalytics.capture("plan.chart_engaged", { chart: "training" });
            onSelectDate?.(nearest.date);
          }
        }}
        selectedLabel={selected ? format(parseDateKey(selected.date), "MMM d, yyyy") : undefined}
        startLabel={window.start}
        state={visible.length && values.length ? "ready" : "empty"}
        summary={chartSummary}
        testID="plan-training-chart"
        todayColor={theme.marker}
        todayPosition={todayIndex >= 0 ? positionForIndex(todayIndex) : undefined}
        yLabels={[
          Math.round(maximum).toString(),
          Math.round((maximum + minimum) / 2).toString(),
          Math.round(minimum).toString(),
        ]}
      >
        {(geometry) => {
          const slot = visible.length ? (geometry.right - geometry.left) / visible.length : 1;
          const xForIndex = (index: number) =>
            visible.length <= 1
              ? (geometry.left + geometry.right) / 2
              : geometry.left + positionForIndex(index) * (geometry.right - geometry.left);
          const yForValue = (value: number) =>
            geometry.bottom - ((value - minimum) / span) * (geometry.bottom - geometry.top);
          const observedSegments = lineSegments(
            visible.map((point) => actualValue(point, metric)),
            xForIndex,
            yForValue,
          );
          const projectedSegments = lineSegments(
            visible.map((point) => projectedValue(point, metric)),
            xForIndex,
            yForValue,
          );
          const selectedIndex = selected
            ? visible.findIndex((point) => point.date === selected.date)
            : -1;
          return (
            <>
              {metric === "load" ? (
                visible.map((point, index) => {
                  const completed = actualValue(point, "load");
                  const planned = plannedLoad(point);
                  const barWidth = Math.max(1.5, Math.min(10, slot * 0.34));
                  return (
                    <G key={point.date}>
                      {finite(planned) && planned > 0 ? (
                        <Rect
                          fill="none"
                          height={geometry.bottom - yForValue(planned)}
                          stroke={theme.plannedLoad}
                          strokeWidth={1.5}
                          width={barWidth}
                          x={xForIndex(index) - barWidth}
                          y={yForValue(planned)}
                        />
                      ) : null}
                      {finite(completed) && completed > 0 ? (
                        <Rect
                          fill={theme.completedLoad}
                          height={geometry.bottom - yForValue(completed)}
                          opacity={1}
                          width={barWidth}
                          x={xForIndex(index) + 1}
                          y={yForValue(completed)}
                        />
                      ) : null}
                    </G>
                  );
                })
              ) : (
                <>
                  {observedSegments.map((segment, index) =>
                    segment.length >= 2 ? (
                      <Polyline
                        fill="none"
                        key={`observed-${segment[0]}`}
                        points={segment.join(" ")}
                        stroke={theme.completed}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        testID={`plan-training-actual-${metric}-${index}`}
                      />
                    ) : null,
                  )}
                  {projectedSegments.map((segment, index) =>
                    segment.length >= 2 ? (
                      <Polyline
                        fill="none"
                        key={`projected-${segment[0]}`}
                        points={segment.join(" ")}
                        stroke={theme.planned}
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        testID={`plan-training-scheduled-${metric}-${index}`}
                      />
                    ) : null,
                  )}
                </>
              )}
              {selectedIndex >= 0 ? (
                <Line
                  stroke={theme.selectedMarker}
                  strokeWidth={3}
                  testID="plan-training-selected-marker"
                  x1={xForIndex(selectedIndex)}
                  x2={xForIndex(selectedIndex)}
                  y1={geometry.bottom + 3}
                  y2={geometry.bottom + 10}
                />
              ) : null}
            </>
          );
        }}
      </ResponsivePlanChartShell>
      {selected ? (
        <View
          accessibilityLabel={`Selected ${format(parseDateKey(selected.date), "MMMM d, yyyy")}. Completed Load ${displayActual(selected, "load")}. Planned Load ${display(plannedLoad(selected))}.`}
          className="gap-3 rounded-2xl border border-border bg-card p-4"
          testID="plan-selected-date-tray"
        >
          <View className="flex-row items-center justify-between gap-2">
            <TouchableOpacity
              accessibilityLabel="Select previous day"
              accessibilityRole="button"
              className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border px-3"
              onPress={onPreviousSelectedDate}
              testID="plan-selected-date-previous"
            >
              <Text className="font-semibold text-foreground">Previous day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Select next day"
              accessibilityRole="button"
              className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border px-3"
              onPress={onNextSelectedDate}
              testID="plan-selected-date-next"
            >
              <Text className="font-semibold text-foreground">Next day</Text>
            </TouchableOpacity>
          </View>
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-semibold text-foreground">
              {format(parseDateKey(selected.date), "EEEE, MMMM d")}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Completed Load {displayActual(selected, "load")} · Planned Load{" "}
              {display(plannedLoad(selected))}
            </Text>
            {metric === "load" ? null : (
              <Text className="text-sm text-muted-foreground">
                Observed {labels[metric]} {displayActual(selected, metric)} · Scheduled /
                recommended {labels[metric]} {display(projectedValue(selected, metric))}
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
              onPress={() => onAdd(selected.date)}
              testID="plan-selected-date-add"
            >
              <Text className="font-semibold text-foreground">Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={`Open training breakdown for ${selected.date}`}
              accessibilityRole="button"
              className="min-h-11 items-center justify-center rounded-xl bg-primary px-3"
              onPress={() => onOpenDetails(selected.date)}
              testID="plan-selected-date-training-breakdown"
            >
              <Text className="font-semibold text-primary-foreground">Training breakdown</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
