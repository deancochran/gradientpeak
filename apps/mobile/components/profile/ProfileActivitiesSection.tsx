import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type ProfileActivitiesSectionProps = {
  profileId: string;
  testID?: string;
};

export function ProfileActivitiesSection({
  profileId,
  testID = "profile-activities-section",
}: ProfileActivitiesSectionProps) {
  const navigateTo = useAppNavigate();
  const activitiesQuery = api.feed.getProfileActivities.useQuery(
    { profileId, limit: 10 },
    { enabled: profileId.length > 0 },
  );
  const activities = activitiesQuery.data?.items ?? [];

  if (activitiesQuery.isLoading || activitiesQuery.isError || activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3" testID={testID}>
      <Text className="text-lg font-semibold text-foreground">Recent activities</Text>
      <View className="gap-3">
        {activities.map((activity) => (
          <ActivityCard
            activity={activity}
            dateMode="absolute"
            key={activity.id}
            onPress={() => navigateTo(`/activity-detail?id=${activity.id}`)}
            testID={`user-detail-activity-${activity.id}`}
          />
        ))}
      </View>
    </View>
  );
}
