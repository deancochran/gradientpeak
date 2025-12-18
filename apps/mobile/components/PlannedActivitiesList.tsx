import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { ActivityPayload } from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Calendar,
  Clock,
  Dumbbell,
  Footprints,
  Play,
  Smartphone,
  Waves,
} from "lucide-react-native";
import React from "react";
import { ActivityIndicator, View } from "react-native";

interface PlannedActivitiesListProps {
  onActivitySelect: (plannedActivity: any) => void;
}

const ACTIVITY_CONFIGS: Record<
  string,
  { name: string; icon: any; color: string }
> = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: {
    name: "Outdoor Bike",
    icon: Bike,
    color: "text-green-600",
  },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength Training",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: {
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
  },
  other: {
    name: "Other Activity",
    icon: Activity,
    color: "text-gray-600",
  },
};

export function PlannedActivitiesList({
  onActivitySelect,
}: PlannedActivitiesListProps) {
  const router = useRouter();

  // Fetch today's planned activities using tRPC
  const { data: plannedActivities, isLoading: loading } =
    trpc.plannedActivities.getToday.useQuery();

  // Handle planned activity selection for follow along mode
  const handleFollowAlong = (activity: any) => {
    const activityPlan = activity.activity_plan;
    const payload: ActivityPayload = {
      category: activityPlan?.activity_category || "other",
      location: activityPlan?.activity_location || "indoor",
      plannedActivityId: activity.id,
      plan: activityPlan,
    };
    activitySelectionStore.setSelection(payload);
    router.push("/follow-along");
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
        <PlannedActivityCard
          key={activity.id}
          activity={activity}
          onFollowAlong={() => handleFollowAlong(activity)}
          onRecord={() => handleRecord(activity)}
        />
      ))}
    </View>
  );
}

interface PlannedActivityCardProps {
  activity: any;
  onFollowAlong: () => void;
  onRecord: () => void;
}

function PlannedActivityCard({
  activity,
  onFollowAlong,
  onRecord,
}: PlannedActivityCardProps) {
  const activityPlan = activity.activity_plan;
  const activityCategory = activityPlan?.activity_category || "other";
  const config = ACTIVITY_CONFIGS[activityCategory] || ACTIVITY_CONFIGS.other;

  // Format the scheduled date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow =
      date.toDateString() ===
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();

    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";

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

  return (
    <View className="bg-card border border-border rounded-xl p-4">
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
              {activityPlan?.name || "Planned Activity"}
            </Text>
            <Text className="text-sm font-medium text-primary">
              {formatDate(activity.scheduled_date)}
            </Text>
          </View>

          {/* Time */}
          <Text className="text-sm text-muted-foreground mb-2">
            {formatTime(activity.scheduled_date)}
          </Text>

          {/* Description */}
          {activityPlan?.description && (
            <Text className="text-sm text-muted-foreground mb-2">
              {activityPlan.description}
            </Text>
          )}

          {/* Metadata */}
          <View className="flex-row items-center gap-4">
            {activityPlan?.estimated_duration_minutes && (
              <View className="flex-row items-center">
                <Icon
                  as={Clock}
                  size={14}
                  className="text-muted-foreground mr-1"
                />
                <Text className="text-xs text-muted-foreground">
                  {activityPlan.estimated_duration_minutes} min
                </Text>
              </View>
            )}

            {activityPlan?.estimated_tss && (
              <View className="flex-row items-center">
                <Text className="text-xs text-muted-foreground">
                  TSS: {Math.round(activityPlan.estimated_tss)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onPress={onFollowAlong}
          className="flex-1 flex-row items-center justify-center gap-2"
        >
          <Icon as={Play} size={16} className="text-foreground" />
          <Text className="text-sm font-medium">Follow Along</Text>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onPress={onRecord}
          className="flex-1 flex-row items-center justify-center gap-2"
        >
          <Icon as={Smartphone} size={16} className="text-foreground" />
          <Text className="text-sm font-medium">Record</Text>
        </Button>
      </View>
    </View>
  );
}
