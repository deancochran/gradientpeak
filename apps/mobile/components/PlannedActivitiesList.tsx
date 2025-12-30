import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { ActivityPayload } from "@repo/core";
import { useRouter } from "expo-router";
import { Calendar, Smartphone } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";

interface PlannedActivitiesListProps {
  onActivitySelect: (plannedActivity: any) => void;
}

// No longer need local transform function - ActivityPlanCard handles it internally

export function PlannedActivitiesList({
  onActivitySelect,
}: PlannedActivitiesListProps) {
  const router = useRouter();

  // Fetch today's planned activities using tRPC
  const { data: plannedActivities, isLoading: loading } =
    trpc.plannedActivities.getToday.useQuery();

  // Handle navigation to activity plan detail page
  const handleNavigateToDetail = (activity: any) => {
    router.push({
      pathname: "/activity-plan-detail" as any,
      params: { planId: activity.activity_plan?.id },
    });
  };

  // Handle planned activity selection for record mode
  const handleRecord = (activity: any) => {
    const activityPlan = activity.activity_plan;
    const payload: ActivityPayload = {
      category: activityPlan?.activity_category || "other",
      location: activityPlan?.activity_location || "indoor",
      plannedActivityId: activity.id,
      plan: activityPlan,
    };
    onActivitySelect(payload);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <ActivityIndicator size="large" />
        <Text className="mt-2 text-sm text-muted-foreground">
          Loading planned activities...
        </Text>
      </View>
    );
  }

  if (!plannedActivities || plannedActivities.length === 0) {
    return (
      <View className="bg-muted/30 rounded-lg p-8">
        <View className="items-center">
          <Icon
            as={Calendar}
            size={48}
            className="text-muted-foreground mb-4"
          />
          <Text className="text-lg font-semibold mb-2">
            No Planned Activities Today
          </Text>
          <Text className="text-muted-foreground text-center">
            You have no activities scheduled for today. Check the Plan tab to
            schedule activities.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground mb-2">
        {plannedActivities.length} activity
        {plannedActivities.length !== 1 ? "ies" : ""} scheduled for today
      </Text>

      {plannedActivities.map((activity) => (
        <View key={activity.id} className="relative">
          <ActivityPlanCard
            plannedActivity={activity}
            onPress={() => handleNavigateToDetail(activity)}
            variant="default"
            showScheduleInfo={true}
          />
          {/* Quick-action Record Button */}
          <TouchableOpacity
            className="absolute top-3 right-3 bg-primary rounded-full p-2 shadow-sm"
            onPress={(e) => {
              e.stopPropagation();
              handleRecord(activity);
            }}
          >
            <Icon
              as={Smartphone}
              size={18}
              className="text-primary-foreground"
            />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
