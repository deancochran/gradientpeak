import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ScrollView } from "react-native-gesture-handler";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { useChartPressState } from "victory-native";

type SelectableChartPoint = {
  date: string;
};

type CenteredChartSelectionInput<Point extends SelectableChartPoint, YKey extends string> = {
  initialChartPressState: { x: number; y: Record<YKey, number> };
  onSelectedDateChange?: (date: string) => void;
  points: Point[];
  selectedDate?: string | null;
  slotWidth: number;
};

export function useCenteredChartSelection<Point extends SelectableChartPoint, YKey extends string>({
  initialChartPressState,
  onSelectedDateChange,
  points,
  selectedDate,
  slotWidth,
}: CenteredChartSelectionInput<Point, YKey>) {
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastProgrammaticScrollDateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const { state: chartPressState } = useChartPressState(initialChartPressState);
  const isSelectionControlled = selectedDate !== undefined;
  const resolvedSelectedDate = isSelectionControlled ? selectedDate : internalSelectedDate;
  const selectedPoint = useMemo(
    () => points.find((point) => point.date === resolvedSelectedDate) ?? points[0] ?? null,
    [points, resolvedSelectedDate],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      const point = points[index];
      if (!point) return;
      lastProgrammaticScrollDateRef.current = point.date;
      scrollRef.current?.scrollTo({ animated, x: index * slotWidth, y: 0 });
    },
    [points, slotWidth],
  );

  const scrollToDate = useCallback(
    (date: string, animated = true) => {
      const index = points.findIndex((point) => point.date === date);
      if (index < 0) return;
      scrollToIndex(index, animated);
    },
    [points, scrollToIndex],
  );

  const selectPoint = useCallback(
    (date: string) => {
      scrollToDate(date);
      if (date === resolvedSelectedDate) return;
      if (!mountedRef.current) return;
      if (!isSelectionControlled) {
        setInternalSelectedDate(date);
      }
      onSelectedDateChange?.(date);
    },
    [isSelectionControlled, onSelectedDateChange, resolvedSelectedDate, scrollToDate],
  );

  const selectPointAtIndex = useCallback(
    (index: number) => {
      const boundedIndex = Math.max(0, Math.min(points.length - 1, Math.round(index)));
      const point = points[boundedIndex];
      if (point) selectPoint(point.date);
    },
    [points, selectPoint],
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
      if (activeIndex != null || previousIndex == null) return;
      runOnJS(selectPointAtIndex)(previousIndex);
    },
    [selectPointAtIndex],
  );

  useEffect(() => {
    if (!resolvedSelectedDate) return;
    if (lastProgrammaticScrollDateRef.current === resolvedSelectedDate) return;
    scrollToDate(resolvedSelectedDate, false);
  }, [resolvedSelectedDate, scrollToDate]);

  const getNearestIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      Math.max(
        0,
        Math.min(points.length - 1, Math.round(event.nativeEvent.contentOffset.x / slotWidth)),
      ),
    [points.length, slotWidth],
  );

  const selectNearestFromScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      selectPointAtIndex(getNearestIndex(event));
    },
    [getNearestIndex, selectPointAtIndex],
  );

  return {
    chartPressConfig: {
      pan: {
        failOffsetY: [-12, 12] as [number, number],
      },
    },
    chartPressState,
    resolvedSelectedDate,
    scrollRef,
    selectNearestFromScrollEvent,
    selectedPoint,
  };
}
