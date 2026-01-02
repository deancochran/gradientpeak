import { Text } from "@/components/ui/text";
import { format, isToday } from "date-fns";
import { Check, Circle } from "lucide-react-native";
import { ScrollView, TouchableOpacity, View } from "react-native";

interface ScheduleItem {
  id: string;
  date: string; // ISO string
  activityName: string;
  activityType: string;
  estimatedDuration: number; // Seconds
  estimatedTSS: number;
  isCompleted?: boolean;
}

interface ScheduleStripProps {
  schedule: ScheduleItem[];
  onPressActivity: (activityId: string) => void;
}

export function ScheduleStrip({ schedule, onPressActivity }: ScheduleStripProps) {
  if (!schedule || schedule.length === 0) {
    return null;
  }

  return (
    <View className="space-y-3">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-lg font-semibold text-foreground">
          Upcoming Schedule
        </Text>
        <Text className="text-sm text-blue-500">View Calendar</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, gap: 12 }}
      >
        {schedule.map((item) => {
          const date = new Date(item.date);
          const isItemToday = isToday(date);
          const dayName = format(date, "EEE"); // Mon, Tue
          const dayNum = format(date, "d"); // 12

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onPressActivity(item.id)}
              className={`w-28 p-3 rounded-xl border ${
                isItemToday
                  ? "bg-primary/10 border-primary"
                  : "bg-card border-border"
              } space-y-2`}
            >
              {/* Date Header */}
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className={`text-xs font-medium ${
                      isItemToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {dayName}
                  </Text>
                  <Text className="text-lg font-bold text-foreground">
                    {dayNum}
                  </Text>
                </View>
                {item.isCompleted ? (
                  <View className="bg-green-500/10 p-1 rounded-full">
                    <Check size={12} className="text-green-600" />
                  </View>
                ) : (
                  <View className="p-1">
                    <Circle
                      size={12}
                      className={
                        isItemToday ? "text-primary" : "text-muted-foreground"
                      }
                    />
                  </View>
                )}
              </View>

              {/* Activity Info */}
              <View>
                <Text
                  numberOfLines={1}
                  className="text-sm font-semibold text-foreground"
                >
                  {item.activityName}
                </Text>
                <Text className="text-xs text-muted-foreground capitalize">
                  {item.activityType.replace("_", " ")}
                </Text>
              </View>

              {/* Stats */}
              <View className="flex-row gap-2 mt-1">
                {item.estimatedDuration > 0 && (
                  <Text className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {Math.round(item.estimatedDuration / 60)}m
                  </Text>
                )}
                {item.estimatedTSS > 0 && (
                  <Text className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {item.estimatedTSS} TSS
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
