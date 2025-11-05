import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
    Activity,
    Bike,
    Calendar,
    Clock,
    Dumbbell,
    Footprints,
    Plus,
    Waves,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { PlannedActivityDetailModal } from "../components/modals/PlannedActivityDetailModal";

const ACTIVITY_CONFIGS = {
  outdoor_run: { name: "Outdoor Run", icon: Footprints, color: "text-blue-600" },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: { name: "Treadmill", icon: Footprints, color: "text-purple-600" },
  indoor_bike_trainer: { name: "Bike Trainer", icon: Bike, color: "text-orange-600" },
  indoor_strength: { name: "Strength Training", icon: Dumbbell, color: "text-red-600" },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other Activity", icon: Activity, color: "text-gray-600" },
};

export default function ScheduledScreen() {
  const router = useRouter();
  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<string | null>(null);

  // Query all scheduled activities
  const { data: scheduledActivities, isLoading } = trpc.plannedActivities.list.useQuery();

  const handleActivityTap = (activityId: string) => {
    setSelectedPlannedActivityId(activityId);
  };

  const handleScheduleNew = () => {
    router.push("/plan/create/planned-activity");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (activityDate.getTime() === today.getTime()) return "Today";
    if (activityDate.getTime() === tomorrow.getTime()) return "Tomorrow";

    // Check if it's this week
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);

    if (activityDate >= startOfWeek && activityDate <= endOfWeek) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }

    // Check if it's next week
    const nextWeekStart = new Date(endOfWeek.getTime() + 1 * 24 * 60 * 60 * 1000);
    const nextWeekEnd = new Date(nextWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

    if (activityDate >= nextWeekStart && activityDate <= nextWeekEnd) {
      return `Next ${date.toLocaleDateString(undefined, { weekday: "long" })}`;
    }

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const groupActivitiesByDate = (activities: any[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);
    const nextWeekStart = new Date(endOfWeek.getTime() + 1 * 24 * 60 * 60 * 1000);
    const nextWeekEnd = new Date(nextWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

    const groups = {
      today: [] as any[],
      tomorrow: [] as any[],
      thisWeek: [] as any[],
      nextWeek: [] as any[],
      later: [] as any[],
    };

    activities.forEach((activity) => {
      const date = new Date(activity.scheduled_date);
      const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      if (activityDate.getTime() === today.getTime()) {
        groups.today.push(activity);
      } else if (activityDate.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(activity);
      } else if (activityDate >= startOfWeek && activityDate <= endOfWeek && activityDate > today) {
        groups.thisWeek.push(activity);
      } else if (activityDate >= nextWeekStart && activityDate <= nextWeekEnd) {
        groups.nextWeek.push(activity);
      } else {
        groups.later.push(activity);
      }
    });

    return groups;
  };

  const renderActivityCard = (activity: any) => {
    const config = ACTIVITY_CONFIGS[activity.activity_plan?.activity_type as keyof typeof ACTIVITY_CONFIGS] || ACTIVITY_CONFIGS.other;

    return (
      <TouchableOpacity
        key={activity.id}
        onPress={() => handleActivityTap(activity.id)}
        className="active:opacity-70"
      >
        <Card>
          <CardContent className="p-4">
            <View className="flex-row items-start">
              {/* Icon */}
              <View className="mr-3 mt-1">
                <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                  <Icon as={config.icon} size={20} className={config.color} />
                </View>
              </View>

              {/* Content */}
              <View className="flex-1">
                {/* Header */}
                <View className="flex-row items-start justify-between mb-1">
                  <Text className="text-lg font-semibold flex-1">
                    {activity.activity_plan?.name || "Unnamed Workout"}
                  </Text>
                  <Text className="text-sm font-medium text-primary">
                    {formatTime(activity.scheduled_date)}
                  </Text>
                </View>

                {/* Activity Type */}
                <Text className="text-sm text-muted-foreground mb-2">
                  {config.name}
                </Text>

                {/* Notes */}
                {activity.notes && (
                  <Text className="text-sm text-muted-foreground mb-2" numberOfLines={2}>
                    {activity.notes}
                  </Text>
                )}

                {/* Metadata */}
                <View className="flex-row items-center gap-4">
                  {activity.activity_plan?.estimated_duration && (
                    <View className="flex-row items-center">
                      <Icon as={Clock} size={14} className="text-muted-foreground mr-1" />
                      <Text className="text-xs text-muted-foreground">
                        {activity.activity_plan.estimated_duration} min
                      </Text>
                    </View>
                  )}

                  {activity.activity_plan?.estimated_tss && (
                    <Text className="text-xs text-muted-foreground">
                      TSS: {activity.activity_plan.estimated_tss}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </CardContent>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderGroup = (title: string, activities: any[]) => {
    if (activities.length === 0) return null;

    return (
      <View key={title} className="mb-6">
        <View className="flex-row items-center gap-2 px-4 mb-3">
          <Text className="text-lg font-semibold">{title}</Text>
          <View className="bg-muted px-2 py-1 rounded-full">
            <Text className="text-xs text-muted-foreground font-medium">
              {activities.length}
            </Text>
          </View>
        </View>
        <View className="gap-3 px-4">
          {activities.map(renderActivityCard)}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-2 text-sm text-muted-foreground">
          Loading scheduled activities...
        </Text>
      </View>
    );
  }

  if (!scheduledActivities || scheduledActivities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="p-4">
          <Text className="text-2xl font-bold">Scheduled Workouts</Text>
          <Text className="text-muted-foreground mt-1">
            Your planned activities will appear here
          </Text>
        </View>

        {/* Empty State */}
        <View className="flex-1 items-center justify-center px-4">
          <View className="bg-muted/30 rounded-lg p-8 max-w-sm">
            <View className="items-center">
              <Icon as={Calendar} size={64} className="text-muted-foreground mb-4" />
              <Text className="text-xl font-semibold mb-2 text-center">
                No Workouts Scheduled
              </Text>
              <Text className="text-muted-foreground text-center mb-6">
                Browse the library to get started with your training plan
              </Text>
              <Button onPress={handleScheduleNew} className="w-full">
                <Icon as={Plus} size={16} className="text-primary-foreground mr-2" />
                <Text className="text-primary-foreground">Schedule from Library</Text>
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const groupedActivities = groupActivitiesByDate(scheduledActivities);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="p-4">
        <Text className="text-2xl font-bold">Scheduled Workouts</Text>
        <Text className="text-muted-foreground mt-1">
          {scheduledActivities.length} workout{scheduledActivities.length !== 1 ? "s" : ""} scheduled
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {renderGroup("Today", groupedActivities.today)}
        {renderGroup("Tomorrow", groupedActivities.tomorrow)}
        {renderGroup("This Week", groupedActivities.thisWeek)}
        {renderGroup("Next Week", groupedActivities.nextWeek)}
        {renderGroup("Later", groupedActivities.later)}
      </ScrollView>

      {/* FAB */}
      <View className="absolute bottom-6 right-6">
        <Button
          onPress={handleScheduleNew}
          size="lg"
          className="w-14 h-14 rounded-full shadow-lg"
        >
          <Icon as={Plus} size={24} className="text-primary-foreground" />
        </Button>
      </View>

      {/* Modal */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={() => setSelectedPlannedActivityId(null)}
        />
      )}
    </View>
  );
}
