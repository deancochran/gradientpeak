import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { shouldUseFollowAlong } from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Calendar,
  ChevronRight,
  Clock,
  Dumbbell,
  Footprints,
  Target,
  Waves,
} from "lucide-react-native";
import { View } from "react-native";

interface PlannedActivitiesListProps {
  onActivitySelect: (plannedActivity: any) => void;
}

// Mock data for planned activities - will be replaced with real API data
const MOCK_PLANNED_ACTIVITIES = [
  {
    id: "planned-1",
    name: "Morning Easy Run",
    activity_type: "outdoor_run",
    scheduled_date: "2024-01-15T07:00:00Z",
    estimated_duration: 45,
    estimated_tss: 65,
    description: "Easy aerobic run to start the week",
    plan: {
      name: "Morning Easy Run",
      description: "Easy aerobic run to start the week",
      activity_type: "outdoor_run",
      estimated_tss: 65,
      structure: {
        steps: [
          {
            type: "step",
            name: "Warm-up",
            duration: { type: "time", value: 10, unit: "minutes" },
            targets: [{ type: "%MaxHR", intensity: 65 }],
          },
          {
            type: "step",
            name: "Main Set",
            duration: { type: "time", value: 30, unit: "minutes" },
            targets: [{ type: "%MaxHR", intensity: 75 }],
          },
          {
            type: "step",
            name: "Cool-down",
            duration: { type: "time", value: 5, unit: "minutes" },
            targets: [{ type: "%MaxHR", intensity: 60 }],
          },
        ],
      },
    },
  },
  {
    id: "planned-2",
    name: "Interval Training",
    activity_type: "indoor_bike_trainer",
    scheduled_date: "2024-01-16T18:00:00Z",
    estimated_duration: 60,
    estimated_tss: 85,
    description: "4x8min intervals at threshold power",
    plan: {
      name: "Interval Training",
      description: "4x8min intervals at threshold power",
      activity_type: "indoor_bike_trainer",
      estimated_tss: 85,
      structure: {
        steps: [
          {
            type: "step",
            name: "Warm-up",
            duration: { type: "time", value: 15, unit: "minutes" },
            targets: [{ type: "%FTP", intensity: 65 }],
          },
          {
            type: "repetition",
            repeat: 4,
            steps: [
              {
                type: "step",
                name: "Interval",
                duration: { type: "time", value: 8, unit: "minutes" },
                targets: [{ type: "%FTP", intensity: 95 }],
              },
              {
                type: "step",
                name: "Recovery",
                duration: { type: "time", value: 2, unit: "minutes" },
                targets: [{ type: "%FTP", intensity: 50 }],
              },
            ],
          },
          {
            type: "step",
            name: "Cool-down",
            duration: { type: "time", value: 10, unit: "minutes" },
            targets: [{ type: "%FTP", intensity: 55 }],
          },
        ],
      },
    },
  },
];

// Activity type configurations
const ACTIVITY_CONFIGS: Record<string, { icon: any; color: string }> = {
  outdoor_run: { icon: Footprints, color: "text-emerald-600" },
  outdoor_bike: { icon: Bike, color: "text-blue-600" },
  indoor_bike_trainer: { icon: Bike, color: "text-orange-600" },
  indoor_treadmill: { icon: Footprints, color: "text-purple-600" },
  indoor_strength: { icon: Dumbbell, color: "text-red-600" },
  indoor_swim: { icon: Waves, color: "text-cyan-600" },
  other: { icon: Activity, color: "text-gray-600" },
};

export function PlannedActivitiesList({
  onActivitySelect,
}: PlannedActivitiesListProps) {
  const router = useRouter();

  // TODO: Replace with real API call
  const plannedActivities = MOCK_PLANNED_ACTIVITIES;
  const isLoading = false;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text className="text-muted-foreground">
          Loading planned activities...
        </Text>
      </View>
    );
  }

  if (plannedActivities.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <View className="items-center mb-6">
          <Icon
            as={Calendar}
            size={48}
            className="text-muted-foreground mb-4"
          />
          <Text className="text-lg font-semibold mb-2">
            No Planned Activities
          </Text>
          <Text className="text-muted-foreground text-center">
            Your scheduled activities will appear here when you create a
            training plan.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground mb-2">
        {plannedActivities.length} activity
        {plannedActivities.length !== 1 ? "ies" : ""} scheduled
      </Text>

      {plannedActivities.map((activity) => (
        <PlannedActivityCard
          key={activity.id}
          activity={activity}
          onSelect={() => handlePlannedActivitySelect(activity)}
        />
      ))}
    </View>
  );

  // Handle planned activity selection with routing logic
  function handlePlannedActivitySelect(activity: any) {
    // Route based on activity type - swim, strength, and other must use follow-along
    if (shouldUseFollowAlong(activity.activity_type)) {
      // Route to follow-along for swim, strength, and other activities
      const payload = {
        type: activity.activity_type,
        plannedActivityId: activity.id,
        plan: activity.plan, // activity.plan is already a RecordingServiceActivityPlan
      };
      const payloadString = encodeURIComponent(JSON.stringify(payload));
      router.push(`/follow-along?payload=${payloadString}` as any);
    } else {
      // Use callback for other activity types (cardio activities)
      onActivitySelect(activity);
    }
  }
}

interface PlannedActivityCardProps {
  activity: any;
  onSelect: () => void;
}

function PlannedActivityCard({ activity, onSelect }: PlannedActivityCardProps) {
  const config =
    ACTIVITY_CONFIGS[activity.activity_type] || ACTIVITY_CONFIGS.other;

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
    <Button
      variant="outline"
      onPress={onSelect}
      className="h-auto p-4 bg-card border border-border rounded-xl"
    >
      <View className="flex-row items-start w-full">
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
              {activity.name}
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
          {activity.description && (
            <Text className="text-sm text-muted-foreground mb-2">
              {activity.description}
            </Text>
          )}

          {/* Metadata */}
          <View className="flex-row items-center gap-4">
            {activity.estimated_duration && (
              <View className="flex-row items-center">
                <Icon
                  as={Clock}
                  size={14}
                  className="text-muted-foreground mr-1"
                />
                <Text className="text-xs text-muted-foreground">
                  {activity.estimated_duration} min
                </Text>
              </View>
            )}


            {activity.estimated_tss && (
              <View className="flex-row items-center">
                <Text className="text-xs text-muted-foreground">
                  TSS: {activity.estimated_tss}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Arrow */}
        <View className="ml-2 mt-1">
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </View>
      </View>
    </Button>
  );
}
