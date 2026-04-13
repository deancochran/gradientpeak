import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React, { useMemo } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { parseDateKey } from "@/lib/calendar/dateMath";
import type { CalendarEvent, CalendarEventsByDate } from "@/lib/calendar/normalizeEvents";
import { CalendarEventCard } from "./CalendarEventCard";

type CalendarSelectedDayAgendaProps = {
  activeDate: string;
  todayKey: string;
  eventsByDate: CalendarEventsByDate;
  draggingEventId: string | null;
  getCanStartPlannedEvent: (event: CalendarEvent) => boolean;
  onOpenEvent: (event: CalendarEvent) => void;
  onQuickActionPress: (event: CalendarEvent) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDropOnDate: (dateKey: string) => void;
};

function formatSelectedDayLabel(activeDate: string, todayKey: string) {
  const date = parseDateKey(activeDate);
  if (activeDate === todayKey) {
    return `Today, ${format(date, "MMMM d")}`;
  }

  return format(date, "EEEE, MMMM d");
}

export function CalendarSelectedDayAgenda({
  activeDate,
  todayKey,
  eventsByDate,
  draggingEventId,
  getCanStartPlannedEvent,
  onOpenEvent,
  onQuickActionPress,
  onDragStart,
  onDropOnDate,
}: CalendarSelectedDayAgendaProps) {
  const visibleEvents = useMemo(
    () => (eventsByDate.get(activeDate) ?? []).filter((event) => event.event_type !== "rest_day"),
    [activeDate, eventsByDate],
  );
  const hasPlannedEvent = visibleEvents.some((event) => event.event_type === "planned");
  const showInferredRestState = !hasPlannedEvent;
  const summaryLabel = visibleEvents.length === 1 ? "1 event" : `${visibleEvents.length} events`;

  return (
    <View className="border-t border-border bg-background px-4 pb-4 pt-4" testID="calendar-selected-day-agenda">
      <View className="rounded-[28px] border border-border bg-card px-4 py-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground" testID="calendar-selected-day-label">
              {formatSelectedDayLabel(activeDate, todayKey)}
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Your selected-day agenda stays simple and focused.
            </Text>
          </View>
          <View className="rounded-full bg-primary/10 px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{summaryLabel}</Text>
          </View>
        </View>

        <ScrollView
          className="mt-4 max-h-72"
          contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {showInferredRestState ? (
            <View
              className="rounded-3xl border border-border bg-background px-5 py-5"
              testID={`calendar-rest-day-state-${activeDate}`}
            >
              <Text className="text-sm font-semibold text-foreground">Rest day</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                No planned activity is scheduled for this day. Keep it light, or add something if
                plans change.
              </Text>
            </View>
          ) : null}

          {draggingEventId ? (
            <TouchableOpacity
              onPress={() => onDropOnDate(activeDate)}
              className="rounded-3xl border border-dashed border-primary bg-primary/5 px-4 py-4"
              activeOpacity={0.85}
              testID={`calendar-drop-zone-${activeDate}`}
            >
              <Text className="text-sm font-semibold text-primary">Move dragged event here</Text>
              <Text className="mt-1 text-xs text-primary/80">
                Confirm the selected date for this reschedule.
              </Text>
            </TouchableOpacity>
          ) : null}

          {visibleEvents.length > 0 ? (
            visibleEvents.map((event) => (
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
            <View className="rounded-3xl border border-border bg-background px-5 py-5" testID="calendar-empty-day-state">
              <Text className="text-sm font-semibold text-foreground">No events</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Use the create action if you want to add something to this day.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
