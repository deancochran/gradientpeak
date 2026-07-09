import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ScrollView } from "react-native-gesture-handler";

type SelectableChartPoint = {
  date: string;
};

type InstantChartSelectionInput<Point extends SelectableChartPoint> = {
  onPreviewSelectedDateChange?: (date: string) => void;
  onSelectedDateChange?: (date: string) => void;
  points: Point[];
  selectedDate?: string | null;
  slotWidth: number;
};

export type InstantChartSelectionPhase = "initializing" | "previewing" | "committed";

function boundedIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.round(index)));
}

export function useInstantChartSelection<Point extends SelectableChartPoint>({
  onPreviewSelectedDateChange,
  onSelectedDateChange,
  points,
  selectedDate,
  slotWidth,
}: InstantChartSelectionInput<Point>) {
  const [internalCommittedDate, setInternalCommittedDate] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [phase, setPhase] = useState<InstantChartSelectionPhase>("initializing");
  const lastPreviewDateRef = useRef<string | null>(null);
  const lastProgrammaticScrollDateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const isSelectionControlled = selectedDate !== undefined;
  const committedDate = isSelectionControlled ? selectedDate : internalCommittedDate;
  const displayDate = phase === "previewing" ? (previewDate ?? committedDate) : committedDate;
  const selectedPoint = useMemo(
    () => points.find((point) => point.date === displayDate) ?? points[0] ?? null,
    [displayDate, points],
  );

  useEffect(() => {
    mountedRef.current = true;
    setPhase("committed");
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getNearestIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      boundedIndex(event.nativeEvent.contentOffset.x / slotWidth, points.length),
    [points.length, slotWidth],
  );

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

  const previewIndex = useCallback(
    (index: number) => {
      const point = points[boundedIndex(index, points.length)];
      if (!point) return;
      setPhase("previewing");
      if (lastPreviewDateRef.current === point.date) return;
      lastPreviewDateRef.current = point.date;
      setPreviewDate(point.date);
      onPreviewSelectedDateChange?.(point.date);
    },
    [onPreviewSelectedDateChange, points],
  );

  const commitDate = useCallback(
    (date: string) => {
      lastPreviewDateRef.current = date;
      setPreviewDate(date);
      setPhase("committed");
      if (date === committedDate) return;
      if (!mountedRef.current) return;
      if (!isSelectionControlled) {
        setInternalCommittedDate(date);
      }
      onSelectedDateChange?.(date);
    },
    [committedDate, isSelectionControlled, onSelectedDateChange],
  );

  const commitIndex = useCallback(
    (index: number) => {
      const point = points[boundedIndex(index, points.length)];
      if (point) commitDate(point.date);
    },
    [commitDate, points],
  );

  useEffect(() => {
    if (!committedDate) return;
    if (phase === "previewing") return;
    lastPreviewDateRef.current = committedDate;
    setPreviewDate(committedDate);
    if (lastProgrammaticScrollDateRef.current === committedDate) return;
    scrollToDate(committedDate, false);
  }, [committedDate, phase, scrollToDate]);

  const previewNearestFromScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      previewIndex(getNearestIndex(event));
    },
    [getNearestIndex, previewIndex],
  );

  const commitNearestFromScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitIndex(getNearestIndex(event));
    },
    [commitIndex, getNearestIndex],
  );

  const beginPreview = useCallback(() => {
    setPhase("previewing");
  }, []);

  return {
    beginPreview,
    committedDate,
    commitNearestFromScrollEvent,
    displayDate,
    phase,
    previewDate,
    previewNearestFromScrollEvent,
    scrollRef,
    selectedPoint,
  };
}
