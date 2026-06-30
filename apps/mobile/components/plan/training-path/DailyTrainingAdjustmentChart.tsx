import { Text } from "@repo/ui/components/text";
import { DashPathEffect, Rect as SkiaRect } from "@shopify/react-native-skia";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { CartesianChart, Line, useChartPressState } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import { DailyTrainingAdjustmentTray } from "./DailyTrainingAdjustmentTray";

export type DailyTrainingAdjustmentPoint = {
  date: string;
  plannedLoadTss?: number | null;
  tentativePlannedLoadTss?: number | null;
  completedLoadTss?: number | null;
  targetLoadTss?: number | null;
  actualOrScheduledLoadTss?: number | null;
  loadDeltaTss?: number | null;
  plannedDeltaTss?: number | null;
  fitnessCtl?: number | null;
  targetFitnessCtl?: number | null;
  scheduledFitnessCtl?: number | null;
  fatigueAtl?: number | null;
  formTsb?: number | null;
  readinessScore?: number | null;
  annotations?: Array<{ code: string; severity?: "info" | "warning" | "risk"; message?: string }>;
};

export type DailyTrainingAdjustmentChartProps = {
  points: DailyTrainingAdjustmentPoint[];
  selectedDate?: string | null;
  onSelectedDateChange?: (date: string) => void;
  density?: "compact" | "standard" | "detail";
  emptyState?: React.ReactNode;
  height?: number;
  showSelectedPointTray?: boolean;
  testID?: string;
};

type ChartDatum = Record<string, unknown> & {
  index: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  plannedLoadWithTentative: number | null;
  targetLoad: number | null;
  actualFitness: number | null;
  projectedFitness: number | null;
  recommendedFitness: number | null;
};

type ChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "plannedLoadWithTentative"
  | "targetLoad"
  | "actualFitness"
  | "projectedFitness"
  | "recommendedFitness";

const chartYKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
  "actualFitness",
  "projectedFitness",
  "recommendedFitness",
];
const loadYKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
];
const fitnessYKeys: ChartYKey[] = ["actualFitness", "projectedFitness", "recommendedFitness"];
const axisWidth = 34;
const chartPadding = { left: 8, right: 8, top: 18, bottom: 26 };

function valueOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valueOrZero(value: number | null | undefined) {
  return valueOrNull(value) ?? 0;
}

function formatDayLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function buildTicks(domain: [number, number], count = 5) {
  const [min, max] = domain;
  if (count <= 1) return [max];
  return Array.from({ length: count }, (_, index) => max - ((max - min) * index) / (count - 1));
}

function expandDomain(
  values: number[],
  fallback: [number, number],
  paddingRatio = 0.08,
): [number, number] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return fallback;
  const minValue = Math.min(...finiteValues, fallback[0]);
  const maxValue = Math.max(...finiteValues, fallback[1]);
  const span = Math.max(1, maxValue - minValue);
  return [Math.max(0, minValue - span * paddingRatio), maxValue + span * paddingRatio];
}

function getLoadBarGeometry(
  points: Array<{ x: number }>,
  index: number,
  chartLeft: number,
  chartRight: number,
) {
  const point = points[index];
  if (!point) return null;
  const previous = points[index - 1];
  const next = points[index + 1];
  const leftGap = previous
    ? point.x - previous.x
    : next
      ? next.x - point.x
      : chartRight - chartLeft;
  const rightGap = next
    ? next.x - point.x
    : previous
      ? point.x - previous.x
      : chartRight - chartLeft;
  return {
    center: point.x,
    width: Math.max(8, Math.min(28, Math.abs(Math.min(leftGap, rightGap)) * 0.72)),
  };
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
      style={{ width: axisWidth, paddingTop: chartPadding.top, paddingBottom: chartPadding.bottom }}
      pointerEvents="none"
    >
      <View className="flex-1 justify-between">
        {buildTicks(domain).map((value) => (
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

export const DailyTrainingAdjustmentChart = memo(function DailyTrainingAdjustmentChart({
  points,
  selectedDate,
  onSelectedDateChange,
  density = "standard",
  emptyState,
  height,
  showSelectedPointTray = true,
  testID = "daily-training-adjustment-chart",
}: DailyTrainingAdjustmentChartProps) {
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(null);
  const [previewSelectedDate, setPreviewSelectedDate] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(320);
  const [viewportWidth, setViewportWidth] = useState(240);
  const [hasMounted, setHasMounted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const activeIndexRef = useRef(0);
  const previewDateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const { state: chartPressState } = useChartPressState({
    x: 0,
    y: {
      actualFitness: 0,
      completedLoad: 0,
      plannedLoad: 0,
      plannedLoadWithTentative: 0,
      projectedFitness: 0,
      recommendedFitness: 0,
      targetLoad: 0,
    } satisfies Record<ChartYKey, number>,
  });
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const slotWidth = density === "compact" ? 32 : density === "detail" ? 44 : 38;
  const barWidth = density === "compact" ? 16 : density === "detail" ? 26 : 22;
  const resolvedHeight = height ?? (density === "compact" ? 190 : density === "detail" ? 270 : 230);
  const chartAreaHeight = Math.max(96, resolvedHeight);
  const resolvedSelectedDate = internalSelectedDate ?? selectedDate;
  const selectedPoint = useMemo(
    () => points.find((point) => point.date === resolvedSelectedDate) ?? points[0] ?? null,
    [points, resolvedSelectedDate],
  );
  const highlightedDate = previewSelectedDate ?? selectedPoint?.date ?? null;

  const chartData = useMemo<ChartDatum[]>(
    () =>
      points.map((point, index) => {
        const planned = valueOrZero(point.plannedLoadTss);
        const tentative = valueOrZero(point.tentativePlannedLoadTss);
        return {
          index,
          completedLoad: valueOrNull(point.completedLoadTss),
          plannedLoad: planned > 0 ? planned : null,
          plannedLoadWithTentative: planned + tentative > 0 ? planned + tentative : null,
          targetLoad: valueOrNull(point.targetLoadTss),
          actualFitness: valueOrNull(point.fitnessCtl),
          projectedFitness: valueOrNull(point.scheduledFitnessCtl),
          recommendedFitness: valueOrNull(point.targetFitnessCtl),
        };
      }),
    [points],
  );

  const loadDomain = useMemo(
    () =>
      expandDomain(
        chartData.flatMap((point) => [
          valueOrZero(point.completedLoad as number | null),
          valueOrZero(point.plannedLoad as number | null),
          valueOrZero(point.plannedLoadWithTentative as number | null),
          valueOrZero(point.targetLoad as number | null),
        ]),
        [0, 100],
        0.1,
      ),
    [chartData],
  );
  const fitnessDomain = useMemo(
    () =>
      expandDomain(
        chartData
          .flatMap((point) => [
            valueOrNull(point.actualFitness as number | null),
            valueOrNull(point.projectedFitness as number | null),
            valueOrNull(point.recommendedFitness as number | null),
          ])
          .filter((value): value is number => value !== null),
        [0, 100],
        0.12,
      ),
    [chartData],
  );
  const labels = useMemo(() => points.map((point) => formatDayLabel(point.date)), [points]);
  const scrollableChartWidth = Math.max(
    chartWidth,
    chartPadding.left + chartPadding.right + Math.max(1, points.length) * slotWidth,
  );
  const sideInset = Math.max(0, viewportWidth / 2 - slotWidth / 2);
  const colors = useMemo(
    () => ({
      axisLabel: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(15, 23, 42, 0.72)",
      completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
      fitness: isDark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.95)",
      frame: isDark ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.24)",
      grid: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.12)",
      planned: isDark ? "rgba(59, 130, 246, 0.72)" : "rgba(37, 99, 235, 0.68)",
      projectedFitness: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
      recommendedFitness: isDark ? "rgba(248, 250, 252, 0.52)" : "rgba(15, 23, 42, 0.44)",
      selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
      target: isDark ? "rgba(148, 163, 184, 0.34)" : "rgba(100, 116, 139, 0.24)",
      tentative: isDark ? "rgba(96, 165, 250, 0.9)" : "rgba(37, 99, 235, 0.88)",
    }),
    [isDark],
  );

  useEffect(() => {
    mountedRef.current = true;
    setHasMounted(true);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onChartLayout = useCallback((event: LayoutChangeEvent) => {
    if (!mountedRef.current) return;
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220)
      setChartWidth((current) => (current === measuredWidth ? current : measuredWidth));
  }, []);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    if (!mountedRef.current) return;
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 120)
      setViewportWidth((current) => (current === measuredWidth ? current : measuredWidth));
  }, []);

  const selectPoint = useCallback(
    (date: string) => {
      previewDateRef.current = null;
      setPreviewSelectedDate(null);
      if (date === resolvedSelectedDate) return;
      if (!mountedRef.current) return;
      setInternalSelectedDate(date);
      onSelectedDateChange?.(date);
    },
    [onSelectedDateChange, resolvedSelectedDate],
  );

  const previewPointAtIndex = useCallback(
    (index: number) => {
      const point = points[Math.max(0, Math.min(points.length - 1, Math.round(index)))];
      if (!point || previewDateRef.current === point.date) return;
      previewDateRef.current = point.date;
      setPreviewSelectedDate(point.date);
    },
    [points],
  );

  const commitPreviewedPoint = useCallback(() => {
    const date = previewDateRef.current;
    if (date) selectPoint(date);
  }, [selectPoint]);

  useAnimatedReaction(
    () => {
      if (!chartPressState.isActive.value) return -1;
      const activeIndex = Number(chartPressState.x.value.value);
      return Number.isFinite(activeIndex) ? Math.round(activeIndex) : -1;
    },
    (activeIndex, previousIndex) => {
      if (activeIndex >= 0) {
        if (activeIndex !== previousIndex) runOnJS(previewPointAtIndex)(activeIndex);
        return;
      }
      if (previousIndex != null && previousIndex >= 0) {
        runOnJS(commitPreviewedPoint)();
      }
    },
    [commitPreviewedPoint, previewPointAtIndex],
  );

  const getNearestIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      Math.max(
        0,
        Math.min(points.length - 1, Math.round(event.nativeEvent.contentOffset.x / slotWidth)),
      ),
    [points.length, slotWidth],
  );

  const previewNearestDay = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = getNearestIndex(event);
      activeIndexRef.current = index;
      const point = points[index];
      if (!point || previewDateRef.current === point.date) return;
      previewDateRef.current = point.date;
      setPreviewSelectedDate(point.date);
    },
    [getNearestIndex, points],
  );

  const selectNearestDay = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = getNearestIndex(event);
      activeIndexRef.current = index;
      const point = points[index];
      if (point) selectPoint(point.date);
    },
    [getNearestIndex, points, selectPoint],
  );

  if (points.length === 0) {
    return (
      <View className="rounded-2xl border border-border bg-card p-4" testID={testID}>
        {emptyState ?? (
          <Text className="text-sm text-muted-foreground">No daily training adjustments yet.</Text>
        )}
      </View>
    );
  }

  return (
    <View className="gap-3" testID={testID}>
      <View className="gap-2 rounded-2xl bg-card px-2 py-3">
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[10px] font-medium text-muted-foreground">Load (TSS)</Text>
          <Text className="text-[10px] font-medium text-muted-foreground">Fitness</Text>
        </View>
        <View style={{ height: chartAreaHeight }} onLayout={onChartLayout}>
          {hasMounted ? (
            <View className="flex-1 flex-row">
              <FixedYAxisLabels domain={loadDomain} />
              <View className="flex-1" onLayout={onViewportLayout}>
                <ScrollView
                  ref={scrollRef}
                  horizontal
                  contentContainerStyle={{ paddingHorizontal: sideInset }}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  onMomentumScrollEnd={selectNearestDay}
                  onScroll={previewNearestDay}
                  onScrollEndDrag={selectNearestDay}
                  scrollEventThrottle={16}
                  showsHorizontalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={slotWidth}
                  testID={`${testID}-scroll`}
                >
                  <View style={{ height: chartAreaHeight, width: scrollableChartWidth }}>
                    <CartesianChart<ChartDatum, "index", ChartYKey>
                      data={chartData}
                      xKey="index"
                      yKeys={chartYKeys}
                      padding={chartPadding}
                      domainPadding={{ left: 2, right: 2, top: 10, bottom: 0 }}
                      xAxis={{
                        axisSide: "bottom",
                        tickValues: chartData.map((point) => point.index),
                        font: null,
                        labelColor: colors.axisLabel,
                        lineColor: "transparent",
                        lineWidth: 0,
                        formatXLabel: (value: unknown) => labels[Math.round(Number(value))] ?? "",
                      }}
                      yAxis={[
                        {
                          yKeys: loadYKeys,
                          axisSide: "left",
                          domain: loadDomain,
                          tickCount: 5,
                          font: null,
                          labelColor: colors.axisLabel,
                          lineColor: colors.grid,
                          linePathEffect: <DashPathEffect intervals={[4, 4]} />,
                          formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
                        },
                        {
                          yKeys: fitnessYKeys,
                          axisSide: "right",
                          domain: fitnessDomain,
                          tickCount: 5,
                          font: null,
                          labelColor: colors.axisLabel,
                          lineColor: "transparent",
                          formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
                        },
                      ]}
                      frame={{
                        lineColor: colors.frame,
                        lineWidth: { bottom: 1, left: 0, right: 0, top: 0 },
                      }}
                      chartPressState={chartPressState}
                      chartPressConfig={
                        {
                          pan: {
                            simultaneousWithExternalGesture: scrollRef,
                          },
                        } as any
                      }
                    >
                      {({ points: plottedPoints, chartBounds }) => (
                        <>
                          {points.map((point, index) => {
                            const geometry = getLoadBarGeometry(
                              plottedPoints.targetLoad,
                              index,
                              chartBounds.left,
                              chartBounds.right,
                            );
                            const targetPoint = plottedPoints.targetLoad[index];
                            const plannedPoint = plottedPoints.plannedLoad[index];
                            const plannedWithTentativePoint =
                              plottedPoints.plannedLoadWithTentative[index];
                            const completedPoint = plottedPoints.completedLoad[index];
                            if (!geometry) return null;
                            const left = geometry.center - barWidth / 2;
                            const isSelected = point.date === highlightedDate;
                            return (
                              <Fragment key={`day-${point.date}`}>
                                {isSelected ? (
                                  <SkiaRect
                                    x={left - 3}
                                    y={chartBounds.top}
                                    width={barWidth + 6}
                                    height={chartBounds.bottom - chartBounds.top}
                                    color={colors.selected}
                                  />
                                ) : null}
                                {typeof targetPoint?.y === "number" ? (
                                  <SkiaRect
                                    x={left}
                                    y={targetPoint.y}
                                    width={barWidth}
                                    height={chartBounds.bottom - targetPoint.y}
                                    color={colors.target}
                                  />
                                ) : null}
                                {typeof plannedPoint?.y === "number" ? (
                                  <SkiaRect
                                    x={left + barWidth * 0.24}
                                    y={plannedPoint.y}
                                    width={barWidth * 0.52}
                                    height={chartBounds.bottom - plannedPoint.y}
                                    color={colors.planned}
                                  />
                                ) : null}
                                {typeof plannedWithTentativePoint?.y === "number" &&
                                plannedWithTentativePoint.yValue != null &&
                                plannedWithTentativePoint.yValue > (plannedPoint?.yValue ?? 0) ? (
                                  <SkiaRect
                                    x={left + barWidth * 0.24}
                                    y={plannedWithTentativePoint.y}
                                    width={barWidth * 0.52}
                                    height={
                                      (plannedPoint?.y ?? chartBounds.bottom) -
                                      plannedWithTentativePoint.y
                                    }
                                    color={colors.tentative}
                                  />
                                ) : null}
                                {typeof completedPoint?.y === "number" ? (
                                  <SkiaRect
                                    x={left + barWidth * 0.08}
                                    y={completedPoint.y}
                                    width={barWidth * 0.34}
                                    height={chartBounds.bottom - completedPoint.y}
                                    color={colors.completed}
                                  />
                                ) : null}
                              </Fragment>
                            );
                          })}
                          <Line
                            points={plottedPoints.recommendedFitness.filter(
                              (point) => point.yValue != null,
                            )}
                            color={colors.recommendedFitness}
                            strokeWidth={2}
                            curveType="natural"
                          >
                            <DashPathEffect intervals={[4, 4]} />
                          </Line>
                          <Line
                            points={plottedPoints.projectedFitness.filter(
                              (point) => point.yValue != null,
                            )}
                            color={colors.projectedFitness}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            points={plottedPoints.actualFitness.filter(
                              (point) => point.yValue != null,
                            )}
                            color={colors.fitness}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                        </>
                      )}
                    </CartesianChart>
                    <View
                      className="absolute bottom-0"
                      style={{
                        left: chartPadding.left,
                        right: chartPadding.right,
                        height: chartPadding.bottom,
                      }}
                      pointerEvents="none"
                    >
                      {labels.map((label, index) => (
                        <View
                          key={`x-label-${points[index]?.date ?? index}`}
                          className="items-center"
                          style={{
                            left: index * slotWidth - slotWidth / 2,
                            position: "absolute",
                            width: slotWidth,
                          }}
                        >
                          <Text
                            className="text-center text-[8px] text-muted-foreground"
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </View>
              <FixedYAxisLabels align="left" domain={fitnessDomain} />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center rounded-2xl bg-muted/20">
              <Text className="text-sm text-muted-foreground">Preparing chart…</Text>
            </View>
          )}
        </View>
      </View>
      {showSelectedPointTray && selectedPoint ? (
        <DailyTrainingAdjustmentTray point={selectedPoint} />
      ) : null}
    </View>
  );
});
