import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Clock,
  Library,
  Plus,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { PlannedActivityDetailModal } from "./components/modals/PlannedActivityDetailModal";

export default function PlanScreen() {
  const router = useRouter();
  const {} = useAuth();

  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);

  // tRPC queries
  const {
    data: todaysActivities = [],
    isLoading: loadingToday,
    error: todayError,
  } = trpc.plannedActivities.getToday.useQuery();

  const { data: userPlansCount = 0, isLoading: loadingPlansCount } =
    trpc.activityPlans.getUserPlansCount.useQuery();

  const { data: weeklyScheduled = 0, isLoading: loadingWeeklyCount } =
    trpc.plannedActivities.getWeekCount.useQuery();

  const handleCreatePlan = () => {
    router.push("/(internal)/(tabs)/plan/create_activity_plan");
  };

  const handleBrowseLibrary = () => {
    router.push("/(internal)/(tabs)/plan/library");
  };

  const handleViewScheduled = () => {
    router.push("/(internal)/(tabs)/plan/planned_activities");
  };

  const handleScheduleFromLibrary = () => {
    router.push({
      pathname: "/(internal)/(tabs)/plan/library",
      params: { scheduleIntent: "true" },
    });
  };

  const handleSelectPlannedActivity = (id: string) => {
    setSelectedPlannedActivityId(id);
  };

  const handleStartActivity = (plannedActivity: any) => {
    if (!plannedActivity.activity_plan) {
      Alert.alert("Error", "Activity plan not found");
      return;
    }

    router.push({
      pathname: "/(internal)/follow-along",
      params: {
        activityPlanId: plannedActivity.activity_plan.id,
        plannedActivityId: plannedActivity.id,
      },
    });
  };

  // Show error state if today's activities failed to load
  if (todayError) {
    return (
      <ScrollView className="flex-1 bg-background">
        <View className="p-4 gap-4">
          <View className="mb-2">
            <Text className="text-3xl font-bold">Training Plan</Text>
            <Text className="text-muted-foreground mt-1">
              Manage your workouts and training schedule
            </Text>
          </View>

          <Card>
            <CardContent className="p-6">
              <View className="items-center">
                <Icon
                  as={AlertCircle}
                  size={48}
                  className="text-destructive mb-2"
                />
                <Text className="text-lg font-semibold mb-1">
                  Unable to Load Data
                </Text>
                <Text className="text-sm text-muted-foreground text-center">
                  Please check your connection and try again
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="flex-1 p-4 gap-4">
        {/* Header */}
        <View className="mb-4">
          <Text className="text-3xl font-bold">Training Plan</Text>
          <Text className="text-muted-foreground mt-2">
            Manage your workouts and training schedule
          </Text>
        </View>

        {/* Today's Workouts Section */}
        {loadingToday ? (
          <Card>
            <CardContent className="p-6">
              <View className="flex items-center justify-center">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-muted-foreground mt-2">
                  Loading today&apos;s workouts...
                </Text>
              </View>
            </CardContent>
          </Card>
        ) : todaysActivities && todaysActivities.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Workouts</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex flex-col gap-3">
                {todaysActivities &&
                  todaysActivities.length > 0 &&
                  todaysActivities.map((activity: any) => (
                    <TouchableOpacity
                      key={activity.id}
                      onPress={() => handleSelectPlannedActivity(activity.id)}
                    >
                      <View className="flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <View className="flex-1">
                          <Text className="font-semibold">
                            {activity.activity_plan?.name || "Unnamed Workout"}
                          </Text>
                          <View className="flex flex-row items-center gap-2 mt-1">
                            <Icon
                              as={Clock}
                              size={14}
                              className="text-muted-foreground"
                            />
                            <Text className="text-sm text-muted-foreground">
                              {activity.activity_plan?.estimated_duration || 0}{" "}
                              min
                            </Text>
                            {activity.activity_plan?.activity_type && (
                              <>
                                <Text className="text-sm text-muted-foreground">
                                  •
                                </Text>
                                <Text className="text-sm text-muted-foreground capitalize">
                                  {activity.activity_plan.activity_type.replace(
                                    "_",
                                    " ",
                                  )}
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                        <View className="flex flex-row items-center gap-2">
                          <Button
                            size="sm"
                            onPress={() => handleStartActivity(activity)}
                          >
                            <Text className="text-primary-foreground font-medium">
                              Start
                            </Text>
                          </Button>
                          <Icon
                            as={ChevronRight}
                            size={20}
                            className="text-muted-foreground"
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <View className="flex items-center">
                <Icon
                  as={Calendar}
                  size={48}
                  className="text-muted-foreground mb-2"
                />
                <Text className="text-lg font-semibold mb-2">
                  No Workouts Today
                </Text>
                <Text className="text-sm text-muted-foreground text-center mb-4">
                  Schedule a workout from your library to get started
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleScheduleFromLibrary}
                >
                  <Text className="text-foreground">Schedule Workout</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Primary Actions */}
        <View className="flex flex-col gap-3">
          <Button
            onPress={handleCreatePlan}
            size="lg"
            className="flex flex-row items-center justify-center gap-2"
          >
            <Icon as={Plus} size={20} className="text-primary-foreground" />
            <Text className="text-primary-foreground font-semibold">
              Create Workout Plan
            </Text>
          </Button>

          <Button
            onPress={handleBrowseLibrary}
            variant="outline"
            size="lg"
            className="flex flex-row items-center justify-center gap-2"
          >
            <Icon as={Library} size={20} className="text-foreground" />
            <Text className="text-foreground font-semibold">
              Browse Workout Library
            </Text>
          </Button>
        </View>

        {/* Secondary Actions */}
        <View className="flex flex-col gap-3">
          <TouchableOpacity onPress={handleViewScheduled}>
            <Card>
              <CardContent className="p-4">
                <View className="flex flex-row items-center justify-between">
                  <View className="flex flex-row items-center gap-3">
                    <Icon
                      as={Calendar}
                      size={24}
                      className="text-muted-foreground"
                    />
                    <Text className="font-semibold">View All Scheduled</Text>
                  </View>
                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground"
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleScheduleFromLibrary}>
            <Card>
              <CardContent className="p-4">
                <View className="flex flex-row items-center justify-between">
                  <View className="flex flex-row items-center gap-3">
                    <Icon
                      as={Plus}
                      size={24}
                      className="text-muted-foreground"
                    />
                    <Text className="font-semibold">Schedule from Library</Text>
                  </View>
                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground"
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Your Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex flex-row justify-around">
              <View className="flex items-center">
                {loadingPlansCount ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-2xl font-bold">{userPlansCount}</Text>
                )}
                <Text className="text-sm text-muted-foreground">
                  Custom Plans
                </Text>
              </View>
              <View className="w-px bg-border" />
              <View className="flex items-center">
                {loadingWeeklyCount ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-2xl font-bold">{weeklyScheduled}</Text>
                )}
                <Text className="text-sm text-muted-foreground">This Week</Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Modals */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={() => setSelectedPlannedActivityId(null)}
        />
      )}
    </ScrollView>
  );
}
