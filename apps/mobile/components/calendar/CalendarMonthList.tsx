import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React, { useEffect, useMemo, useRef } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import {
  addDaysToDateKey,
  buildMonthStartKeys,
  getMonthGridStartKey,
  isSameMonth,
  parseDateKey,
} from "@/lib/calendar/dateMath";
import { type CalendarEventsByDate, getMonthDensity } from "@/lib/calendar/normalizeEvents";

type CalendarMonthListProps = {
  rangeStart: string;
  rangeEnd: string;
  activeDate: string;
  visibleMonthAnchor: string;
  todayKey: string;
  eventsByDate: CalendarEventsByDate;
  onVisibleMonthChange: (monthStartKey: string) => void;
  onReachStart: () => void;
  onReachEnd: () => void;
  onSelectDay: (dateKey: string, hasVisibleEvents: boolean) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function getVisibleMonthIndex(months: string[], visibleMonthAnchor: string): number {
  return Math.max(
    0,
    months.findIndex(
      (monthStart) =>
        monthStart === visibleMonthAnchor || monthStart === visibleMonthAnchor.slice(0, 8) + "01",
    ),
  );
}

export function CalendarMonthList({
  rangeStart,
  rangeEnd,
  activeDate,
  visibleMonthAnchor,
  todayKey,
  eventsByDate,
  onVisibleMonthChange,
  onReachStart,
  onReachEnd,
  onSelectDay,
}: CalendarMonthListProps) {
  const listRef = useRef<FlatList<string>>(null);
  const lastReportedVisibleMonthRef = useRef<string | null>(null);
  const previousVisibleMonthRef = useRef(visibleMonthAnchor);
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 30,
    minimumViewTime: 80,
    waitForInteraction: true,
  });
  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: string | null }> }) => {
      const firstVisible = viewableItems.find((item) => typeof item.item === "string")?.item;
      if (typeof firstVisible !== "string") {
        return;
      }

      if (lastReportedVisibleMonthRef.current !== firstVisible) {
        lastReportedVisibleMonthRef.current = firstVisible;
        onVisibleMonthChange(firstVisible);
      }
    },
  );
  const months = useMemo(() => buildMonthStartKeys(rangeStart, rangeEnd), [rangeEnd, rangeStart]);
  const activeMonthIndex = useMemo(
    () => getVisibleMonthIndex(months, visibleMonthAnchor),
    [months, visibleMonthAnchor],
  );

  useEffect(() => {
    if (
      previousVisibleMonthRef.current === visibleMonthAnchor ||
      lastReportedVisibleMonthRef.current === visibleMonthAnchor
    ) {
      previousVisibleMonthRef.current = visibleMonthAnchor;
      return;
    }

    previousVisibleMonthRef.current = visibleMonthAnchor;
    listRef.current?.scrollToIndex({ animated: false, index: activeMonthIndex, viewPosition: 0 });
  }, [activeMonthIndex, visibleMonthAnchor]);

  return (
    <FlatList
      ref={listRef}
      data={months}
      keyExtractor={(item) => item}
      initialScrollIndex={activeMonthIndex}
      initialNumToRender={4}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      maxToRenderPerBatch={4}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      windowSize={5}
      onEndReached={onReachEnd}
      onEndReachedThreshold={0.75}
      onStartReached={onReachStart}
      onStartReachedThreshold={0.75}
      onScrollToIndexFailed={({ index }) => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({
            animated: false,
            index: Math.max(0, index),
            viewPosition: 0,
          });
        });
      }}
      onViewableItemsChanged={onViewableItemsChangedRef.current}
      viewabilityConfig={viewabilityConfigRef.current}
      renderItem={({ item }) => {
        const gridStart = getMonthGridStartKey(item);
        const gridDays = Array.from({ length: 42 }, (_, index) =>
          addDaysToDateKey(gridStart, index),
        );

        return (
          <View className="bg-background px-4 pb-4 pt-3" testID={`calendar-month-page-${item}`}>
            <View className="rounded-3xl border border-border bg-card px-4 py-4">
              <Text className="text-lg font-semibold text-foreground">
                {format(parseDateKey(item), "MMMM yyyy")}
              </Text>
              <View className="mt-4 flex-row">
                {WEEKDAY_LABELS.map((label) => (
                  <View key={label} className="flex-1 items-center">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              <View className="mt-3 flex-row flex-wrap">
                {gridDays.map((dateKey) => {
                  const density = getMonthDensity(eventsByDate, dateKey);
                  const hasVisibleEvents = density > 0;
                  const isInMonth = isSameMonth(dateKey, item);
                  const isActive = isInMonth && dateKey === activeDate;
                  const isToday = isInMonth && dateKey === todayKey;

                  if (!isInMonth) {
                    return (
                      <View
                        key={dateKey}
                        className="mb-2 w-[14.285%] items-center"
                        testID={`calendar-month-filler-${item}-${dateKey}`}
                      >
                        <View className="h-11 w-11 rounded-2xl bg-transparent" />
                        <View className="mt-1 h-2" />
                      </View>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      onPress={() => onSelectDay(dateKey, hasVisibleEvents)}
                      className="mb-2 w-[14.285%] items-center"
                      activeOpacity={0.85}
                      testID={`calendar-month-cell-${dateKey}`}
                    >
                      <View
                        className={`h-11 w-11 items-center justify-center rounded-2xl ${isActive ? "bg-primary" : isToday ? "border border-primary bg-primary/5" : "bg-transparent"}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${isActive ? "text-primary-foreground" : isInMonth ? "text-foreground" : "text-muted-foreground/40"}`}
                        >
                          {format(parseDateKey(dateKey), "d")}
                        </Text>
                      </View>
                      <View className="mt-1 h-2 flex-row items-center justify-center gap-1">
                        {Array.from({ length: Math.min(3, density) }, (_, index) => (
                          <View
                            key={`${dateKey}-${index}`}
                            className="h-1.5 w-1.5 rounded-full bg-primary/70"
                          />
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}
