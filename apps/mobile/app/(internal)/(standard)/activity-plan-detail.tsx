import { format } from "date-fns";
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
  estimateActivity,
  getStepIntensityColor,
  IntervalStepV2,
} from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  CalendarCheck,
  Clock,
  Copy,
  MapPin,
  Share2,
  Smartphone,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

export default function ActivityPlanDetailPage() {
  const router = useRouter();
  const { profile } = useRequireAuth();
  const params = useLocalSearchParams();
  const planId = params.planId as string | undefined;
  const plannedActivityId = params.plannedActivityId as string | undefined;
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Fetch plan from database if planId is provided
  const { data: fetchedPlan, isLoading: loadingPlan } =
    trpc.activityPlans.getById.useQuery({ id: planId! }, { enabled: !!planId });

  // Fetch planned activity if plannedActivityId is provided
  const { data: plannedActivity, isLoading: loadingPlannedActivity } =
    trpc.plannedActivities.getById.useQuery(
      { id: plannedActivityId! },
      { enabled: !!plannedActivityId },
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

  return (
    <View className="flex-1 bg-background">
      {/* Scrollable Content */}
      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Title */}
          <Text className="text-3xl font-bold mb-2">{activityPlan.name}</Text>
          <View className="flex-row items-center gap-2 mb-6">
            <Text className="text-sm text-muted-foreground capitalize">
              {activityPlan.activity_category}
            </Text>
            <Text className="text-sm text-muted-foreground">•</Text>
            <Text className="text-sm text-muted-foreground capitalize">
              {activityPlan.activity_location}
            </Text>
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

          {/* Stats Cards */}
          <View className="flex-row gap-3 mb-6">
            {durationMinutes && (
              <View className="flex-1 bg-card border border-border rounded-xl p-4 items-center">
                <Icon
                  as={Clock}
                  size={24}
                  className="text-muted-foreground mb-2"
                />
                <Text className="text-2xl font-bold">
                  {formatDuration(durationMinutes * 60)}
                </Text>
                <Text className="text-xs text-muted-foreground">Duration</Text>
              </View>
            )}

            {tss && (
              <View className="flex-1 bg-card border border-border rounded-xl p-4 items-center">
                <Icon
                  as={Zap}
                  size={24}
                  className="text-muted-foreground mb-2"
                />
                <Text className="text-2xl font-bold">{tss}</Text>
                <Text className="text-xs text-muted-foreground">TSS</Text>
              </View>
            )}

            {intensityFactor && (
              <View className="flex-1 bg-card border border-border rounded-xl p-4 items-center">
                <Icon
                  as={TrendingUp}
                  size={24}
                  className="text-muted-foreground mb-2"
                />
                <Text className="text-2xl font-bold">
                  {intensityFactor.toFixed(2)}
                </Text>
                <Text className="text-xs text-muted-foreground">IF</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {activityPlan.description && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              <Text className="text-sm font-semibold mb-2">Description</Text>
              <Text className="text-sm text-muted-foreground leading-5">
                {activityPlan.description}
              </Text>
            </View>
          )}

          {/* Intensity Timeline Chart */}
          {activityPlan.structure && steps.length > 0 && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              <Text className="text-sm font-semibold mb-3">
                Intensity Profile
              </Text>
              <TimelineChart structure={activityPlan.structure} height={140} />
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

          {/* Route Information (if available) */}
          {activityPlan.route_id && (
            <View className="bg-card border border-border rounded-xl p-4 mb-6">
              <View className="flex-row items-center mb-2">
                <Icon
                  as={MapPin}
                  size={16}
                  className="text-muted-foreground mr-2"
                />
                <Text className="text-sm font-semibold">Route</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                Route attached (preview not available)
              </Text>
              {/* TODO: Add route map preview and elevation profile */}
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

      {/* Action Bar */}
      <View className="border-t border-border bg-background px-4 py-3">
        {/* Primary Action */}
        <Button
          onPress={handleRecordNow}
          className="w-full flex-row items-center justify-center gap-2 mb-2"
        >
          <Icon as={Smartphone} size={18} className="text-primary-foreground" />
          <Text className="text-primary-foreground font-semibold">
            Record Now
          </Text>
        </Button>

        {/* Secondary Actions */}
        <View className="flex-row gap-2">
          <Button
            onPress={handleSchedule}
            variant="outline"
            size="sm"
            className="flex-1 flex-row items-center justify-center gap-1.5"
          >
            <Icon as={Calendar} size={16} className="text-foreground" />
            <Text className="text-foreground text-sm">Schedule</Text>
          </Button>

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
