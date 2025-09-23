import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { type PublicActivityType } from "@repo/core";
import { ScrollView, View } from "react-native";

// Simple activity type display names
const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Outdoor Run",
  outdoor_bike: "Road Cycling",
  indoor_treadmill: "Treadmill Run",
  indoor_strength: "Strength Training",
  indoor_swim: "Pool Swimming",
  other: "Other Activity",
};

export function ReadyStep({
  activityType,
  mode,
  plannedActivityId,
}: {
  activityType: PublicActivityType | null;
  mode: "planned" | "unplanned" | null;
  plannedActivityId: string | null;
}) {
  const { data: plannedActivities } = trpc.plannedActivities.list.useQuery(
    {
      limit: 50,
      offset: 0,
    },
    {
      enabled: mode === "planned" && !!plannedActivityId,
    },
  );

  const plannedActivity = plannedActivities?.find(
    (a) => a.id === plannedActivityId,
  );

  return (
    <ScrollView className="flex-1 px-6 py-4">
      <View className="items-center mb-8">
        <Text className="text-2xl font-bold text-center mb-2">
          Ready to Start!
        </Text>
        <Text className="text-center text-muted-foreground">
          Everything is set up for your activity
        </Text>
      </View>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity Details</CardTitle>
        </CardHeader>
        <CardContent>
          <View className="gap-2">
            <View className="flex-row items-center">
              <Text className="text-foreground font-medium">
                {mode === "planned" && plannedActivity
                  ? plannedActivity.name
                  : activityType
                    ? ACTIVITY_NAMES[activityType]
                    : "Activity"}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-muted-foreground">
                {mode === "planned"
                  ? "Planned workout"
                  : "Quick start activity"}
              </Text>
            </View>
            {plannedActivity?.description && (
              <View className="flex-row items-center">
                <Text className="text-muted-foreground">
                  {plannedActivity.description}
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </ScrollView>
  );
}
