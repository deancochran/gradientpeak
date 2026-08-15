import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  Line as SkiaLine,
  Rect as SkiaRect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessibilityActionEvent, LayoutChangeEvent } from "react-native";
import { TouchableOpacity, useWindowDimensions, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import type {
  CommonLoadIdentity,
  CompletedObservationState,
} from "@/lib/training-path/completedCommonLoadObservation";
import { DailyTrainingAdjustmentTray } from "./DailyTrainingAdjustmentTray";
import {
  buildDailyTrainingAdjustmentChartLayout,
  buildDailyTrainingAdjustmentRendererGeometry,
  clampChartMarkerLabelX,
  getDailyTrainingAdjustmentNearestIndex,
  getDailyTrainingAdjustmentScrollOffset,
} from "./dailyTrainingAdjustmentChartLayout";
import {
  buildDailyTrainingAdjustmentAccessibilityValue,
  buildDailyTrainingAdjustmentCartesianContract,
  type DailyTrainingAdjustmentChartDatum,
  dailyTrainingAdjustmentChartYKeys,
  dailyTrainingAdjustmentFitnessYKeys,
  dailyTrainingAdjustmentLoadYKeys,
  hasCompletedActivityWithoutLoad,
  useDailyTrainingAdjustmentChartPresentation,
} from "./dailyTrainingAdjustmentChartPresentation";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";
import type { PlanTrainingChartRange } from "./trainingPathTypes";
import { useChartEdgePrefetch } from "./useChartEdgePrefetch";
import { useInstantChartSelection } from "./useInstantChartSelection";

export type DailyTrainingAdjustmentPoint = {
  completedObservationState?: CompletedObservationState;
  completedCommonLoadIdentity?: CommonLoadIdentity | null;
  date: string;
  hasCompletedActivityWithoutLoad?: boolean;
  hasTargetLoad?: boolean;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveLoad?: number | null;
  effectiveIntensity?: number | null;
  effectiveCompletedLoad?: number | null;
  effectiveRemainingLoad?: number | null;
  recommendedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  recommendedLoad?: number | null;
  plannedLoad?: number | null;
  completedLoad?: number | null;
  targetLoad?: number | null;
  actualOrScheduledLoad?: number | null;
  loadDelta?: number | null;
  plannedDelta?: number | null;
  fitnessCtl?: number | null;
  targetFitnessCtl?: number | null;
  scheduledFitnessCtl?: number | null;
  actualFatigueAtl?: number | null;
  scheduledFatigueAtl?: number | null;
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
  formatDateLabel?: (dateKey: string, index: number) => string;
  maxVisiblePoints?: number;
  onPreviewSelectedDateChange?: (date: string) => void;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  range?: PlanTrainingChartRange;
  /** Compatibility-only; Plan never renders recommendation layers. */
  showRecommendedProjection?: boolean;
  todayDate?: string | null;
};

const axisWidth = 42;
const chartTopPadding = 18;

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("@/assets/fonts/SpaceMono-Regular.ttf") as Parameters<typeof useFont>[0];
  } catch {
    return undefined;
  }
};

function buildTicks(domain: [number, number], count = 5) {
  const [min, max] = domain;
  if (count <= 1) return [max];
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
      accessible={false}
      className="relative"
      importantForAccessibility="no-hide-descendants"
      style={{
        width: axisWidth,
        paddingTop: chartTopPadding,
        paddingBottom: 26,
      }}
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
  formatDateLabel,
  height,
  maxVisiblePoints = 168,
  onPreviewSelectedDateChange,
  onScrollNearEnd,
  onScrollNearStart,
  range = "daily",
  showSelectedPointTray = true,
  testID = "daily-training-adjustment-chart",
  todayDate,
}: DailyTrainingAdjustmentChartProps) {
  const [viewportWidth, setViewportWidth] = useState(240);
  const [hasContentMeasurement, setHasContentMeasurement] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasViewportLayout, setHasViewportLayout] = useState(false);
  const windowAnchorDateRef = useRef<string | null>(null);
  const previousSourceRangeRef = useRef<string | null>(null);
  const pendingViewportRestoreDateRef = useRef<string | null>(null);
  const userInteractionActiveRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const axisFont = useFont(getAxisFontSource(), 9);
  const isDark = resolvedTheme === "dark";
  const resolvedHeight = height ?? (density === "compact" ? 190 : density === "detail" ? 270 : 230);
  const chartAreaHeight = Math.max(96, resolvedHeight);
  const nextAnchorDate = selectedDate ?? points[0]?.date ?? null;
  if (
    !windowAnchorDateRef.current ||
    !points.some((point) => point.date === windowAnchorDateRef.current)
  ) {
    windowAnchorDateRef.current = nextAnchorDate;
  }
  const chartWindow = useMemo(
    () =>
      deriveTrainingPathChartWindow({
        anchorDate: windowAnchorDateRef.current,
        maxPoints: maxVisiblePoints,
        points,
        selectedDate,
      }),
    [maxVisiblePoints, points, selectedDate],
  );
  const visiblePoints = chartWindow.visiblePoints;
  const layout = useMemo(
    () =>
      buildDailyTrainingAdjustmentChartLayout({
        bucketCount: visiblePoints.length,
        density,
        fontScale,
        range,
        viewportWidth,
      }),
    [density, fontScale, range, viewportWidth, visiblePoints.length],
  );
  const slotWidth = layout.slotWidth;
  const rendererGeometry = useMemo(
    () => buildDailyTrainingAdjustmentRendererGeometry(layout),
    [layout],
  );
  const visibleSelectedDate = visiblePoints.some((point) => point.date === selectedDate)
    ? selectedDate
    : (chartWindow.anchorDate ?? visiblePoints[0]?.date ?? null);

  const {
    beginMomentum,
    beginPreview,
    endDrag,
    endMomentum,
    previewNearestFromScrollEvent,
    scrollRef,
    scrollToDate,
    selectDate,
    selectRelative,
    selectedPoint,
    phase,
  } = useInstantChartSelection({
    isScrollReady: hasViewportLayout && hasContentMeasurement,
    onPreviewSelectedDateChange,
    onSelectedDateChange,
    points: visiblePoints,
    selectedDate: selectedDate === undefined ? undefined : visibleSelectedDate,
    slotWidth,
    indexForOffset: (offsetX) =>
      getDailyTrainingAdjustmentNearestIndex(layout, offsetX, viewportWidth),
    offsetForIndex: (index) => getDailyTrainingAdjustmentScrollOffset(layout, index, viewportWidth),
  });

  const { chartData, fitnessDomain, labels, loadDomain } =
    useDailyTrainingAdjustmentChartPresentation({
      formatDateLabel,
      bucketCenters: rendererGeometry.map((geometry) => geometry.datumX),
      points: visiblePoints,
      range,
      todayDate,
    });
  const cartesianContract = useMemo(
    () => buildDailyTrainingAdjustmentCartesianContract(chartData),
    [chartData],
  );
  const todayIndex = todayDate ? visiblePoints.findIndex((point) => point.date === todayDate) : -1;
  const scrollableChartWidth = layout.chartContentWidth;
  const prefetchNearEdge = useChartEdgePrefetch({
    onScrollNearEnd,
    onScrollNearStart,
    points: visiblePoints,
    preloadDistance: slotWidth * 14,
    scrollableWidth: scrollableChartWidth,
    viewportWidth,
  });
  const colors = useMemo(
    () => ({
      axisLabel: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(15, 23, 42, 0.72)",
      completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
      fitness: isDark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.95)",
      fatigue: isDark ? "rgba(251, 146, 60, 0.95)" : "rgba(234, 88, 12, 0.95)",
      frame: isDark ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.24)",
      grid: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.12)",
      planned: isDark ? "rgba(59, 130, 246, 0.72)" : "rgba(37, 99, 235, 0.68)",
      projectedFitness: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
      projectedFatigue: isDark ? "rgba(251, 191, 36, 0.95)" : "rgba(217, 119, 6, 0.95)",
      selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
    }),
    [isDark],
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const sourceRangeKey = `${points[0]?.date ?? ""}:${points[points.length - 1]?.date ?? ""}:${points.length}`;
  useEffect(() => {
    const previousSourceRange = previousSourceRangeRef.current;
    previousSourceRangeRef.current = sourceRangeKey;
    if (!previousSourceRange || previousSourceRange === sourceRangeKey) return;

    const anchorDate = windowAnchorDateRef.current;
    if (anchorDate && visiblePoints.some((point) => point.date === anchorDate)) {
      pendingViewportRestoreDateRef.current = anchorDate;
    }
  }, [sourceRangeKey, visiblePoints]);

  useEffect(() => {
    const restoreDate = pendingViewportRestoreDateRef.current;
    if (!restoreDate || phase === "previewing" || !hasViewportLayout || !hasContentMeasurement) {
      return;
    }
    pendingViewportRestoreDateRef.current = null;
    scrollToDate(restoreDate, false);
  }, [hasContentMeasurement, hasViewportLayout, phase, scrollToDate]);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth > 0) setHasViewportLayout(true);
    if (measuredWidth >= 120) {
      setViewportWidth((current) => (current === measuredWidth ? current : measuredWidth));
    }
  }, []);

  const onContentSizeChange = useCallback((width: number) => {
    if (width > 0) setHasContentMeasurement(true);
  }, []);

  const handleScroll = useCallback(
    (event: Parameters<typeof previewNearestFromScrollEvent>[0]) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const nearestIndex = getDailyTrainingAdjustmentNearestIndex(layout, offsetX, viewportWidth);
      const nextAnchorDate = visiblePoints[nearestIndex]?.date ?? windowAnchorDateRef.current;
      windowAnchorDateRef.current = nextAnchorDate;
      if (pendingViewportRestoreDateRef.current && nextAnchorDate) {
        pendingViewportRestoreDateRef.current = nextAnchorDate;
      }
      if (userInteractionActiveRef.current) previewNearestFromScrollEvent(event);
      prefetchNearEdge(offsetX);
    },
    [layout, prefetchNearEdge, previewNearestFromScrollEvent, viewportWidth, visiblePoints],
  );

  const handleScrollBeginDrag = useCallback(() => {
    userInteractionActiveRef.current = true;
    beginPreview();
  }, [beginPreview]);

  const handleMomentumScrollBegin = useCallback(() => {
    userInteractionActiveRef.current = true;
    beginMomentum();
  }, [beginMomentum]);

  const handleMomentumScrollEnd = useCallback(
    (event: Parameters<typeof endMomentum>[0]) => {
      endMomentum(event);
      userInteractionActiveRef.current = false;
    },
    [endMomentum],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") selectRelative(1);
      if (event.nativeEvent.actionName === "decrement") selectRelative(-1);
    },
    [selectRelative],
  );

  const accessibilityValue = buildDailyTrainingAdjustmentAccessibilityValue(selectedPoint);

  if (visiblePoints.length === 0) {
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
          <View accessibilityLabel="Left axis: Load, Common Load">
            <Text className="text-[10px] font-medium text-muted-foreground">Load</Text>
            <Text className="text-[8px] text-muted-foreground">Common Load</Text>
          </View>
          <View accessibilityLabel="Right axis: Training state">
            <Text className="text-[10px] font-medium text-muted-foreground">Training state</Text>
          </View>
        </View>
        <View style={{ height: chartAreaHeight }}>
          {hasMounted ? (
            <View className="flex-1 flex-row">
              <FixedYAxisLabels domain={loadDomain} />
              <View className="flex-1" onLayout={onViewportLayout} testID={`${testID}-viewport`}>
                <View
                  accessible
                  accessibilityActions={[
                    { name: "increment", label: "Select next date" },
                    { name: "decrement", label: "Select previous date" },
                  ]}
                  accessibilityHint="Adjust to select the next or previous date"
                  accessibilityLabel={
                    range === "daily"
                      ? "Daily training adjustment chart"
                      : `${range[0]?.toUpperCase()}${range.slice(1)} training analysis chart`
                  }
                  accessibilityRole="adjustable"
                  accessibilityValue={{ text: accessibilityValue }}
                  className="absolute inset-0"
                  onAccessibilityAction={handleAccessibilityAction}
                  pointerEvents="none"
                  testID={`${testID}-accessibility`}
                />
                <ScrollView
                  ref={scrollRef}
                  horizontal
                  // Time remains chronological left-to-right in RTL locales.
                  contentContainerStyle={{ direction: "ltr" }}
                  decelerationRate="fast"
                  onContentSizeChange={onContentSizeChange}
                  onMomentumScrollBegin={handleMomentumScrollBegin}
                  onMomentumScrollEnd={handleMomentumScrollEnd}
                  onScroll={handleScroll}
                  onScrollBeginDrag={handleScrollBeginDrag}
                  onScrollEndDrag={endDrag}
                  scrollEventThrottle={16}
                  showsHorizontalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={slotWidth}
                  testID={`${testID}-scroll`}
                >
                  <View style={{ height: chartAreaHeight, width: scrollableChartWidth }}>
                    <CartesianChart<
                      DailyTrainingAdjustmentChartDatum,
                      "x",
                      (typeof dailyTrainingAdjustmentChartYKeys)[number]
                    >
                      {...cartesianContract}
                      yKeys={dailyTrainingAdjustmentChartYKeys}
                      padding={{
                        left:
                          layout.firstCenter === layout.lastCenter
                            ? layout.firstCenter - 1
                            : layout.firstCenter,
                        right:
                          layout.firstCenter === layout.lastCenter
                            ? scrollableChartWidth - layout.lastCenter - 1
                            : scrollableChartWidth - layout.lastCenter,
                        top: chartTopPadding,
                        bottom: layout.labelBandHeight,
                      }}
                      domain={{
                        x:
                          layout.firstCenter === layout.lastCenter
                            ? [layout.firstCenter - 1, layout.lastCenter + 1]
                            : [layout.firstCenter, layout.lastCenter],
                      }}
                      domainPadding={{ top: 10, bottom: 0 }}
                      xAxis={{
                        axisSide: "bottom",
                        tickValues: chartData.map((point) => point.x),
                        font: null,
                        labelColor: colors.axisLabel,
                        lineColor: "transparent",
                        lineWidth: 0,
                        formatXLabel: () => "",
                      }}
                      yAxis={[
                        {
                          yKeys: dailyTrainingAdjustmentLoadYKeys,
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
                          yKeys: dailyTrainingAdjustmentFitnessYKeys,
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
                    >
                      {({ points: plottedPoints, chartBounds }) => (
                        <>
                          {visiblePoints.map((point, index) => {
                            const plannedPoint = plottedPoints.plannedLoad[index];
                            const completedPoint = plottedPoints.completedLoad[index];
                            const showCompletedActivityMarker =
                              hasCompletedActivityWithoutLoad(point);
                            const geometry = rendererGeometry[index];
                            if (!geometry) return null;
                            const center = geometry.datumX;
                            const isSelected = point.date === selectedPoint?.date;
                            return (
                              <Fragment key={`day-${point.date}`}>
                                {isSelected ? (
                                  <SkiaRect
                                    x={geometry.touchTarget.left}
                                    y={chartBounds.top}
                                    width={geometry.touchTarget.width}
                                    height={chartBounds.bottom - chartBounds.top}
                                    color={colors.selected}
                                  />
                                ) : null}
                                {typeof plannedPoint?.y === "number" ? (
                                  <SkiaRect
                                    x={geometry.plannedBar.left}
                                    y={plannedPoint.y}
                                    width={geometry.plannedBar.width}
                                    height={chartBounds.bottom - plannedPoint.y}
                                    color={colors.planned}
                                  />
                                ) : null}
                                {typeof completedPoint?.y === "number" ? (
                                  <SkiaRect
                                    x={geometry.completedBar.left}
                                    y={completedPoint.y}
                                    width={geometry.completedBar.width}
                                    height={chartBounds.bottom - completedPoint.y}
                                    color={colors.completed}
                                  />
                                ) : null}
                                {showCompletedActivityMarker ? (
                                  <>
                                    <SkiaLine
                                      p1={vec(center - 4, chartBounds.bottom - 7)}
                                      p2={vec(center - 1, chartBounds.bottom - 4)}
                                      color={colors.completed}
                                      strokeWidth={2}
                                    />
                                    <SkiaLine
                                      p1={vec(center - 1, chartBounds.bottom - 4)}
                                      p2={vec(center + 5, chartBounds.bottom - 11)}
                                      color={colors.completed}
                                      strokeWidth={2}
                                    />
                                  </>
                                ) : null}
                              </Fragment>
                            );
                          })}
                          <Line
                            points={(plottedPoints.projectedFatigue ?? []).filter(
                              (point) => point.yValue != null,
                            )}
                            color={colors.projectedFatigue}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            points={(plottedPoints.actualFatigue ?? []).filter(
                              (point) => point.yValue != null,
                            )}
                            color={colors.fatigue}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
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
                          {todayIndex >= 0
                            ? (() => {
                                const markerCenter =
                                  rendererGeometry[todayIndex]?.todayMarkerCenter;
                                if (markerCenter === undefined) return null;
                                return (
                                  <>
                                    <SkiaLine
                                      p1={vec(markerCenter, chartBounds.top + 12)}
                                      p2={vec(markerCenter, chartBounds.bottom)}
                                      color={colors.axisLabel}
                                      strokeWidth={1.5}
                                    >
                                      <DashPathEffect intervals={[3, 3]} />
                                    </SkiaLine>
                                    {axisFont ? (
                                      <SkiaText
                                        x={clampChartMarkerLabelX({
                                          center: markerCenter,
                                          chartLeft: chartBounds.left,
                                          chartRight: chartBounds.right,
                                          labelWidth: layout.markerLabelWidth,
                                        })}
                                        y={chartBounds.top + 10}
                                        text="TODAY"
                                        font={axisFont}
                                        color={colors.axisLabel}
                                      />
                                    ) : null}
                                  </>
                                );
                              })()
                            : null}
                        </>
                      )}
                    </CartesianChart>
                    {visiblePoints.filter(hasCompletedActivityWithoutLoad).map((point) => (
                      <View
                        key={`completed-activity-marker-label-${point.date}`}
                        accessibilityLabel={`Completed activity without load on ${point.date}`}
                        accessibilityRole="image"
                        style={{ height: 0, width: 0 }}
                        testID={`completed-activity-marker-label-${point.date}`}
                      />
                    ))}
                    {todayIndex >= 0 ? (
                      <View
                        accessibilityLabel={`Today boundary at ${todayDate}`}
                        accessibilityRole="image"
                        style={{ height: 0, width: 0 }}
                        testID={`${testID}-today-boundary`}
                      />
                    ) : null}
                    {visiblePoints.map((point, index) => (
                      <TouchableOpacity
                        accessibilityHint="Selects this period in the chart"
                        accessibilityLabel={`Select ${labels[index] ?? point.date}, ${point.date}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: point.date === selectedPoint?.date }}
                        activeOpacity={1}
                        key={`bucket-target-${point.date}`}
                        onPress={() => {
                          scrollToDate(point.date);
                          selectDate(point.date);
                        }}
                        style={{
                          bottom: layout.labelBandHeight,
                          left: rendererGeometry[index]?.touchTarget.left ?? 0,
                          position: "absolute",
                          top: chartTopPadding,
                          width: rendererGeometry[index]?.touchTarget.width ?? 44,
                        }}
                        testID={`${testID}-bucket-${point.date}`}
                      />
                    ))}
                    <View
                      className="absolute bottom-0"
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                      style={{
                        left: 0,
                        right: 0,
                        height: layout.labelBandHeight,
                      }}
                      pointerEvents="none"
                    >
                      {labels.map((label, index) => (
                        <View
                          key={`x-label-${visiblePoints[index]?.date ?? index}`}
                          className="items-center"
                          style={{
                            left:
                              (rendererGeometry[index]?.labelCenter ?? 0) - layout.labelWidth / 2,
                            position: "absolute",
                            width: layout.labelWidth,
                          }}
                        >
                          <Text
                            className="text-center text-[8px] text-muted-foreground"
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                            numberOfLines={1}
                            style={{
                              fontSize: layout.labelFontSize,
                              lineHeight: layout.labelLineHeight,
                            }}
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
