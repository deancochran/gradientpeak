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
  onOpenEvent: (event: CalendarEvent) => void;
  onQuickActionPress: (event: CalendarEvent) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDropOnDate: (dateKey: string) => void;
};

export function getActiveDayIndex(dayKeys: string[], activeDate: string): number {
  return Math.max(0, dayKeys.indexOf(activeDate));
}

export function CalendarDayList({
  dayKeys,
  activeDate,
  todayKey,
  pageHeight,
  eventsByDate,
  draggingEventId,
  getCanStartPlannedEvent,
  onVisibleDateChange,
  onOpenEvent,
  onQuickActionPress,
  onDragStart,
  onDropOnDate,
}: CalendarDayListProps) {
  const listRef = useRef<FlatList<string>>(null);

  const activeIndex = useMemo(() => getActiveDayIndex(dayKeys, activeDate), [activeDate, dayKeys]);

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
        const visibleEvents = dayEvents.filter((event) => event.event_type !== "rest_day");
        const hasPlannedEvent = visibleEvents.some((event) => event.event_type === "planned");
        const showInferredRestState = !hasPlannedEvent;
        const isActive = item === activeDate;
        const isToday = item === todayKey;
        const isDropTarget = !!draggingEventId;

        return (
          <View
            className="bg-background px-4 pb-4 pt-2"
            style={{ height: pageHeight }}
            testID={`calendar-day-page-${item}`}
          >
            <View className="px-1 pb-3 pt-1">
              <Text
                className={`text-lg font-semibold ${isToday ? "text-primary" : isActive ? "text-foreground" : "text-muted-foreground"}`}
              >
                {format(date, "EEEE")}
              </Text>
              <Text className="text-sm text-muted-foreground">{format(date, "MMMM d, yyyy")}</Text>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ gap: 12, paddingBottom: 24, paddingTop: 4 }}
              nestedScrollEnabled
            >
              {showInferredRestState ? (
                <View
                  className="rounded-3xl border border-border bg-card px-5 py-5"
                  testID={`calendar-rest-day-state-${item}`}
                >
                  <Text className="text-sm font-semibold text-foreground">Rest day</Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    No planned activity is scheduled for this day. Keep it light, or add something
                    if plans change.
                  </Text>
                </View>
              ) : null}

              {visibleEvents.length > 0
                ? visibleEvents.map((event) => (
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
                : null}

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
