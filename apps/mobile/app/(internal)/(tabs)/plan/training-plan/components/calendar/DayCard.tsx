import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Plus } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { ActivityCard } from "./ActivityCard";

interface Activity {
  id: string;
  name: string;
  activityType: string;
  duration: number;
  tss: number;
  status: "completed" | "scheduled" | "warning" | "violation";
}

interface DayCardProps {
  date: Date;
  activities: Activity[];
  isRestDay: boolean;
  isToday: boolean;
  onActivityPress: (activityId: string) => void;
  onActivityLongPress?: (activityId: string) => void;
  onAddActivity: (date: Date) => void;
}

/**
 * Day card component for the training plan calendar
 * Displays a single day with its activities or rest day indicator
 */
export function DayCard({
  date,
  activities,
  isRestDay,
  isToday,
  onActivityPress,
  onActivityLongPress,
  onAddActivity,
}: DayCardProps) {
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const dayNumber = date.getDate();

  return (
    <View className="flex-1 min-w-[120px]">
      {/* Day Header */}
      <View
        className={`p-3 rounded-t-lg ${isToday ? "bg-primary" : "bg-muted/50"}`}
      >
        <Text
          className={`text-xs font-medium text-center ${
            isToday ? "text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {dayName}
        </Text>
        <Text
          className={`text-lg font-bold text-center ${
            isToday ? "text-primary-foreground" : "text-foreground"
          }`}
        >
          {dayNumber}
        </Text>
      </View>

      {/* Day Content */}
      <View className="bg-card border border-border border-t-0 rounded-b-lg p-2 min-h-[200px]">
        {/* Rest Day Indicator */}
        {isRestDay && activities.length === 0 && (
          <View className="items-center justify-center py-8">
            <View className="bg-muted/50 rounded-full px-3 py-2">
              <Text className="text-sm text-muted-foreground font-medium">
                Rest Day
              </Text>
            </View>
          </View>
        )}

        {/* Activities List */}
        {activities.length > 0 && (
          <View className="gap-2">
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                id={activity.id}
                name={activity.name}
                activityType={activity.activityType}
                duration={activity.duration}
                tss={activity.tss}
                status={activity.status}
                onPress={onActivityPress}
                onLongPress={onActivityLongPress}
              />
            ))}
          </View>
        )}

        {/* Add Activity Button */}
        <TouchableOpacity
          onPress={() => onAddActivity(date)}
          activeOpacity={0.7}
          className="mt-2"
        >
          <View className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-3 items-center justify-center">
            <Icon as={Plus} size={20} className="text-muted-foreground/50" />
            <Text className="text-xs text-muted-foreground/50 mt-1">
              Add Activity
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
