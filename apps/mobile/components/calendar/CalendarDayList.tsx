import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React, { useEffect, useMemo, useRef } from "react";
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native";
import { parseDateKey } from "@/lib/calendar/dateMath";
import type { CalendarEvent, CalendarEventsByDate } from "@/lib/calendar/normalizeEvents";
import { CalendarEventCard } from "./CalendarEventCard";

type CalendarDayListProps = {
  dayKeys: string[];
  activeDate: string;
  todayKey: string;
  pageHeight: number;
  eventsByDate: CalendarEventsByDate;
  draggingEventId: string | null;
  getCanStartPlannedEvent: (event: CalendarEvent) => boolean;
  onVisibleDateChange: (dateKey: string) => void;
  onSelectDate: (dateKey: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onQuickActionPress: (event: CalendarEvent) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDropOnDate: (dateKey: string) => void;
};

export function CalendarDayList({
  dayKeys,
  activeDate,
  todayKey,
  pageHeight,
  eventsByDate,
  draggingEventId,
  getCanStartPlannedEvent,
  onVisibleDateChange,
  onSelectDate,
  onOpenEvent,
  onQuickActionPress,
  onDragStart,
  onDropOnDate,
}: CalendarDayListProps) {
  const listRef = useRef<FlatList<string>>(null);

  const activeIndex = useMemo(
    () => Math.max(0, dayKeys.indexOf(activeDate)),
    [activeDate, dayKeys],
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.scrollToIndex({ animated: false, index: activeIndex });
  }, [activeIndex]);

  return (
    <FlatList
      ref={listRef}
      data={dayKeys}
      keyExtractor={(item) => item}
      pagingEnabled
      getItemLayout={(_, index) => ({ index, length: pageHeight, offset: pageHeight * index })}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={({ viewableItems }) => {
        const firstVisible = viewableItems[0]?.item;
        if (typeof firstVisible === "string") {
          onVisibleDateChange(firstVisible);
        }
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
      renderItem={({ item }) => {
        const date = parseDateKey(item);
        const dayEvents = eventsByDate.get(item) ?? [];
        const isActive = item === activeDate;
        const isToday = item === todayKey;
        const isDropTarget = !!draggingEventId;

        return (
          <View
            className="bg-background px-4 pb-4 pt-3"
            style={{ height: pageHeight }}
            testID={`calendar-day-page-${item}`}
          >
            <TouchableOpacity
              onPress={() => onSelectDate(item)}
              className={`rounded-3xl border px-4 py-4 ${isActive ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              activeOpacity={0.9}
              testID={`day-header-${item}`}
            >
              <View className="flex-row items-center justify-between gap-3">
                <View>
                  <Text
                    className={`text-lg font-semibold ${isToday ? "text-primary" : "text-foreground"}`}
                  >
                    {format(date, "EEEE")}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {format(date, "MMMM d, yyyy")}
                  </Text>
                </View>
                <View className="rounded-full bg-background px-3 py-2">
                  <Text className="text-xs font-medium text-muted-foreground">
                    {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <ScrollView
              className="mt-4 flex-1"
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              nestedScrollEnabled
            >
              {dayEvents.length > 0 ? (
                dayEvents.map((event) => (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    canStart={getCanStartPlannedEvent(event)}
                    isDragging={draggingEventId === event.id}
                    onPress={() => onOpenEvent(event)}
                    onQuickActionPress={() => onQuickActionPress(event)}
                    onDragStart={() => onDragStart(event)}
                  />
                ))
              ) : (
                <View
                  className="rounded-3xl border border-dashed border-border bg-card px-5 py-6"
                  testID={`calendar-empty-day-${item}`}
                >
                  <Text className="text-sm font-semibold text-foreground">Nothing scheduled</Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    Keep the day open, or add something when you are ready.
                  </Text>
                </View>
              )}

              {isDropTarget ? (
                <TouchableOpacity
                  onPress={() => onDropOnDate(item)}
                  className="rounded-3xl border border-dashed border-primary bg-primary/5 px-4 py-4"
                  activeOpacity={0.85}
                  testID={`calendar-drop-zone-${item}`}
                >
                  <Text className="text-sm font-semibold text-primary">
                    Move dragged event here
                  </Text>
                  <Text className="mt-1 text-xs text-primary/80">
                    Tap to reschedule onto this day.
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        );
      }}
    />
  );
}
