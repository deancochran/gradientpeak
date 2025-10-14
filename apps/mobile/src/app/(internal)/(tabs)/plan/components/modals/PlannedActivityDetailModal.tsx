import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { Calendar, Clock, Edit, Play, Trash2 } from "lucide-react-native";
import { Alert, ScrollView, View } from "react-native";

interface PlannedActivityDetailModalProps {
  plannedActivityId: string;
  isVisible: boolean;
  onClose: () => void;
}

export function PlannedActivityDetailModal({
  plannedActivityId,
  isVisible,
  onClose,
}: PlannedActivityDetailModalProps) {
  const router = useRouter();

  // Query planned activity with plan details
  const { data: plannedActivity, isLoading } =
    trpc.plannedActivities.getById.useQuery(
      { id: plannedActivityId },
      { enabled: isVisible && !!plannedActivityId },
    );

  // Delete mutation
  const deleteMutation = trpc.plannedActivities.delete.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Workout has been removed from your schedule");
      onClose();
    },
    onError: (error) => {
      Alert.alert(
        "Error",
        error.message || "Failed to delete workout. Please try again.",
      );
    },
  });

  const handleStartWorkout = () => {
    if (!plannedActivity) return;

    // Launch ActivityRecorder with the plan
    const payload = {
      type: plannedActivity.activity_plan?.activity_type,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };

    // Navigate to recording session
    router.push({
      pathname: "/(internal)/record",
      params: { payload: JSON.stringify(payload) },
    });
    onClose();
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;

    // Navigate to schedule form in edit mode
    router.push({
      pathname: "/(internal)/(tabs)/plan/create_planned_activity",
      params: { activityId: plannedActivity.id },
    });
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Workout",
      "Are you sure you want to remove this workout from your schedule? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: plannedActivityId }),
        },
      ],
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
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

  if (!plannedActivity && !isLoading) {
    return (
      <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workout Not Found</DialogTitle>
            <DialogDescription>
              This scheduled workout could not be found.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onPress={onClose}>
              <Text>Close</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg mx-4 max-h-[80%]">
        <DialogHeader>
          <DialogTitle>
            {plannedActivity?.activity_plan?.name || "Scheduled Workout"}
          </DialogTitle>
          <DialogDescription>
            {plannedActivity?.scheduled_date &&
              formatDate(plannedActivity.scheduled_date)}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <View className="flex items-center justify-center py-8">
            <Text className="text-muted-foreground">
              Loading workout details...
            </Text>
          </View>
        ) : (
          <ScrollView className="max-h-96">
            <View className="flex flex-col gap-4 py-4">
              {/* Schedule Info */}
              <View className="bg-muted/30 rounded-lg p-4">
                <View className="flex flex-row items-center gap-2 mb-2">
                  <Icon
                    as={Calendar}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Text className="font-semibold">Schedule</Text>
                </View>
                <Text className="text-sm text-muted-foreground mb-1">
                  {plannedActivity?.scheduled_date &&
                    formatDate(plannedActivity.scheduled_date)}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {plannedActivity?.scheduled_date &&
                    formatTime(plannedActivity.scheduled_date)}
                </Text>
              </View>

              {/* Plan Summary */}
              {plannedActivity?.activity_plan && (
                <View className="bg-muted/30 rounded-lg p-4">
                  <View className="flex flex-row items-center gap-2 mb-2">
                    <Icon
                      as={Clock}
                      size={16}
                      className="text-muted-foreground"
                    />
                    <Text className="font-semibold">Workout Plan</Text>
                  </View>

                  <Text className="font-medium mb-1">
                    {plannedActivity.activity_plan.name}
                  </Text>

                  {plannedActivity.activity_plan.description && (
                    <Text className="text-sm text-muted-foreground mb-2">
                      {plannedActivity.activity_plan.description}
                    </Text>
                  )}

                  <View className="flex flex-row gap-4">
                    {plannedActivity.activity_plan.estimated_duration && (
                      <View>
                        <Text className="text-xs text-muted-foreground">
                          Duration
                        </Text>
                        <Text className="text-sm font-medium">
                          {plannedActivity.activity_plan.estimated_duration} min
                        </Text>
                      </View>
                    )}

                    {plannedActivity.activity_plan.estimated_tss && (
                      <View>
                        <Text className="text-xs text-muted-foreground">
                          TSS
                        </Text>
                        <Text className="text-sm font-medium">
                          {plannedActivity.activity_plan.estimated_tss}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Workout Structure Preview */}
              {plannedActivity?.activity_plan?.structure &&
                typeof plannedActivity.activity_plan.structure === "object" &&
                "steps" in plannedActivity.activity_plan.structure &&
                Array.isArray(
                  plannedActivity.activity_plan.structure.steps,
                ) && (
                  <View className="bg-muted/30 rounded-lg p-4">
                    <Text className="font-semibold mb-2">
                      Workout Structure
                    </Text>
                    <View className="flex flex-col gap-2">
                      {(plannedActivity.activity_plan.structure.steps as any[])
                        .slice(0, 3)
                        .map((step: any, index: number) => (
                          <View
                            key={index}
                            className="flex flex-row items-center gap-2"
                          >
                            <View className="w-2 h-2 bg-primary rounded-full" />
                            <Text className="text-sm">
                              {step.name || `Step ${index + 1}`}
                              {step.duration &&
                                step.duration !== "untilFinished" &&
                                ` (${step.duration.value} ${step.duration.unit})`}
                            </Text>
                          </View>
                        ))}
                      {(plannedActivity.activity_plan.structure.steps as any[])
                        .length > 3 && (
                        <Text className="text-xs text-muted-foreground ml-4">
                          +
                          {(
                            plannedActivity.activity_plan.structure
                              .steps as any[]
                          ).length - 3}{" "}
                          more steps
                        </Text>
                      )}
                    </View>
                  </View>
                )}
            </View>
          </ScrollView>
        )}

        <DialogFooter className="flex flex-row gap-2">
          <Button
            variant="outline"
            onPress={onClose}
            disabled={deleteMutation.isPending}
          >
            <Text>Close</Text>
          </Button>

          <Button
            variant="outline"
            onPress={handleReschedule}
            disabled={deleteMutation.isPending || isLoading}
          >
            <Icon as={Edit} size={16} className="text-foreground" />
            <Text>Reschedule</Text>
          </Button>

          <Button
            variant="destructive"
            onPress={handleDelete}
            disabled={deleteMutation.isPending || isLoading}
          >
            <Icon
              as={Trash2}
              size={16}
              className="text-destructive-foreground"
            />
            <Text className="text-destructive-foreground">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Text>
          </Button>

          <Button
            onPress={handleStartWorkout}
            disabled={deleteMutation.isPending || isLoading}
          >
            <Icon as={Play} size={16} className="text-primary-foreground" />
            <Text className="text-primary-foreground">Start Workout</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
