import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { CalendarDayList, type CalendarDayListProps } from "./CalendarDayList";
import { type CalendarWeekDayIndicators, CalendarWeekStrip } from "./CalendarWeekStrip";

type CalendarErrorScreenProps = {
  onRetry: () => void;
};

type CalendarReadyScreenProps = {
  hydrated: boolean;
  headerTitle: string;
  selectedDateKey: string;
  todayKey: string;
  weekDayIndicators: Map<string, CalendarWeekDayIndicators>;
  dayListProps: CalendarDayListProps;
  onCreateEvent: () => void;
  onJumpToday: () => void;
  onSelectWeekDate: (dateKey: string) => void;
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
          onPress={onRetry}
          className="rounded-full border border-border bg-card px-4 py-2"
          activeOpacity={0.85}
        >
          <Text className="text-sm text-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CalendarReadyScreen({
  hydrated,
  headerTitle,
  selectedDateKey,
  todayKey,
  weekDayIndicators,
  dayListProps,
  onCreateEvent,
  onJumpToday,
  onSelectWeekDate,
}: CalendarReadyScreenProps) {
  return (
    <View className="flex-1 bg-background" testID="calendar-screen-ready">
      <AppHeader title="Calendar" />
      <CalendarWeekStrip
        dayIndicators={weekDayIndicators}
        monthTitle={headerTitle}
        onCreateEvent={onCreateEvent}
        onResetToday={onJumpToday}
        selectedDateKey={selectedDateKey}
        todayKey={todayKey}
        onSelectDate={onSelectWeekDate}
      />

      <View className="flex-1" testID="calendar-screen-content-ready">
        <CalendarDayList {...dayListProps} />
      </View>

      {!hydrated ? <View testID="calendar-store-pending" /> : null}
    </View>
  );
}
