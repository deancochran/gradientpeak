import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Circle, Line, Polyline } from "react-native-svg";
import { useProductAnalytics } from "@/lib/analytics/productAnalytics";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import {
  formatPlanThresholdValue,
  type PlanGoalProgressResult,
  type PlanThresholdHistoryPoint,
  type PlanThresholdTrend,
} from "../training-path/planDashboardPresentation";
import { type PlanChartGeometry, ResponsivePlanChartShell } from "./ResponsivePlanChartShell";

function millis(date: string) {
  return parseDateKey(date.slice(0, 10)).getTime();
}

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function axisUnit(point: PlanThresholdHistoryPoint | undefined) {
  if (!point) return "Threshold value";
  if (point.unit === "watts") return "Power (W)";
  if (point.unit === "meters_per_second") return "Speed (m/s)";
  return readable(point.unit);
}

function axisValue(value: number, unit: string | undefined) {
  return unit === "meters_per_second" ? value.toFixed(2) : Math.round(value).toString();
}

export function PlanProgressInsight({
  deadlineDate,
  onOpenSourceActivity,
  progress,
  todayKey,
  trend,
  window,
}: {
  deadlineDate: string | null;
  onOpenSourceActivity: (activityId: string) => void;
  progress: PlanGoalProgressResult | null | undefined;
  todayKey: string;
  trend: PlanThresholdTrend | null;
  window: { end: string; start: string };
}) {
  const productAnalytics = useProductAnalytics();
  const { resolvedTheme } = useTheme();
  const theme = getPlanChartTheme(resolvedTheme);
  const visiblePoints = useMemo(
    () =>
      (trend?.points ?? []).filter((point) => {
        const date = point.effectiveAt.slice(0, 10);
        return date >= window.start && date <= window.end;
      }),
    [trend?.points, window.end, window.start],
  );
  const target = progress && progress.status !== "unsupported" ? progress.target.targetValue : null;
  const rawAchievement =
    progress && progress.status !== "unsupported" ? progress.target.achievementValue : null;
  const achievement =
    typeof rawAchievement === "number" && Number.isFinite(rawAchievement) ? rawAchievement : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    visiblePoints.find((point) => (point.thresholdId ?? point.effectiveAt) === selectedId) ??
    visiblePoints.at(-1) ??
    null;

  useEffect(() => {
    const latest = visiblePoints.at(-1);
    setSelectedId(latest ? (latest.thresholdId ?? latest.effectiveAt) : null);
  }, [visiblePoints]);

  const values = [
    ...visiblePoints.map((point) => point.value),
    ...(target === null ? [] : [target]),
    ...(achievement === null ? [] : [achievement]),
  ];
  const rawMinimum = values.length ? Math.min(...values) : 0;
  const rawMaximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max(1, (rawMaximum - rawMinimum) * 0.12);
  const minimum = Math.max(0, rawMinimum - padding);
  const maximum = rawMaximum + padding;
  const valueSpan = Math.max(1, maximum - minimum);
  const timeSpan = Math.max(1, millis(window.end) - millis(window.start));
  const positionForDate = (date: string) =>
    (millis(date.slice(0, 10)) - millis(window.start)) / timeSpan;
  const xForPoint = (point: PlanThresholdHistoryPoint, geometry: PlanChartGeometry) =>
    geometry.left + positionForDate(point.effectiveAt) * (geometry.right - geometry.left);
  const yForValue = (value: number, geometry: PlanChartGeometry) =>
    geometry.bottom - ((value - minimum) / valueSpan) * (geometry.bottom - geometry.top);
  const todayVisible = todayKey >= window.start && todayKey <= window.end;
  const deadlineVisible =
    deadlineDate !== null && deadlineDate >= window.start && deadlineDate <= window.end;
  const evidenceSummary =
    visiblePoints.length >= 2
      ? `${visiblePoints.length} connected comparable threshold assessments from ${window.start} to ${window.end}.`
      : "A performance trend requires two or more comparable threshold assessments.";
  const deadlineSummary = deadlineDate
    ? deadlineVisible
      ? `Goal deadline ${format(parseDateKey(deadlineDate), "MMM d, yyyy")} is in this evidence range.`
      : `Goal deadline ${format(parseDateKey(deadlineDate), "MMM d, yyyy")} is outside this evidence range.`
    : "No goal deadline is available.";
  const staleLabel =
    progress && progress.status !== "unsupported" && progress.current?.freshness === "stale"
      ? "Current threshold evidence is stale."
      : undefined;

  return (
    <View className="gap-3" testID="plan-progress-insight">
      <ResponsivePlanChartShell
        axisLabel={axisUnit(visiblePoints[0] ?? trend?.current)}
        emptyLabel="A performance trend requires two or more comparable threshold assessments."
        endLabel={window.end}
        goalColor={theme.target}
        goalLabel={
          deadlineVisible && deadlineDate
            ? `Goal deadline ${format(parseDateKey(deadlineDate), "MMM d, yyyy")}`
            : "Goal"
        }
        goalPosition={deadlineVisible && deadlineDate ? positionForDate(deadlineDate) : undefined}
        gridColor={theme.grid}
        legend={
          <>
            <Text className="text-xs text-foreground">● Calculated threshold</Text>
            {target === null ? null : (
              <Text className="text-xs text-foreground">
                — — Goal{" "}
                {formatPlanThresholdValue(
                  progress && progress.status !== "unsupported"
                    ? progress.target.activityCategory
                    : "bike",
                  target,
                )}
              </Text>
            )}
            {achievement === null || achievement === target ? null : (
              <Text className="text-xs text-foreground">
                ┄ Achievement threshold{" "}
                {formatPlanThresholdValue(
                  progress && progress.status !== "unsupported"
                    ? progress.target.activityCategory
                    : "bike",
                  achievement,
                )}
              </Text>
            )}
          </>
        }
        onNearestX={(x, geometry) => {
          const nearest = visiblePoints.reduce<PlanThresholdHistoryPoint | null>(
            (candidate, point) =>
              !candidate ||
              Math.abs(xForPoint(point, geometry) - x) <
                Math.abs(xForPoint(candidate, geometry) - x)
                ? point
                : candidate,
            null,
          );
          if (nearest) setSelectedId(nearest.thresholdId ?? nearest.effectiveAt);
        }}
        selectedLabel={
          selected ? formatPlanThresholdValue(selected.activityCategory, selected.value) : undefined
        }
        staleLabel={staleLabel}
        startLabel={window.start}
        state={visiblePoints.length ? "ready" : "empty"}
        summary={`${axisUnit(visiblePoints[0])}. ${evidenceSummary} ${deadlineSummary}`}
        testID="plan-progress-chart"
        todayColor={theme.marker}
        todayPosition={todayVisible ? positionForDate(todayKey) : undefined}
        yLabels={[
          axisValue(maximum, visiblePoints[0]?.unit ?? trend?.unit),
          axisValue((maximum + minimum) / 2, visiblePoints[0]?.unit ?? trend?.unit),
          axisValue(minimum, visiblePoints[0]?.unit ?? trend?.unit),
        ]}
      >
        {(geometry) => {
          const projected = visiblePoints.map((point) => ({
            point,
            x: xForPoint(point, geometry),
            y: yForValue(point.value, geometry),
          }));
          return (
            <>
              {target === null ? null : (
                <Line
                  stroke={theme.target}
                  strokeDasharray="7 5"
                  strokeWidth={2}
                  testID="plan-progress-goal-line"
                  x1={geometry.left}
                  x2={geometry.right}
                  y1={yForValue(target, geometry)}
                  y2={yForValue(target, geometry)}
                />
              )}
              {achievement === null || achievement === target ? null : (
                <Line
                  stroke={theme.target}
                  strokeDasharray="2 4"
                  strokeWidth={1.5}
                  testID="plan-progress-achievement-line"
                  x1={geometry.left}
                  x2={geometry.right}
                  y1={yForValue(achievement, geometry)}
                  y2={yForValue(achievement, geometry)}
                />
              )}
              {projected.length >= 2 ? (
                <Polyline
                  fill="none"
                  points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
                  stroke={theme.completed}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  testID="plan-progress-connected-line"
                />
              ) : null}
              {projected.map(({ point, x, y }) => {
                const isSelected = point === selected;
                return (
                  <Circle
                    cx={x}
                    cy={y}
                    fill={isSelected ? theme.muted : theme.completed}
                    key={point.thresholdId ?? point.effectiveAt}
                    r={isSelected ? 7 : 4}
                    stroke={theme.completed}
                    strokeWidth={isSelected ? 3 : 0}
                    testID={isSelected ? "plan-progress-selected-point" : undefined}
                  />
                );
              })}
            </>
          );
        }}
      </ResponsivePlanChartShell>
      <View className="flex-row flex-wrap gap-2" testID="plan-progress-evidence-selectors">
        {visiblePoints.map((point) => (
          <TouchableOpacity
            accessibilityLabel={`Select ${formatPlanThresholdValue(point.activityCategory, point.value)} threshold from ${format(new Date(point.effectiveAt), "MMMM d, yyyy")}`}
            accessibilityRole="button"
            accessibilityState={{ selected: point === selected }}
            className="min-h-11 justify-center rounded-xl border border-border px-3"
            key={point.thresholdId ?? point.effectiveAt}
            onPress={() => {
              productAnalytics.capture("plan.chart_engaged", { chart: "progress" });
              setSelectedId(point.thresholdId ?? point.effectiveAt);
            }}
            testID={`plan-progress-point-${point.effectiveAt.slice(0, 10)}`}
          >
            <Text className="text-xs font-medium text-foreground">
              {format(new Date(point.effectiveAt), "MMM d")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text className="text-sm text-muted-foreground" testID="plan-progress-summary">
        {evidenceSummary}
      </Text>
      {deadlineDate && !deadlineVisible ? (
        <Text className="text-sm text-muted-foreground" testID="plan-progress-deadline-summary">
          {deadlineSummary}
        </Text>
      ) : null}
      {selected ? (
        <View
          accessibilityLabel={`Selected threshold ${formatPlanThresholdValue(selected.activityCategory, selected.value)}, ${Math.round((selected.confidence ?? 0) * 100)} percent confidence`}
          className="gap-2 rounded-2xl border border-border bg-card p-4"
          testID="plan-progress-evidence-tray"
        >
          <Text accessibilityRole="header" className="font-semibold text-foreground">
            {formatPlanThresholdValue(selected.activityCategory, selected.value)} ·{" "}
            {format(new Date(selected.effectiveAt), "MMM d, yyyy")}
          </Text>
          <Text className="text-sm capitalize text-muted-foreground">
            {selected.method ? readable(selected.method) : "Calculated threshold"} ·{" "}
            {Math.round((selected.confidence ?? 0) * 100)}% confidence
          </Text>
          {(selected.sourceActivities ?? []).map((activity) => (
            <TouchableOpacity
              accessibilityLabel={`Open source activity ${activity.name}`}
              accessibilityRole="button"
              className="min-h-11 justify-center rounded-xl bg-muted/30 px-3"
              key={activity.id}
              onPress={() => onOpenSourceActivity(activity.id)}
              testID={`plan-progress-source-${activity.id}`}
            >
              <Text className="font-medium text-foreground">{activity.name}</Text>
              <Text className="text-xs text-muted-foreground">
                Source activity · {format(new Date(activity.finishedAt), "MMM d, yyyy")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
