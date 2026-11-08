import type { ProfileGoal } from "@repo/core";
import {
  formatRecordedHistoryValue,
  type RecordedHistoryChart,
  recordedHistoryChartTitle,
} from "@repo/core/goals/recorded-history-visuals";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { buildChartSegments, getPaddedChartDomain } from "@repo/ui/lib/chart";
import { format } from "date-fns";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { useTheme } from "@/lib/stores/theme-store";
import { formatGoalTimeLeft } from "../plan/insights/PlanProgressInsight";
import { getPlanChartTheme } from "../plan/training-path/planChartTheme";
import { useRecordedGoalHistory } from "./useRecordedGoalHistory";

export function RecordedGoalHistory({
  goal,
  timezone,
  onOpenActivity,
}: {
  goal: ProfileGoal;
  timezone: string | null | undefined;
  onOpenActivity: (id: string) => void;
}) {
  const history = useRecordedGoalHistory(goal, timezone);
  return (
    <Card className="rounded-3xl border border-border bg-card" testID="goal-recorded-history">
      <CardContent className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          Recorded history
        </Text>
        <Text className="text-xs text-muted-foreground">
          Last 12 calendar weeks · single-category activities
        </Text>
        {history.state === "timezone" ? (
          <Text>Recorded history needs your planning timezone.</Text>
        ) : (
          <>
            {history.window ? (
              <Text className="text-sm text-muted-foreground">
                Time left: {formatGoalTimeLeft(goal.target_date, history.window.today)}
              </Text>
            ) : null}
            {history.state === "loading" ? (
              <Text accessibilityRole="text">Loading recorded history…</Text>
            ) : null}
            {history.state === "error" || history.state === "partial" ? (
              <View className="gap-2">
                <Text accessibilityRole="alert">
                  {history.state === "error"
                    ? "Recorded history could not be loaded."
                    : "Partial history — some activities may be missing (maximum 1,000 records)."}
                </Text>
                <Pressable accessibilityRole="button" onPress={history.retry} className="py-2">
                  <Text className="font-semibold text-primary">Retry history</Text>
                </Pressable>
              </View>
            ) : null}
            {history.visuals && history.hasPages ? (
              <>
                {history.visuals.targetDistanceMeters !== null ? (
                  <Text className="text-xs text-muted-foreground">
                    Within 1% of{" "}
                    {formatRecordedHistoryValue(history.visuals.targetDistanceMeters, "meters")}
                  </Text>
                ) : null}
                {history.visuals.targetWeeks !== null ? (
                  <Text className="text-xs text-muted-foreground">
                    Target duration: {history.visuals.targetWeeks} weeks
                  </Text>
                ) : null}
                {history.visuals.charts.map((chart) => (
                  <RecordedChart
                    key={chart.id}
                    chart={chart}
                    complete={history.visuals?.complete ?? false}
                    onOpenActivity={onOpenActivity}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecordedChart({
  chart,
  complete,
  onOpenActivity,
}: {
  chart: RecordedHistoryChart;
  complete: boolean;
  onOpenActivity: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [width, setWidth] = useState(300);
  const { resolvedTheme } = useTheme();
  const theme = getPlanChartTheme(resolvedTheme);
  const selected = chart.points.find((point) => point.id === selectedId) ?? chart.points.at(-1);
  const values = chart.points.map((point) => point.value);
  const domain =
    chart.id === "sessions"
      ? {
          min: 0,
          max: Math.ceil(
            Math.max(1, chart.target ?? 0, ...values.map((value) => value ?? 0)) * 1.15,
          ),
        }
      : getPaddedChartDomain([...values, chart.target]);
  const segments = buildChartSegments(
    chart.points.map((point) => ({
      x: Date.parse(
        chart.id === "sessions" ? point.date : (point.activities[0]?.startedAt ?? point.date),
      ),
      y: point.value,
      label: point.id,
    })),
    { domain, left: 8, right: 92, top: 10, bottom: 86 },
  );
  const targetY =
    chart.target === null
      ? null
      : 86 - ((chart.target - domain.min) / (domain.max - domain.min)) * 76;
  const formatValue = (value: number | null) => formatRecordedHistoryValue(value, chart.unit);
  const pointValue = (value: number | null, lowerBound = false) =>
    value === null ? "Unavailable" : `${lowerBound ? "≥ " : ""}${formatValue(value)}`;
  const bestLabel =
    chart.id === "event_time"
      ? complete
        ? "Best recorded"
        : "Best loaded"
      : complete
        ? "Longest recorded"
        : "Longest loaded";
  return (
    <View className="gap-3 border-t border-border pt-4">
      <Text accessibilityRole="header" className="font-semibold text-foreground">
        {recordedHistoryChartTitle(chart.id)}
      </Text>
      {chart.id === "event_time" ? (
        <Text className="text-xs text-muted-foreground">Elapsed time · lower is faster</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-4">
        {chart.id === "sessions" ? (
          <View className="min-w-[28%] flex-1">
            <Text className="text-xs text-muted-foreground">This week</Text>
            <Text className="font-semibold text-foreground">
              {pointValue(chart.points.at(-1)?.value ?? null, !complete)}
            </Text>
          </View>
        ) : (
          <View className="min-w-[28%] flex-1">
            <Text className="text-xs text-muted-foreground">{bestLabel}</Text>
            <Text className="font-semibold text-foreground">{formatValue(chart.best)}</Text>
          </View>
        )}
        <View className="min-w-[28%] flex-1">
          <Text className="text-xs text-muted-foreground">
            {chart.id === "sessions" ? "Weekly target" : "Target"}
          </Text>
          <Text className="font-semibold text-foreground">
            {chart.target === null ? "Not specified" : formatValue(chart.target)}
          </Text>
        </View>
        <View className="min-w-[28%] flex-1">
          <Text className="text-xs text-muted-foreground">
            {chart.id === "sessions" ? "Remaining this week" : "Gap to target"}
          </Text>
          <Text className="font-semibold text-foreground">
            {chart.target === null ? "—" : formatValue(chart.gap)}
          </Text>
        </View>
      </View>
      {segments.length ? (
        <View>
          <View
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            accessibilityRole="image"
            accessibilityLabel={`${recordedHistoryChartTitle(chart.id)}. ${chart.id === "event_time" ? "Lower time is faster. " : ""}${complete ? "Loaded history complete." : "Partial history."}`}
            style={{ height: 208 }}
          >
            <Text className="absolute left-0 top-0 text-xs text-muted-foreground">
              {formatValue(domain.max)}
            </Text>
            <Svg width="100%" height={208} viewBox="0 0 100 100" preserveAspectRatio="none">
              {[10, 48, 86].map((y) => (
                <Line key={y} x1={8} x2={92} y1={y} y2={y} stroke={theme.grid} strokeWidth={0.3} />
              ))}
              {targetY !== null ? (
                <Line
                  testID={`recorded-target-${chart.id}`}
                  x1={8}
                  x2={92}
                  y1={targetY}
                  y2={targetY}
                  stroke={theme.axisLabel}
                  strokeDasharray="2 2"
                  strokeWidth={0.5}
                />
              ) : null}
              {chart.id === "sessions" ? (
                segments
                  .flat()
                  .map((point) => (
                    <Rect
                      key={point.label}
                      x={point.plotX - 2}
                      y={point.plotY}
                      width={4}
                      height={Math.max(0, 86 - point.plotY)}
                      fill={theme.chart1}
                      stroke={selected?.id === point.label ? theme.chart1 : "none"}
                      strokeWidth={0.6}
                      opacity={
                        chart.points.find((item) => item.id === point.label)?.inProgress ? 0.5 : 1
                      }
                    />
                  ))
              ) : (
                <>
                  {segments
                    .filter((segment) => segment.length > 1)
                    .map((segment) => (
                      <Polyline
                        key={segment[0]?.label}
                        points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
                        fill="none"
                        stroke={theme.chart1}
                        strokeWidth={0.7}
                      />
                    ))}
                  {segments.flat().map((point) => (
                    <Circle
                      key={point.label}
                      cx={point.plotX}
                      cy={point.plotY}
                      r={selected?.id === point.label ? 1.8 : 1.2}
                      fill={theme.chart1}
                    />
                  ))}
                </>
              )}
            </Svg>
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="absolute inset-0"
              onPress={(event) => {
                const nearest = segments
                  .flat()
                  .reduce<{ id: string | undefined; distance: number }>(
                    (best, point) => {
                      const distance = Math.hypot(
                        (point.plotX * width) / 100 - event.nativeEvent.locationX,
                        chart.id === "sessions"
                          ? 0
                          : point.plotY * 2.08 - event.nativeEvent.locationY,
                      );
                      return distance < best.distance ? { id: point.label, distance } : best;
                    },
                    { id: undefined, distance: Infinity },
                  );
                if (nearest.id) setSelectedId(nearest.id);
              }}
            />
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted-foreground">
              {chart.points[0] ? format(parseDateKey(chart.points[0].date), "MMM d") : ""}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {chart.target !== null ? `Target ${formatValue(chart.target)}` : ""}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {chart.points.at(-1)
                ? format(parseDateKey(chart.points.at(-1)?.date ?? ""), "MMM d")
                : ""}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="py-8 text-center text-sm text-muted-foreground">
          {complete
            ? "No matching recorded measurements in this window."
            : "No matching measurements in the history loaded so far."}
        </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View className="flex-row gap-2">
          {chart.points.map((point) => (
            <Pressable
              key={point.id}
              testID={`recorded-${chart.id}-${point.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selected?.id === point.id }}
              accessibilityLabel={`${format(parseDateKey(point.date), "MMMM d, yyyy")} · ${pointValue(point.value, point.lowerBound)}${point.inProgress ? " · In progress" : ""}`}
              onPress={() => setSelectedId(point.id)}
              className={`rounded-xl border px-3 py-2 ${selected?.id === point.id ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <Text className="text-xs text-foreground">
                {format(parseDateKey(point.date), "MMM d")} ·{" "}
                {point.value === null ? "—" : pointValue(point.value, point.lowerBound)}
                {point.inProgress ? " · In progress" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {selected ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">
            {format(parseDateKey(selected.date), "MMM d, yyyy")} ·{" "}
            {pointValue(selected.value, selected.lowerBound)}
            {selected.inProgress ? " · In progress" : ""}
          </Text>
          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
            {selected.activities.map((activity) => (
              <Pressable
                key={activity.id}
                accessibilityRole="link"
                testID={`recorded-source-${chart.id}-${activity.id}`}
                onPress={() => onOpenActivity(activity.id)}
                className="gap-1 py-2"
              >
                <Text className="text-sm font-medium text-primary">
                  Source activity: {activity.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Distance: {formatRecordedHistoryValue(activity.distanceMeters, "meters")} ·
                  Elapsed: {formatRecordedHistoryValue(activity.elapsedSeconds, "seconds")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
