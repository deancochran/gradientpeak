import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { Stack, useRouter } from "expo-router";
import { Calendar } from "lucide-react-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ActivityList } from "@/components/plan/calendar/ActivityList";
import { HeaderTextAction } from "@/components/shared/HeaderAction";
import { DefaultErrorState, ResourceListErrorNotice } from "@/components/shared/ResourceList";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function ScheduledScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const utils = api.useUtils();
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );

  // Query all scheduled activities
  const {
    data: scheduledData,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = api.events.list.useQuery(
    {
      limit: 100, // Get all activities for scheduling view
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );

  const scheduledActivities = scheduledData?.items || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    await invalidateTrainingPlanQueries(utils);
    setRefreshing(false);
  };

  const handleActivityTap = (activityId: string) => {
    navigateTo(ROUTES.PLAN.ACTIVITY_DETAIL(activityId));
  };

  const handleScheduleNew = () => {
    router.navigate(ROUTES.CALENDAR);
  };

  const screenHeader = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <HeaderTextAction
            accessibilityLabel="Open calendar"
            label="Calendar"
            onPress={handleScheduleNew}
            testID="scheduled-activities-list-calendar-trigger"
          />
        ),
      }}
    />
  );

  if (isLoading && scheduledActivities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {screenHeader}
        <ScrollView className="flex-1 p-4">
          <ListSkeleton count={8} />
        </ScrollView>
      </View>
    );
  }

  if (isError && scheduledActivities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {screenHeader}
        <View className="flex-1 items-center justify-center p-6">
          <DefaultErrorState
            description={error?.message ?? "Please try again."}
            isRetrying={isFetching}
            onRetry={refetch}
            title="Unable to load scheduled activities"
          />
        </View>
      </View>
    );
  }

  if (scheduledActivities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {screenHeader}
        <ScrollView
          className="flex-1"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View className="flex-1 p-6 items-center justify-center min-h-[500px]">
            <EmptyStateCard
              actionLabel="Open calendar"
              icon={Calendar}
              title="No scheduled activities"
              description="Scheduled activities will appear here."
              iconSize={64}
              iconColor="text-primary"
              onAction={handleScheduleNew}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {screenHeader}
      {isError ? (
        <View className="px-4 pt-4">
          <ResourceListErrorNotice
            description={error?.message ?? "Some scheduled activities could not be refreshed."}
            isRetrying={isFetching}
            onRetry={refetch}
          />
        </View>
      ) : null}
      {/* Activity Count */}
      <View className="px-4 pt-4 pb-3 border-b border-border bg-card">
        <Text className="text-sm text-muted-foreground">
          {scheduledActivities.length}{" "}
          {scheduledActivities.length === 1 ? "activity" : "activities"} scheduled
        </Text>
      </View>

      {/* Activity List */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="py-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <ActivityList
          activities={scheduledActivities}
          onActivityPress={handleActivityTap}
          groupBy="date"
          showEmptyState={true}
          emptyStateMessage="No activities found"
        />
      </ScrollView>
    </View>
  );
}
