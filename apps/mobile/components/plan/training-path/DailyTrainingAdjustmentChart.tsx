import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  Line as SkiaLine,
  Rect as SkiaRect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  getDailyTrainingAdjustmentRendererPointLimit,
  getDailyTrainingAdjustmentScrollOffset,
} from "./dailyTrainingAdjustmentChartLayout";
import {
  buildDailyTrainingAdjustmentAccessibilityValue,
  buildDailyTrainingAdjustmentCartesianContract,
  type DailyTrainingAdjustmentChartDatum,
  dailyTrainingAdjustmentChartYKeys,
  dailyTrainingAdjustmentFitnessYKeys,
  dailyTrainingAdjustmentFormYKeys,
  dailyTrainingAdjustmentLoadYKeys,
  hasCompletedActivityWithoutLoad,
  useDailyTrainingAdjustmentChartPresentation,
} from "./dailyTrainingAdjustmentChartPresentation";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";
import type { PlanTrainingChartRange } from "./trainingPathTypes";
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
  effectiveCompletedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveCompletedLoad?: number | null;
  effectiveRemainingLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveRemainingLoad?: number | null;
  recommendedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  recommendedLoad?: number | null;
  plannedLoad?: number | null;
  plannedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
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
  fillHeight?: boolean;
  height?: number;
  showSelectedPointTray?: boolean;
  testID?: string;
  formatDateLabel?: (dateKey: string, index: number) => string;
  maxVisiblePoints?: number;
  onPreviewSelectedDateChange?: (date: string) => void;
  range?: PlanTrainingChartRange;
  /** Compatibility-only; Plan never renders recommendation layers. */
  showRecommendedProjection?: boolean;
  todayDate?: string | null;
};

const chartTopPadding = 18;
const maxChartCanvasPhysicalWidth = 3840;

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

function isFiniteChartNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function FixedYAxisLabels({
  align = "right",
  domain,
  fontScale,
}: {
  align?: "left" | "right";
  domain: [number, number];
  fontScale: number;
}) {
  const scaledFontSize = 9 * Math.min(Math.max(fontScale, 1), 1.6);
  const longestTick = Math.max(...buildTicks(domain).map((value) => `${Math.round(value)}`.length));
  const resolvedAxisWidth = Math.ceil(
    Math.max(24, Math.min(40, longestTick * scaledFontSize * 0.58 + 6)),
  );
  return (
    <View
      accessible={false}
      className="relative"
      importantForAccessibility="no-hide-descendants"
      style={{
        width: resolvedAxisWidth,
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
            adjustsFontSizeToFit
            minimumFontScale={0.75}
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
  fillHeight = false,
  formatDateLabel,
  height,
  // Keep the Skia surface below common mobile GPU texture limits. The complete
  // bounded API result remains in memory while this renderer mounts a local window.
  maxVisiblePoints = 64,
  onPreviewSelectedDateChange,
  range = "daily",
  showSelectedPointTray = true,
  testID = "daily-training-adjustment-chart",
  todayDate,
}: DailyTrainingAdjustmentChartProps) {
  const [viewportWidth, setViewportWidth] = useState(240);
  const [hasContentMeasurement, setHasContentMeasurement] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasViewportLayout, setHasViewportLayout] = useState(false);
  const [measuredChartAreaHeight, setMeasuredChartAreaHeight] = useState<number | null>(null);
  const [anchorRestorationActive, setAnchorRestorationActive] = useState(false);
  const windowAnchorDateRef = useRef<string | null>(null);
  const pendingViewportRestoreDateRef = useRef<string | null>(null);
  const anchorRestorationActiveRef = useRef(false);
  const interactionActiveRef = useRef(false);
  const hasPendingPointsUpdateRef = useRef(false);
  const latestPointsRef = useRef(points);
  latestPointsRef.current = points;
  const { resolvedTheme } = useTheme();
  const { fontScale, scale = 1 } = useWindowDimensions();
  const cappedFontScale = Math.min(Math.max(fontScale, 1), 1.6);
  const axisFont = useFont(getAxisFontSource(), 9 * cappedFontScale);
  const isDark = resolvedTheme === "dark";
  const resolvedHeight = height ?? (density === "compact" ? 190 : density === "detail" ? 270 : 230);
  const chartAreaHeight = Math.max(96, resolvedHeight);
  const renderedChartAreaHeight = fillHeight ? (measuredChartAreaHeight ?? 1) : chartAreaHeight;
  const nextAnchorDate = selectedDate ?? points[0]?.date ?? null;
  if (
    !windowAnchorDateRef.current ||
    !points.some((point) => point.date === windowAnchorDateRef.current)
  ) {
    windowAnchorDateRef.current = nextAnchorDate;
  }
  const sizingLayout = useMemo(
    () =>
      buildDailyTrainingAdjustmentChartLayout({
        bucketCount: 1,
        density,
        fontScale,
        range,
        viewportWidth,
      }),
    [density, fontScale, range, viewportWidth],
  );
  const rendererPointLimit = getDailyTrainingAdjustmentRendererPointLimit({
    maxPhysicalWidth: maxChartCanvasPhysicalWidth,
    pixelRatio: scale,
    sideInset: sizingLayout.sideInset,
    slotWidth: sizingLayout.slotWidth,
  });
  const boundedRendererPointLimit = Math.min(maxVisiblePoints, rendererPointLimit);
  const [visiblePoints, setVisiblePoints] = useState(
    () =>
      deriveTrainingPathChartWindow({
        anchorDate: windowAnchorDateRef.current,
        maxPoints: boundedRendererPointLimit,
        points,
        ...(selectedDate !== undefined ? { selectedDate } : {}),
      }).visiblePoints,
  );
  const visiblePointsRef = useRef(visiblePoints);
  visiblePointsRef.current = visiblePoints;
  const applyLatestChartWindow = useCallback(
    (anchorDate: string | null) => {
      if (interactionActiveRef.current || anchorRestorationActiveRef.current) return;
      const nextWindow = deriveTrainingPathChartWindow({
        anchorDate,
        maxPoints: boundedRendererPointLimit,
        points: latestPointsRef.current,
        ...(selectedDate !== undefined ? { selectedDate } : {}),
      });
      const current = visiblePointsRef.current;
      const next = nextWindow.visiblePoints;
      if (hasPendingPointsUpdateRef.current && current.length > 0) {
        hasPendingPointsUpdateRef.current = false;
        const latest = latestPointsRef.current;
        const currentStartIndex = latest.findIndex((point) => point.date === current[0]?.date);
        const stableWindow =
          currentStartIndex < 0
            ? []
            : latest.slice(currentStartIndex, currentStartIndex + current.length);
        const retainsVisibleDates =
          stableWindow.length === current.length &&
          stableWindow.every((point, index) => point.date === current[index]?.date);
        if (retainsVisibleDates) {
          // New dates often arrive while the user is dragging at an edge. Keep the
          // same dates in view and refresh only their values, rather than swapping
          // in a re-centered window and imperatively scrolling back into place.
          setVisiblePoints(stableWindow);
          return;
        }
      }
      const isSameWindow =
        current.length === next.length && current.every((point, index) => point === next[index]);
      if (isSameWindow) return;

      const restoreDate =
        anchorDate && next.some((point) => point.date === anchorDate) && current.length > 0
          ? anchorDate
          : null;
      if (restoreDate) {
        pendingViewportRestoreDateRef.current = restoreDate;
        anchorRestorationActiveRef.current = true;
        setAnchorRestorationActive(true);
      }
      setVisiblePoints(next);
    },
    [boundedRendererPointLimit, selectedDate],
  );

  useLayoutEffect(() => {
    latestPointsRef.current = points;
    if (interactionActiveRef.current) {
      hasPendingPointsUpdateRef.current = true;
      return;
    }
    if (anchorRestorationActiveRef.current) return;
    applyLatestChartWindow(windowAnchorDateRef.current);
  }, [applyLatestChartWindow, points]);

  const chartWindow = useMemo(
    () =>
      deriveTrainingPathChartWindow({
        anchorDate: windowAnchorDateRef.current,
        maxPoints: boundedRendererPointLimit,
        points: visiblePoints,
        ...(selectedDate !== undefined ? { selectedDate } : {}),
      }),
    [boundedRendererPointLimit, selectedDate, visiblePoints],
  );
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
  } = useInstantChartSelection({
    isScrollReady: hasViewportLayout && hasContentMeasurement,
    onInteractionSettled: (date) => {
      interactionActiveRef.current = false;
      windowAnchorDateRef.current = date;
      applyLatestChartWindow(date);
    },
    onInteractionStart: () => {
      interactionActiveRef.current = true;
    },
    ...(onPreviewSelectedDateChange !== undefined ? { onPreviewSelectedDateChange } : {}),
    ...(onSelectedDateChange !== undefined ? { onSelectedDateChange } : {}),
    points: visiblePoints,
    ...(selectedDate !== undefined ? { selectedDate: visibleSelectedDate } : {}),
    slotWidth,
    suppressSelectionScroll: anchorRestorationActive,
    indexForOffset: (offsetX) =>
      getDailyTrainingAdjustmentNearestIndex(layout, offsetX, viewportWidth),
    offsetForIndex: (index) => getDailyTrainingAdjustmentScrollOffset(layout, index, viewportWidth),
  });

  const nextPresentation = useDailyTrainingAdjustmentChartPresentation({
    ...(formatDateLabel !== undefined ? { formatDateLabel } : {}),
    bucketCenters: rendererGeometry.map((geometry) => geometry.datumX),
    points: visiblePoints,
    range,
    ...(todayDate !== undefined ? { todayDate } : {}),
  });
  const interactionPresentationRef = useRef(nextPresentation);
  if (!interactionActiveRef.current) {
    interactionPresentationRef.current = nextPresentation;
  }
  // Victory resets its native interaction state when its data identity changes.
  // Freeze the complete plotted presentation for the whole drag/momentum cycle;
  // fetched data is applied only by the settlement callback above.
  const { chartData, fitnessDomain, formDomain, labels, loadDomain } = interactionActiveRef.current
    ? interactionPresentationRef.current
    : nextPresentation;
  const cartesianContract = useMemo(
    () => buildDailyTrainingAdjustmentCartesianContract(chartData),
    [chartData],
  );
  const todayIndex = todayDate ? visiblePoints.findIndex((point) => point.date === todayDate) : -1;
  const scrollableChartWidth = layout.chartContentWidth;
  const colors = useMemo(
    () => ({
      axisLabel: isDark ? "rgba(226, 232, 240, 0.82)" : "rgba(15, 23, 42, 0.72)",
      completed: isDark ? "rgba(34, 197, 94, 0.88)" : "rgba(22, 163, 74, 0.86)",
      fitness: isDark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.95)",
      fatigue: isDark ? "rgba(251, 146, 60, 0.95)" : "rgba(234, 88, 12, 0.95)",
      form: isDark ? "rgba(196, 181, 253, 0.95)" : "rgba(124, 58, 237, 0.95)",
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

  useLayoutEffect(() => {
    const restoreDate = pendingViewportRestoreDateRef.current;
    if (
      !restoreDate ||
      interactionActiveRef.current ||
      !hasViewportLayout ||
      !hasContentMeasurement ||
      !visiblePoints.some((point) => point.date === restoreDate)
    ) {
      return;
    }
    pendingViewportRestoreDateRef.current = null;
    scrollToDate(restoreDate, false);
    anchorRestorationActiveRef.current = false;
    setAnchorRestorationActive(false);
    applyLatestChartWindow(restoreDate);
  }, [
    applyLatestChartWindow,
    hasContentMeasurement,
    hasViewportLayout,
    scrollToDate,
    visiblePoints,
  ]);

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
      if (!interactionActiveRef.current) return;
      const nearestIndex = getDailyTrainingAdjustmentNearestIndex(layout, offsetX, viewportWidth);
      const nextAnchorDate = visiblePoints[nearestIndex]?.date ?? windowAnchorDateRef.current;
      windowAnchorDateRef.current = nextAnchorDate;
      previewNearestFromScrollEvent(event);
    },
    [layout, previewNearestFromScrollEvent, viewportWidth, visiblePoints],
  );

  const handleScrollBeginDrag = useCallback(() => {
    beginPreview();
  }, [beginPreview]);

  const handleMomentumScrollBegin = useCallback(() => {
    beginMomentum();
  }, [beginMomentum]);

  const handleMomentumScrollEnd = useCallback(
    (event: Parameters<typeof endMomentum>[0]) => endMomentum(event),
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
    <View className={fillHeight ? "min-h-0 flex-1 gap-3" : "gap-3"} testID={testID}>
      <View
        className={
          fillHeight
            ? "min-h-0 flex-1 gap-2 rounded-2xl bg-card px-2 py-3"
            : "gap-2 rounded-2xl bg-card px-2 py-3"
        }
      >
        <View className="flex-row items-center justify-between px-1">
          <View accessibilityLabel="Left axis: Load, Common Load">
            <Text className="text-[10px] font-medium text-muted-foreground">Load</Text>
            <Text className="text-[8px] text-muted-foreground">Common Load</Text>
          </View>
          <View accessibilityLabel="Right axis: Fitness / Fatigue">
            <Text className="text-[10px] font-medium text-muted-foreground">Fitness / Fatigue</Text>
            <Text className="text-[8px] text-muted-foreground">Form line shows recovery</Text>
          </View>
        </View>
        <View
          onLayout={
            fillHeight
              ? (event) => setMeasuredChartAreaHeight(event.nativeEvent.layout.height)
              : undefined
          }
          style={fillHeight ? { flex: 1, minHeight: 0 } : { height: chartAreaHeight }}
        >
          {hasMounted ? (
            <View className="flex-1 flex-row">
              <FixedYAxisLabels domain={loadDomain} fontScale={fontScale} />
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
                  persistentScrollbar
                  showsHorizontalScrollIndicator
                  snapToAlignment="start"
                  snapToInterval={slotWidth}
                  testID={`${testID}-scroll`}
                >
                  <View style={{ height: renderedChartAreaHeight, width: scrollableChartWidth }}>
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
                        {
                          // Form uses a signed range but intentionally has no numeric axis.
                          // Its precise value remains in the selected-day summary.
                          yKeys: dailyTrainingAdjustmentFormYKeys,
                          axisSide: "right",
                          domain: formDomain,
                          tickCount: 5,
                          font: null,
                          labelColor: "transparent",
                          lineColor: "transparent",
                          formatYLabel: () => "",
                        },
                      ]}
                      frame={{
                        lineColor: colors.frame,
                        lineWidth: { bottom: 1, left: 0, right: 0, top: 0 },
                      }}
                    >
                      {({ points: plottedPoints, chartBounds }) => (
                        <>
                          <SkiaLine
                            p1={vec(chartBounds.left, (chartBounds.top + chartBounds.bottom) / 2)}
                            p2={vec(chartBounds.right, (chartBounds.top + chartBounds.bottom) / 2)}
                            color={colors.form}
                            opacity={0.3}
                            strokeWidth={1}
                          >
                            <DashPathEffect intervals={[3, 4]} />
                          </SkiaLine>
                          {visiblePoints.map((point, index) => {
                            const plannedPoint = plottedPoints.plannedLoad[index];
                            const completedPoint = plottedPoints.completedLoad[index];
                            const geometry = rendererGeometry[index];
                            if (!geometry) return null;
                            const isSelected = point.date === selectedPoint?.date;
                            const showMissingLoadHighlight = hasCompletedActivityWithoutLoad(point);
                            const showKnownZeroCompletedLoad =
                              point.effectiveCompletedLoadStatus === "known_zero" &&
                              completedPoint?.yValue === 0;
                            return (
                              <Fragment key={`day-${point.date}`}>
                                {isSelected ? (
                                  <SkiaRect
                                    x={geometry.selectionHighlight.left}
                                    y={chartBounds.top}
                                    width={geometry.selectionHighlight.width}
                                    height={chartBounds.bottom - chartBounds.top}
                                    color={colors.selected}
                                  />
                                ) : null}
                                {isFiniteChartNumber(plannedPoint?.yValue) &&
                                isFiniteChartNumber(plannedPoint.y) ? (
                                  <SkiaRect
                                    x={geometry.plannedBar.left}
                                    y={plannedPoint.y}
                                    width={geometry.plannedBar.width}
                                    height={chartBounds.bottom - plannedPoint.y}
                                    color={colors.planned}
                                  />
                                ) : null}
                                {isFiniteChartNumber(completedPoint?.yValue) &&
                                isFiniteChartNumber(completedPoint.y) ? (
                                  <SkiaRect
                                    x={geometry.completedBar.left}
                                    y={completedPoint.y}
                                    width={geometry.completedBar.width}
                                    height={chartBounds.bottom - completedPoint.y}
                                    color={colors.completed}
                                  />
                                ) : null}
                                {showKnownZeroCompletedLoad ? (
                                  <SkiaRect
                                    x={geometry.completedBar.left}
                                    y={chartBounds.bottom - 3}
                                    width={geometry.completedBar.width}
                                    height={3}
                                    color={colors.completed}
                                  />
                                ) : null}
                                {showMissingLoadHighlight ? (
                                  <SkiaRect
                                    x={geometry.touchTarget.left}
                                    y={chartBounds.bottom - 3}
                                    width={geometry.touchTarget.width}
                                    height={3}
                                    color={colors.completed}
                                  />
                                ) : null}
                              </Fragment>
                            );
                          })}
                          <Line
                            connectMissingData={false}
                            points={plottedPoints.projectedFatigue ?? []}
                            color={colors.projectedFatigue}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            connectMissingData={false}
                            points={plottedPoints.actualFatigue ?? []}
                            color={colors.fatigue}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            connectMissingData={false}
                            points={plottedPoints.projectedFitness}
                            color={colors.projectedFitness}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            connectMissingData={false}
                            points={plottedPoints.actualFitness}
                            color={colors.fitness}
                            strokeWidth={2.5}
                            curveType="natural"
                          />
                          <Line
                            connectMissingData={false}
                            points={plottedPoints.form}
                            color={colors.form}
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
                        accessible={false}
                        importantForAccessibility="no-hide-descendants"
                        key={`completed-activity-without-load-highlight-${point.date}`}
                        style={{ height: 0, width: 0 }}
                        testID={`completed-activity-without-load-highlight-${point.date}`}
                      />
                    ))}
                    {visiblePoints
                      .filter((point) => point.effectiveCompletedLoadStatus === "known_zero")
                      .map((point) => (
                        <View
                          accessible={false}
                          importantForAccessibility="no-hide-descendants"
                          key={`known-zero-completed-load-marker-${point.date}`}
                          style={{ height: 0, width: 0 }}
                          testID={`known-zero-completed-load-marker-${point.date}`}
                        />
                      ))}
                    {todayIndex >= 0 ? (
                      <View
                        accessible={false}
                        importantForAccessibility="no-hide-descendants"
                        style={{ height: 0, width: 0 }}
                        testID={`${testID}-today-boundary`}
                      />
                    ) : null}
                    {visiblePoints.map((point, index) => (
                      <TouchableOpacity
                        accessible={false}
                        activeOpacity={1}
                        importantForAccessibility="no-hide-descendants"
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
                      {labels.map((label, index) => {
                        const point = visiblePoints[index];
                        const isKeyDate =
                          index % layout.labelEvery === 0 ||
                          point?.date === selectedPoint?.date ||
                          point?.date === todayDate;
                        if (!isKeyDate) return null;
                        return (
                          <View
                            key={`x-label-${point?.date ?? index}`}
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
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
              <FixedYAxisLabels align="left" domain={fitnessDomain} fontScale={fontScale} />
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
