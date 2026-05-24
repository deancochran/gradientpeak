import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format, startOfWeek } from "date-fns";
import { RotateCcw } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { addDaysToDateKey, parseDateKey, toDateKey } from "@/lib/calendar/dateMath";

type CalendarWeekStripProps = {
  dayIndicators: Map<string, CalendarWeekDayIndicators>;
  monthTitle: string;
  selectedDateKey: string;
  todayKey: string;
  onCreateEvent: () => void;
  onResetToday: () => void;
  onSelectDate: (dateKey: string) => void;
};

export type CalendarWeekDayIndicators = {
  activityCount: number;
  eventCount: number;
  goalCount: number;
};

type WeekPage = {
  weekStartKey: string;
  dayKeys: string[];
};

const WEEK_PAGE_COUNT = 13;
const WEEK_PAGE_RADIUS = Math.floor(WEEK_PAGE_COUNT / 2);

function getWeekStartKey(dateKey: string) {
  return toDateKey(startOfWeek(parseDateKey(dateKey)));
}

function buildWeekPage(weekStartKey: string): WeekPage {
  return {
    weekStartKey,
    dayKeys: Array.from({ length: 7 }, (_unused, index) => addDaysToDateKey(weekStartKey, index)),
  };
}

function buildWeekPages(selectedDateKey: string) {
  const selectedWeekStartKey = getWeekStartKey(selectedDateKey);

  return Array.from({ length: WEEK_PAGE_COUNT }, (_unused, index) =>
    buildWeekPage(addDaysToDateKey(selectedWeekStartKey, (index - WEEK_PAGE_RADIUS) * 7)),
  );
}

export function CalendarWeekStrip({
  dayIndicators,
  monthTitle,
  selectedDateKey,
  todayKey,
  onCreateEvent,
  onResetToday,
  onSelectDate,
}: CalendarWeekStripProps) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<WeekPage> | null>(null);
  const selectedWeekStartKey = getWeekStartKey(selectedDateKey);
  const weekPages = useMemo(() => buildWeekPages(selectedDateKey), [selectedDateKey]);

  useEffect(() => {
    listRef.current?.scrollToIndex({ animated: false, index: WEEK_PAGE_RADIUS });
  }, []);

  const renderWeek = ({ item }: ListRenderItemInfo<WeekPage>) => (
    <View
      className="px-3 pb-0.5"
      style={{ width }}
      testID={`calendar-week-page-${item.weekStartKey}`}
    >
      <View className="flex-row justify-between gap-2">
        {item.dayKeys.map((dateKey) => {
          const date = parseDateKey(dateKey);
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;
          const indicators = dayIndicators.get(dateKey);

          return (
            <TouchableOpacity
              key={dateKey}
              onPress={() => onSelectDate(dateKey)}
              className="min-w-12 flex-1 items-center gap-1.5 rounded-2xl px-2 py-1.5"
              activeOpacity={0.85}
              testID={`calendar-week-day-${dateKey}`}
              accessibilityRole="button"
              accessibilityLabel={`${format(date, "EEEE, MMMM d")}${isSelected ? ", selected" : ""}`}
            >
              <Text
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isSelected ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {format(date, "EEEEE")}
              </Text>
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  isSelected ? "bg-primary" : isToday ? "bg-muted" : "bg-transparent"
                }`}
                testID={isSelected ? `calendar-week-day-selected-${dateKey}` : undefined}
              >
                <Text
                  className={`text-lg font-semibold ${
                    isSelected ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {format(date, "d")}
                </Text>
              </View>
              <View className="h-2 flex-row items-center justify-center gap-0.5">
                {indicators?.eventCount ? (
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`}
                    testID={`calendar-week-indicator-event-${dateKey}`}
                  />
                ) : null}
                {indicators?.activityCount ? (
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground/80" : "bg-emerald-500"}`}
                    testID={`calendar-week-indicator-activity-${dateKey}`}
                  />
                ) : null}
                {indicators?.goalCount ? (
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground/70" : "bg-muted-foreground"}`}
                    testID={`calendar-week-indicator-goal-${dateKey}`}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View className="border-b border-border bg-background" testID="calendar-week-strip">
      <View className="flex-row items-center justify-between px-5 pb-0.5 pt-1.5">
        <Text
          className="text-xl font-bold tracking-tight text-foreground"
          testID="calendar-visible-month-label"
        >
          {monthTitle}
        </Text>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={onResetToday}
            className="h-8 w-8 items-center justify-center rounded-full border border-border bg-card"
            activeOpacity={0.85}
            testID="calendar-reset-today-entry"
            accessibilityRole="button"
            accessibilityLabel="Reset calendar to today"
          >
            <Icon as={RotateCcw} size={15} className="text-muted-foreground" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCreateEvent}
            className="h-8 w-8 items-center justify-center rounded-full bg-primary"
            activeOpacity={0.85}
            testID="create-event-entry"
            accessibilityRole="button"
            accessibilityLabel="Create calendar event"
          >
            <Text className="text-xl font-light leading-none text-primary-foreground">+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        ref={listRef}
        key={selectedWeekStartKey}
        data={weekPages}
        extraData={selectedDateKey}
        horizontal
        initialNumToRender={3}
        initialScrollIndex={WEEK_PAGE_RADIUS}
        getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
        keyExtractor={(item) => item.weekStartKey}
        maxToRenderPerBatch={3}
        onScrollToIndexFailed={() => undefined}
        pagingEnabled
        removeClippedSubviews
        renderItem={renderWeek}
        showsHorizontalScrollIndicator={false}
        windowSize={3}
        testID="calendar-week-strip-list"
      />
    </View>
  );
}
