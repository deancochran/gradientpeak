import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { normalizeDate } from "@/lib/utils/plan/dateGrouping";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  GripVertical,
  Save,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function WorkoutsReorder() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get all planned activities
  const {
    data: plannedActivitiesData,
    isLoading,
    refetch,
  } = trpc.plannedActivities.list.useQuery({
    limit: 100,
  });

  const updateMutation = trpc.plannedActivities.update.useMutation({
    onSuccess: () => {
      utils.plannedActivities.invalidate();
    },
  });

  // Local state for reordering
  const [activities, setActivities] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize activities from query
  React.useEffect(() => {
    if (plannedActivitiesData?.items) {
      // Filter out completed activities (activities with completed_activity_id)
      const upcomingActivities = plannedActivitiesData.items.filter(
        (item: any) => !item.completed_activity_id,
      );
      setActivities(upcomingActivities);
      setHasChanges(false);
    }
  }, [plannedActivitiesData]);

  // Group activities by date
  const activityGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};

    activities.forEach((activity) => {
      const dateKey = normalizeDate(
        new Date(activity.scheduled_date),
      ).toISOString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });

    // Sort groups by date
    return Object.entries(groups).sort(
      ([dateA], [dateB]) =>
        new Date(dateA).getTime() - new Date(dateB).getTime(),
    );
  }, [activities]);

  // Handle moving activity to different date
  const handleMoveActivity = (activityId: string, direction: "up" | "down") => {
    const currentIndex = activities.findIndex((a) => a.id === activityId);
    if (currentIndex === -1) return;

    const newActivities = [...activities];
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= newActivities.length) return;

    // Swap
    [newActivities[currentIndex], newActivities[targetIndex]] = [
      newActivities[targetIndex],
      newActivities[currentIndex],
    ];

    setActivities(newActivities);
    setHasChanges(true);
  };

  // Handle date change
  const handleChangeDateForActivity = (
    activityId: string,
    daysToAdd: number,
  ) => {
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) return;

    const currentDate = new Date(activity.scheduled_date);
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + daysToAdd);

    const newActivities = activities.map((a) =>
      a.id === activityId
        ? { ...a, scheduled_date: newDate.toISOString().split("T")[0] }
        : a,
    );

    setActivities(newActivities);
    setHasChanges(true);
  };

  // Save changes
  const handleSave = async () => {
    if (!hasChanges) return;

    setSaving(true);

    try {
      // Update each activity's scheduled date if changed
      const originalActivities = plannedActivitiesData?.items || [];
      const updatePromises = activities
        .filter((activity) => {
          const original = originalActivities.find(
            (orig: any) => orig.id === activity.id,
          );
          return (
            original && original.scheduled_date !== activity.scheduled_date
          );
        })
        .map((activity) =>
          updateMutation.mutateAsync({
            id: activity.id,
            scheduled_date: activity.scheduled_date,
          }),
        );

      await Promise.all(updatePromises);

      Alert.alert("Success", "Workouts reordered successfully", [
        {
          text: "OK",
          onPress: () => {
            setHasChanges(false);
            refetch();
          },
        },
      ]);
    } catch (error) {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        "Discard Changes?",
        "You have unsaved changes. Are you sure you want to discard them?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center px-4 py-4 bg-background border-b border-border">
          <TouchableOpacity onPress={handleCancel} className="mr-3">
            <Icon as={ArrowLeft} size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">Reorder Workouts</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">
            Loading workouts...
          </Text>
        </View>
      </View>
    );
  }

  // Empty state
  if (!activities || activities.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center px-4 py-4 bg-background border-b border-border">
          <TouchableOpacity onPress={handleCancel} className="mr-3">
            <Icon as={ArrowLeft} size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">Reorder Workouts</Text>
        </View>
        <View className="flex-1 items-center justify-center p-6">
          <View className="bg-muted rounded-full p-6 mb-4">
            <Icon as={Calendar} size={48} className="text-muted-foreground" />
          </View>
          <Text className="text-xl font-semibold mb-2">
            No Scheduled Workouts
          </Text>
          <Text className="text-sm text-muted-foreground text-center">
            Schedule some activities from your training plan to reorder them.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-4 bg-background border-b border-border">
        <TouchableOpacity onPress={handleCancel} className="mr-3">
          <Icon as={ArrowLeft} size={24} className="text-foreground" />
        </TouchableOpacity>
        <Text className="text-xl font-bold">Reorder Workouts</Text>
      </View>

      {/* Info Banner */}
      <View className="px-4 pt-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <View className="flex-row items-start gap-2">
              <Icon
                as={AlertCircle}
                size={16}
                className="text-primary mt-0.5"
              />
              <Text className="text-xs text-muted-foreground flex-1">
                Drag activities or use the buttons to change scheduled dates.
                Tap Save when finished.
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="gap-4">
          {activityGroups.map(([dateKey, dayActivities]) => {
            const date = new Date(dateKey);
            return (
              <View key={dateKey}>
                {/* Date Header */}
                <Text className="text-base font-semibold mb-2">
                  {format(date, "EEEE, MMM d")}
                </Text>

                {/* Activities for this date */}
                <View className="gap-2 mb-4">
                  {dayActivities.map((activity, index) => (
                    <View
                      key={activity.id}
                      className="bg-card border border-border rounded-lg overflow-hidden"
                    >
                      {/* Activity Card */}
                      <View className="flex-row items-center">
                        <View className="p-3 border-r border-border">
                          <Icon
                            as={GripVertical}
                            size={20}
                            className="text-muted-foreground"
                          />
                        </View>
                        <View className="flex-1">
                          <ActivityPlanCard
                            plannedActivity={activity}
                            onPress={() => {}}
                            variant="compact"
                            showScheduleInfo={false}
                          />
                        </View>
                      </View>

                      {/* Action Buttons */}
                      <View className="flex-row border-t border-border">
                        <TouchableOpacity
                          onPress={() =>
                            handleChangeDateForActivity(activity.id, -1)
                          }
                          className="flex-1 py-2 items-center border-r border-border"
                          activeOpacity={0.7}
                        >
                          <Text className="text-xs font-medium text-primary">
                            ← Previous Day
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            handleChangeDateForActivity(activity.id, 1)
                          }
                          className="flex-1 py-2 items-center"
                          activeOpacity={0.7}
                        >
                          <Text className="text-xs font-medium text-primary">
                            Next Day →
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Save/Cancel Buttons */}
      {hasChanges && (
        <View className="border-t border-border bg-card p-4">
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onPress={handleCancel}
              disabled={saving}
            >
              <Text className="text-foreground">Cancel</Text>
            </Button>
            <Button
              className="flex-1 flex-row items-center justify-center gap-2"
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Icon
                    as={Save}
                    size={18}
                    className="text-primary-foreground"
                  />
                  <Text className="text-primary-foreground font-semibold">
                    Save Changes
                  </Text>
                </>
              )}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
