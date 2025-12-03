import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Play } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface UpcomingActivity {
  id: string;
  day: string;
  title: string;
  type: string;
  distance: number;
  duration: number;
  status: string;
}

interface WeeklyPlanPreviewProps {
  upcomingActivities: UpcomingActivity[];
  onActivityPress: (activityId: string) => void;
  onViewAll: () => void;
}

export function WeeklyPlanPreview({
  upcomingActivities,
  onActivityPress,
  onViewAll,
}: WeeklyPlanPreviewProps) {
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 border-green-500";
      case "current":
        return "bg-blue-500/20 border-blue-500";
      case "upcoming":
        return "bg-muted/50 border-border";
      default:
        return "bg-muted/50 border-border";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "current":
        return "text-blue-400";
      case "upcoming":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  if (upcomingActivities.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-foreground">This Week's Plan</CardTitle>
        <Button variant="ghost" size="sm" onPress={onViewAll}>
          <Text className="text-blue-400 text-sm">View All</Text>
        </Button>
      </CardHeader>
      <CardContent className="gap-2">
        {upcomingActivities.map((activity) => (
          <TouchableOpacity
            key={activity.id}
            onPress={() => onActivityPress(activity.id)}
            className="flex-row items-center justify-between p-3 bg-muted rounded-lg border border-border"
          >
            <View className="flex-1">
              <View className="flex-row items-center mb-1">
                <Text className="text-muted-foreground text-xs font-medium mr-2">
                  {activity.day}
                </Text>
                <View
                  className={`px-2 py-0.5 rounded ${getStatusBadgeColor(activity.status)}`}
                >
                  <Text
                    className={`${getStatusTextColor(activity.status)} text-xs font-medium`}
                  >
                    {activity.status}
                  </Text>
                </View>
              </View>
              <Text className="text-foreground font-medium mb-1">
                {activity.title}
              </Text>
              <View className="flex-row items-center gap-3">
                <Text className="text-muted-foreground text-xs">
                  {activity.type}
                </Text>
                {activity.distance > 0 && (
                  <Text className="text-muted-foreground text-xs">
                    {activity.distance} km
                  </Text>
                )}
                {activity.duration > 0 && (
                  <Text className="text-muted-foreground text-xs">
                    {activity.duration} min
                  </Text>
                )}
              </View>
            </View>
            {activity.status !== "completed" && (
              <Icon as={Play} size={20} className="text-muted-foreground" />
            )}
          </TouchableOpacity>
        ))}
      </CardContent>
    </Card>
  );
}
