import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { Calendar, Plus } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityList } from "../components/ActivityList";
import { PlannedActivityDetailModal } from "../components/modals/PlannedActivityDetailModal";

export default function ScheduledScreen() {
  const router = useRouter();
  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);

  // Query all scheduled activities
  const {
    data: scheduledData,
    isLoading,
    refetch,
  } = trpc.plannedActivities.list.useQuery({
    limit: 100, // Get all activities for scheduling view
  });

  const scheduledActivities = scheduledData?.items || [];

  const handleActivityTap = (activityId: string) => {
    setSelectedPlannedActivityId(activityId);
  };

  const handleScheduleNew = () => {
    router.push("/plan/library" as any);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading scheduled activities...
        </Text>
      </View>
    );
  }

  if (scheduledActivities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Empty State */}
        <View className="flex-1 p-6 items-center justify-center">
          <Icon
            as={Calendar}
            size={64}
            className="text-muted-foreground mb-4"
          />
          <Text className="text-xl font-semibold mb-2">
            No Activities Scheduled
          </Text>
          <Text className="text-muted-foreground text-center mb-6">
            Browse the library to get started with your training plan
          </Text>
          <Button onPress={handleScheduleNew} size="lg">
            <Icon
              as={Plus}
              size={20}
              className="text-primary-foreground mr-2"
            />
            <Text className="text-primary-foreground font-semibold">
              Browse Library
            </Text>
          </Button>
        </View>
      </View>
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
      <ScrollView className="flex-1" contentContainerClassName="py-4">
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

      {/* Activity Detail Modal */}
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
