import { ActivityList } from "@/components/plan/calendar/ActivityList";
import { EmptyStateCard, ListSkeleton } from "@/components/shared";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Calendar, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function ScheduledScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const utils = trpc.useUtils();

  // Query all scheduled activities
  const {
    data: scheduledData,
    isLoading,
    refetch,
  } = trpc.plannedActivities.list.useQuery({
    limit: 100, // Get all activities for scheduling view
  });

  const scheduledActivities = scheduledData?.items || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    await utils.trainingPlans.invalidate();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      refetch();
      utils.trainingPlans.invalidate();
    }, [refetch, utils.trainingPlans]),
  );

  const handleActivityTap = (activityId: string) => {
    router.push(`/scheduled-activity-detail?id=${activityId}` as any);
  };

  const handleScheduleNew = () => {
    router.push("/plan-library" as any);
  };

  if (isLoading) {
    return (
      <ScrollView className="flex-1 bg-background p-4">
        <ListSkeleton count={8} />
      </ScrollView>
    );
  }

  if (scheduledActivities.length === 0) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="flex-1 p-6 items-center justify-center min-h-[500px]">
          <EmptyStateCard
            icon={Calendar}
            title="No Activities Scheduled"
            description="Browse the library to get started with your training plan"
            actionLabel="Browse Library"
            onAction={handleScheduleNew}
            iconSize={64}
            iconColor="text-primary"
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Activity Count */}
      <View className="px-4 pt-4 pb-3 border-b border-border bg-card">
        <Text className="text-sm text-muted-foreground">
          {scheduledActivities.length}{" "}
          {scheduledActivities.length === 1 ? "activity" : "activities"}{" "}
          scheduled
        </Text>
      </View>

      {/* Activity List */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="py-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <ActivityList
          activities={scheduledActivities}
          onActivityPress={handleActivityTap}
          groupBy="date"
          showEmptyState={true}
          emptyStateMessage="No activities found"
        />
      </ScrollView>

      {/* FAB - Floating Action Button */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary items-center justify-center shadow-lg"
        onPress={handleScheduleNew}
        activeOpacity={0.8}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Icon as={Plus} size={24} className="text-primary-foreground" />
      </TouchableOpacity>
    </View>
  );
}
