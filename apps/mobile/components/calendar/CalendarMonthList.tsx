import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React, { useEffect, useMemo, useRef } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import {
  addDaysToDateKey,
  buildMonthStartKeys,
  getMonthGridDayCount,
  getMonthGridStartKey,
  isSameMonth,
  parseDateKey,
} from "@/lib/calendar/dateMath";
import {
  type CalendarEvent,
  type CalendarEventsByDate,
  getMonthDensity,
} from "@/lib/calendar/normalizeEvents";

type CalendarMonthListProps = {
  rangeStart: string;
  rangeEnd: string;
  visibleMonthAnchor: string;
  todayKey: string;
  eventsByDate: CalendarEventsByDate;
  goalDates: Set<string>;
  onVisibleMonthChange: (monthStartKey: string) => void;
  onReachStart: () => void;
  onReachEnd: () => void;
  onSelectDay: (dateKey: string) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getPlannedDaySignal(
  events: CalendarEvent[],
): { count: number; level: 1 | 2 | 3 | 4 } | null {
  const plannedEvents = events.filter((event) => event.event_type === "planned");
  if (plannedEvents.length === 0) {
    return null;
  }

  const maxTss = plannedEvents.reduce((highest, event) => {
    const tss =
      readMetric(getAuthoritativeActivityPlanMetrics(event.activity_plan).estimated_tss) ?? 0;
    return Math.max(highest, tss);
  }, 0);

  const level: 1 | 2 | 3 | 4 = maxTss >= 110 ? 4 : maxTss >= 80 ? 3 : maxTss >= 45 ? 2 : 1;

  return { count: plannedEvents.length, level };
}

function getPlannedDayChipClass(level: 1 | 2 | 3 | 4 | null, isToday: boolean) {
  if (level === 4) {
    return isToday
      ? "border border-primary bg-primary/25"
      : "border border-primary/60 bg-primary/20";
  }

  if (level === 3) {
    return isToday
      ? "border border-primary bg-primary/18"
      : "border border-primary/45 bg-primary/14";
  }

  if (level === 2) {
    return isToday
      ? "border border-primary bg-primary/12"
      : "border border-primary/35 bg-primary/10";
  }

  if (level === 1) {
    return isToday
      ? "border border-primary bg-primary/10"
      : "border border-primary/25 bg-primary/5";
  }

  return isToday ? "border border-primary bg-primary/5" : "bg-transparent";
}

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
  visibleMonthAnchor,
  todayKey,
  eventsByDate,
  goalDates,
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
        const gridDays = Array.from({ length: getMonthGridDayCount(item) }, (_, index) =>
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
                  const dayEvents = eventsByDate.get(dateKey) ?? [];
                  const density = getMonthDensity(eventsByDate, dateKey);
                  const plannedSignal = getPlannedDaySignal(dayEvents);
                  const hasGoalAnchor = goalDates.has(dateKey);
                  const hasVisibleEvents = density > 0;
                  const isInMonth = isSameMonth(dateKey, item);
                  const isToday = isInMonth && dateKey === todayKey;
                  const dayChipClassName = getPlannedDayChipClass(
                    plannedSignal?.level ?? null,
                    isToday,
                  );

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
                      onPress={() => onSelectDay(dateKey)}
                      className="mb-2 w-[14.285%] items-center"
                      activeOpacity={0.6}
                      testID={`calendar-month-cell-${dateKey}`}
                    >
                      <View
                        className={`h-11 w-11 items-center justify-center rounded-2xl ${dayChipClassName}`}
                        testID={`calendar-month-day-chip-${dateKey}`}
                      >
                        <Text className="text-sm font-semibold text-foreground">
                          {format(parseDateKey(dateKey), "d")}
                        </Text>
                      </View>
                      <View className="mt-1 h-3 items-center justify-start gap-1">
                        {hasGoalAnchor ? (
                          <View
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            testID={`calendar-month-goal-signal-${dateKey}`}
                          />
                        ) : null}
                        {plannedSignal ? (
                          <View
                            className={`min-w-4 rounded-full px-1.5 py-[1px] ${
                              plannedSignal.level >= 4
                                ? "bg-primary"
                                : plannedSignal.level === 3
                                  ? "bg-primary/90"
                                  : plannedSignal.level === 2
                                    ? "bg-primary/80"
                                    : "bg-primary/65"
                            }`}
                            testID={`calendar-month-planned-signal-${dateKey}`}
                          >
                            <Text className="text-[9px] font-semibold text-primary-foreground">
                              {plannedSignal.count}
                            </Text>
                          </View>
                        ) : null}
                        <View className="h-1.5 flex-row items-center justify-center gap-1">
                          {hasVisibleEvents
                            ? Array.from({ length: Math.min(3, density) }, (_, index) => (
                                <View
                                  key={`${dateKey}-${index}`}
                                  className="h-1.5 w-1.5 rounded-full bg-primary/70"
                                />
                              ))
                            : null}
                        </View>
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
