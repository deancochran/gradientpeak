/**
 * ActivityList Component
 * Reusable component for displaying grouped activities
 * Eliminates duplication across index.tsx and planned_activities/index.tsx
 */

import { Text } from "@/components/ui/text";
import { useMemo } from "react";
import { View } from "react-native";
import { groupActivitiesByDate, GroupedActivities } from "../utils/dateGrouping";
import { PlannedActivityCard } from "./PlannedActivityCard";

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
          <PlannedActivityCard
            key={activity.id}
            activity={activity}
            onPress={onPress}
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
          <PlannedActivityCard
            key={activity.id}
            activity={activity}
            onPress={onActivityPress}
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
        <PlannedActivityCard
          key={activity.id}
          activity={activity}
          onPress={onActivityPress}
          compact
        />
      ))}
    </View>
  );
}
