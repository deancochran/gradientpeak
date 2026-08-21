import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  interpolateColors,
  Line as SkiaLine,
  Rect as SkiaRect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { CartesianChart, Line, useChartPressState } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import {
  getCenteredWeekIndex,
  getChartSideInset,
  getWeekScrollOffset,
} from "./trainingPathScrollSnap";
import type { TrainingPathRange, TrainingPathViewModel } from "./trainingPathTypes";

type ChartDatum = Record<string, unknown> & {
  index: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  targetLoad: number | null;
  fitness: number | null;
  scheduledFitness: number | null;
  targetFitness: number | null;
};

type ChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "targetLoad"
  | "fitness"
  | "scheduledFitness"
  | "targetFitness";

type TrainingPathChartProps = {
  model: TrainingPathViewModel;
  range: TrainingPathRange;
  onSelectedWeekChange?: (weekStart: string) => void;
  height?: number;
  domains?: TrainingPathViewModel["domains"];
  fillHeight?: boolean;
  scrollX?: boolean;
  reviewWeeks?: boolean;
  showCompletedLoad?: boolean;
  showPlannedLoad?: boolean;
  showScheduledFitness?: boolean;
  onScrollInteractionStart?: () => void;
  onScrollInteractionSettled?: () => void;
  onDisplayedWeekChange?: (weekStart: string) => void;
};

const yKeys: ChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "targetLoad",
  "fitness",
  "scheduledFitness",
  "targetFitness",
];
const loadKeys: ChartYKey[] = ["completedLoad", "plannedLoad", "targetLoad"];
const fitnessKeys: ChartYKey[] = ["fitness", "scheduledFitness", "targetFitness"];
const initialChartPressState: { x: number; y: Record<ChartYKey, number> } = {
  x: 0,
  y: {
    completedLoad: 0,
    fitness: 0,
    plannedLoad: 0,
    scheduledFitness: 0,
    targetFitness: 0,
    targetLoad: 0,
  },
};
const chartPadding = { left: 8, right: 8, top: 20, bottom: 26 };
const fixedAxisWidth = 34;
const scrollWeekWidth = 38;
const scrollBarWidth = 28;

const formatAccessibleMetric = (label: string, value: number | null, unit = "") =>
  typeof value === "number" && Number.isFinite(value)
    ? `${label} ${Math.round(value)}${unit}`
    : `${label} unavailable`;

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
  const chartWidth = Math.max(4, chartRight - chartLeft);
  const slotWidth = Math.min(
    chartWidth,
    Math.max(4, Math.min(Math.abs(leftStep), Math.abs(rightStep)) || chartWidth),
  );
  return { center: current.x, width: slotWidth };
}

function getLoadBarGeometry(
  pointsByKey: Partial<Record<ChartYKey, Array<{ x: number }>>>,
  index: number,
  chartLeft: number,
  chartRight: number,
) {
  return (
    getBarGeometry(pointsByKey.completedLoad ?? [], index, chartLeft, chartRight) ??
    getBarGeometry(pointsByKey.plannedLoad ?? [], index, chartLeft, chartRight) ??
    getBarGeometry(pointsByKey.targetLoad ?? [], index, chartLeft, chartRight)
  );
}

function getSleeveBarWidth(slotWidth: number, weekCount: number, fixedWidth?: number) {
  if (typeof fixedWidth === "number") return Math.min(fixedWidth, Math.max(4, slotWidth - 6));
  if (weekCount > 80) return Math.max(4, slotWidth * 0.78);
  if (weekCount > 52) return Math.max(5, slotWidth * 0.82);
  if (weekCount > 30) return Math.max(6, slotWidth * 0.88);
  return Math.max(8, slotWidth * 0.94);
}

function getVisibleBarLeft(center: number, width: number, chartLeft: number, chartRight: number) {
  if (width >= chartRight - chartLeft) return chartLeft;
  return Math.max(chartLeft, Math.min(center - width / 2, chartRight - width));
}

function AnimatedFocusedRect({
  activeColor,
  chartScrollX,
  dimColor,
  height,
  index,
  scrollSlotWidth,
  strokeWidth,
  style,
  width,
  x,
  y,
}: {
  activeColor: string;
  chartScrollX: SharedValue<number>;
  dimColor: string;
  height: number;
  index: number;
  scrollSlotWidth: number;
  strokeWidth?: number;
  style?: "fill" | "stroke";
  width: number;
  x: number;
  y: number;
}) {
  const focus = useDerivedValue(() => {
    const distance = Math.abs(chartScrollX.value - index * scrollSlotWidth);
    return Math.max(0, Math.min(1, 1 - distance / scrollSlotWidth));
  });
  const color = useDerivedValue(() =>
    interpolateColors(focus.value, [0, 1], [dimColor, activeColor]),
  );
  const opacity = useDerivedValue(() => 0.58 + focus.value * 0.42);

  return (
    <SkiaRect
      x={x}
      y={y}
      width={width}
      height={height}
      color={color}
      opacity={opacity}
      style={style}
      strokeWidth={strokeWidth}
    />
  );
}

function buildLinearTicks(domain: [number, number], count = 5) {
  const [min, max] = domain;
  if (count <= 1 || min === max) return [max];
  return Array.from({ length: count }, (_, index) => max - ((max - min) * index) / (count - 1));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function expandDomainToValues(
  domain: [number, number],
  values: number[],
  headroomRatio = 0.12,
): [number, number] {
  const finiteValues = values.filter(isFiniteNumber);
  if (finiteValues.length === 0) return domain;

  const min = Math.min(domain[0], 0, ...finiteValues);
  const maxValue = Math.max(domain[1], ...finiteValues);
  const span = Math.max(1, maxValue - min);
  const paddedMax = maxValue + Math.max(4, span * headroomRatio);

  return [min, paddedMax];
}

function getRenderedLoadDomain({
  baseDomain,
  chartData,
  range,
  showCompletedLoad,
  showPlannedLoad,
}: {
  baseDomain: [number, number];
  chartData: ChartDatum[];
  range: TrainingPathRange;
  showCompletedLoad: boolean;
  showPlannedLoad: boolean;
}) {
  const values: number[] = [];
  const showPlanningLayers = range !== "all";

  for (const datum of chartData) {
    if (showCompletedLoad && isFiniteNumber(datum.completedLoad)) values.push(datum.completedLoad);
    if (showPlanningLayers && isFiniteNumber(datum.targetLoad)) values.push(datum.targetLoad);
    if (showPlanningLayers && showPlannedLoad && isFiniteNumber(datum.plannedLoad)) {
      values.push(datum.plannedLoad);
    }
  }

  return expandDomainToValues(baseDomain, values);
}

function getRenderedFitnessDomain({
  baseDomain,
  chartData,
  showScheduledFitness,
}: {
  baseDomain: [number, number];
  chartData: ChartDatum[];
  showScheduledFitness: boolean;
}) {
  const values: number[] = [];

  for (const datum of chartData) {
    if (isFiniteNumber(datum.fitness)) values.push(datum.fitness);
    if (isFiniteNumber(datum.targetFitness)) values.push(datum.targetFitness);
    if (showScheduledFitness && isFiniteNumber(datum.scheduledFitness)) {
      values.push(datum.scheduledFitness);
    }
  }

  return expandDomainToValues(baseDomain, values, 0.08);
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
  const resolvedAxisWidth = Math.ceil(fixedAxisWidth * Math.min(Math.max(fontScale, 1), 1.6));
  return (
    <View
      accessible={false}
      className="relative"
      importantForAccessibility="no-hide-descendants"
      style={{
        width: resolvedAxisWidth,
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

export function TrainingPathChart({
  model,
  range,
  onSelectedWeekChange,
  height = 430,
  domains = model.domains,
  fillHeight = false,
  scrollX = false,
  reviewWeeks = true,
  showCompletedLoad = true,
  showPlannedLoad = true,
  showScheduledFitness = true,
  onScrollInteractionStart,
  onScrollInteractionSettled,
  onDisplayedWeekChange,
}: TrainingPathChartProps) {
  const [chartWidth, setChartWidth] = useState(320);
  const [scrollViewportWidth, setScrollViewportWidth] = useState(240);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
  const centeredWeekIndexRef = useRef<number | null>(null);
  const latestScrollOffsetRef = useRef(0);
  const deferredCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteractingRef = useRef(false);
  const displayedWeekIndexRef = useRef<number | null>(null);
  const chartScrollX = useSharedValue(0);
  const { state: chartPressState } = useChartPressState(initialChartPressState);
  const animatedScrollHandler = useAnimatedScrollHandler((event) => {
    chartScrollX.value = event.contentOffset.x;
  });
  const { fontScale = 1 } = useWindowDimensions();
  const cappedFontScale = Math.min(Math.max(fontScale, 1), 1.6);
  const resolvedScrollWeekWidth = Math.ceil(scrollWeekWidth * cappedFontScale);
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
    selected: isDark ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.08)",
    scheduledFitness: isDark ? "rgba(96, 165, 250, 0.95)" : "rgba(37, 99, 235, 0.95)",
    target: isDark ? "rgba(148, 163, 184, 0.34)" : "rgba(100, 116, 139, 0.24)",
    targetDimmed: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(100, 116, 139, 0.1)",
    targetFitness: isDark ? "rgba(248, 250, 252, 0.5)" : "rgba(15, 23, 42, 0.42)",
  };
  const axisFont = useFont(getAxisFontSource(), 9 * cappedFontScale);
  const hasGoalBackedRecommendation =
    model.goalMarkers.length > 0 &&
    model.weeks.some(
      (week) =>
        week.recommendedLoadStatus === "complete" || week.recommendedLoadStatus === "known_zero",
    );
  const labels = useMemo(() => model.weeks.map((week) => week.label), [model.weeks]);
  const chartData: ChartDatum[] = useMemo(
    () =>
      model.weeks.map((week, index) => {
        const plannedLoadStatus =
          week.effectiveRemainingLoad === undefined
            ? (week.plannedLoadStatus ?? week.effectiveLoadStatus)
            : (week.effectiveRemainingLoadStatus ?? week.effectiveLoadStatus);
        return {
          index,
          completedLoad: week.effectiveCompletedLoad ?? null,
          plannedLoad:
            plannedLoadStatus === "unavailable"
              ? null
              : week.effectiveRemainingLoad === undefined
                ? (week.plannedLoad ?? null)
                : week.effectiveRemainingLoad,
          // Only the explicit versioned common-Load recommendation may share this axis.
          targetLoad:
            hasGoalBackedRecommendation &&
            (week.recommendedLoadStatus === "complete" ||
              week.recommendedLoadStatus === "known_zero")
              ? (week.recommendedLoad ?? null)
              : null,
          fitness: week.fitness,
          scheduledFitness: week.scheduledFitness,
          targetFitness:
            hasGoalBackedRecommendation &&
            (week.recommendedLoadStatus === "complete" ||
              week.recommendedLoadStatus === "known_zero")
              ? week.targetFitness
              : null,
        };
      }),
    [hasGoalBackedRecommendation, model.weeks],
  );
  const effectiveLoadDomain = useMemo(
    () =>
      getRenderedLoadDomain({
        baseDomain: domains.load,
        chartData,
        range,
        showCompletedLoad,
        showPlannedLoad,
      }),
    [chartData, domains.load, range, showCompletedLoad, showPlannedLoad],
  );
  const effectiveFitnessDomain = useMemo(
    () =>
      getRenderedFitnessDomain({
        baseDomain: domains.fitness,
        chartData,
        showScheduledFitness,
      }),
    [chartData, domains.fitness, showScheduledFitness],
  );
  const xTickIndexes = useMemo(
    () =>
      scrollX ? model.weeks.map((_, index) => index) : buildAxisTickIndexes(model.weeks.length),
    [model.weeks, scrollX],
  );
  const todayWeekStart = model.weeks.find(
    (week) => model.todayKey >= week.weekStart && model.todayKey <= week.weekEnd,
  );
  const selectedIndex = model.weeks.findIndex((week) => week.isSelected);
  const scrollableChartWidth = scrollX
    ? Math.max(
        chartPadding.left +
          chartPadding.right +
          Math.max(0, model.weeks.length - 1) * resolvedScrollWeekWidth,
        1,
      )
    : chartWidth;
  const scrollSideInset = scrollX ? getChartSideInset(scrollViewportWidth, chartPadding.left) : 0;
  const xLabelSpacing = scrollX
    ? resolvedScrollWeekWidth
    : model.weeks.length > 1
      ? (scrollableChartWidth - chartPadding.left - chartPadding.right) / (model.weeks.length - 1)
      : 0;
  const chartAreaHeight = fillHeight
    ? Math.max(1, (measuredHeight ?? 23) - 22)
    : Math.max(120, height - 22);
  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    const nextMeasuredHeight = Math.floor(event.nativeEvent.layout.height);
    if (measuredWidth >= 220) setChartWidth(measuredWidth);
    if (fillHeight && nextMeasuredHeight > 0) setMeasuredHeight(nextMeasuredHeight);
  };
  const onScrollViewportLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 120) setScrollViewportWidth(measuredWidth);
  };
  const commitCenteredWeek = useCallback(
    (offsetX: number) => {
      if (!reviewWeeks || !onSelectedWeekChange) return;
      if (model.weeks.length === 0) return;
      const centeredIndex = getCenteredWeekIndex(
        offsetX,
        resolvedScrollWeekWidth,
        model.weeks.length,
      );
      centeredWeekIndexRef.current = centeredIndex;
      const centeredWeek = model.weeks[centeredIndex];
      if (centeredWeek && !centeredWeek.isSelected) {
        onSelectedWeekChange(centeredWeek.weekStart);
      }
    },
    [model.weeks, onSelectedWeekChange, resolvedScrollWeekWidth, reviewWeeks],
  );
  const publishDisplayedWeek = useCallback(
    (offsetX: number) => {
      if (!reviewWeeks) return;
      if (model.weeks.length === 0) return;
      const centeredIndex = getCenteredWeekIndex(
        offsetX,
        resolvedScrollWeekWidth,
        model.weeks.length,
      );
      if (displayedWeekIndexRef.current === centeredIndex) return;
      displayedWeekIndexRef.current = centeredIndex;
      const displayedWeek = model.weeks[centeredIndex];
      if (displayedWeek) onDisplayedWeekChange?.(displayedWeek.weekStart);
    },
    [model.weeks, onDisplayedWeekChange, resolvedScrollWeekWidth, reviewWeeks],
  );
  const clearDeferredCommit = useCallback(() => {
    if (!deferredCommitTimeoutRef.current) return;
    clearTimeout(deferredCommitTimeoutRef.current);
    deferredCommitTimeoutRef.current = null;
  }, []);
  const beginScrollInteraction = useCallback(() => {
    userInteractingRef.current = true;
    clearDeferredCommit();
    onScrollInteractionStart?.();
  }, [clearDeferredCommit, onScrollInteractionStart]);
  const settleScrollInteraction = useCallback(() => {
    userInteractingRef.current = false;
    onScrollInteractionSettled?.();
  }, [onScrollInteractionSettled]);
  const onHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    latestScrollOffsetRef.current = contentOffset.x;
  };
  const onHorizontalScrollSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    clearDeferredCommit();
    publishDisplayedWeek(event.nativeEvent.contentOffset.x);
    commitCenteredWeek(event.nativeEvent.contentOffset.x);
    onHorizontalScroll(event);
    settleScrollInteraction();
  };
  const onHorizontalMomentumBegin = () => {
    beginScrollInteraction();
  };
  const onHorizontalDragBegin = () => {
    beginScrollInteraction();
  };
  const onHorizontalDragEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onHorizontalScroll(event);
    clearDeferredCommit();
    deferredCommitTimeoutRef.current = setTimeout(() => {
      deferredCommitTimeoutRef.current = null;
      publishDisplayedWeek(latestScrollOffsetRef.current);
      commitCenteredWeek(latestScrollOffsetRef.current);
      settleScrollInteraction();
    }, 180);
  };
  const scrollToWeekIndex = useCallback(
    (index: number, animated: boolean) => {
      const offset = getWeekScrollOffset(index, resolvedScrollWeekWidth);
      centeredWeekIndexRef.current = index;
      scrollTo(scrollViewRef, offset, 0, animated);
    },
    [resolvedScrollWeekWidth, scrollViewRef],
  );
  const selectWeekAtIndex = useCallback(
    (index: number) => {
      const boundedIndex = Math.max(0, Math.min(model.weeks.length - 1, Math.round(index)));
      const week = model.weeks[boundedIndex];
      if (!week) return;
      if (!reviewWeeks || !onSelectedWeekChange) return;
      if (scrollX) {
        scrollToWeekIndex(boundedIndex, true);
        beginScrollInteraction();
        publishDisplayedWeek(getWeekScrollOffset(boundedIndex, resolvedScrollWeekWidth));
        if (!week.isSelected) {
          onSelectedWeekChange(week.weekStart);
        }
        clearDeferredCommit();
        deferredCommitTimeoutRef.current = setTimeout(() => {
          deferredCommitTimeoutRef.current = null;
          settleScrollInteraction();
        }, 260);
        return;
      }

      onSelectedWeekChange(week.weekStart);
    },
    [
      beginScrollInteraction,
      clearDeferredCommit,
      model.weeks,
      onSelectedWeekChange,
      publishDisplayedWeek,
      reviewWeeks,
      resolvedScrollWeekWidth,
      scrollToWeekIndex,
      scrollX,
      settleScrollInteraction,
    ],
  );
  const accessibilityIndex =
    selectedIndex >= 0
      ? selectedIndex
      : Math.max(
          0,
          model.weeks.findIndex((week) => week.isCurrent),
        );
  const accessibilityWeek = model.weeks[accessibilityIndex] ?? model.weeks[0];
  const accessibilityPlannedLoad =
    accessibilityWeek?.effectiveRemainingLoad === undefined
      ? (accessibilityWeek?.plannedLoad ?? null)
      : accessibilityWeek.effectiveRemainingLoad;
  const accessibilityPlannedLoadStatus =
    accessibilityWeek?.effectiveRemainingLoad === undefined
      ? (accessibilityWeek?.plannedLoadStatus ?? accessibilityWeek?.effectiveLoadStatus)
      : (accessibilityWeek?.effectiveRemainingLoadStatus ?? accessibilityWeek?.effectiveLoadStatus);
  const accessibilityValue = accessibilityWeek
    ? [
        `Selected week ${accessibilityWeek.label}, ${accessibilityWeek.weekStart} to ${accessibilityWeek.weekEnd}`,
        accessibilityWeek.effectiveLoadStatus === "unavailable"
          ? "Common Load unavailable"
          : `${formatAccessibleMetric("Common Load", accessibilityWeek.effectiveLoad ?? null)}${accessibilityWeek.effectiveLoadStatus === "partial" ? " incomplete" : ""}`,
        accessibilityWeek.effectiveLoadStatus === "known_zero"
          ? "Normalized intensity not applicable"
          : accessibilityWeek.effectiveIntensity == null
            ? "Normalized intensity unavailable"
            : `Normalized intensity ${accessibilityWeek.effectiveIntensity.toFixed(2)}${accessibilityWeek.effectiveLoadStatus === "partial" ? " incomplete" : ""}`,
        accessibilityWeek.effectiveCompletedLoad == null
          ? null
          : formatAccessibleMetric(
              "Completed Common Load",
              accessibilityWeek.effectiveCompletedLoad,
            ),
        accessibilityWeek.completedLoadUnavailable
          ? "Completed activity Common Load unavailable"
          : null,
        accessibilityPlannedLoadStatus === "known_zero"
          ? "Planned Common Load 0, no planned load"
          : accessibilityPlannedLoadStatus === "unavailable"
            ? "Planned Common Load unavailable"
            : `${formatAccessibleMetric("Planned Common Load", accessibilityPlannedLoad)}${accessibilityPlannedLoadStatus === "partial" ? " incomplete" : ""}`,
        !hasGoalBackedRecommendation || !accessibilityWeek.recommendedLoadStatus
          ? null
          : formatAccessibleMetric(
              "Recommended Common Load",
              accessibilityWeek.recommendedLoadStatus === "known_zero"
                ? 0
                : (accessibilityWeek.recommendedLoad ?? null),
            ),
        formatAccessibleMetric("Current fitness", accessibilityWeek.fitness),
        formatAccessibleMetric("Planned projection", accessibilityWeek.scheduledFitness),
        hasGoalBackedRecommendation &&
        (accessibilityWeek.recommendedLoadStatus === "complete" ||
          accessibilityWeek.recommendedLoadStatus === "known_zero")
          ? formatAccessibleMetric("Recommended projection", accessibilityWeek.targetFitness)
          : null,
      ]
        .filter((value): value is string => value !== null)
        .join(". ")
    : "No week selected";
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") {
        selectWeekAtIndex(accessibilityIndex + 1);
      }
      if (event.nativeEvent.actionName === "decrement") {
        selectWeekAtIndex(accessibilityIndex - 1);
      }
    },
    [accessibilityIndex, selectWeekAtIndex],
  );

  useAnimatedReaction(
    () => {
      "worklet";
      if (!chartPressState.isActive.value) return null;
      const activeIndex = Number(chartPressState.x.value.value);
      return Number.isFinite(activeIndex) ? Math.round(activeIndex) : null;
    },
    (activeIndex, previousIndex) => {
      "worklet";
      if (activeIndex == null || activeIndex === previousIndex) return;
      runOnJS(selectWeekAtIndex)(activeIndex);
    },
    [selectWeekAtIndex],
  );

  useEffect(() => {
    if (!reviewWeeks || !scrollX || selectedIndex < 0) return;
    if (userInteractingRef.current) return;
    if (centeredWeekIndexRef.current === selectedIndex) return;
    requestAnimationFrame(() => {
      if (userInteractingRef.current) return;
      scrollToWeekIndex(selectedIndex, false);
    });
  }, [reviewWeeks, selectedIndex, scrollX, scrollToWeekIndex]);

  useEffect(() => {
    return () => {
      if (!deferredCommitTimeoutRef.current) return;
      clearTimeout(deferredCommitTimeoutRef.current);
      deferredCommitTimeoutRef.current = null;
    };
  }, []);

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
    <View style={{ width: scrollableChartWidth, height: chartAreaHeight }}>
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
            domain: effectiveLoadDomain,
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
            domain: effectiveFitnessDomain,
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
        chartPressState={reviewWeeks && !scrollX ? chartPressState : undefined}
      >
        {({ points, chartBounds }) => (
          <>
            {reviewWeeks && !scrollX && selectedIndex >= 0
              ? (() => {
                  const geometry = getLoadBarGeometry(
                    points,
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
                  const barLeft = getVisibleBarLeft(
                    geometry.center,
                    barWidth,
                    chartBounds.left,
                    chartBounds.right,
                  );
                  return (
                    <SkiaRect
                      x={barLeft}
                      y={chartBounds.top}
                      width={barWidth}
                      height={chartBounds.bottom - chartBounds.top}
                      color={chartColors.selected}
                    />
                  );
                })()
              : null}
            {model.weeks.map((week, index) => {
              const geometry = getLoadBarGeometry(
                points,
                index,
                chartBounds.left,
                chartBounds.right,
              );
              const completedPoint = points.completedLoad[index];
              const plannedPoint = points.plannedLoad[index];
              const targetPoint = points.targetLoad[index];
              if (!geometry) return null;
              const barWidth = getSleeveBarWidth(
                geometry.width,
                model.weeks.length,
                scrollX ? scrollBarWidth : undefined,
              );
              const barLeft = getVisibleBarLeft(
                geometry.center,
                barWidth,
                chartBounds.left,
                chartBounds.right,
              );
              const isDimmed =
                reviewWeeks && !scrollX && selectedIndex >= 0 && index !== selectedIndex;
              const showPlanningLayers = range !== "all";
              const shouldFocusScrolledBars = scrollX && reviewWeeks;
              return (
                <Fragment key={`load-bars-${week.weekStart}`}>
                  {showPlanningLayers &&
                  showPlannedLoad &&
                  isFiniteNumber(targetPoint?.yValue) &&
                  isFiniteNumber(targetPoint.y) ? (
                    shouldFocusScrolledBars ? (
                      <AnimatedFocusedRect
                        key={`target-${week.weekStart}`}
                        x={barLeft}
                        y={targetPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - targetPoint.y}
                        activeColor={chartColors.target}
                        dimColor={chartColors.targetDimmed}
                        index={index}
                        scrollSlotWidth={resolvedScrollWeekWidth}
                        chartScrollX={chartScrollX}
                      />
                    ) : (
                      <SkiaRect
                        key={`target-${week.weekStart}`}
                        x={barLeft}
                        y={targetPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - targetPoint.y}
                        color={isDimmed ? chartColors.targetDimmed : chartColors.target}
                      />
                    )
                  ) : null}
                  {showPlanningLayers &&
                  showPlannedLoad &&
                  isFiniteNumber(plannedPoint?.yValue) &&
                  isFiniteNumber(plannedPoint.y) ? (
                    shouldFocusScrolledBars ? (
                      <AnimatedFocusedRect
                        key={`planned-${week.weekStart}`}
                        x={barLeft}
                        y={plannedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - plannedPoint.y}
                        activeColor={chartColors.planned}
                        dimColor={chartColors.plannedDimmed}
                        index={index}
                        scrollSlotWidth={resolvedScrollWeekWidth}
                        chartScrollX={chartScrollX}
                      />
                    ) : (
                      <SkiaRect
                        key={`planned-${week.weekStart}`}
                        x={barLeft}
                        y={plannedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - plannedPoint.y}
                        color={isDimmed ? chartColors.plannedDimmed : chartColors.planned}
                      />
                    )
                  ) : null}
                  {showCompletedLoad &&
                  isFiniteNumber(completedPoint?.yValue) &&
                  isFiniteNumber(completedPoint.y) ? (
                    shouldFocusScrolledBars ? (
                      <AnimatedFocusedRect
                        key={`completed-${week.weekStart}`}
                        x={barLeft}
                        y={completedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - completedPoint.y}
                        activeColor={chartColors.completed}
                        dimColor={chartColors.completedDimmed}
                        index={index}
                        scrollSlotWidth={resolvedScrollWeekWidth}
                        chartScrollX={chartScrollX}
                      />
                    ) : (
                      <SkiaRect
                        key={`completed-${week.weekStart}`}
                        x={barLeft}
                        y={completedPoint.y}
                        width={barWidth}
                        height={chartBounds.bottom - completedPoint.y}
                        color={isDimmed ? chartColors.completedDimmed : chartColors.completed}
                      />
                    )
                  ) : null}
                  {week.completedLoadUnavailable ? (
                    <SkiaRect
                      x={barLeft}
                      y={chartBounds.bottom - 3}
                      width={barWidth}
                      height={3}
                      color={chartColors.completed}
                    />
                  ) : null}
                </Fragment>
              );
            })}
            {hasGoalBackedRecommendation ? (
              <Line
                connectMissingData={false}
                points={points.targetFitness}
                color={chartColors.targetFitness}
                strokeWidth={2}
                curveType="natural"
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
            ) : null}
            {showScheduledFitness ? (
              <Line
                connectMissingData={false}
                points={points.scheduledFitness}
                color={chartColors.scheduledFitness}
                strokeWidth={3}
                curveType="natural"
              />
            ) : null}
            <Line
              connectMissingData={false}
              points={points.fitness}
              color={chartColors.fitness}
              strokeWidth={2.5}
              curveType="natural"
            />
            {todayWeekStart
              ? (() => {
                  const index = model.weeks.findIndex(
                    (week) => week.weekStart === todayWeekStart.weekStart,
                  );
                  const markerPoint =
                    points.fitness[index] ??
                    points.scheduledFitness[index] ??
                    points.completedLoad[index];
                  if (!markerPoint || typeof markerPoint.x !== "number") return null;
                  return (
                    <>
                      <SkiaLine
                        p1={vec(markerPoint.x, chartBounds.top + 12)}
                        p2={vec(markerPoint.x, chartBounds.bottom)}
                        color={chartColors.marker}
                        strokeWidth={1.5}
                      >
                        <DashPathEffect intervals={[3, 3]} />
                      </SkiaLine>
                      {axisFont ? (
                        <SkiaText
                          x={Math.max(chartBounds.left, markerPoint.x - 12)}
                          y={chartBounds.top + 10}
                          text="TODAY"
                          font={axisFont}
                          color={chartColors.marker}
                        />
                      ) : null}
                    </>
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
                    p2={vec(markerPoint.x, chartBounds.top + 12)}
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
                left: index * xLabelSpacing - resolvedScrollWeekWidth / 2,
                position: "absolute",
                width: resolvedScrollWeekWidth,
              }}
            >
              <Text
                adjustsFontSizeToFit
                className="text-center text-[8px] text-muted-foreground"
                minimumFontScale={0.75}
                numberOfLines={1}
              >
                {week.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={fillHeight ? { flex: 1, minHeight: 0 } : { height }}
      onLayout={onChartLayout}
      testID="training-path-chart"
    >
      <View className="flex-row items-center justify-between px-2 pb-1">
        <View accessibilityLabel="Left axis: Load, Common Load">
          <Text className="text-[10px] font-medium text-muted-foreground">Load</Text>
          <Text className="text-[8px] text-muted-foreground">Common Load</Text>
        </View>
        <View accessibilityLabel="Right axis: Fitness">
          <Text className="text-[10px] font-medium text-muted-foreground">Fitness</Text>
        </View>
      </View>
      {todayWeekStart ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ height: 0, width: 0 }}
          testID="training-path-today-boundary"
        />
      ) : null}
      {model.weeks
        .filter((week) => week.completedLoadUnavailable)
        .map((week) => (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={`completed-activity-without-load-highlight-${week.weekStart}`}
            style={{ height: 0, width: 0 }}
            testID={`completed-activity-without-load-highlight-${week.weekStart}`}
          />
        ))}
      {reviewWeeks && onSelectedWeekChange ? (
        <View
          accessible
          accessibilityActions={[
            { name: "increment", label: "Select next week" },
            { name: "decrement", label: "Select previous week" },
          ]}
          accessibilityHint="Adjust to select the next or previous week"
          accessibilityLabel="Weekly training path chart"
          accessibilityRole="adjustable"
          accessibilityValue={{ text: accessibilityValue }}
          className="absolute inset-0"
          onAccessibilityAction={handleAccessibilityAction}
          pointerEvents="none"
          testID="training-path-chart-accessibility"
        />
      ) : null}
      {scrollX ? (
        <View className="flex-1 flex-row">
          <FixedYAxisLabels domain={effectiveLoadDomain} fontScale={fontScale} />
          <View className="flex-1" onLayout={onScrollViewportLayout}>
            <Animated.ScrollView
              ref={scrollViewRef}
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: scrollSideInset }}
              decelerationRate="fast"
              disableIntervalMomentum={false}
              horizontal
              nestedScrollEnabled
              onScrollBeginDrag={onHorizontalDragBegin}
              onMomentumScrollBegin={onHorizontalMomentumBegin}
              onMomentumScrollEnd={onHorizontalScrollSettled}
              onScroll={animatedScrollHandler}
              onScrollEndDrag={onHorizontalDragEnd}
              scrollEventThrottle={16}
              persistentScrollbar
              showsHorizontalScrollIndicator
              snapToAlignment={reviewWeeks ? "start" : undefined}
              snapToInterval={reviewWeeks ? resolvedScrollWeekWidth : undefined}
            >
              {chartContent}
            </Animated.ScrollView>
          </View>
          <FixedYAxisLabels align="left" domain={effectiveFitnessDomain} fontScale={fontScale} />
        </View>
      ) : (
        chartContent
      )}
    </View>
  );
}
