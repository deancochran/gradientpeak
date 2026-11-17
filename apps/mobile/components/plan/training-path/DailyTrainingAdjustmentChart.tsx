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
import type {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
} from "react-native";
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
  buildDailyTrainingAdjustmentAxisTickLabels,
  buildDailyTrainingAdjustmentChartLayout,
  buildDailyTrainingAdjustmentRendererGeometry,
  clampChartMarkerLabelX,
  type DailyTrainingAdjustmentChartDensity,
  formatDailyTrainingAdjustmentAxisTick,
  getDailyTrainingAdjustmentMinimumSlotWidth,
  getDailyTrainingAdjustmentNearestIndex,
  getDailyTrainingAdjustmentNearestIndexForLocation,
  getDailyTrainingAdjustmentRendererPointLimit,
  getDailyTrainingAdjustmentScrollOffset,
} from "./dailyTrainingAdjustmentChartLayout";
import {
  buildDailyTrainingAdjustmentAccessibilityValue,
  buildDailyTrainingAdjustmentCartesianContract,
  type DailyTrainingAdjustmentChartDatum,
  type dailyTrainingAdjustmentChartYKeys,
  dailyTrainingAdjustmentFatigueTrendYKeys,
  dailyTrainingAdjustmentFitnessTrendYKeys,
  dailyTrainingAdjustmentFormYKeys,
  dailyTrainingAdjustmentLoadYKeys,
  getPlanChartBucketDate,
  useDailyTrainingAdjustmentChartPresentation,
} from "./dailyTrainingAdjustmentChartPresentation";
import { getPlanChartTheme } from "./planChartTheme";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";
import type { PlanTrainingChartRange, PlanTrainingTrendLine } from "./trainingPathTypes";
import { useInstantChartSelection } from "./useInstantChartSelection";

export type DailyTrainingAdjustmentPoint = {
  bucketEndDate?: string;
  bucketStartDate?: string;
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
  recommendedFitnessCtl?: number | null;
  actualFatigueAtl?: number | null;
  scheduledFatigueAtl?: number | null;
  recommendedFatigueAtl?: number | null;
  formTsb?: number | null;
  scheduledFormTsb?: number | null;
  recommendedFormTsb?: number | null;
  readinessScore?: number | null;
  annotations?: Array<{ code: string; severity?: "info" | "warning" | "risk"; message?: string }>;
};

export type DailyTrainingAdjustmentChartProps = {
  points: DailyTrainingAdjustmentPoint[];
  selectedDate?: string | null;
  onSelectedDateChange?: (date: string) => void;
  density?: DailyTrainingAdjustmentChartDensity;
  emptyState?: React.ReactNode;
  fillHeight?: boolean;
  fitRange?: boolean;
  height?: number;
  testID?: string;
  formatDateLabel?: (dateKey: string, index: number) => string;
  goalDates?: readonly string[];
  goalMarkers?: readonly PlanLoadGoalMarker[];
  primaryGoalId?: string | null;
  onGoalPress?: (goalId: string) => void;
  onReachEnd?: () => void;
  onReachStart?: () => void;
  loadOnly?: boolean;
  range?: PlanTrainingChartRange;
  showSelectedTray?: boolean;
  maxVisiblePoints?: number;
  onPreviewSelectedDateChange?: (date: string) => void;
  todayDate?: string | null;
  visibleTrends?: readonly PlanTrainingTrendLine[];
};

export type PlanLoadGoalMarker = {
  id: string;
  label: string;
  priority: number;
  targetDate: string;
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
  const ticks = buildDailyTrainingAdjustmentAxisTickLabels(domain);
  const longestTick = Math.max(...ticks.map(({ label }) => label.length));
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
        {ticks.map(({ label, value }) => (
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
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CompactTrendAxes({
  axes,
}: {
  axes: ReadonlyArray<{ color: string; domain: [number, number]; label: string }>;
}) {
  return (
    <View className="w-20 justify-center gap-2 pl-2">
      {axes.map((axis) => (
        <View key={axis.label}>
          <Text className="text-[9px] font-semibold" style={{ color: axis.color }}>
            {axis.label}
          </Text>
          <Text className="text-[9px] text-muted-foreground">
            {Math.round(axis.domain[0])}–{Math.round(axis.domain[1])}
          </Text>
        </View>
      ))}
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
  fitRange = false,
  formatDateLabel,
  goalDates = [],
  goalMarkers = [],
  height,
  loadOnly = false,
  // Keep the Skia surface below common mobile GPU texture limits. The complete
  // bounded API result remains in memory while this renderer mounts a local window.
  maxVisiblePoints = 64,
  onGoalPress,
  onPreviewSelectedDateChange,
  onReachEnd,
  onReachStart,
  primaryGoalId = null,
  range = "daily",
  showSelectedTray = true,
  testID = "daily-training-adjustment-chart",
  todayDate,
  visibleTrends,
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
  const rendererMinimumSlotWidth = getDailyTrainingAdjustmentMinimumSlotWidth({
    density,
    fontScale,
    range,
  });
  const rendererPointLimit = getDailyTrainingAdjustmentRendererPointLimit({
    maxPhysicalWidth: maxChartCanvasPhysicalWidth,
    minimumSlotWidth: rendererMinimumSlotWidth,
    pixelRatio: scale,
    sideInset: 0,
  });
  const boundedRendererPointLimit = fitRange
    ? Math.max(1, points.length)
    : Math.min(maxVisiblePoints, rendererPointLimit);
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
        fitRange,
        fontScale,
        pixelRatio: scale,
        range,
        viewportWidth,
      }),
    [density, fitRange, fontScale, range, scale, viewportWidth, visiblePoints.length],
  );
  const slotWidth = layout.slotWidth;
  const rendererGeometry = useMemo(
    () => buildDailyTrainingAdjustmentRendererGeometry(layout),
    [layout],
  );
  const activeTrends = useMemo(
    () =>
      new Set<PlanTrainingTrendLine>(
        visibleTrends ?? (loadOnly ? [] : ["fitness", "fatigue", "form"]),
      ),
    [loadOnly, visibleTrends],
  );
  const showFitness = activeTrends.has("fitness");
  const showFatigue = activeTrends.has("fatigue");
  const showForm = activeTrends.has("form");
  const hasTrendLines = showFitness || showFatigue || showForm;
  const showChartChrome = density !== "compact";
  const legacyAllTrends = visibleTrends === undefined && !loadOnly;
  const visibleSelectedDate = visiblePoints.some((point) => point.date === selectedDate)
    ? selectedDate
    : (chartWindow.anchorDate ?? visiblePoints[0]?.date ?? null);

  const {
    beginMomentum,
    beginPreview,
    endDrag,
    endMomentum,
    previewNearestFromScrollEvent,
    previewIndex,
    scrollRef,
    scrollToDate,
    selectDate,
    selectRelative,
    settleIndex,
    selectedPoint,
  } = useInstantChartSelection({
    isScrollReady: !fitRange && hasViewportLayout && hasContentMeasurement,
    onInteractionSettled: (date) => {
      interactionActiveRef.current = false;
      windowAnchorDateRef.current = date;
      applyLatestChartWindow(date);
      if (date === points[0]?.date) onReachStart?.();
      if (date === points.at(-1)?.date) onReachEnd?.();
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
    interpolateTrends: visibleTrends !== undefined,
    points: visiblePoints,
    range,
    tightLoadDomain: fitRange,
    ...(todayDate !== undefined ? { todayDate } : {}),
  });
  const interactionPresentationRef = useRef(nextPresentation);
  const presentationScope = `${range}:${visiblePoints[0]?.date ?? ""}:${visiblePoints.at(-1)?.date ?? ""}:${visiblePoints.length}`;
  const presentationScopeRef = useRef(presentationScope);
  if (presentationScopeRef.current !== presentationScope) {
    presentationScopeRef.current = presentationScope;
    interactionActiveRef.current = false;
    hasPendingPointsUpdateRef.current = false;
    interactionPresentationRef.current = nextPresentation;
  } else if (!interactionActiveRef.current) {
    interactionPresentationRef.current = nextPresentation;
  }
  // Victory resets its native interaction state when its data identity changes.
  // Freeze the complete plotted presentation for the whole drag/momentum cycle;
  // fetched data is applied only by the settlement callback above.
  const { chartData, fatigueDomain, fitnessDomain, formDomain, labels, loadDomain } =
    interactionActiveRef.current ? interactionPresentationRef.current : nextPresentation;
  const cartesianContract = useMemo(
    () => buildDailyTrainingAdjustmentCartesianContract(chartData),
    [chartData],
  );
  const todayBucketDate = todayDate ? getPlanChartBucketDate(todayDate, range) : null;
  const todayIndex = todayBucketDate
    ? visiblePoints.findIndex(
        (point) => getPlanChartBucketDate(point.date, range) === todayBucketDate,
      )
    : -1;
  const resolvedGoalMarkers = useMemo(
    () =>
      goalMarkers.length > 0
        ? [...goalMarkers]
        : goalDates.map((targetDate, index) => ({
            id: `legacy-goal-${index}`,
            label: "Goal",
            priority: 0,
            targetDate,
          })),
    [goalDates, goalMarkers],
  );
  const goalGroups = useMemo(() => {
    const groups = new Map<string, PlanLoadGoalMarker[]>();
    for (const marker of resolvedGoalMarkers) {
      const bucketDate = getPlanChartBucketDate(marker.targetDate, range);
      const group = groups.get(bucketDate);
      if (group) group.push(marker);
      else groups.set(bucketDate, [marker]);
    }
    return [...groups.entries()].map(([date, markers]) => ({
      date,
      markers: markers.sort(
        (left, right) =>
          right.priority - left.priority ||
          left.targetDate.localeCompare(right.targetDate) ||
          left.id.localeCompare(right.id),
      ),
    }));
  }, [range, resolvedGoalMarkers]);
  const goalIndexes = goalGroups.flatMap((group) => {
    const index = visiblePoints.findIndex(
      (point) => getPlanChartBucketDate(point.date, range) === group.date,
    );
    return index >= 0 ? [{ ...group, index }] : [];
  });
  const visibleStart = visiblePoints[0]
    ? getPlanChartBucketDate(visiblePoints[0].date, range)
    : undefined;
  const lastVisiblePoint = visiblePoints.at(-1);
  const visibleEnd = lastVisiblePoint
    ? getPlanChartBucketDate(lastVisiblePoint.date, range)
    : undefined;
  const goalsBefore = visibleStart
    ? goalGroups.filter((group) => group.date < visibleStart).flatMap((group) => group.markers)
    : [];
  const goalsAfter = visibleEnd
    ? goalGroups.filter((group) => group.date > visibleEnd).flatMap((group) => group.markers)
    : [];
  const renderedYKeys = [
    ...dailyTrainingAdjustmentLoadYKeys,
    ...(showFitness ? dailyTrainingAdjustmentFitnessTrendYKeys : []),
    ...(showFatigue ? dailyTrainingAdjustmentFatigueTrendYKeys : []),
    ...(showForm ? dailyTrainingAdjustmentFormYKeys : []),
  ];
  const chartRenderKey = `${presentationScope}:${renderedYKeys.join(",")}:${chartData
    .map((point) => `${point.fitness ?? ""},${point.fatigue ?? ""},${point.form ?? ""}`)
    .join(";")}`;
  const scrollableChartWidth = layout.chartContentWidth;
  const colors = useMemo(() => getPlanChartTheme(resolvedTheme), [resolvedTheme]);

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

  const fittedIndexFromEvent = useCallback(
    (event: GestureResponderEvent) =>
      getDailyTrainingAdjustmentNearestIndexForLocation(layout, event.nativeEvent.locationX),
    [layout],
  );

  const handleFittedSelectionStart = useCallback(
    (event: GestureResponderEvent) => {
      beginPreview();
      previewIndex(fittedIndexFromEvent(event));
    },
    [beginPreview, fittedIndexFromEvent, previewIndex],
  );

  const handleFittedSelectionMove = useCallback(
    (event: GestureResponderEvent) => previewIndex(fittedIndexFromEvent(event)),
    [fittedIndexFromEvent, previewIndex],
  );

  const handleFittedSelectionEnd = useCallback(
    (event: GestureResponderEvent) => settleIndex(fittedIndexFromEvent(event)),
    [fittedIndexFromEvent, settleIndex],
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
        {showChartChrome ? (
          <View className="flex-row items-center justify-between px-1">
            <View accessibilityLabel="Left axis: Load, Common Load">
              <Text className="text-[10px] font-medium text-muted-foreground">Load</Text>
            </View>
            {hasTrendLines ? (
              <View
                accessibilityLabel={
                  legacyAllTrends
                    ? "Right axis: Fitness / Fatigue"
                    : `Trend lines: ${[
                        showFitness ? "Fitness" : null,
                        showFatigue ? "Fatigue" : null,
                        showForm ? "Form" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}`
                }
              >
                <Text className="text-[10px] font-medium text-muted-foreground">
                  {legacyAllTrends
                    ? "Fitness / Fatigue"
                    : [
                        showFitness ? "Fitness" : null,
                        showFatigue ? "Fatigue" : null,
                        showForm ? "Form" : null,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
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
              {showChartChrome ? (
                <FixedYAxisLabels domain={loadDomain} fontScale={fontScale} />
              ) : null}
              <View className="flex-1" onLayout={onViewportLayout} testID={`${testID}-viewport`}>
                <View
                  accessible
                  accessibilityActions={[
                    { name: "increment", label: "Select next date" },
                    { name: "decrement", label: "Select previous date" },
                  ]}
                  accessibilityHint="Adjust to select the next or previous date"
                  accessibilityLabel={
                    legacyAllTrends
                      ? "Daily training adjustment chart"
                      : hasTrendLines
                        ? "Plan Load and trend timeline"
                        : "Plan Load timeline"
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
                  persistentScrollbar={!fitRange}
                  scrollEnabled={!fitRange}
                  showsHorizontalScrollIndicator={!fitRange}
                  snapToAlignment="start"
                  snapToInterval={fitRange ? undefined : slotWidth}
                  testID={`${testID}-scroll`}
                >
                  <View style={{ height: renderedChartAreaHeight, width: scrollableChartWidth }}>
                    <CartesianChart<
                      DailyTrainingAdjustmentChartDatum,
                      "x",
                      (typeof dailyTrainingAdjustmentChartYKeys)[number]
                    >
                      {...cartesianContract}
                      key={chartRenderKey}
                      yKeys={renderedYKeys}
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
                          formatYLabel: (value: unknown) =>
                            formatDailyTrainingAdjustmentAxisTick(Number(value), loadDomain),
                        },
                        ...(showFitness
                          ? [
                              {
                                yKeys: dailyTrainingAdjustmentFitnessTrendYKeys,
                                axisSide: "right" as const,
                                domain: fitnessDomain,
                                tickCount: 5,
                                font: null,
                                labelColor: colors.axisLabel,
                                lineColor: "transparent",
                                formatYLabel: (value: unknown) =>
                                  formatDailyTrainingAdjustmentAxisTick(
                                    Number(value),
                                    fitnessDomain,
                                  ),
                              },
                            ]
                          : []),
                        ...(showFatigue
                          ? [
                              {
                                yKeys: dailyTrainingAdjustmentFatigueTrendYKeys,
                                axisSide: "right" as const,
                                domain: fatigueDomain,
                                tickCount: 5,
                                font: null,
                                labelColor: "transparent",
                                lineColor: "transparent",
                                formatYLabel: () => "",
                              },
                            ]
                          : []),
                        ...(showForm
                          ? [
                              {
                                // Form uses a signed range but intentionally has no numeric axis.
                                // Its precise value remains in the selected-day summary.
                                yKeys: dailyTrainingAdjustmentFormYKeys,
                                axisSide: "right" as const,
                                domain: formDomain,
                                tickCount: 5,
                                font: null,
                                labelColor: "transparent",
                                lineColor: "transparent",
                                formatYLabel: () => "",
                              },
                            ]
                          : []),
                      ]}
                      frame={{
                        lineColor: colors.frame,
                        lineWidth: { bottom: 1, left: 0, right: 0, top: 0 },
                      }}
                    >
                      {({ points: plottedPoints, chartBounds }) => (
                        <>
                          {showForm ? (
                            <SkiaLine
                              p1={vec(chartBounds.left, (chartBounds.top + chartBounds.bottom) / 2)}
                              p2={vec(
                                chartBounds.right,
                                (chartBounds.top + chartBounds.bottom) / 2,
                              )}
                              color={colors.form}
                              opacity={0.3}
                              strokeWidth={1}
                            >
                              <DashPathEffect intervals={[3, 4]} />
                            </SkiaLine>
                          ) : null}
                          {visiblePoints.map((point, index) => {
                            const plannedPoint = plottedPoints.plannedLoad[index];
                            const completedPoint = plottedPoints.completedLoad[index];
                            const geometry = rendererGeometry[index];
                            if (!geometry) return null;
                            const isSelected = point.date === selectedPoint?.date;
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
                                plannedPoint.yValue > 0 &&
                                isFiniteChartNumber(plannedPoint.y) ? (
                                  <SkiaRect
                                    x={geometry.plannedBar.left}
                                    y={plannedPoint.y}
                                    width={geometry.plannedBar.width}
                                    height={chartBounds.bottom - plannedPoint.y}
                                    color={colors.plannedLoad}
                                  />
                                ) : null}
                                {isFiniteChartNumber(completedPoint?.yValue) &&
                                completedPoint.yValue > 0 &&
                                isFiniteChartNumber(completedPoint.y) ? (
                                  <SkiaRect
                                    x={geometry.completedBar.left}
                                    y={completedPoint.y}
                                    width={geometry.completedBar.width}
                                    height={chartBounds.bottom - completedPoint.y}
                                    color={colors.completedLoad}
                                    opacity={1}
                                  />
                                ) : null}
                              </Fragment>
                            );
                          })}
                          {hasTrendLines ? (
                            <>
                              {showFatigue ? (
                                <Line
                                  connectMissingData
                                  points={plottedPoints.fatigue}
                                  color={colors.fatigue}
                                  strokeWidth={2.5}
                                  curveType="natural"
                                />
                              ) : null}
                              {showFitness ? (
                                <Line
                                  connectMissingData
                                  points={plottedPoints.fitness}
                                  color={colors.fitness}
                                  strokeWidth={2.5}
                                  curveType="natural"
                                />
                              ) : null}
                              {showForm ? (
                                <Line
                                  connectMissingData
                                  points={plottedPoints.form}
                                  color={colors.form}
                                  strokeWidth={2.5}
                                  curveType="natural"
                                />
                              ) : null}
                            </>
                          ) : null}
                          {goalIndexes.map(({ date, index, markers }) => {
                            const markerCenter = rendererGeometry[index]?.todayMarkerCenter;
                            if (markerCenter === undefined) return null;
                            const primary = markers.some((marker) => marker.id === primaryGoalId);
                            return (
                              <Fragment key={`goal-${date}`}>
                                <SkiaLine
                                  p1={vec(markerCenter, chartBounds.top + 12)}
                                  p2={vec(markerCenter, chartBounds.bottom)}
                                  color={primary ? colors.target : colors.axisLabel}
                                  strokeWidth={primary ? 2.5 : 1.5}
                                >
                                  <DashPathEffect intervals={[4, 4]} />
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
                                    text={markers.length > 1 ? `GOAL ×${markers.length}` : "GOAL"}
                                    font={axisFont}
                                    color={primary ? colors.target : colors.axisLabel}
                                  />
                                ) : null}
                              </Fragment>
                            );
                          })}
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
                    {todayIndex >= 0 ? (
                      <View
                        accessible={false}
                        importantForAccessibility="no-hide-descendants"
                        style={{ height: 0, width: 0 }}
                        testID={`${testID}-today-boundary`}
                      />
                    ) : null}
                    {fitRange
                      ? null
                      : visiblePoints.map((point, index) => (
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
                    {fitRange
                      ? null
                      : goalIndexes.map(({ date, index, markers }) => {
                          const markerCenter = rendererGeometry[index]?.todayMarkerCenter;
                          const first = markers[0];
                          if (markerCenter === undefined || !first) return null;
                          return (
                            <TouchableOpacity
                              accessibilityLabel={
                                markers.length > 1
                                  ? `${markers.length} goals on ${date}. Open ${first.label}`
                                  : `Open goal ${first.label}`
                              }
                              accessibilityRole={onGoalPress ? "button" : undefined}
                              className="absolute top-0 min-h-11 min-w-11"
                              disabled={!onGoalPress}
                              key={`goal-target-${date}`}
                              onPress={() => onGoalPress?.(first.id)}
                              style={{ left: markerCenter - 22, width: 44 }}
                              testID={`${testID}-goal-marker-${date}`}
                            />
                          );
                        })}
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
                          point?.date === todayBucketDate;
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
                {fitRange ? (
                  <View
                    accessible={false}
                    className="absolute inset-0"
                    importantForAccessibility="no"
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={handleFittedSelectionStart}
                    onResponderMove={handleFittedSelectionMove}
                    onResponderRelease={handleFittedSelectionEnd}
                    onResponderTerminate={handleFittedSelectionEnd}
                    onStartShouldSetResponder={() => true}
                    testID={`${testID}-fitted-interaction`}
                  />
                ) : null}
                {goalsBefore.length > 0 ? (
                  <TouchableOpacity
                    accessibilityLabel={`${goalsBefore.length} goals before this view`}
                    accessibilityRole={onGoalPress ? "button" : undefined}
                    className="absolute left-1 top-1 min-h-11 min-w-11 items-center justify-center rounded-full bg-card/90"
                    disabled={!onGoalPress}
                    onPress={() => {
                      const first = goalsBefore[0];
                      if (first) onGoalPress?.(first.id);
                    }}
                    testID={`${testID}-goals-before`}
                  >
                    <Text className="font-semibold text-foreground">‹{goalsBefore.length}</Text>
                  </TouchableOpacity>
                ) : null}
                {goalsAfter.length > 0 ? (
                  <TouchableOpacity
                    accessibilityLabel={`${goalsAfter.length} goals after this view`}
                    accessibilityRole={onGoalPress ? "button" : undefined}
                    className="absolute right-1 top-1 min-h-11 min-w-11 items-center justify-center rounded-full bg-card/90"
                    disabled={!onGoalPress}
                    onPress={() => {
                      const first = goalsAfter[0];
                      if (first) onGoalPress?.(first.id);
                    }}
                    testID={`${testID}-goals-after`}
                  >
                    <Text className="font-semibold text-foreground">{goalsAfter.length}›</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {hasTrendLines && showChartChrome ? (
                <CompactTrendAxes
                  axes={[
                    ...(showFitness
                      ? [{ color: colors.fitness, domain: fitnessDomain, label: "Fit" }]
                      : []),
                    ...(showFatigue
                      ? [{ color: colors.fatigue, domain: fatigueDomain, label: "Fat" }]
                      : []),
                    ...(showForm
                      ? [{ color: colors.form, domain: formDomain, label: "Form" }]
                      : []),
                  ]}
                />
              ) : null}
            </View>
          ) : (
            <View className="flex-1 items-center justify-center rounded-2xl bg-muted/20">
              <Text className="text-sm text-muted-foreground">Preparing chart…</Text>
            </View>
          )}
        </View>
      </View>
      {showSelectedTray && selectedPoint ? (
        <DailyTrainingAdjustmentTray point={selectedPoint} />
      ) : null}
    </View>
  );
});
