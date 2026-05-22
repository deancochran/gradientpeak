import type { ProfileGoal } from "@repo/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FlatList, type ListRenderItemInfo, View, type ViewToken } from "react-native";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import { type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarTimelineRows,
  type CalendarActivity,
  type CalendarTimelineRow,
} from "./CalendarTimelineModel";
import { CalendarDayHeaderRow, CalendarScheduleObjectRow } from "./CalendarTimelineRows";

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
  const latestOnVisibleDayChangeRef = useRef(props.onVisibleDayChange);
  const lastScrollRequestRef = useRef<{ dateKey: string; animated: boolean } | null>(null);
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
      listRef.current?.scrollToIndex({ index: targetIndex, animated, viewPosition: 0 });
      return true;
    },
    [rows],
  );

  const handleViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<CalendarTimelineRow>[] }) => {
      const firstVisibleRow = [...viewableItems]
        .filter((token) => token.isViewable)
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))[0]?.item;
      if (!firstVisibleRow) {
        return;
      }

      if (lastVisibleDayKeyRef.current === firstVisibleRow.dateKey) {
        return;
      }

      lastVisibleDayKeyRef.current = firstVisibleRow.dateKey;
      latestOnVisibleDayChangeRef.current(firstVisibleRow.dateKey);
    },
  );

  useEffect(() => {
    latestOnVisibleDayChangeRef.current = props.onVisibleDayChange;
  }, [props.onVisibleDayChange]);

  useEffect(() => {
    lastVisibleDayKeyRef.current = props.selectedDateKey;
  }, [props.selectedDateKey]);

  useEffect(() => {
    if (!props.scrollTargetDateKey) {
      return;
    }

    if (!scrollToDate(props.scrollTargetDateKey, true)) {
      lastScrollRequestRef.current = { dateKey: props.scrollTargetDateKey, animated: true };
    }
  }, [props.scrollTargetDateKey, props.scrollTargetVersion, scrollToDate]);

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
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
