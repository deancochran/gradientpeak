import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ScrollView } from "react-native-gesture-handler";

type SelectableChartPoint = {
  date: string;
};

type CenteredChartSelectionInput<Point extends SelectableChartPoint> = {
  onSelectedDateChange?: (date: string) => void;
  points: Point[];
  selectedDate?: string | null;
  slotWidth: number;
};

export type CenteredChartSelectionPhase = "initializing" | "selecting" | "selected";

export function useCenteredChartSelection<Point extends SelectableChartPoint>({
  onSelectedDateChange,
  points,
  selectedDate,
  slotWidth,
}: CenteredChartSelectionInput<Point>) {
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(null);
  const [selectionPhase, setSelectionPhase] = useState<CenteredChartSelectionPhase>("initializing");
  const scrollRef = useRef<ScrollView>(null);
  const lastProgrammaticScrollDateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const isSelectionControlled = selectedDate !== undefined;
  const resolvedSelectedDate = isSelectionControlled ? selectedDate : internalSelectedDate;
  const selectedPoint = useMemo(
    () => points.find((point) => point.date === resolvedSelectedDate) ?? points[0] ?? null,
    [points, resolvedSelectedDate],
  );

  useEffect(() => {
    mountedRef.current = true;
    setSelectionPhase("selected");
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
      if (date === resolvedSelectedDate) {
        setSelectionPhase("selected");
        return;
      }
      if (!mountedRef.current) return;
      if (!isSelectionControlled) {
        setInternalSelectedDate(date);
      }
      onSelectedDateChange?.(date);
      setSelectionPhase("selected");
    },
    [isSelectionControlled, onSelectedDateChange, resolvedSelectedDate],
  );

  const selectPointAtIndex = useCallback(
    (index: number) => {
      const boundedIndex = Math.max(0, Math.min(points.length - 1, Math.round(index)));
      const point = points[boundedIndex];
      if (point) selectPoint(point.date);
    },
    [points, selectPoint],
  );

  useEffect(() => {
    if (!resolvedSelectedDate) return;
    if (selectionPhase === "selecting") return;
    if (lastProgrammaticScrollDateRef.current === resolvedSelectedDate) return;
    scrollToDate(resolvedSelectedDate, false);
  }, [resolvedSelectedDate, scrollToDate, selectionPhase]);

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

  const markSelecting = useCallback(() => {
    setSelectionPhase("selecting");
  }, []);

  return {
    markSelecting,
    resolvedSelectedDate,
    scrollRef,
    selectNearestFromScrollEvent,
    selectionPhase,
    selectedPoint,
  };
}
