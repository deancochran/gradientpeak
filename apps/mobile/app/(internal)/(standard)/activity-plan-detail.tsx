import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { getDurationMs } from "@/lib/utils/durationConversion";
import {
  ActivityPayload,
  buildEstimationContext,
  decodePolyline,
  estimateActivity,
  getStepIntensityColor,
  IntervalStepV2,
} from "@repo/core";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  CalendarCheck,
  Copy,
  Edit,
  Share2,
  Smartphone,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

export default function ActivityPlanDetailPage() {
  const router = useRouter();
  const { profile } = useRequireAuth();
  const params = useLocalSearchParams();
  const planId = params.planId as string | undefined;
  const plannedActivityId = params.plannedActivityId as string | undefined;
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const utils = trpc.useUtils();

  // Fetch plan from database if planId is provided
  const { data: fetchedPlan, isLoading: loadingPlan } =
    trpc.activityPlans.getById.useQuery({ id: planId! }, { enabled: !!planId });

  // Fetch planned activity if plannedActivityId is provided
  const { data: plannedActivity, isLoading: loadingPlannedActivity } =
    trpc.plannedActivities.getById.useQuery(
      { id: plannedActivityId! },
      { enabled: !!plannedActivityId },
    );

  // Fetch route if plan has one
  const routeId =
    fetchedPlan?.route_id || plannedActivity?.activity_plan?.route_id;
  const { data: route } = trpc.routes.get.useQuery(
    { id: routeId! },
    { enabled: !!routeId },
  );

  // Parse activity plan from params
  // This can be either a template from discover page, a database activity_plan record, or from a planned activity
  const activityPlan = useMemo(() => {
    // If we fetched a planned activity, use its activity_plan
    if (plannedActivity?.activity_plan) {
      return plannedActivity.activity_plan;
    }

    // If we fetched from database, use that
    if (fetchedPlan) {
      return fetchedPlan;
    }

    // Try template param first (from discover page)
    if (params.template && typeof params.template === "string") {
      try {
        return JSON.parse(params.template);
      } catch (error) {
        console.error("Failed to parse template:", error);
      }
    }

    // Try activityPlan param (from plan page/database)
    if (params.activityPlan && typeof params.activityPlan === "string") {
      try {
        return JSON.parse(params.activityPlan);
      } catch (error) {
        console.error("Failed to parse activityPlan:", error);
      }
    }

    return null;
  }, [params.template, params.activityPlan, fetchedPlan, plannedActivity]);

  // Calculate estimates
  const estimates = useMemo(() => {
    if (!activityPlan) return null;

    try {
      const context = buildEstimationContext({
        userProfile: profile || {},
        activityPlan: activityPlan,
      });
      return estimateActivity(context);
    } catch (error) {
      console.error("Estimation error:", error);
      return null;
    }
  }, [activityPlan, profile]);

  // Expand intervals into flat steps
  const steps: IntervalStepV2[] = useMemo(() => {
    if (!activityPlan?.structure?.intervals) return [];

    const flatSteps: IntervalStepV2[] = [];
    const intervals = activityPlan.structure.intervals || [];

    for (const interval of intervals) {
      for (let i = 0; i < interval.repetitions; i++) {
        for (const step of interval.steps) {
          flatSteps.push(step);
        }
      }
    }

    return flatSteps;
  }, [activityPlan?.structure]);

  const totalDuration = useMemo(() => {
    return steps.reduce((total, step) => {
      return total + getDurationMs(step.duration);
    }, 0);
  }, [steps]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  // Get scheduled date if this is a planned activity
  const scheduledDate = plannedActivity?.scheduled_date || null;
  const isScheduled = !!scheduledDate;

  // Handle actions
  const handleRecordNow = () => {
    if (!activityPlan) return;

    const payload: ActivityPayload = {
      category: activityPlan.activity_category,
      location: activityPlan.activity_location,
      plan: activityPlan,
      plannedActivityId: plannedActivity?.id,
    };

    activitySelectionStore.setSelection(payload);
    router.push("/record");
  };

  const handleSchedule = () => {
    if (!activityPlan) return;
    setShowScheduleModal(true);
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;
    setShowScheduleModal(true);
  };

  const handleRemoveSchedule = () => {
    if (!plannedActivity) return;
    // TODO: Implement remove from schedule
    console.log("Remove from schedule", plannedActivity.id);
  };

  const handleDuplicate = () => {
    // TODO: Navigate to create activity plan with this plan as template
    router.push({
      pathname: "/create-activity-plan" as any,
      params: { templateId: activityPlan?.id },
    });
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    console.log("Share activity");
  };

  const handleEdit = () => {
    if (!activityPlan) return;
    // Navigate to edit screen (using create flow with existing data)
    router.push({
      pathname: "/create-activity-plan" as any,
      params: { planId: planId || activityPlan.id },
    });
  };

  // Delete mutation
  const deleteMutation = trpc.activityPlans.delete.useMutation({
    onSuccess: async () => {
      // Invalidate queries
      await utils.activityPlans.list.invalidate();
      await utils.activityPlans.getUserPlansCount.invalidate();

      Alert.alert("Success", "Activity plan deleted successfully");
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        "Error",
        error.message ||
          "Failed to delete activity plan. It may be used in scheduled activities.",
      );
    },
  });

  const handleDelete = () => {
    if (!activityPlan || !planId) return;

    Alert.alert(
      "Delete Activity Plan",
      `Are you sure you want to delete "${activityPlan.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate({ id: planId });
          },
        },
      ],
    );
  };

  if (loadingPlan || loadingPlannedActivity) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading activity plan...
        </Text>
      </View>
    );
  }

  if (!activityPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Activity plan not found</Text>
      </View>
    );
  }

  const durationMinutes = estimates
    ? Math.round(estimates.duration / 60)
    : Math.round(totalDuration / 60000);
  const tss = estimates
    ? Math.round(estimates.tss)
    : activityPlan.estimated_tss;
  const intensityFactor = estimates?.intensityFactor;

  // Check if user owns this plan for edit permission
  // Database uses profile_id field, not user_id
  const isOwnedByUser = activityPlan.profile_id === profile?.id;

  // Decode route coordinates if available
  const routeCoordinates = route?.polyline
    ? decodePolyline(route.polyline)
    : null;

  return (
    <View className="flex-1 bg-background">
      {/* Scrollable Content */}
      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Title */}
          <Text className="text-3xl font-bold mb-2">{activityPlan.name}</Text>
          <View className="flex-row items-center gap-2 mb-3">
            <Text className="text-sm text-muted-foreground capitalize">
              {activityPlan.activity_category}
            </Text>
            <Text className="text-sm text-muted-foreground">•</Text>
            <Text className="text-sm text-muted-foreground capitalize">
              {activityPlan.activity_location}
            </Text>
          </View>

          {/* Action Buttons - Two Rows */}
          <View className="gap-2 mb-6">
            {/* Primary Actions Row */}
            <View className="flex-row gap-2">
              <Button
                onPress={handleRecordNow}
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
              >
                <Icon
                  as={Smartphone}
                  size={16}
                  className="text-primary-foreground"
                />
                <Text className="text-primary-foreground text-sm font-semibold">
                  Record Now
                </Text>
              </Button>

              <Button
                onPress={handleSchedule}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
              >
                <Icon as={Calendar} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">Schedule</Text>
              </Button>
            </View>

            {/* Secondary Actions Row */}
            <View className="flex-row gap-2">
              {isOwnedByUser && (
                <>
                  <Button
                    onPress={handleEdit}
                    variant="outline"
                    size="sm"
                    className="flex-1 flex-row items-center justify-center gap-1.5"
                  >
                    <Icon as={Edit} size={16} className="text-foreground" />
                    <Text className="text-foreground text-sm">Edit</Text>
                  </Button>

                  <Button
                    onPress={handleDelete}
                    variant="outline"
                    size="sm"
                    className="flex-1 flex-row items-center justify-center gap-1.5"
                    disabled={deleteMutation.isPending}
                  >
                    <Icon as={Trash2} size={16} className="text-destructive" />
                    <Text className="text-destructive text-sm">
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </Text>
                  </Button>
                </>
              )}

              <Button
                onPress={handleDuplicate}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
              >
                <Icon as={Copy} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">Duplicate</Text>
              </Button>

              <Button
                onPress={handleShare}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
              >
                <Icon as={Share2} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">Share</Text>
              </Button>
            </View>
          </View>

          {/* Scheduled Date Banner */}
          {isScheduled && scheduledDate && (
            <View className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex-row items-center">
              <Icon
                as={CalendarCheck}
                size={20}
                className="text-primary mr-3"
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary mb-0.5">
                  Scheduled Activity
                </Text>
                <Text className="text-xs text-primary/80">
                  {format(
                    new Date(scheduledDate),
                    "EEEE, MMMM d, yyyy 'at' h:mm a",
                  )}
                </Text>
              </View>
            </View>
          )}

          {/* GPX Route Map Preview */}
          {routeCoordinates && routeCoordinates.length > 0 && (
            <View className="bg-card border border-border rounded-xl overflow-hidden mb-6">
              <View className="h-64">
                <MapView
                  style={{ flex: 1 }}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude:
                      routeCoordinates[Math.floor(routeCoordinates.length / 2)]
                        .latitude,
                    longitude:
                      routeCoordinates[Math.floor(routeCoordinates.length / 2)]
                        .longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  scrollEnabled={true}
                  zoomEnabled={true}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor="#3b82f6"
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                </MapView>
              </View>
              {route && (
                <View className="p-3 border-t border-border">
                  <Text className="font-medium mb-1">{route.name}</Text>
                  <View className="flex-row gap-3">
                    <Text className="text-xs text-muted-foreground">
                      {(route.total_distance / 1000).toFixed(1)} km
                    </Text>
                    {route.total_ascent != null && route.total_ascent > 0 && (
                      <Text className="text-xs text-muted-foreground">
                        ↑ {route.total_ascent}m
                      </Text>
                    )}
                    {route.total_descent != null && route.total_descent > 0 && (
                      <Text className="text-xs text-muted-foreground">
                        ↓ {route.total_descent}m
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Intensity Timeline Chart with Stats */}
          {activityPlan.structure && steps.length > 0 && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              {/* Stats Row Above Chart */}
              <View className="flex-row justify-around mb-4 pb-3 border-b border-border">
                {durationMinutes && (
                  <View className="items-center">
                    <Text className="text-xs text-muted-foreground mb-1">
                      Duration
                    </Text>
                    <Text className="text-lg font-bold">
                      {formatDuration(durationMinutes * 60)}
                    </Text>
                  </View>
                )}
                {tss && (
                  <View className="items-center">
                    <Text className="text-xs text-muted-foreground mb-1">
                      TSS
                    </Text>
                    <Text className="text-lg font-bold">{tss}</Text>
                  </View>
                )}
                {intensityFactor && (
                  <View className="items-center">
                    <Text className="text-xs text-muted-foreground mb-1">
                      IF
                    </Text>
                    <Text className="text-lg font-bold">
                      {intensityFactor.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View className="items-center">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Steps
                  </Text>
                  <Text className="text-lg font-bold">{steps.length}</Text>
                </View>
              </View>

              {/* Intensity Chart */}
              <Text className="text-sm font-semibold mb-3">
                Intensity Profile
              </Text>
              <TimelineChart structure={activityPlan.structure} height={140} />
            </View>
          )}

          {/* Description */}
          {activityPlan.description && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              <Text className="text-sm font-semibold mb-2">Description</Text>
              <Text className="text-sm text-muted-foreground leading-5">
                {activityPlan.description}
              </Text>
            </View>
          )}

          {/* Notes */}
          {activityPlan.notes && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              <Text className="text-sm font-semibold mb-2">Notes</Text>
              <Text className="text-sm text-muted-foreground leading-5">
                {activityPlan.notes}
              </Text>
            </View>
          )}

          {/* Intervals Breakdown */}
          {activityPlan.structure?.intervals &&
            activityPlan.structure.intervals.length > 0 && (
              <View className="bg-card border border-border rounded-xl p-4 mb-6">
                <Text className="text-sm font-semibold mb-3">
                  Intervals ({activityPlan.structure.intervals.length})
                </Text>

                <View className="gap-3">
                  {activityPlan.structure.intervals.map(
                    (interval: any, idx: number) => (
                      <View
                        key={interval.id || idx}
                        className="border border-border rounded-lg p-3"
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="font-medium">{interval.name}</Text>
                          <Text className="text-xs text-muted-foreground">
                            {interval.repetitions}x
                          </Text>
                        </View>

                        {interval.notes && (
                          <Text className="text-xs text-muted-foreground mb-2">
                            {interval.notes}
                          </Text>
                        )}

                        <View className="gap-1.5">
                          {interval.steps.map(
                            (step: IntervalStepV2, stepIdx: number) => (
                              <View
                                key={step.id || stepIdx}
                                className="flex-row items-center ml-3"
                              >
                                <View
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{
                                    backgroundColor:
                                      getStepIntensityColor(step),
                                  }}
                                />
                                <Text className="text-xs text-muted-foreground flex-1">
                                  {step.name}
                                </Text>
                                <Text className="text-xs text-muted-foreground">
                                  {formatStepDuration(step.duration)}
                                </Text>
                              </View>
                            ),
                          )}
                        </View>
                      </View>
                    ),
                  )}
                </View>
              </View>
            )}
        </View>
      </ScrollView>

      {/* Schedule Modal */}
      {activityPlan && (
        <ScheduleActivityModal
          visible={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          activityPlanId={plannedActivityId ? undefined : planId}
          activityPlan={
            !planId && !plannedActivityId ? activityPlan : undefined
          }
          plannedActivityId={plannedActivityId}
          onSuccess={() => {
            setShowScheduleModal(false);
            router.back();
          }}
        />
      )}
    </View>
  );
}

// Helper function to format step duration
function formatStepDuration(duration: any): string {
  if (duration.type === "time") {
    const minutes = Math.floor(duration.seconds / 60);
    const seconds = duration.seconds % 60;
    if (minutes > 0 && seconds > 0) {
      return `${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  } else if (duration.type === "distance") {
    const km = duration.meters / 1000;
    return `${km.toFixed(2)} km`;
  } else if (duration.type === "repetitions") {
    return `${duration.count} reps`;
  } else if (duration.type === "untilFinished") {
    return "Until finished";
  }
  return "";
}
