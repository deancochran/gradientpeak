import { Text } from "@/components/ui/text";
import React from "react";
import { View, ScrollView } from "react-native";

export interface ConsistencyData {
  activityDays: string[]; // Array of dates with activities (YYYY-MM-DD)
  weeklyAvg: number;
  currentStreak: number;
  longestStreak: number;
  totalActivities: number;
  totalDays: number;
}

interface ConsistencyHeatmapProps {
  data: ConsistencyData;
  startDate: string;
  endDate: string;
}

export function ConsistencyHeatmap({
  data,
  startDate,
  endDate,
}: ConsistencyHeatmapProps) {
  const isEmpty = !data || data.activityDays.length === 0;

  // Generate calendar grid
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get Monday of the first week
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() - start.getDay() + 1);

  // Get Sunday of the last week
  const lastSunday = new Date(end);
  lastSunday.setDate(end.getDate() + (7 - end.getDay()));

  // Generate weeks
  const weeks: Array<
    Array<{ date: Date; hasActivity: boolean; isOutOfRange: boolean }>
  > = [];
  let currentDate = new Date(firstMonday);

  while (currentDate <= lastSunday) {
    const week: Array<{
      date: Date;
      hasActivity: boolean;
      isOutOfRange: boolean;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const dateStr = currentDate.toISOString().split("T")[0] || "";
      const hasActivity = data.activityDays.includes(dateStr);
      const isOutOfRange = currentDate < start || currentDate > end;

      week.push({
        date: new Date(currentDate),
        hasActivity,
        isOutOfRange,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    weeks.push(week);
  }

  // Day labels
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  // Calculate frequency percentage
  const frequencyPercentage = isEmpty
    ? 0
    : (data.totalActivities / data.totalDays) * 100;

  return (
    <View className="rounded-lg border bg-card border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        Training Consistency
      </Text>

      {isEmpty ? (
        <View className="py-8 items-center justify-center bg-muted/30 rounded">
          <Text className="text-muted-foreground text-sm mb-1">
            No consistency data yet
          </Text>
          <Text className="text-muted-foreground text-xs text-center px-4">
            Start recording activities to track your training streaks and
            consistency
          </Text>
        </View>
      ) : (
        <>
          {/* Stats Summary */}
          <View className="flex-row justify-around mb-4 pb-4 border-b border-border">
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Current Streak
              </Text>
              <Text className="text-2xl font-bold text-foreground">
                {data.currentStreak}
              </Text>
              <Text className="text-xs text-muted-foreground">days</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Longest Streak
              </Text>
              <Text className="text-2xl font-bold text-foreground">
                {data.longestStreak}
              </Text>
              <Text className="text-xs text-muted-foreground">days</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Weekly Avg</Text>
              <Text className="text-2xl font-bold text-foreground">
                {data.weeklyAvg}
              </Text>
              <Text className="text-xs text-muted-foreground">activities</Text>
            </View>
          </View>

          {/* Calendar Heatmap */}
          <View className="mb-2">
            <Text className="text-sm font-medium text-foreground mb-2">
              Activity Calendar
            </Text>

            {/* Day labels */}
            <View className="flex-row mb-1 ml-8">
              {dayLabels.map((day, index) => (
                <View key={index} className="w-8 items-center">
                  <Text className="text-xs text-muted-foreground">{day}</Text>
                </View>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {weeks.map((week, weekIndex) => {
                  const weekStart = week[0]?.date;
                  const monthLabel = weekStart
                    ? `${weekStart.toLocaleString("default", { month: "short" })}`
                    : "";

                  return (
                    <View
                      key={weekIndex}
                      className="flex-row items-center mb-1"
                    >
                      {/* Month label */}
                      <View className="w-8 mr-1">
                        {weekIndex === 0 || week[0]?.date.getDate() <= 7 ? (
                          <Text className="text-xs text-muted-foreground">
                            {monthLabel}
                          </Text>
                        ) : null}
                      </View>

                      {/* Days */}
                      {week.map((day, dayIndex) => (
                        <View
                          key={dayIndex}
                          className={`w-7 h-7 rounded m-0.5 items-center justify-center ${
                            day.isOutOfRange
                              ? "bg-gray-100"
                              : day.hasActivity
                                ? "bg-green-500"
                                : "bg-gray-200"
                          }`}
                        >
                          {day.hasActivity && !day.isOutOfRange && (
                            <Text className="text-xs text-white font-bold">
                              ✓
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Legend */}
          <View className="flex-row items-center gap-4 mt-2">
            <View className="flex-row items-center gap-1">
              <View className="w-4 h-4 rounded bg-green-500" />
              <Text className="text-xs text-muted-foreground">Activity</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <View className="w-4 h-4 rounded bg-gray-200" />
              <Text className="text-xs text-muted-foreground">Rest Day</Text>
            </View>
          </View>

          {/* Frequency indicator */}
          <View className="mt-3 p-3 bg-blue-50 rounded">
            <Text className="text-xs text-gray-700">
              Training Frequency: {frequencyPercentage.toFixed(1)}% of days
            </Text>
            <Text className="text-xs text-gray-600 mt-1">
              {frequencyPercentage >= 80
                ? "🔥 Excellent consistency!"
                : frequencyPercentage >= 60
                  ? "💪 Good consistency, keep it up!"
                  : frequencyPercentage >= 40
                    ? "👍 Moderate consistency, room for improvement"
                    : "⚠️ Low consistency. Try scheduling regular training days."}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
