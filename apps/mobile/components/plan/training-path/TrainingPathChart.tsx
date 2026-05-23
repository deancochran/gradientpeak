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
import { Fragment, useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import type { TrainingPathRange, TrainingPathViewModel } from "./trainingPathTypes";

type ChartDatum = Record<string, unknown> & {
  index: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  plannedLoadWithTentative: number | null;
  targetLoad: number | null;
  fitness: number | null;
  scheduledFitness: number | null;
  targetFitness: number | null;
};

type ChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "plannedLoadWithTentative"
  | "targetLoad"
  | "fitness"
  | "scheduledFitness"
  | "targetFitness";

type TrainingPathChartProps = {
  model: TrainingPathViewModel;
  range: TrainingPathRange;
  onSelectedWeekChange: (weekStart: string) => void;
  height?: number;
  domains?: TrainingPathViewModel["domains"];
  scrollX?: boolean;
  onScrollNearStart?: () => void;
  onScrollNearEnd?: () => void;
};

const yKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
  "fitness",
  "scheduledFitness",
  "targetFitness",
];
const loadKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
];
const fitnessKeys: ChartYKey[] = ["fitness", "scheduledFitness", "targetFitness"];
const chartPadding = { left: 8, right: 8, top: 20, bottom: 26 };
const fixedAxisWidth = 34;
const scrollWeekWidth = 46;
const scrollBarWidth = 30;

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

function getSleeveBarWidth(slotWidth: number, weekCount: number, fixedWidth?: number) {
  if (typeof fixedWidth === "number") return Math.min(fixedWidth, Math.max(4, slotWidth - 6));
  if (weekCount > 80) return Math.max(4, slotWidth * 0.78);
  if (weekCount > 52) return Math.max(5, slotWidth * 0.82);
  if (weekCount > 30) return Math.max(6, slotWidth * 0.88);
  return Math.max(8, slotWidth * 0.94);
}

function buildLinearTicks(domain: [number, number], count = 5) {
  const [min, max] = domain;
  if (count <= 1 || min === max) return [max];
  return Array.from({ length: count }, (_, index) => max - ((max - min) * index) / (count - 1));
}

function FixedYAxisLabels({
  align = "right",
  domain,
}: {
  align?: "left" | "right";
  domain: [number, number];
}) {
  return (
    <View
      className="relative"
      style={{
        width: fixedAxisWidth,
        paddingTop: chartPadding.top,
        paddingBottom: chartPadding.bottom,
      }}
      pointerEvents="none"
    >
      <View className="flex-1 justify-between">
        {buildLinearTicks(domain).map((value) => (
          <Text
            key={`${domain[0]}-${domain[1]}-${value}`}
            className={
              align === "left"
                ? "text-left text-[9px] text-muted-foreground"
                : "text-right text-[9px] text-muted-foreground"
            }
            numberOfLines={1}
          >
            {Math.round(value)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function TrainingPathChart({
  model,
  range,
  onSelectedWeekChange,
  height = 430,
  domains = model.domains,
  scrollX = false,
  onScrollNearStart,
  onScrollNearEnd,
}: TrainingPathChartProps) {
  const [chartWidth, setChartWidth] = useState(320);
  const [scrollViewportWidth, setScrollViewportWidth] = useState(240);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const centeredWeekIndexRef = useRef<number | null>(null);
  const startScrollExpansionAt = useRef(0);
  const endScrollExpansionAt = useRef(0);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const chartColors = {
    axisLabel: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(15, 23, 42, 0.72)",
    completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
    completedDimmed: isDark ? "rgba(34, 197, 94, 0.38)" : "rgba(22, 163, 74, 0.3)",
    fitness: isDark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.95)",
    frame: isDark ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.24)",
    grid: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.12)",
    marker: isDark ? "#f8fafc" : "#020617",
    planned: isDark ? "rgba(59, 130, 246, 0.74)" : "rgba(37, 99, 235, 0.68)",
    plannedDimmed: isDark ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)",
    plannedOutline: isDark ? "rgba(96, 165, 250, 0.9)" : "rgba(37, 99, 235, 0.88)",
    selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
    scheduledFitness: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
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
    plannedLoadWithTentative:
      typeof week.plannedLoad === "number" || typeof week.tentativePlannedLoad === "number"
        ? (week.plannedLoad ?? 0) + (week.tentativePlannedLoad ?? 0)
        : null,
    targetLoad: week.targetLoad,
    fitness: week.fitness,
    scheduledFitness: week.scheduledFitness,
    targetFitness: week.targetFitness,
  }));
  const xTickIndexes = scrollX
    ? model.weeks.map((_, index) => index)
    : buildAxisTickIndexes(model.weeks.length);
  const todayWeekStart = model.weeks.find(
    (week) => model.todayKey >= week.weekStart && model.todayKey <= week.weekEnd,
  );
  const selectedIndex = model.weeks.findIndex((week) => week.isSelected);
  const scrollableChartWidth = scrollX
    ? Math.max(
        chartPadding.left +
          chartPadding.right +
          Math.max(0, model.weeks.length - 1) * scrollWeekWidth,
        1,
      )
    : chartWidth;
  const scrollSideInset = scrollX ? Math.max(0, scrollViewportWidth / 2 - chartPadding.left) : 0;
  const xLabelSpacing = scrollX
    ? scrollWeekWidth
    : model.weeks.length > 1
      ? (scrollableChartWidth - chartPadding.left - chartPadding.right) / (model.weeks.length - 1)
      : 0;
  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220) setChartWidth(measuredWidth);
  };
  const onScrollViewportLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 120) setScrollViewportWidth(measuredWidth);
  };
  const selectCenteredWeek = (offsetX: number) => {
    if (model.weeks.length === 0) return;
    const centeredIndex = Math.max(
      0,
      Math.min(model.weeks.length - 1, Math.round(offsetX / scrollWeekWidth)),
    );
    if (centeredWeekIndexRef.current === centeredIndex) return;
    centeredWeekIndexRef.current = centeredIndex;
    const centeredWeek = model.weeks[centeredIndex];
    if (centeredWeek && !centeredWeek.isSelected) {
      onSelectedWeekChange(centeredWeek.weekStart);
    }
  };
  const onHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const now = Date.now();
    selectCenteredWeek(contentOffset.x);
    if (contentOffset.x <= scrollWeekWidth * 2) {
      if (now - startScrollExpansionAt.current < 500) return;
      startScrollExpansionAt.current = now;
      onScrollNearStart?.();
    }
    if (contentOffset.x + layoutMeasurement.width >= contentSize.width - scrollWeekWidth * 2) {
      if (now - endScrollExpansionAt.current < 500) return;
      endScrollExpansionAt.current = now;
      onScrollNearEnd?.();
    }
  };
  const scrollToWeekIndex = (index: number, animated: boolean) => {
    const offset = Math.max(0, index * scrollWeekWidth);
    centeredWeekIndexRef.current = index;
    scrollViewRef.current?.scrollTo({ x: offset, animated });
  };
  const onWeekPress = (weekStart: string, index: number) => {
    onSelectedWeekChange(weekStart);
    if (scrollX) scrollToWeekIndex(index, true);
  };

  useEffect(() => {
    if (!scrollX || selectedIndex < 0) return;
    if (centeredWeekIndexRef.current === selectedIndex) return;
    requestAnimationFrame(() => {
      scrollToWeekIndex(selectedIndex, false);
    });
  }, [selectedIndex, scrollX, scrollableChartWidth]);

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

  const chartContent = (
    <View className="flex-1" style={{ width: scrollableChartWidth, height: "100%" }}>
      <CartesianChart<ChartDatum, "index", ChartYKey>
        data={chartData}
        xKey="index"
        yKeys={yKeys}
        padding={chartPadding}
        domainPadding={{ left: 2, right: 2, top: 10, bottom: 0 }}
        xAxis={{
          axisSide: "bottom",
          tickValues: xTickIndexes,
          font: scrollX ? null : axisFont,
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
            font: scrollX ? null : axisFont,
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
            font: scrollX ? null : axisFont,
            labelColor: chartColors.axisLabel,
            lineColor: "transparent",
            formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
          },
        ]}
        frame={{
          lineColor: chartColors.frame,
          lineWidth: { bottom: 1, left: scrollX ? 0 : 1, right: 0, top: 0 },
        }}
      >
        {({ points, chartBounds }) => (
          <>
            {!scrollX && selectedIndex >= 0
              ? (() => {
                  const geometry = getBarGeometry(
                    points.completedLoad,
                    selectedIndex,
                    chartBounds.left,
                    chartBounds.right,
                  );
                  if (!geometry) return null;
                  const barWidth = getSleeveBarWidth(
                    geometry.width,
                    model.weeks.length,
                    scrollX ? scrollBarWidth : undefined,
                  );
                  return (
                    <SkiaRect
                      x={geometry.center - barWidth / 2}
                      y={chartBounds.top}
                      width={barWidth}
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
              const plannedWithTentativePoint = points.plannedLoadWithTentative[index];
              const targetPoint = points.targetLoad[index];
              if (!geometry) return null;
              const barWidth = getSleeveBarWidth(
                geometry.width,
                model.weeks.length,
                scrollX ? scrollBarWidth : undefined,
              );
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
                  {showPlanningLayers &&
                  typeof plannedWithTentativePoint?.yValue === "number" &&
                  typeof plannedWithTentativePoint.y === "number" &&
                  plannedWithTentativePoint.yValue > (plannedPoint?.yValue ?? 0) ? (
                    <SkiaRect
                      key={`tentative-planned-${week.weekStart}`}
                      x={barLeft}
                      y={plannedWithTentativePoint.y}
                      width={barWidth}
                      height={(plannedPoint?.y ?? chartBounds.bottom) - plannedWithTentativePoint.y}
                      color={isDimmed ? chartColors.plannedDimmed : chartColors.plannedOutline}
                      style="stroke"
                      strokeWidth={1.5}
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
              points={points.scheduledFitness.filter((point) => point.yValue != null)}
              color={chartColors.scheduledFitness}
              strokeWidth={3}
              curveType="natural"
            >
              <DashPathEffect intervals={[2, 5]} />
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
                  const actualMarkerPoint = points.fitness[index];
                  const scheduledMarkerPoint = points.scheduledFitness[index];
                  const markerPoint =
                    actualMarkerPoint?.yValue != null ? actualMarkerPoint : scheduledMarkerPoint;
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
                <Fragment key={`goal-marker-${marker.id}`}>
                  <SkiaLine
                    p1={vec(markerPoint.x, chartBounds.bottom)}
                    p2={vec(markerPoint.x, chartBounds.top)}
                    color={chartColors.marker}
                    strokeWidth={2}
                  >
                    <DashPathEffect intervals={[4, 4]} />
                  </SkiaLine>
                  {axisFont ? (
                    <SkiaText
                      x={Math.max(chartBounds.left, markerPoint.x - 12)}
                      y={chartBounds.top + 10}
                      text="GOAL"
                      font={axisFont}
                      color={chartColors.marker}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </>
        )}
      </CartesianChart>
      <View
        className="absolute inset-0 flex-row"
        style={{ width: scrollableChartWidth }}
        pointerEvents="box-none"
      >
        {model.weeks.map((week, index) => (
          <TouchableOpacity
            key={`select-${week.weekStart}`}
            accessibilityRole="button"
            accessibilityLabel={`Select week of ${week.label}`}
            className="flex-1"
            activeOpacity={1}
            onPress={() => onWeekPress(week.weekStart, index)}
            testID={`training-path-week-${week.weekStart}`}
          />
        ))}
      </View>
      {scrollX ? (
        <View
          className="absolute bottom-0"
          style={{
            left: chartPadding.left,
            right: chartPadding.right,
            height: chartPadding.bottom,
          }}
          pointerEvents="none"
        >
          {model.weeks.map((week, index) => (
            <View
              key={`x-label-${week.weekStart}`}
              className="items-center"
              style={{
                left: index * xLabelSpacing - scrollWeekWidth / 2,
                position: "absolute",
                width: scrollWeekWidth,
              }}
            >
              <Text className="text-center text-[8px] text-muted-foreground" numberOfLines={1}>
                {week.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ height }} onLayout={onChartLayout} testID="training-path-chart">
      <View className="flex-row items-center justify-between px-2 pb-1">
        <Text className="text-[10px] font-medium text-muted-foreground">Load (TSS)</Text>
        <Text className="text-[10px] font-medium text-muted-foreground">Fitness</Text>
      </View>
      {scrollX ? (
        <View className="flex-1 flex-row">
          <FixedYAxisLabels domain={domains.load} />
          <View className="flex-1" onLayout={onScrollViewportLayout}>
            <ScrollView
              ref={scrollViewRef}
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: scrollSideInset }}
              decelerationRate="fast"
              horizontal
              nestedScrollEnabled
              onMomentumScrollEnd={onHorizontalScroll}
              onScroll={onHorizontalScroll}
              scrollEventThrottle={80}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={scrollWeekWidth}
            >
              {chartContent}
            </ScrollView>
            <View
              className="absolute rounded-full bg-foreground/10"
              pointerEvents="none"
              style={{
                bottom: chartPadding.bottom,
                left: scrollViewportWidth / 2 - scrollBarWidth / 2,
                top: chartPadding.top,
                width: scrollBarWidth,
              }}
            />
          </View>
          <FixedYAxisLabels align="left" domain={domains.fitness} />
        </View>
      ) : (
        chartContent
      )}
    </View>
  );
}
