import { ActivityCard } from "@/components/plan";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { Calendar, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { PlannedActivityDetailModal } from "../components/modals/PlannedActivityDetailModal";

export default function ScheduledScreen() {
  const router = useRouter();
  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);

  // Query all scheduled activities
  const { data: scheduledActivities, isLoading } =
    trpc.plannedActivities.list.useQuery({
      limit: 100,
    });

  const handleActivityTap = (activityId: string) => {
    setSelectedPlannedActivityId(activityId);
  };

  const handleScheduleNew = () => {
    router.push("/plan/create_planned_activity" as any);
  };

  const groupActivitiesByDate = (activities: any[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);
    const nextWeekStart = new Date(
      endOfWeek.getTime() + 1 * 24 * 60 * 60 * 1000,
    );
    const nextWeekEnd = new Date(
      nextWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000,
    );

    const groups = {
      today: [] as any[],
      tomorrow: [] as any[],
      thisWeek: [] as any[],
      nextWeek: [] as any[],
      later: [] as any[],
    };

    activities.forEach((activity) => {
      const date = new Date(activity.scheduled_date);
      const activityDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );

      if (activityDate.getTime() === today.getTime()) {
        groups.today.push(activity);
      } else if (activityDate.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(activity);
      } else if (
        activityDate >= startOfWeek &&
        activityDate <= endOfWeek &&
        activityDate > today
      ) {
        groups.thisWeek.push(activity);
      } else if (activityDate >= nextWeekStart && activityDate <= nextWeekEnd) {
        groups.nextWeek.push(activity);
      } else {
        groups.later.push(activity);
      }
    });

    return groups;
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
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={{
                id: activity.id,
                name: activity.activity_plan?.name || "Unnamed Activity",
                activityType:
                  activity.activity_plan?.activity_category || "other",
                duration: activity.activity_plan?.estimated_duration || 0,
                tss: activity.activity_plan?.estimated_tss || 0,
                scheduledDate: activity.scheduled_date,
                notes: activity.notes,
                status: "scheduled",
              }}
              onPress={handleActivityTap}
              showDate={true}
            />
          ))}
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

  if (!scheduledActivities || scheduledActivities.items.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Empty State */}
        <View className="flex-1 items-center justify-center px-4">
          <View className="bg-muted/30 rounded-lg p-8 max-w-sm">
            <View className="items-center">
              <Icon
                as={Calendar}
                size={64}
                className="text-muted-foreground mb-4"
              />
              <Text className="text-xl font-semibold mb-2 text-center">
                No Activities Scheduled
              </Text>
              <Text className="text-muted-foreground text-center mb-6">
                Browse the library to get started with your training plan
              </Text>
              <Button onPress={handleScheduleNew} className="w-full">
                <Icon
                  as={Plus}
                  size={16}
                  className="text-primary-foreground mr-2"
                />
                <Text className="text-primary-foreground">
                  Schedule from Library
                </Text>
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const groupedActivities = groupActivitiesByDate(scheduledActivities.items);

  return (
    <View className="flex-1 bg-background">
      {/* Activity Count */}
      <View className="p-4 pb-2 border-b border-border">
        <Text className="text-sm text-muted-foreground">
          {scheduledActivities.items.length} activity
          {scheduledActivities.items.length !== 1 ? "s" : ""} scheduled
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
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
