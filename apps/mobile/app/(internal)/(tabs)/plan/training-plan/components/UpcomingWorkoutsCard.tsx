import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { Calendar, ChevronRight, Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface UpcomingWorkout {
  id: string;
  scheduled_date: string;
  activity_plan: {
    id: string;
    name: string;
    activity_type: string;
    estimated_duration: number;
    estimated_tss: number;
  } | null;
}

interface UpcomingWorkoutsCardProps {
  workouts: UpcomingWorkout[];
}

export function UpcomingWorkoutsCard({ workouts }: UpcomingWorkoutsCardProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset hours for comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === today.getTime()) {
      return "Today";
    } else if (date.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    } else {
      const daysOfWeek = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayName = daysOfWeek[new Date(dateString).getDay()];
      const month = new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
      });
      const day = new Date(dateString).getDate();
      return `${dayName}, ${month} ${day}`;
    }
  };

  const formatActivityType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleWorkoutPress = (workoutId: string) => {
    router.push({
      pathname:
        "/(internal)/(tabs)/plan/planned_activities/[activity_uuid]" as any,
      params: { activity_uuid: workoutId },
    });
  };

  if (!workouts || workouts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Workouts</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="gap-3">
          {workouts.map((workout, index) => {
            if (!workout.activity_plan) return null;

            return (
              <View key={workout.id}>
                <TouchableOpacity
                  onPress={() => handleWorkoutPress(workout.id)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <View className="flex-1 mr-3">
                      {/* Date */}
                      <View className="flex-row items-center gap-2 mb-2">
                        <Icon
                          as={Calendar}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-sm text-muted-foreground font-medium">
                          {formatDate(workout.scheduled_date)}
                        </Text>
                      </View>

                      {/* Workout Name */}
                      <Text className="font-semibold text-base mb-1">
                        {workout.activity_plan.name}
                      </Text>

                      {/* Workout Details */}
                      <View className="flex-row items-center gap-3">
                        <View className="flex-row items-center gap-1">
                          <Icon
                            as={Clock}
                            size={12}
                            className="text-muted-foreground"
                          />
                          <Text className="text-xs text-muted-foreground">
                            {workout.activity_plan.estimated_duration} min
                          </Text>
                        </View>

                        {workout.activity_plan.estimated_tss && (
                          <>
                            <Text className="text-xs text-muted-foreground">
                              •
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {Math.round(workout.activity_plan.estimated_tss)}{" "}
                              TSS
                            </Text>
                          </>
                        )}

                        <Text className="text-xs text-muted-foreground">•</Text>
                        <Text className="text-xs text-muted-foreground capitalize">
                          {formatActivityType(
                            workout.activity_plan.activity_type,
                          )}
                        </Text>
                      </View>
                    </View>

                    <Icon
                      as={ChevronRight}
                      size={20}
                      className="text-muted-foreground"
                    />
                  </View>
                </TouchableOpacity>

                {/* Divider between workouts (not after last one) */}
                {index < workouts.length - 1 && (
                  <View className="h-px bg-border my-1" />
                )}
              </View>
            );
          })}
        </View>
      </CardContent>
    </Card>
  );
}
