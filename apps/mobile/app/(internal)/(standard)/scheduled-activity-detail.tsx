import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { getActivityBgClass, getActivityColor } from "@/lib/utils/plan/colors";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  Play,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";

function PlannedActivityDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const plannedActivityId = params.id as string;
  const utils = trpc.useUtils();
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Query planned activity with plan details
  const { data: plannedActivity, isLoading } =
    trpc.plannedActivities.getById.useQuery(
      { id: plannedActivityId },
      { enabled: !!plannedActivityId },
    );

  // Delete mutation
  const deleteMutation = useReliableMutation(trpc.plannedActivities.delete, {
    invalidate: [utils.plannedActivities, utils.trainingPlans],
    success: "Activity removed from your schedule",
    onSuccess: () => router.back(),
  });

  const handleStartActivity = () => {
    if (!plannedActivity?.activity_plan) return;

    const payload: ActivityPayload = {
      category: plannedActivity.activity_plan.activity_category,
      location: plannedActivity.activity_plan.activity_location,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };

    activitySelectionStore.setSelection(payload);
    router.push("/record");
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;
    setShowRescheduleModal(true);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Activity",
      "Are you sure you want to remove this activity from your schedule?",
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

  const completed = plannedActivity
    ? isActivityCompleted(plannedActivity)
    : false;
  const activityType =
    plannedActivity?.activity_plan?.activity_category || "other";
  const colorConfig = getActivityColor(activityType);

  const isPastActivity = plannedActivity
    ? new Date(plannedActivity.scheduled_date) < new Date()
    : false;

  const canStart = !completed && !isPastActivity;

  return (
    <View className="flex-1 bg-background">
      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">
            Loading activity details...
          </Text>
        </View>
      ) : !plannedActivity ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold mb-2">Activity Not Found</Text>
          <Text className="text-muted-foreground text-center mb-4">
            This scheduled activity could not be found.
          </Text>
          <Button onPress={() => router.back()}>
            <Text className="text-primary-foreground">Go Back</Text>
          </Button>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="p-4">
          {/* Status Badge */}
          {completed && (
            <Card className="bg-green-50 border-green-200 mb-4">
              <CardContent className="p-3">
                <View className="flex-row items-center gap-2">
                  <Icon
                    as={CheckCircle2}
                    size={20}
                    className="text-green-600"
                  />
                  <Text className="text-green-600 font-semibold">
                    Activity Completed
                  </Text>
                </View>
              </CardContent>
            </Card>
          )}

          {/* Activity Type Badge */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <View className="flex-row items-center gap-3">
                <View
                  className={`w-12 h-12 ${getActivityBgClass(activityType)} rounded-xl items-center justify-center`}
                >
                  <Icon as={Calendar} size={24} className="text-white" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Activity Type
                  </Text>
                  <Text className="font-semibold capitalize">
                    {colorConfig.name}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Schedule Info */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Icon as={Clock} size={16} className="text-muted-foreground" />
                <Text className="font-semibold">Schedule</Text>
              </View>
              <Text className="text-base mb-1">
                {format(
                  new Date(plannedActivity.scheduled_date),
                  "EEEE, MMMM d, yyyy",
                )}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {format(new Date(plannedActivity.scheduled_date), "h:mm a")}
              </Text>
            </CardContent>
          </Card>

          {/* Plan Details */}
          {plannedActivity.activity_plan && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <View className="flex-row items-center gap-2 mb-3">
                  <Icon as={Zap} size={16} className="text-muted-foreground" />
                  <Text className="font-semibold">Activity Details</Text>
                </View>

                <Text className="text-base font-medium mb-2">
                  {plannedActivity.activity_plan.name}
                </Text>

                {plannedActivity.activity_plan.description && (
                  <Text className="text-sm text-muted-foreground mb-3">
                    {plannedActivity.activity_plan.description}
                  </Text>
                )}

                {/* Estimated metrics */}
                {(plannedActivity.activity_plan.estimated_duration ||
                  plannedActivity.activity_plan.estimated_tss) && (
                  <View className="flex-row gap-4 mt-2">
                    {plannedActivity.activity_plan.estimated_duration && (
                      <View>
                        <Text className="text-xs text-muted-foreground">
                          Duration
                        </Text>
                        <Text className="font-semibold">
                          {plannedActivity.activity_plan.estimated_duration} min
                        </Text>
                      </View>
                    )}
                    {plannedActivity.activity_plan.estimated_tss && (
                      <View>
                        <Text className="text-xs text-muted-foreground">
                          TSS
                        </Text>
                        <Text className="font-semibold">
                          {plannedActivity.activity_plan.estimated_tss}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Structure */}
          {plannedActivity?.activity_plan?.structure &&
            typeof plannedActivity.activity_plan.structure === "object" &&
            (plannedActivity.activity_plan.structure as any).steps &&
            Array.isArray(
              (plannedActivity.activity_plan.structure as any).steps,
            ) &&
            (plannedActivity.activity_plan.structure as any).steps.length >
              0 && (
              <Card className="mb-4">
                <CardContent className="p-4">
                  <Text className="font-semibold mb-3">Activity Structure</Text>
                  <View className="gap-2">
                    {(
                      (plannedActivity.activity_plan.structure as any)
                        .steps as any[]
                    )
                      .slice(0, 5)
                      .map((step: any, index: number) => (
                        <View
                          key={index}
                          className="flex-row items-start gap-2 py-1"
                        >
                          <View className="w-6 h-6 bg-primary/10 rounded-full items-center justify-center mt-0.5">
                            <Text className="text-xs text-primary font-semibold">
                              {index + 1}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-medium">
                              {step.name || `Step ${index + 1}`}
                            </Text>
                            {step.duration &&
                              step.duration !== "untilFinished" && (
                                <Text className="text-xs text-muted-foreground">
                                  {step.duration.value}{" "}
                                  {step.duration.unit === "minutes"
                                    ? "min"
                                    : step.duration.unit}
                                </Text>
                              )}
                          </View>
                        </View>
                      ))}
                    {(
                      (plannedActivity.activity_plan.structure as any)
                        .steps as any[]
                    ).length > 5 && (
                      <Text className="text-xs text-muted-foreground ml-8">
                        +
                        {(
                          (plannedActivity.activity_plan.structure as any)
                            .steps as any[]
                        ).length - 5}{" "}
                        more steps
                      </Text>
                    )}
                  </View>
                </CardContent>
              </Card>
            )}

          {/* Notes */}
          {plannedActivity.notes && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <Text className="font-semibold mb-2">Notes</Text>
                <Text className="text-sm text-muted-foreground">
                  {plannedActivity.notes}
                </Text>
              </CardContent>
            </Card>
          )}
        </ScrollView>
      )}

      {/* Action Bar */}
      <View className="border-t border-border bg-background">
        <View className="px-4 py-3 gap-2">
          {/* Primary Action */}
          {canStart && (
            <Button
              onPress={handleStartActivity}
              disabled={deleteMutation.isPending || isLoading}
              size="lg"
            >
              <Icon
                as={Play}
                size={20}
                className="text-primary-foreground mr-2"
              />
              <Text className="text-primary-foreground font-semibold">
                Start Activity
              </Text>
            </Button>
          )}

          {/* Secondary Actions */}
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              onPress={handleReschedule}
              disabled={deleteMutation.isPending || isLoading}
              className="flex-1"
            >
              <Icon as={Edit} size={16} className="text-foreground mr-2" />
              <Text>Reschedule</Text>
            </Button>

            <Button
              variant="outline"
              onPress={handleDelete}
              disabled={deleteMutation.isPending || isLoading}
              className="flex-1"
            >
              <Icon as={Trash2} size={16} className="text-destructive mr-2" />
              <Text className="text-destructive">
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Text>
            </Button>
          </View>
        </View>
      </View>

      {/* Reschedule Modal */}
      {plannedActivity && (
        <ScheduleActivityModal
          visible={showRescheduleModal}
          onClose={() => setShowRescheduleModal(false)}
          plannedActivityId={plannedActivity.id}
          onSuccess={() => {
            utils.plannedActivities.invalidate();
          }}
        />
      )}
    </View>
  );
}

export default function PlannedActivityDetailScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlannedActivityDetailScreen />
    </ErrorBoundary>
  );
}
