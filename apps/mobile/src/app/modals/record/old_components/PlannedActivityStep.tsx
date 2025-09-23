import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { type PublicActivityType } from "@repo/core";
import { ActivityIndicator, ScrollView, View } from "react-native";

// Simple activity type display names
const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Outdoor Run",
  outdoor_bike: "Road Cycling",
  indoor_treadmill: "Treadmill Run",
  indoor_strength: "Strength Training",
  indoor_swim: "Pool Swimming",
  other: "Other Activity",
};

// Mock fallback data (remove once DB has planned activities)
const MOCK_PLANNED_ACTIVITIES = [
  {
    id: "mock-1",
    name: "Morning Recovery Run",
    activity_type: "outdoor_run" as PublicActivityType,
    scheduled_date: new Date().toISOString(),
    description: "Easy 5K recovery run",
    estimated_duration: 30,
  },
  {
    id: "mock-2",
    name: "Evening Strength Session",
    activity_type: "indoor_strength" as PublicActivityType,
    scheduled_date: new Date().toISOString(),
    description: "Full body workout",
    estimated_duration: 45,
  },
];

export function PlannedActivityStep({
  onSelectActivity,
}: {
  onSelectActivity: (
    activityId: string,
    activityType: PublicActivityType,
  ) => void;
}) {
  const {
    data: plannedActivities,
    isLoading,
    error,
    refetch,
  } = trpc.plannedActivities.list.useQuery({
    limit: 50,
    offset: 0,
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  // Use mock data if no real data (for testing)
  const activities = plannedActivities?.length ? plannedActivities : MOCK_PLANNED_ACTIVITIES;

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <ActivityIndicator size="large" />
        <Text className="text-center text-muted-foreground mt-4">
          Loading your scheduled activities...
        </Text>
      </View>
    );
  }

  if (error && !plannedActivities?.length) {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Text className="text-center text-destructive mb-4">
          Failed to load planned activities
        </Text>
        <Button onPress={() => refetch()} variant="outline">
          <Text>Try Again</Text>
        </Button>
      </View>
    );
  }

  if (!activities.length) {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Text className="text-center text-muted-foreground mb-2">
          No planned activities found
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Create some planned activities to see them here
        </Text>
        <Button onPress={() => refetch()} variant="outline" className="mt-4">
          <Text>Refresh</Text>
        </Button>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-6">
      <Text className="text-center text-muted-foreground mb-6">
        Select from your scheduled activities ({activities.length} found)
      </Text>

      <View className="gap-3">
        {activities.map((activity) => (
          <Button
            key={activity.id}
            onPress={() =>
              onSelectActivity(
                activity.id,
                activity.activity_type as PublicActivityType,
              )
            }
            className="p-4"
            variant="outline"
          >
            <View className="w-full">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-base font-semibold">{activity.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {formatTime(activity.scheduled_date)}
                </Text>
              </View>
              {activity.description && (
                <Text className="text-sm text-muted-foreground mb-2">
                  {activity.description}
                </Text>
              )}
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-muted-foreground">
                  {ACTIVITY_NAMES[
                    activity.activity_type as PublicActivityType
                  ] || activity.activity_type}
                </Text>
                {activity.estimated_duration && (
                  <Text className="text-sm text-muted-foreground">
                    {formatDuration(activity.estimated_duration)}
                  </Text>
                )}
              </View>
            </View>
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}
