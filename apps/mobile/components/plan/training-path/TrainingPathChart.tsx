import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  Circle as SkiaCircle,
  Line as SkiaLine,
  Rect as SkiaRect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import { Fragment, useState } from "react";
import { LayoutChangeEvent, TouchableOpacity, View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import type { TrainingPathRange, TrainingPathViewModel } from "./trainingPathTypes";

type ChartDatum = Record<string, unknown> & {
  index: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  targetLoad: number | null;
  fitness: number | null;
  targetFitness: number | null;
};

type ChartYKey = "completedLoad" | "plannedLoad" | "targetLoad" | "fitness" | "targetFitness";

type TrainingPathChartProps = {
  model: TrainingPathViewModel;
  range: TrainingPathRange;
  onSelectedWeekChange: (weekStart: string) => void;
  height?: number;
  domains?: TrainingPathViewModel["domains"];
};

const yKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "targetLoad",
  "fitness",
  "targetFitness",
];
const loadKeys: ChartYKey[] = ["completedLoad", "plannedLoad", "targetLoad"];
const fitnessKeys: ChartYKey[] = ["fitness", "targetFitness"];
const chartPadding = { left: 8, right: 8, top: 20, bottom: 26 };

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("@/assets/fonts/SpaceMono-Regular.ttf") as Parameters<typeof useFont>[0];
  } catch {
    return undefined;
  }
};

function buildAxisTickIndexes(count: number, desiredTicks = 6) {
  if (count <= 0) return [] as number[];
  if (count === 1) return [0];
  const maxIndex = count - 1;
  const indexes = new Set<number>([0, maxIndex]);
  for (let tick = 1; tick < Math.min(desiredTicks, count) - 1; tick += 1) {
    indexes.add(Math.round((maxIndex * tick) / (Math.min(desiredTicks, count) - 1)));
  }
  return [...indexes].sort((left, right) => left - right);
}

function getBarGeometry(
  points: Array<{ x: number }>,
  index: number,
  chartLeft: number,
  chartRight: number,
) {
  const current = points[index];
  if (!current) return null;
  const previous = points[index - 1];
  const next = points[index + 1];
  const leftStep = previous
    ? current.x - previous.x
    : next
      ? next.x - current.x
      : chartRight - chartLeft;
  const rightStep = next
    ? next.x - current.x
    : previous
      ? current.x - previous.x
      : chartRight - chartLeft;
  const left = Math.max(chartLeft, current.x - Math.abs(leftStep) / 2);
  const right = Math.min(chartRight, current.x + Math.abs(rightStep) / 2);
  return { center: current.x, width: Math.max(4, right - left) };
}

function getSleeveBarWidth(slotWidth: number, weekCount: number) {
  if (weekCount > 80) return Math.max(2, slotWidth * 0.34);
  if (weekCount > 52) return Math.max(3, slotWidth * 0.42);
  if (weekCount > 30) return Math.max(4, slotWidth * 0.58);
  return Math.max(6, slotWidth * 0.86);
}

export function TrainingPathChart({
  model,
  range,
  onSelectedWeekChange,
  height = 430,
  domains = model.domains,
}: TrainingPathChartProps) {
  const [chartWidth, setChartWidth] = useState(320);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const chartColors = {
    axisLabel: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(15, 23, 42, 0.72)",
    completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
    completedDimmed: isDark ? "rgba(34, 197, 94, 0.38)" : "rgba(22, 163, 74, 0.3)",
    fitness: isDark ? "#f8fafc" : "#020617",
    frame: isDark ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.24)",
    grid: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.12)",
    marker: isDark ? "#f8fafc" : "#020617",
    planned: isDark ? "rgba(59, 130, 246, 0.74)" : "rgba(37, 99, 235, 0.68)",
    plannedDimmed: isDark ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)",
    selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
    target: isDark ? "rgba(148, 163, 184, 0.34)" : "rgba(100, 116, 139, 0.24)",
    targetDimmed: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(100, 116, 139, 0.1)",
    targetFitness: isDark ? "rgba(248, 250, 252, 0.5)" : "rgba(15, 23, 42, 0.42)",
  };
  const axisFont = useFont(getAxisFontSource(), 9);
  const labels = model.weeks.map((week) => week.label);
  const chartData: ChartDatum[] = model.weeks.map((week, index) => ({
    index,
    completedLoad: week.completedLoad,
    plannedLoad: week.plannedLoad,
    targetLoad: week.targetLoad,
    fitness: week.fitness,
    targetFitness: week.targetFitness,
  }));
  const xTickIndexes = buildAxisTickIndexes(model.weeks.length);
  const todayWeekStart = model.weeks.find(
    (week) => model.todayKey >= week.weekStart && model.todayKey <= week.weekEnd,
  );
  const selectedIndex = model.weeks.findIndex((week) => week.isSelected);
  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220) setChartWidth(measuredWidth);
  };

  if (model.weeks.length === 0) {
    return (
      <View
        className="h-72 items-center justify-center rounded-2xl bg-muted/20"
        testID="training-path-empty-chart"
      >
        <Text className="text-sm text-muted-foreground">
          Training path is still being calculated.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height }} onLayout={onChartLayout} testID="training-path-chart">
      <View className="flex-row items-center justify-between px-2 pb-1">
        <Text className="text-[10px] font-medium text-muted-foreground">Load (TSS)</Text>
        <Text className="text-[10px] font-medium text-muted-foreground">Fitness</Text>
      </View>
      <View className="flex-1">
        <CartesianChart<ChartDatum, "index", ChartYKey>
          data={chartData}
          xKey="index"
          yKeys={yKeys}
          padding={chartPadding}
          domainPadding={{ left: 2, right: 2, top: 10, bottom: 0 }}
          xAxis={{
            axisSide: "bottom",
            tickValues: xTickIndexes,
            font: axisFont,
            labelColor: chartColors.axisLabel,
            lineColor: "transparent",
            lineWidth: 0,
            formatXLabel: (value: unknown) => labels[Math.round(Number(value))] ?? "",
          }}
          yAxis={[
            {
              yKeys: loadKeys,
              axisSide: "left",
              domain: domains.load,
              tickCount: 5,
              font: axisFont,
              labelColor: chartColors.axisLabel,
              lineColor: chartColors.grid,
              linePathEffect: <DashPathEffect intervals={[4, 4]} />,
              formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
            },
            {
              yKeys: fitnessKeys,
              axisSide: "right",
              domain: domains.fitness,
              tickCount: 5,
              font: axisFont,
              labelColor: chartColors.axisLabel,
              lineColor: "transparent",
              formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
            },
          ]}
          frame={{
            lineColor: chartColors.frame,
            lineWidth: { bottom: 1, left: 1, right: 0, top: 0 },
          }}
        >
          {({ points, chartBounds }) => (
            <>
              {selectedIndex >= 0
                ? (() => {
                    const geometry = getBarGeometry(
                      points.completedLoad,
                      selectedIndex,
                      chartBounds.left,
                      chartBounds.right,
                    );
                    if (!geometry) return null;
                    return (
                      <SkiaRect
                        x={geometry.center - geometry.width / 2}
                        y={chartBounds.top}
                        width={geometry.width}
                        height={chartBounds.bottom - chartBounds.top}
                        color={chartColors.selected}
                      />
                    );
                  })()
                : null}
              {model.weeks.map((week, index) => {
                const geometry = getBarGeometry(
                  points.completedLoad,
                  index,
                  chartBounds.left,
                  chartBounds.right,
                );
                const completedPoint = points.completedLoad[index];
                const plannedPoint = points.plannedLoad[index];
                const targetPoint = points.targetLoad[index];
                if (!geometry) return null;
                const barWidth = getSleeveBarWidth(geometry.width, model.weeks.length);
                const barLeft = geometry.center - barWidth / 2;
                const isDimmed = selectedIndex >= 0 && index !== selectedIndex;
                const showPlanningLayers = range !== "all";
                return (
                  <Fragment key={`load-bars-${week.weekStart}`}>
                    {showPlanningLayers &&
                    typeof targetPoint?.yValue === "number" &&
                    typeof targetPoint.y === "number" ? (
                      <SkiaRect
                        key={`target-${week.weekStart}`}
                        x={barLeft}
                        y={targetPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - targetPoint.y}
                        color={isDimmed ? chartColors.targetDimmed : chartColors.target}
                      />
                    ) : null}
                    {showPlanningLayers &&
                    typeof plannedPoint?.yValue === "number" &&
                    typeof plannedPoint.y === "number" ? (
                      <SkiaRect
                        key={`planned-${week.weekStart}`}
                        x={barLeft}
                        y={plannedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - plannedPoint.y}
                        color={isDimmed ? chartColors.plannedDimmed : chartColors.planned}
                      />
                    ) : null}
                    {typeof completedPoint?.yValue === "number" &&
                    typeof completedPoint.y === "number" ? (
                      <SkiaRect
                        key={`completed-${week.weekStart}`}
                        x={barLeft}
                        y={completedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - completedPoint.y}
                        color={isDimmed ? chartColors.completedDimmed : chartColors.completed}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
              <Line
                points={points.targetFitness.filter((point) => point.yValue != null)}
                color={chartColors.targetFitness}
                strokeWidth={2}
                curveType="natural"
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
              <Line
                points={points.fitness.filter((point) => point.yValue != null)}
                color={chartColors.fitness}
                strokeWidth={2.5}
                curveType="natural"
              />
              {todayWeekStart
                ? (() => {
                    const index = model.weeks.findIndex(
                      (week) => week.weekStart === todayWeekStart.weekStart,
                    );
                    const markerPoint = points.fitness[index];
                    if (
                      !markerPoint ||
                      markerPoint.yValue == null ||
                      typeof markerPoint.y !== "number"
                    )
                      return null;
                    return (
                      <SkiaCircle
                        cx={markerPoint.x}
                        cy={markerPoint.y}
                        r={4}
                        color={chartColors.marker}
                      />
                    );
                  })()
                : null}
              {model.goalMarkers.map((marker) => {
                const index = model.weeks.findIndex((week) => week.weekStart === marker.weekStart);
                const markerPoint = points.completedLoad[index];
                if (!markerPoint) return null;
                return (
                  <>
                    <SkiaLine
                      key={`goal-line-${marker.id}`}
                      p1={vec(markerPoint.x, chartBounds.bottom)}
                      p2={vec(markerPoint.x, chartBounds.top)}
                      color={chartColors.marker}
                      strokeWidth={2}
                    >
                      <DashPathEffect intervals={[4, 4]} />
                    </SkiaLine>
                    {axisFont ? (
                      <SkiaText
                        key={`goal-label-${marker.id}`}
                        x={Math.max(chartBounds.left, markerPoint.x - 12)}
                        y={chartBounds.top + 10}
                        text="GOAL"
                        font={axisFont}
                        color={chartColors.marker}
                      />
                    ) : null}
                  </>
                );
              })}
            </>
          )}
        </CartesianChart>
        <View
          className="absolute inset-0 flex-row"
          style={{ width: chartWidth }}
          pointerEvents="box-none"
        >
          {model.weeks.map((week) => (
            <TouchableOpacity
              key={`select-${week.weekStart}`}
              accessibilityRole="button"
              accessibilityLabel={`Select week of ${week.label}`}
              className="flex-1"
              activeOpacity={1}
              onPress={() => onSelectedWeekChange(week.weekStart)}
              testID={`training-path-week-${week.weekStart}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
