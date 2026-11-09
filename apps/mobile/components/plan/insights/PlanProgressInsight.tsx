import {
  diffDateOnlyUtcDays,
  formatDateOnlyInTimeZone,
  isValidDateOnlyUtc,
} from "@repo/core/calendar";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
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

export function formatGoalTimeLeft(deadlineDate: string | null, todayDate: string) {
  if (!deadlineDate || !isValidDateOnlyUtc(deadlineDate) || !isValidDateOnlyUtc(todayDate))
    return "Unavailable";
  const days = diffDateOnlyUtcDays(todayDate, deadlineDate);
  if (days === 0) return "Due today";
  const duration = `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  return days < 0 ? `${duration} overdue` : `${duration} left`;
}

function evidenceDate(instant: string, timezone?: string) {
  if (timezone === undefined) return instant.slice(0, 10);
  try {
    return formatDateOnlyInTimeZone(new Date(instant), timezone);
  } catch {
    return new Date(instant).toISOString().slice(0, 10);
  }
}

function evidenceLabelDate(instant: string, timezone?: string) {
  // Existing callers use device-local labels but UTC-sliced chart dates.
  return timezone === undefined ? new Date(instant) : parseDateKey(evidenceDate(instant, timezone));
}

export function formatGoalGap(
  progress: Exclude<PlanGoalProgressResult, { status: "unsupported" }>,
) {
  if (progress.metrics.remainingGap === null) return "Unavailable";
  if (progress.target.unit === "watts") return `${Math.round(progress.metrics.remainingGap)} W`;
  if (!progress.current) return "Unavailable";
  const distance = progress.target.activityCategory === "swim" ? 100 : 1000;
  const seconds =
    progress.metrics.remainingGap === 0
      ? 0
      : Math.max(
          0,
          distance / progress.current.value - distance / progress.target.achievementValue,
        );
  return `${Math.round(seconds)} s/${distance === 100 ? "100m" : "km"}`;
}

export function PlanProgressInsight({
  deadlineDate,
  onOpenSourceActivity,
  progress,
  showGoalSummary = false,
  todayKey,
  trend,
  window,
  planningTimezone,
}: {
  deadlineDate: string | null;
  onOpenSourceActivity: (activityId: string) => void;
  progress: PlanGoalProgressResult | null | undefined;
  showGoalSummary?: boolean;
  todayKey: string;
  trend: PlanThresholdTrend | null;
  window: { end: string; start: string };
  planningTimezone?: string;
}) {
  const productAnalytics = useProductAnalytics();
  const { resolvedTheme } = useTheme();
  const theme = getPlanChartTheme(resolvedTheme);
  const visiblePoints = useMemo(
    () =>
      (trend?.points ?? []).filter((point) => {
        const date = evidenceDate(point.effectiveAt, planningTimezone);
        return (
          date >= window.start &&
          date <= window.end &&
          (!showGoalSummary ||
            !progress ||
            progress.status === "unsupported" ||
            !progress.assessedAt ||
            Date.parse(point.effectiveAt) <= Date.parse(progress.assessedAt))
        );
      }),
    [trend?.points, window.end, window.start, showGoalSummary, progress, planningTimezone],
  );
  const evidenceSegments = useMemo(() => {
    const segments: PlanThresholdHistoryPoint[][] = [];
    for (const point of visiblePoints) {
      const segment = segments.at(-1);
      const previous = segment?.at(-1);
      if (
        !segment ||
        previous?.method !== point.method ||
        previous?.policyVersion !== point.policyVersion
      ) {
        segments.push([point]);
      } else {
        segment.push(point);
      }
    }
    return segments;
  }, [visiblePoints]);
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
    geometry.left +
    positionForDate(evidenceDate(point.effectiveAt, planningTimezone)) *
      (geometry.right - geometry.left);
  const yForValue = (value: number, geometry: PlanChartGeometry) =>
    geometry.bottom - ((value - minimum) / valueSpan) * (geometry.bottom - geometry.top);
  const todayVisible = todayKey >= window.start && todayKey <= window.end;
  const deadlineVisible =
    deadlineDate !== null && deadlineDate >= window.start && deadlineDate <= window.end;
  const evidenceSummary =
    visiblePoints.length >= 2
      ? `${visiblePoints.length} threshold assessments from ${window.start} to ${window.end}.`
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
      {showGoalSummary && progress && progress.status !== "unsupported" ? (
        <View className="flex-row flex-wrap gap-4 border-b border-border pb-4">
          {[
            [
              "Current",
              progress.current
                ? formatPlanThresholdValue(progress.target.activityCategory, progress.current.value)
                : "Unavailable",
            ],
            [
              "Target",
              formatPlanThresholdValue(
                progress.target.activityCategory,
                progress.target.targetValue,
              ),
            ],
            [
              progress.target.unit === "watts" ? "Remaining gap" : "Pace gap to achievement",
              formatGoalGap(progress),
            ],
            ["Time left", formatGoalTimeLeft(deadlineDate, todayKey)],
          ].map(([label, value]) => (
            <View className="min-w-[40%] flex-1 gap-1" key={label}>
              <Text className="text-xs text-muted-foreground">{label}</Text>
              <Text className="text-xl font-semibold text-foreground">{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
        {...(deadlineVisible && deadlineDate
          ? { goalPosition: positionForDate(deadlineDate) }
          : {})}
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
        {...(selected
          ? { selectedLabel: formatPlanThresholdValue(selected.activityCategory, selected.value) }
          : {})}
        {...(staleLabel ? { staleLabel } : {})}
        startLabel={window.start}
        state={visiblePoints.length ? "ready" : "empty"}
        summary={`${axisUnit(visiblePoints[0])}. ${evidenceSummary} ${deadlineSummary}`}
        testID="plan-progress-chart"
        todayColor={theme.marker}
        {...(todayVisible ? { todayPosition: positionForDate(todayKey) } : {})}
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
              {evidenceSegments
                .filter((segment) => segment.length >= 2)
                .map((segment) => (
                  <Polyline
                    key={segment[0]?.thresholdId ?? segment[0]?.effectiveAt}
                    fill="none"
                    points={segment
                      .map(
                        (point) =>
                          `${xForPoint(point, geometry)},${yForValue(point.value, geometry)}`,
                      )
                      .join(" ")}
                    stroke={theme.completed}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    testID="plan-progress-connected-line"
                  />
                ))}
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
                    {...(isSelected ? { testID: "plan-progress-selected-point" } : {})}
                  />
                );
              })}
            </>
          );
        }}
      </ResponsivePlanChartShell>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        testID="plan-progress-evidence-selectors"
      >
        <View className="flex-row gap-2">
          {visiblePoints.map((point) => (
            <TouchableOpacity
              accessibilityLabel={`Select ${formatPlanThresholdValue(point.activityCategory, point.value)} threshold from ${format(evidenceLabelDate(point.effectiveAt, planningTimezone), "MMMM d, yyyy")}`}
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
                {format(evidenceLabelDate(point.effectiveAt, planningTimezone), "MMM d")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
          accessibilityLabel={`Selected threshold ${formatPlanThresholdValue(selected.activityCategory, selected.value)}, ${selected.confidence == null ? "confidence unknown" : `${Math.round(selected.confidence * 100)} percent confidence`}`}
          className="gap-2 rounded-2xl border border-border bg-card p-4"
          testID="plan-progress-evidence-tray"
        >
          <Text accessibilityRole="header" className="font-semibold text-foreground">
            {formatPlanThresholdValue(selected.activityCategory, selected.value)} ·{" "}
            {format(evidenceLabelDate(selected.effectiveAt, planningTimezone), "MMM d, yyyy")}
          </Text>
          <Text className="text-sm capitalize text-muted-foreground">
            {selected.method ? readable(selected.method) : "Calculated threshold"} ·{" "}
            {selected.confidence == null
              ? "Confidence unknown"
              : `${Math.round(selected.confidence * 100)}% confidence`}
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
                Source activity ·{" "}
                {format(evidenceLabelDate(activity.finishedAt, planningTimezone), "MMM d, yyyy")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
