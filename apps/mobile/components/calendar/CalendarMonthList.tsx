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
  todayKey: string;
  eventsByDate: CalendarEventsByDate;
  onVisibleMonthChange: (monthStartKey: string) => void;
  onSelectDay: (dateKey: string) => void;
};

const MONTH_BLOCK_HEIGHT = 360;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarMonthList({
  rangeStart,
  rangeEnd,
  activeDate,
  todayKey,
  eventsByDate,
  onVisibleMonthChange,
  onSelectDay,
}: CalendarMonthListProps) {
  const listRef = useRef<FlatList<string>>(null);
  const months = useMemo(() => buildMonthStartKeys(rangeStart, rangeEnd), [rangeEnd, rangeStart]);
  const activeMonthIndex = useMemo(
    () =>
      Math.max(
        0,
        months.findIndex(
          (monthStart) => monthStart === activeDate || monthStart === activeDate.slice(0, 8) + "01",
        ),
      ),
    [activeDate, months],
  );

  useEffect(() => {
    listRef.current?.scrollToIndex({ animated: false, index: activeMonthIndex });
  }, [activeMonthIndex]);

  return (
    <FlatList
      ref={listRef}
      data={months}
      keyExtractor={(item) => item}
      pagingEnabled
      getItemLayout={(_, index) => ({
        index,
        length: MONTH_BLOCK_HEIGHT,
        offset: MONTH_BLOCK_HEIGHT * index,
      })}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={({ viewableItems }) => {
        const firstVisible = viewableItems[0]?.item;
        if (typeof firstVisible === "string") {
          onVisibleMonthChange(firstVisible);
        }
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
      renderItem={({ item }) => {
        const gridStart = getMonthGridStartKey(item);
        const gridDays = Array.from({ length: 42 }, (_, index) =>
          addDaysToDateKey(gridStart, index),
        );

        return (
          <View
            className="bg-background px-4 pb-4 pt-3"
            style={{ height: MONTH_BLOCK_HEIGHT }}
            testID={`calendar-month-page-${item}`}
          >
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
                  const isInMonth = isSameMonth(dateKey, item);
                  const isActive = dateKey === activeDate;
                  const isToday = dateKey === todayKey;

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      onPress={() => onSelectDay(dateKey)}
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
