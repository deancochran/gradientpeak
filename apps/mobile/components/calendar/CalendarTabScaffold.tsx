import type { CalendarProjectionItem } from "@repo/core";
import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { CalendarAgendaSheet } from "./CalendarAgendaSheet";
import { CalendarMonthPage } from "./CalendarMonthPage";
import { CalendarTimelineToolbar } from "./CalendarTimelineToolbar";

type CalendarErrorScreenProps = {
  onRetry: () => void;
};

type CalendarReadyScreenProps = {
  activeMonthKey: string;
  calendarProjectionTruncated: boolean;
  hasPartialError: boolean;
  hydrated: boolean;
  isLoadingAdjacentPage: boolean;
  itemsByDate: Map<string, CalendarProjectionItem[]>;
  monthTitle: string;
  onCreateEvent: () => void;
  onMoveMonth: (months: number) => void;
  onOpenItem: (item: CalendarProjectionItem) => void;
  onSelectDate: (dateKey: string) => void;
  onToday: () => void;
  onRetry: () => void;
  selectedDateKey: string;
  todayKey: string;
};

export function CalendarLoadingScreen() {
  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Calendar" />
      <ScrollView className="flex-1 p-6">
        <PlanCalendarSkeleton />
      </ScrollView>
      <View testID="calendar-screen-loading" />
    </View>
  );
}

export function CalendarErrorScreen({ onRetry }: CalendarErrorScreenProps) {
  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Calendar" />
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-center text-sm text-muted-foreground">
          Unable to load calendar events right now.
        </Text>
        <TouchableOpacity
          accessibilityLabel="Retry loading calendar"
          accessibilityRole="button"
          className="rounded-full border border-border bg-card px-4 py-2"
          onPress={onRetry}
          testID="calendar-retry"
        >
          <Text className="text-sm text-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CalendarReadyScreen(props: CalendarReadyScreenProps) {
  const [isAgendaVisible, setIsAgendaVisible] = useState(false);

  const handleCreateEvent = () => {
    setIsAgendaVisible(false);
    props.onCreateEvent();
  };

  const handleOpenItem = (item: CalendarProjectionItem) => {
    setIsAgendaVisible(false);
    props.onOpenItem(item);
  };

  return (
    <View className="flex-1 bg-background" testID="calendar-screen-ready">
      <AppHeader title="Calendar" />
      <CalendarTimelineToolbar
        dateKey={props.selectedDateKey}
        isJumpLoading={props.isLoadingAdjacentPage}
        monthTitle={props.monthTitle}
        onCreateEvent={props.onCreateEvent}
        onJumpDate={props.onSelectDate}
        onMoveMonth={props.onMoveMonth}
        onResetToday={props.onToday}
      />

      {props.hasPartialError ? (
        <View
          className="mx-4 mb-2 flex-row items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2"
          testID="calendar-partial-error"
        >
          <Text className="flex-1 text-xs text-foreground">
            Some calendar items could not be loaded.
          </Text>
          <TouchableOpacity
            accessibilityLabel="Retry loading calendar items"
            accessibilityRole="button"
            onPress={props.onRetry}
          >
            <Text className="text-xs font-medium text-foreground">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {props.calendarProjectionTruncated ? (
        <View
          className="mx-4 mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2"
          testID="calendar-projection-truncated"
        >
          <Text accessibilityRole="alert" className="text-xs text-foreground">
            This date page contains more calendar items than can be shown.
          </Text>
        </View>
      ) : null}

      <View className="flex-1">
        <CalendarMonthPage
          activeMonthKey={props.activeMonthKey}
          itemsByDate={props.itemsByDate}
          onOpenSelectedDay={() => setIsAgendaVisible(true)}
          onSelectDate={props.onSelectDate}
          selectedDateKey={props.selectedDateKey}
          todayKey={props.todayKey}
        />
      </View>

      <CalendarAgendaSheet
        dateKey={props.selectedDateKey}
        onClose={() => setIsAgendaVisible(false)}
        onCreateEvent={handleCreateEvent}
        onOpenItem={handleOpenItem}
        visible={isAgendaVisible}
      />

      {props.isLoadingAdjacentPage ? (
        <ActivityIndicator
          accessibilityLabel="Loading calendar month"
          size="small"
          testID="calendar-month-loading"
        />
      ) : null}
      {!props.hydrated ? <View testID="calendar-store-pending" /> : null}
    </View>
  );
}
