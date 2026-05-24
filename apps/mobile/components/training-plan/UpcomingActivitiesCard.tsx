import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

interface UpcomingActivity {
  id: string;
  scheduled_date: string;
  training_plan_id?: string | null;
  activity_plan: {
    id: string;
    name: string;
    activity_category: string;
    authoritative_metrics?: {
      estimated_duration?: number | null;
      estimated_tss?: number | null;
    } | null;
  } | null;
}

interface UpcomingActivitiesCardProps {
  activities: UpcomingActivity[];
}

export function UpcomingActivitiesCard({ activities }: UpcomingActivitiesCardProps) {
  const navigateTo = useAppNavigate();

  const handleActivityPress = (activityId: string) => {
    navigateTo(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  };

  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">Upcoming Activities</Text>
      <View className="gap-3">
        {activities.map((activity, index) => {
          if (!activity.activity_plan) return null;

          return (
            <View key={activity.id}>
              <ActivityPlanCard
                plannedActivity={activity as any}
                onPress={() => handleActivityPress(activity.id)}
                showScheduleInfo
                testID={`upcoming-activity-card-${activity.id}`}
                variant="compact"
              />

              {index < activities.length - 1 ? <View className="my-1 h-px bg-border" /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
