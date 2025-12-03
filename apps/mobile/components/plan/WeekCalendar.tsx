import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface WeekActivity {
  completed: boolean;
  type: string;
  count: number;
}

interface WeekCalendarProps {
  weekDates: Date[];
  weekDays: string[];
  dates: number[];
  weekActivities: WeekActivity[];
  selectedDate: Date;
  startOfWeek: Date;
  endOfWeek: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onSelectDay: (index: number) => void;
}

export function WeekCalendar({
  weekDates,
  weekDays,
  dates,
  weekActivities,
  selectedDate,
  startOfWeek,
  endOfWeek,
  onPreviousWeek,
  onNextWeek,
  onSelectDay,
}: WeekCalendarProps) {
  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  return (
    <View className="bg-primary px-5 pb-6">
      {/* Week Navigation */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          className="p-2"
          onPress={onPreviousWeek}
          activeOpacity={0.7}
        >
          <Icon
            as={ChevronLeft}
            size={20}
            className="text-primary-foreground"
          />
        </TouchableOpacity>
        <Text className="font-medium text-primary-foreground">
          {format(startOfWeek, "MMM d")} - {format(endOfWeek, "MMM d")}
        </Text>
        <TouchableOpacity
          className="p-2"
          onPress={onNextWeek}
          activeOpacity={0.7}
        >
          <Icon
            as={ChevronRight}
            size={20}
            className="text-primary-foreground"
          />
        </TouchableOpacity>
      </View>

      {/* Week Calendar */}
      <View className="flex-row justify-between">
        {weekDays.map((day, idx) => {
          const dateObj = weekDates[idx];
          const isSelectedDay = isSameDay(dateObj, selectedDate);
          const isTodayMarker = isSameDay(dateObj, new Date());

          return (
            <TouchableOpacity
              key={idx}
              onPress={() => onSelectDay(idx)}
              className={`items-center ${isSelectedDay ? "opacity-100" : "opacity-60"}`}
              activeOpacity={0.7}
            >
              <Text className="text-xs mb-2 text-primary-foreground">
                {day}
              </Text>
              <View
                className={`w-12 h-12 rounded-lg items-center justify-center relative ${
                  isSelectedDay
                    ? "bg-primary-foreground"
                    : "bg-primary-foreground/10"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    isSelectedDay ? "text-primary" : "text-primary-foreground"
                  }`}
                >
                  {dates[idx]}
                </Text>
                {weekActivities[idx].count > 0 && (
                  <View
                    className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                      weekActivities[idx].completed
                        ? "bg-green-500"
                        : isSelectedDay
                          ? "bg-primary"
                          : "bg-primary-foreground"
                    }`}
                  />
                )}
                {isTodayMarker && !isSelectedDay && (
                  <View className="absolute top-1 right-1 w-1 h-1 rounded-full bg-yellow-400" />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
