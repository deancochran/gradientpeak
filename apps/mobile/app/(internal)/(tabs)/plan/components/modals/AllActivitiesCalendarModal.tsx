import { ErrorBoundary, ModalErrorFallback } from "@/components/ErrorBoundary";
import { EmptyStateCard } from "@/components/shared";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { Calendar, X } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityList } from "../ActivityList";
import { PlannedActivityDetailModal } from "./PlannedActivityDetailModal";

interface AllActivitiesCalendarModalProps {
  isVisible: boolean;
  onClose: () => void;
}

function AllActivitiesCalendarModalContent({
  isVisible,
  onClose,
}: AllActivitiesCalendarModalProps) {
  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);

  // Query all scheduled activities
  const {
    data: scheduledData,
    isLoading,
    refetch,
  } = trpc.plannedActivities.list.useQuery(
    {
      limit: 100, // Get all activities for calendar view
    },
    { enabled: isVisible },
  );

  const scheduledActivities = scheduledData?.items || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleActivityTap = (activityId: string) => {
    setSelectedPlannedActivityId(activityId);
  };

  const handleCloseActivityDetail = () => {
    setSelectedPlannedActivityId(null);
  };

  return (
    <>
      <Modal
        visible={isVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
        transparent={false}
      >
        <View className="flex-1 bg-background">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-12 pb-4 border-b border-border bg-card">
            <View className="flex-1">
              <Text className="text-xl font-bold">All Activities</Text>
              {!isLoading && (
                <Text className="text-sm text-muted-foreground mt-1">
                  {scheduledActivities.length}{" "}
                  {scheduledActivities.length === 1 ? "activity" : "activities"}{" "}
                  scheduled
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="w-10 h-10 items-center justify-center"
            >
              <Icon as={X} size={24} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" />
              <Text className="text-muted-foreground mt-4">
                Loading activities...
              </Text>
            </View>
          ) : scheduledActivities.length === 0 ? (
            <ScrollView
              className="flex-1"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
              }
            >
              <View className="flex-1 p-6 items-center justify-center min-h-[500px]">
                <EmptyStateCard
                  icon={Calendar}
                  title="No Activities Scheduled"
                  description="Schedule activities to see them here"
                  iconSize={64}
                  iconColor="text-primary"
                />
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerClassName="py-4"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
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
          )}
        </View>
      </Modal>

      {/* Activity Detail Modal - Nested */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={handleCloseActivityDetail}
        />
      )}
    </>
  );
}

export function AllActivitiesCalendarModal(
  props: AllActivitiesCalendarModalProps,
) {
  return (
    <ErrorBoundary fallback={ModalErrorFallback}>
      <AllActivitiesCalendarModalContent {...props} />
    </ErrorBoundary>
  );
}
