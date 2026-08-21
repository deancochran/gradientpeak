import type { CalendarProjectionItem } from "@repo/core";
import { deriveCalendarDayVisualState, describeCalendarDayVisualState } from "@repo/core/calendar";
import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import { addDaysToDateKey, getMonthGridStartKey, isSameMonth } from "@/lib/calendar/dateMath";
import { CalendarDayVisual } from "./CalendarDayVisual";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarMonthPageProps = {
  activeMonthKey: string;
  itemsByDate: Map<string, CalendarProjectionItem[]>;
  onOpenSelectedDay: () => void;
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
  todayKey: string;
};

export function CalendarMonthPage({
  activeMonthKey,
  itemsByDate,
  onOpenSelectedDay,
  onSelectDate,
  selectedDateKey,
  todayKey,
}: CalendarMonthPageProps) {
  const gridStart = getMonthGridStartKey(activeMonthKey);
  const weeks = Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) =>
      addDaysToDateKey(gridStart, weekIndex * 7 + dayIndex),
    ),
  );

  return (
    <View className="flex-1 px-2 py-3" testID={`calendar-month-page-${activeMonthKey}`}>
      <View className="flex-1 rounded-2xl border border-border bg-card p-2">
        <View className="flex-row">
          {WEEKDAYS.map((weekday) => (
            <View key={weekday} className="flex-1 items-center">
              <Text className="text-[11px] font-semibold uppercase text-muted-foreground">
                {weekday}
              </Text>
            </View>
          ))}
        </View>
        <View className="mt-1 flex-1">
          {weeks.map((week) => (
            <View className="flex-1 flex-row" key={week[0]}>
              {week.map((dateKey) => {
                const selected = dateKey === selectedDateKey;
                const today = dateKey === todayKey;
                const inMonth = isSameMonth(dateKey, activeMonthKey);
                const visualState = deriveCalendarDayVisualState(itemsByDate.get(dateKey) ?? []);

                return (
                  <TouchableOpacity
                    key={dateKey}
                    accessibilityLabel={`${selected ? "Open agenda for" : "Select"} ${dateKey}. ${describeCalendarDayVisualState(visualState)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className="flex-1 items-center justify-center"
                    onPress={() => (selected ? onOpenSelectedDay() : onSelectDate(dateKey))}
                    testID={`calendar-day-select-${dateKey}`}
                  >
                    <CalendarDayVisual
                      day={Number(dateKey.slice(8, 10))}
                      decorative
                      muted={!inMonth}
                      selected={selected}
                      state={visualState}
                      today={today}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
