import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { isSameDay, normalizeDate } from "@/app/(internal)/(tabs)/plan/utils/dateGrouping";

interface DayStatus {
  completed: boolean;
  type: string;
  count: number;
}

interface WeekStripProps {
  weekDates: Date[];
  weekActivities: DayStatus[];
  selectedDate: Date;
  onSelectDay: (index: number) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

export function WeekStrip({
  weekDates,
  weekActivities,
  selectedDate,
  onSelectDay,
  onPreviousWeek,
  onNextWeek
}: WeekStripProps) {
  return (
    <View className="bg-card border-b border-border">
      {/* Week Navigation */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity
          onPress={onPreviousWeek}
          className="w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </TouchableOpacity>

        {/* Days Grid */}
        <View className="flex-1 flex-row justify-around items-center px-2">
          {weekDates.map((date, index) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, new Date());
            const dayStatus = weekActivities[index];

            return (
              <TouchableOpacity
                key={index}
                onPress={() => onSelectDay(index)}
                className="items-center"
                activeOpacity={0.7}
              >
                {/* Day Letter */}
                <Text
                  className={`text-xs mb-1.5 ${
                    isSelected ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  {format(date, "EEEEE")}
                </Text>

                {/* Date Number */}
                <View
                  className={`w-10 h-10 rounded-full items-center justify-center mb-2 ${
                    isSelected
                      ? "bg-primary"
                      : isToday
                      ? "border-2 border-primary"
                      : ""
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected
                        ? "text-primary-foreground"
                        : isToday
                        ? "text-primary"
                        : "text-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </Text>
                </View>

                {/* Status Dot */}
                <View className="h-2 w-2">
                  {dayStatus.count > 0 ? (
                    dayStatus.completed ? (
                      // Checkmark dot (filled green)
                      <View className="w-2 h-2 rounded-full bg-green-500" />
                    ) : (
                      // Scheduled dot (filled blue)
                      <View className="w-2 h-2 rounded-full bg-blue-500" />
                    )
                  ) : (
                    // Empty ring (no activity)
                    <View className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={onNextWeek}
          className="w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
        >
          <Icon as={ChevronRight} size={24} className="text-foreground" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
