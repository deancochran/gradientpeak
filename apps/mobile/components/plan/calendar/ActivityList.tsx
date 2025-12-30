/**
 * ActivityList Component
 * Reusable component for displaying grouped activities
 * Eliminates duplication across index.tsx and planned_activities/index.tsx
 */

import {
  ActivityPlanCard,
  ActivityPlanCardData,
} from "@/components/shared/ActivityPlanCard";
import { Text } from "@/components/ui/text";
import {
  groupActivitiesByDate,
  GroupedActivities,
} from "@/lib/utils/plan/dateGrouping";
import { useMemo } from "react";
import { View } from "react-native";

export interface ActivityListProps {
  activities: any[];
  onActivityPress: (activityId: string) => void;
  groupBy?: "date" | "none";
  showEmptyState?: boolean;
  emptyStateMessage?: string;
  limit?: number;
}

interface GroupSectionProps {
  title: string;
  activities: any[];
  onPress: (activityId: string) => void;
}

// Transform planned activity to card data format
function transformToCardData(plannedActivity: any): ActivityPlanCardData {
  const plan = plannedActivity.activity_plan;
  return {
    id: plannedActivity.id,
    name: plan?.name || "Unnamed Activity",
    activityType: plan?.activity_category || "other",
    structure: plan?.structure,
    estimatedDuration: plan?.estimated_duration,
    estimatedTss: plan?.estimated_tss,
    estimatedDistance: (plan?.structure as any)?.route?.distance,
    routeId: (plan?.structure as any)?.route_id,
    routeName: (plan?.structure as any)?.route?.name,
    notes: plannedActivity.notes,
    scheduledDate: plannedActivity.scheduled_date,
    isCompleted: Boolean(plannedActivity.completed_activity_id),
  };
}

/**
 * Render a group section with title and activities
 */
function GroupSection({ title, activities, onPress }: GroupSectionProps) {
  if (activities.length === 0) return null;

  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-3 px-4">
        <Text className="text-lg font-semibold flex-1">{title}</Text>
        <View className="bg-muted px-3 py-1 rounded-full">
          <Text className="text-sm text-muted-foreground">
            {activities.length}
          </Text>
        </View>
      </View>
      <View className="gap-3 px-4">
        {activities.map((activity) => (
          <ActivityPlanCard
            key={activity.id}
            activity={transformToCardData(activity)}
            onPress={() => onPress(activity.id)}
            variant="default"
            showScheduleInfo={true}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * ActivityList Component
 * Displays a list of activities, optionally grouped by date
 */
export function ActivityList({
  activities,
  onActivityPress,
  groupBy = "date",
  showEmptyState = true,
  emptyStateMessage = "No activities found",
  limit,
}: ActivityListProps) {
  // Apply limit if specified
  const displayActivities = useMemo(() => {
    if (!limit) return activities;
    return activities.slice(0, limit);
  }, [activities, limit]);

  // Group activities by date if requested
  const groupedActivities = useMemo<GroupedActivities>(() => {
    if (groupBy === "none") {
      return {
        today: [],
        tomorrow: [],
        thisWeek: [],
        nextWeek: [],
        later: displayActivities,
      };
    }

    return groupActivitiesByDate(displayActivities);
  }, [displayActivities, groupBy]);

  // Check if there are any activities
  const hasActivities = displayActivities.length > 0;

  if (!hasActivities && showEmptyState) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-8">
        <Text className="text-muted-foreground text-center">
          {emptyStateMessage}
        </Text>
      </View>
    );
  }

  if (groupBy === "none") {
    return (
      <View className="gap-3">
        {displayActivities.map((activity) => (
          <ActivityPlanCard
            key={activity.id}
            activity={transformToCardData(activity)}
            onPress={() => onActivityPress(activity.id)}
            variant="default"
            showScheduleInfo={true}
          />
        ))}
      </View>
    );
  }

  // Render grouped activities
  return (
    <View>
      <GroupSection
        title="Today"
        activities={groupedActivities.today}
        onPress={onActivityPress}
      />
      <GroupSection
        title="Tomorrow"
        activities={groupedActivities.tomorrow}
        onPress={onActivityPress}
      />
      <GroupSection
        title="This Week"
        activities={groupedActivities.thisWeek}
        onPress={onActivityPress}
      />
      <GroupSection
        title="Next Week"
        activities={groupedActivities.nextWeek}
        onPress={onActivityPress}
      />
      <GroupSection
        title="Later"
        activities={groupedActivities.later}
        onPress={onActivityPress}
      />
    </View>
  );
}

/**
 * Simple list variant without grouping or card styling
 * Useful for compact displays
 */
export function ActivityListCompact({
  activities,
  onActivityPress,
  limit,
}: Pick<ActivityListProps, "activities" | "onActivityPress" | "limit">) {
  const displayActivities = limit ? activities.slice(0, limit) : activities;

  return (
    <View className="gap-2">
      {displayActivities.map((activity) => (
        <ActivityPlanCard
          key={activity.id}
          activity={transformToCardData(activity)}
          onPress={() => onActivityPress(activity.id)}
          variant="compact"
          showScheduleInfo={true}
        />
      ))}
    </View>
  );
}
