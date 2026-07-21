import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ScrollView } from "react-native-gesture-handler";
import {
  getNearestTrainingPathChartIndex,
  getTrainingPathChartOffset,
} from "./trainingPathChartWindow";

type SelectableChartPoint = {
  date: string;
};

const DRAG_SETTLE_DELAY_MS = 32;

type InstantChartSelectionInput<Point extends SelectableChartPoint> = {
  onPreviewSelectedDateChange?: (date: string) => void;
  onSelectedDateChange?: (date: string) => void;
  points: Point[];
  isScrollReady?: boolean;
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
  isScrollReady = true,
  selectedDate,
  slotWidth,
}: InstantChartSelectionInput<Point>) {
  const [internalCommittedDate, setInternalCommittedDate] = useState<string | null>(null);
  const [pendingControlledDate, setPendingControlledDate] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [phase, setPhase] = useState<InstantChartSelectionPhase>("initializing");
  const lastPreviewDateRef = useRef<string | null>(null);
  const lastProgrammaticScrollDateRef = useRef<string | null>(null);
  const lastCommittedDateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const pendingControlledBaseDateRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionSettledRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const isSelectionControlled = selectedDate !== undefined;
  const controlledDate = selectedDate ?? null;
  const committedDate = isSelectionControlled
    ? (pendingControlledDate ?? controlledDate)
    : internalCommittedDate;
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
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingControlledDate) return;
    if (controlledDate === pendingControlledDate) {
      setPendingControlledDate(null);
      pendingControlledBaseDateRef.current = null;
      return;
    }
    if (controlledDate !== pendingControlledBaseDateRef.current) {
      setPendingControlledDate(null);
      pendingControlledBaseDateRef.current = null;
    }
  }, [controlledDate, pendingControlledDate]);

  useEffect(() => {
    lastCommittedDateRef.current = committedDate ?? null;
  }, [committedDate]);

  const getNearestIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      getNearestTrainingPathChartIndex(event.nativeEvent.contentOffset.x, slotWidth, points.length),
    [points.length, slotWidth],
  );

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      const point = points[index];
      if (!point || !scrollRef.current) return false;
      lastProgrammaticScrollDateRef.current = point.date;
      scrollRef.current.scrollTo({
        animated,
        x: getTrainingPathChartOffset(index, slotWidth),
        y: 0,
      });
      return true;
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
      if (date === committedDate || date === lastCommittedDateRef.current) return;
      if (!mountedRef.current) return;
      lastCommittedDateRef.current = date;
      if (!isSelectionControlled) {
        setInternalCommittedDate(date);
      } else {
        pendingControlledBaseDateRef.current = controlledDate;
        setPendingControlledDate(date);
      }
      onSelectedDateChange?.(date);
    },
    [committedDate, controlledDate, isSelectionControlled, onSelectedDateChange],
  );

  const commitIndex = useCallback(
    (index: number) => {
      const point = points[boundedIndex(index, points.length)];
      if (point) commitDate(point.date);
    },
    [commitDate, points],
  );

  useEffect(() => {
    if (!committedDate || !isScrollReady) return;
    if (phase === "previewing") return;
    lastPreviewDateRef.current = committedDate;
    setPreviewDate(committedDate);
    if (lastProgrammaticScrollDateRef.current === committedDate) return;
    scrollToDate(committedDate, false);
  }, [committedDate, isScrollReady, phase, scrollToDate]);

  const previewNearestFromScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      previewIndex(getNearestIndex(event));
    },
    [getNearestIndex, previewIndex],
  );

  const settleIndex = useCallback(
    (index: number) => {
      if (interactionSettledRef.current) return;
      interactionSettledRef.current = true;
      commitIndex(index);
    },
    [commitIndex],
  );

  const beginPreview = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    interactionSettledRef.current = false;
    setPhase("previewing");
  }, []);

  const beginMomentum = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    interactionSettledRef.current = false;
    setPhase("previewing");
  }, []);

  const endDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      const index = getNearestIndex(event);
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) > 0.01) return;
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        settleIndex(index);
      }, DRAG_SETTLE_DELAY_MS);
    },
    [getNearestIndex, settleIndex],
  );

  const endMomentum = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      settleIndex(getNearestIndex(event));
    },
    [getNearestIndex, settleIndex],
  );

  const selectRelative = useCallback(
    (increment: number) => {
      const currentIndex = Math.max(
        0,
        points.findIndex((point) => point.date === displayDate),
      );
      const nextIndex = boundedIndex(currentIndex + increment, points.length);
      const point = points[nextIndex];
      if (!point || nextIndex === currentIndex) return;
      scrollToIndex(nextIndex);
      commitDate(point.date);
    },
    [commitDate, displayDate, points, scrollToIndex],
  );

  return {
    beginMomentum,
    beginPreview,
    committedDate,
    displayDate,
    endDrag,
    endMomentum,
    phase,
    previewDate,
    previewNearestFromScrollEvent,
    scrollRef,
    scrollToDate,
    selectRelative,
    selectedPoint,
  };
}
