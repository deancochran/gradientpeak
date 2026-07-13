import type { ProfileGoal } from "@repo/core";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
  type ViewProps,
  type ViewToken,
} from "react-native";
import Animated, { runOnJS, useAnimatedScrollHandler } from "react-native-reanimated";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarTimelineRows,
  type CalendarActivity,
  type CalendarTimelineRow,
} from "./CalendarTimelineModel";
import { CalendarDayHeaderRow, CalendarScheduleObjectRow } from "./CalendarTimelineRows";

const AnimatedCalendarFlatList = Animated.createAnimatedComponent(FlatList<CalendarTimelineRow>);

type CalendarCellRendererProps = ViewProps & {
  children?: ReactNode;
  index?: number;
};

export type CalendarDayListProps = {
  rangeStart: string;
  rangeEnd: string;
  visibleDayKey: string;
  selectedDateKey: string;
  todayKey: string;
  scrollTargetDateKey: string | null;
  scrollTargetVersion: number;
  activitiesByDate: Map<string, CalendarActivity[]>;
  eventsByDate: Map<string, CalendarEvent[]>;
  groupEventsByDate: Map<string, CalendarGroupEvent[]>;
  goalsByDate: Map<string, ProfileGoal[]>;
  onReachStart: () => void;
  onReachEnd: () => void;
  onVisibleDayChange: (dateKey: string) => void;
  onVisibleDaySettled: (dateKey: string) => void;
  onPressDay: (dateKey: string) => void;
  onPressActivity: (activity: CalendarActivity) => void;
  onPressEvent: (event: CalendarEvent) => void;
  onPressGroupEvent: (event: CalendarGroupEvent) => void;
  onPressGoal: (goal: ProfileGoal) => void;
};

export function CalendarDayList(props: CalendarDayListProps) {
  const listRef = useRef<FlatList<CalendarTimelineRow> | null>(null);
  const initialVisibleDayKeyRef = useRef(props.visibleDayKey);
  const lastStartReachedRef = useRef<string | null>(null);
  const lastEndReachedRef = useRef<string | null>(null);
  const lastVisibleDayKeyRef = useRef(props.visibleDayKey);
  const lastSettledDayKeyRef = useRef(props.visibleDayKey);
  const latestOnVisibleDayChangeRef = useRef(props.onVisibleDayChange);
  const latestOnVisibleDaySettledRef = useRef(props.onVisibleDaySettled);
  const lastScrollRequestRef = useRef<{ dateKey: string; animated: boolean } | null>(null);
  const latestScrollOffsetYRef = useRef(0);
  const programmaticScrollTargetRef = useRef<string | null>(null);
  const pendingScrollEndSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayOffsetsRef = useRef(new Map<string, number>());
  const sortedDayOffsetsRef = useRef<{ dateKey: string; y: number }[]>([]);
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 35,
    minimumViewTime: 80,
  });
  const { rows, stickyHeaderIndices } = useMemo(
    () =>
      buildCalendarTimelineRows({
        activitiesByDate: props.activitiesByDate,
        rangeStart: props.rangeStart,
        rangeEnd: props.rangeEnd,
        eventsByDate: props.eventsByDate,
        groupEventsByDate: props.groupEventsByDate,
        goalsByDate: props.goalsByDate,
      }),
    [
      props.activitiesByDate,
      props.eventsByDate,
      props.goalsByDate,
      props.groupEventsByDate,
      props.rangeEnd,
      props.rangeStart,
    ],
  );

  const initialScrollIndex = useMemo(
    () =>
      Math.max(
        0,
        rows.findIndex(
          (row) => row.type === "day" && row.dateKey === initialVisibleDayKeyRef.current,
        ),
      ),
    [rows],
  );

  const handleReachStart = useCallback(() => {
    if (lastStartReachedRef.current === props.rangeStart) {
      return;
    }

    lastStartReachedRef.current = props.rangeStart;
    props.onReachStart();
  }, [props.onReachStart, props.rangeStart]);

  const handleReachEnd = useCallback(() => {
    if (lastEndReachedRef.current === props.rangeEnd) {
      return;
    }

    lastEndReachedRef.current = props.rangeEnd;
    props.onReachEnd();
  }, [props.onReachEnd, props.rangeEnd]);

  const publishVisibleDay = useCallback((dateKey: string) => {
    if (lastVisibleDayKeyRef.current === dateKey) {
      return;
    }

    lastVisibleDayKeyRef.current = dateKey;
    latestOnVisibleDayChangeRef.current(dateKey);
  }, []);

  const rebuildSortedDayOffsets = useCallback(() => {
    sortedDayOffsetsRef.current = [...dayOffsetsRef.current.entries()]
      .map(([dateKey, y]) => ({ dateKey, y }))
      .sort((left, right) => left.y - right.y);
  }, []);

  const handleDayLayout = useCallback(
    (dateKey: string, y: number) => {
      const previousY = dayOffsetsRef.current.get(dateKey);
      if (previousY === y) {
        return;
      }

      dayOffsetsRef.current.set(dateKey, y);
      rebuildSortedDayOffsets();
    },
    [rebuildSortedDayOffsets],
  );

  const findVisibleDayKey = useCallback((offsetY: number) => {
    const dayOffsets = sortedDayOffsetsRef.current;
    if (dayOffsets.length === 0) {
      return null;
    }

    const selectionY = Math.max(0, offsetY + 8);
    let visibleDateKey = dayOffsets[0]?.dateKey ?? null;
    let lowerIndex = 0;
    let upperIndex = dayOffsets.length - 1;

    while (lowerIndex <= upperIndex) {
      const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
      const dayOffset = dayOffsets[middleIndex];
      if (!dayOffset) {
        break;
      }

      if (dayOffset.y <= selectionY) {
        visibleDateKey = dayOffset.dateKey;
        lowerIndex = middleIndex + 1;
      } else {
        upperIndex = middleIndex - 1;
      }
    }

    return visibleDateKey;
  }, []);

  const handleScrollOffset = useCallback(
    (offsetY: number) => {
      latestScrollOffsetYRef.current = offsetY;

      const visibleDateKey = findVisibleDayKey(offsetY);
      if (!visibleDateKey) {
        return;
      }

      const programmaticTarget = programmaticScrollTargetRef.current;
      if (programmaticTarget && visibleDateKey !== programmaticTarget) {
        return;
      }

      publishVisibleDay(visibleDateKey);
    },
    [findVisibleDayKey, publishVisibleDay],
  );

  const settleToDate = useCallback(
    (dateKey: string) => {
      programmaticScrollTargetRef.current = null;
      publishVisibleDay(dateKey);
      if (lastSettledDayKeyRef.current === dateKey) {
        return;
      }

      lastSettledDayKeyRef.current = dateKey;
      latestOnVisibleDaySettledRef.current(dateKey);
    },
    [publishVisibleDay],
  );

  const handleScrollSettled = useCallback(
    (event?: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pendingScrollEndSettleRef.current) {
        clearTimeout(pendingScrollEndSettleRef.current);
        pendingScrollEndSettleRef.current = null;
      }

      const settledOffsetY = event?.nativeEvent.contentOffset?.y ?? latestScrollOffsetYRef.current;
      const visibleDateKey = findVisibleDayKey(settledOffsetY) ?? lastVisibleDayKeyRef.current;
      const programmaticTarget = programmaticScrollTargetRef.current;
      if (programmaticTarget && visibleDateKey !== programmaticTarget) {
        return;
      }

      settleToDate(visibleDateKey);
    },
    [findVisibleDayKey, settleToDate],
  );

  const cancelPendingScrollEndSettle = useCallback(() => {
    if (!pendingScrollEndSettleRef.current) {
      return;
    }

    clearTimeout(pendingScrollEndSettleRef.current);
    pendingScrollEndSettleRef.current = null;
  }, []);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      latestScrollOffsetYRef.current =
        event.nativeEvent.contentOffset?.y ?? latestScrollOffsetYRef.current;
      const velocityY = event.nativeEvent.velocity?.y;
      if (typeof velocityY === "number") {
        if (Math.abs(velocityY) < 0.1) {
          handleScrollSettled(event);
        }
        return;
      }

      cancelPendingScrollEndSettle();
      pendingScrollEndSettleRef.current = setTimeout(() => {
        pendingScrollEndSettleRef.current = null;
        handleScrollSettled(event);
      }, 80);
    },
    [cancelPendingScrollEndSettle, handleScrollSettled],
  );

  const handleScrollBeginDrag = useCallback(() => {
    programmaticScrollTargetRef.current = null;
    cancelPendingScrollEndSettle();
  }, [cancelPendingScrollEndSettle]);

  const CellRendererComponent = useCallback(
    ({ children, index, onLayout, style, ...cellProps }: CalendarCellRendererProps) => (
      <View
        {...cellProps}
        style={style}
        onLayout={(event: LayoutChangeEvent) => {
          onLayout?.(event);
          const row = typeof index === "number" ? rows[index] : null;
          if (row?.type === "day") {
            handleDayLayout(row.dateKey, event.nativeEvent.layout.y);
          }
        }}
      >
        {children}
      </View>
    ),
    [handleDayLayout, rows],
  );

  const scrollHandler = useAnimatedScrollHandler<{ lastPublishedY: number }>({
    onScroll: (event, context) => {
      const nextY = event.contentOffset.y;
      if (Math.abs(nextY - (context.lastPublishedY ?? -64)) < 16) {
        return;
      }

      context.lastPublishedY = nextY;
      runOnJS(handleScrollOffset)(nextY);
    },
  });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CalendarTimelineRow>) => {
      if (item.type === "day") {
        return (
          <CalendarDayHeaderRow
            row={item}
            onPressDay={props.onPressDay}
            selectedDateKey={props.selectedDateKey}
            todayKey={props.todayKey}
          />
        );
      }

      return (
        <CalendarScheduleObjectRow
          object={item.object}
          onPressActivity={props.onPressActivity}
          onPressEvent={props.onPressEvent}
          onPressGroupEvent={props.onPressGroupEvent}
          onPressGoal={props.onPressGoal}
        />
      );
    },
    [
      props.onPressDay,
      props.onPressActivity,
      props.onPressEvent,
      props.onPressGroupEvent,
      props.onPressGoal,
      props.selectedDateKey,
      props.todayKey,
    ],
  );

  const handleScrollToIndexFailed = useCallback(
    ({
      averageItemLength,
      highestMeasuredFrameIndex,
      index,
    }: {
      averageItemLength: number;
      highestMeasuredFrameIndex: number;
      index: number;
    }) => {
      const safeIndex = Math.min(index, rows.length - 1);
      if (safeIndex < 0) {
        return;
      }

      const scheduleFrame =
        globalThis.requestAnimationFrame ??
        ((callback: FrameRequestCallback) => setTimeout(callback, 0));

      scheduleFrame(() => {
        const lastScrollRequest = lastScrollRequestRef.current;
        const list = listRef.current;
        if (!list) {
          return;
        }

        const measuredIndex = Math.max(0, highestMeasuredFrameIndex);
        const fallbackIndex = Math.min(safeIndex, measuredIndex);
        const estimatedOffset = Math.max(0, averageItemLength * fallbackIndex);

        list.scrollToOffset({ animated: false, offset: estimatedOffset });
        scheduleFrame(() => {
          list.scrollToIndex({
            index: safeIndex,
            animated: lastScrollRequest?.animated ?? false,
            viewPosition: 0,
          });
        });
      });
    },
    [rows.length],
  );

  const scrollToDate = useCallback(
    (dateKey: string, animated: boolean) => {
      const targetIndex = rows.findIndex((row) => row.type === "day" && row.dateKey === dateKey);
      if (targetIndex < 0) {
        return false;
      }

      lastScrollRequestRef.current = { dateKey, animated };
      programmaticScrollTargetRef.current = dateKey;
      listRef.current?.scrollToIndex({ index: targetIndex, animated, viewPosition: 0 });
      return true;
    },
    [rows],
  );

  const handleViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<CalendarTimelineRow>[] }) => {
      let firstVisibleToken: ViewToken<CalendarTimelineRow> | null = null;
      for (const token of viewableItems) {
        if (!token.isViewable) {
          continue;
        }
        if (
          (token.index ?? Number.MAX_SAFE_INTEGER) <
          (firstVisibleToken?.index ?? Number.MAX_SAFE_INTEGER)
        ) {
          firstVisibleToken = token;
        }
      }

      const firstVisibleRow = firstVisibleToken?.item;
      if (!firstVisibleRow) {
        return;
      }

      const programmaticTarget = programmaticScrollTargetRef.current;
      if (!programmaticTarget && sortedDayOffsetsRef.current.length > 0) {
        return;
      }

      if (programmaticTarget && firstVisibleRow.dateKey !== programmaticTarget) {
        return;
      }

      publishVisibleDay(firstVisibleRow.dateKey);
    },
  );

  useEffect(() => {
    latestOnVisibleDayChangeRef.current = props.onVisibleDayChange;
  }, [props.onVisibleDayChange]);

  useEffect(() => {
    latestOnVisibleDaySettledRef.current = props.onVisibleDaySettled;
  }, [props.onVisibleDaySettled]);

  useEffect(() => cancelPendingScrollEndSettle, [cancelPendingScrollEndSettle]);

  useEffect(() => {
    const dateKeys = new Set(rows.filter((row) => row.type === "day").map((row) => row.dateKey));
    for (const dateKey of dayOffsetsRef.current.keys()) {
      if (!dateKeys.has(dateKey)) {
        dayOffsetsRef.current.delete(dateKey);
      }
    }
    rebuildSortedDayOffsets();
  }, [rebuildSortedDayOffsets, rows]);

  useEffect(() => {
    lastVisibleDayKeyRef.current = props.selectedDateKey;
  }, [props.selectedDateKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollTargetVersion intentionally retriggers same-date scroll requests.
  useEffect(() => {
    if (!props.scrollTargetDateKey) {
      return;
    }

    if (!scrollToDate(props.scrollTargetDateKey, true)) {
      lastScrollRequestRef.current = { dateKey: props.scrollTargetDateKey, animated: true };
      programmaticScrollTargetRef.current = props.scrollTargetDateKey;
    }
  }, [props.scrollTargetDateKey, props.scrollTargetVersion, scrollToDate]);

  return (
    <View className="flex-1">
      <AnimatedCalendarFlatList
        ref={listRef}
        CellRendererComponent={CellRendererComponent}
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        initialScrollIndex={initialScrollIndex}
        initialNumToRender={14}
        stickyHeaderIndices={stickyHeaderIndices}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        onEndReached={handleReachEnd}
        onEndReachedThreshold={0.35}
        onMomentumScrollBegin={cancelPendingScrollEndSettle}
        onMomentumScrollEnd={handleScrollSettled}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChangedRef.current}
        onStartReached={handleReachStart}
        onStartReachedThreshold={0.35}
        viewabilityConfig={viewabilityConfigRef.current}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        testID="calendar-day-list"
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    </View>
  );
}
