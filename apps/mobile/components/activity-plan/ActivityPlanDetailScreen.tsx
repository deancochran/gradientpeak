import { invalidateActivityPlanQueries } from "@repo/api/react";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  CalendarCheck,
  CalendarX,
  Copy,
  Edit,
  Eye,
  EyeOff,
  Heart,
  MessageCircle,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { ActivityPlanContentPreview } from "./ActivityPlanContentPreview";
import { ActivityPlanSummarySection } from "./ActivityPlanSummarySection";
import { useActivityPlanDetailViewModel } from "./useActivityPlanDetailViewModel";
import { useActivityPlanSchedulingActions } from "./useActivityPlanSchedulingActions";
import { useActivityPlanSocialController } from "./useActivityPlanSocialController";

export interface ActivityPlanDetailRouteParams {
  planId?: string;
  fallbackId?: string;
  eventId?: string;
  action?: string;
  template?: string;
  activityPlan?: string;
}

export function ActivityPlanDetailScreen({
  planId: planIdParam,
  fallbackId,
  eventId,
  action,
  template,
  activityPlan: activityPlanParam,
}: ActivityPlanDetailRouteParams) {
  const planId = planIdParam ?? fallbackId;
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isPublic, setIsPublic] = useState(false);
  const router = require("expo-router").useRouter();
  const navigateTo = useAppNavigate();

  const utils = api.useUtils();
  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });

  const { data: fetchedPlan, isLoading: loadingPlan } = api.activityPlans.getById.useQuery(
    { id: planId! },
    { enabled: !!planId },
  );

  const {
    data: plannedActivity,
    error: plannedActivityError,
    isLoading: loadingPlannedActivity,
  } = api.events.getById.useQuery({ id: eventId! }, { enabled: !!eventId && !isRedirecting });

  React.useEffect(() => {
    redirectOnNotFound(plannedActivityError);
  }, [plannedActivityError, redirectOnNotFound]);

  const routeId = fetchedPlan?.route_id || plannedActivity?.activity_plan?.route_id;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const isScheduled = !!plannedActivity?.scheduled_date;

  const vm = useActivityPlanDetailViewModel({
    activityPlanParam,
    fetchedPlan,
    formatDuration,
    isPublic,
    isScheduled,
    plannedActivity,
    profile,
    route,
    template,
  });

  const activityPlan = vm.activityPlan;

  const handleRecordNow = () => {
    if (!activityPlan) return;
    const payload: ActivityPayload = {
      category: activityPlan.activity_category,
      gpsRecordingEnabled: true,
      plan: activityPlan,
      eventId: plannedActivity?.id,
    };
    activitySelectionStore.setSelection(payload);
    navigateTo("/record");
  };
  const scheduling = useActivityPlanSchedulingActions({
    action,
    activityPlan,
    beginRedirect,
    eventId,
    plannedActivity,
    planId,
    profileId: profile?.id,
    queryClient,
    router,
    utils,
  });

  const handleEdit = () => {
    if (!activityPlan) return;
    navigateTo({
      pathname: "/create-activity-plan" as any,
      params: { planId: planId || activityPlan.id },
    } as any);
  };

  const deleteMutation = api.activityPlans.delete.useMutation({
    onSuccess: async () => {
      await invalidateActivityPlanQueries(utils);
      Alert.alert("Success", "Activity plan deleted successfully");
      router.navigate(ROUTES.PLAN.INDEX);
    },
    onError: (error) => {
      console.error("Delete error:", {
        message: error.message,
        code: error.data?.code,
        fullError: error,
      });
      Alert.alert(
        "Error",
        error.message || "Failed to delete activity plan. It may be used in scheduled activities.",
      );
    },
  });

  const updatePrivacyMutation = api.activityPlans.update.useMutation({
    onSuccess: async () => {
      await invalidateActivityPlanQueries(utils, {
        planId,
        includeCount: false,
        includeDetail: true,
      });
    },
    onError: (error) => {
      console.error("Privacy update error:", error);
      Alert.alert("Error", error.message || "Failed to update privacy");
      setIsPublic(!isPublic);
    },
  });

  const handleTogglePrivacy = () => {
    const newVisibility = isPublic ? "private" : "public";
    setIsPublic(!isPublic);
    updatePrivacyMutation.mutate({
      id: planId || activityPlan.id,
      template_visibility: newVisibility,
    });
  };

  const handleDelete = () => {
    if (!activityPlan) return;
    const actualPlanId = planId || activityPlan.id;
    if (!actualPlanId) {
      Alert.alert("Error", "Cannot delete this activity plan - no ID found");
      return;
    }
    if (activityPlan.profile_id !== profile?.id) {
      Alert.alert("Error", "You don't have permission to delete this activity plan");
      return;
    }
    Alert.alert(
      "Delete Activity Plan",
      `Are you sure you want to delete "${activityPlan.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: actualPlanId }),
        },
      ],
    );
  };

  const social = useActivityPlanSocialController({
    initialHasLiked: activityPlan?.has_liked,
    initialLikesCount: activityPlan?.likes_count,
    planId: planId || activityPlan?.id,
  });

  React.useEffect(() => {
    if (activityPlan) setIsPublic(activityPlan.template_visibility === "public");
  }, [activityPlan?.template_visibility]);

  if (loadingPlan || loadingPlannedActivity || isRedirecting) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          {isRedirecting ? "Closing activity..." : "Loading activity plan..."}
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

  const tss = vm.tss;
  const intensityFactor = vm.intensityFactor;
  const isOwnedByUser = vm.isOwnedByUser;
  const primaryScheduleLabel = scheduling.primaryScheduleLabel;
  const detailBadges = vm.detailBadges;
  const steps = vm.steps;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="p-4">
          <ActivityPlanSummarySection
            description={activityPlan.description}
            detailBadges={detailBadges}
            durationLabel={vm.durationLabel}
            intensityFactor={intensityFactor}
            name={activityPlan.name}
            notes={activityPlan.notes}
            scheduledDate={scheduling.isScheduled ? scheduling.scheduledDate : null}
            stepsCount={steps.length}
            tss={tss}
          />
          <View className="mb-6 gap-2.5">
            <View className="flex-row gap-2">
              <Button
                onPress={handleRecordNow}
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                testID="activity-plan-record-now-button"
              >
                <Icon as={Smartphone} size={16} className="text-primary-foreground" />
                <Text className="text-primary-foreground text-sm font-semibold">
                  Start Activity
                </Text>
              </Button>
              <Button
                onPress={
                  scheduling.isScheduled ? scheduling.handleReschedule : scheduling.handleSchedule
                }
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                disabled={!scheduling.isScheduled && scheduling.duplicatePending}
                testID={
                  scheduling.isScheduled
                    ? "activity-plan-reschedule-button"
                    : "activity-plan-schedule-button"
                }
              >
                <Icon as={Calendar} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">{primaryScheduleLabel}</Text>
              </Button>
            </View>
            {scheduling.isScheduled && eventId && (
              <View className="flex-row gap-2">
                <Button
                  onPress={scheduling.handleRemoveSchedule}
                  variant="outline"
                  size="sm"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  disabled={scheduling.removeSchedulePending}
                  testID="activity-plan-remove-schedule-button"
                >
                  <Icon as={CalendarX} size={16} className="text-destructive" />
                  <Text className="text-destructive text-sm">
                    {scheduling.removeSchedulePending ? "Removing..." : "Remove Schedule"}
                  </Text>
                </Button>
              </View>
            )}
            <View className="flex-row gap-2">
              <Pressable
                onPress={social.handleToggleLike}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-2.5"
                testID="activity-plan-like-button"
              >
                <Icon
                  as={Heart}
                  size={16}
                  className={social.isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
                />
                <Text
                  className={
                    social.isLiked
                      ? "text-red-500 text-sm font-medium"
                      : "text-muted-foreground text-sm"
                  }
                >
                  {social.likesCount > 0 ? social.likesCount : "Like"}
                </Text>
                {social.commentCount > 0 && (
                  <>
                    <Text className="text-muted-foreground text-sm">·</Text>
                    <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-sm">{social.commentCount}</Text>
                  </>
                )}
              </Pressable>
              <Button
                onPress={scheduling.handleDuplicate}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                disabled={scheduling.duplicatePending}
                testID="activity-plan-duplicate-button"
              >
                <Icon as={Copy} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">
                  {scheduling.duplicatePending ? "Duplicating..." : "Duplicate Activity"}
                </Text>
              </Button>
            </View>
            {isOwnedByUser && (
              <View className="flex-row gap-2">
                <View className="flex-1 flex-row items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5">
                  <View className="flex-row items-center gap-2">
                    <Icon
                      as={isPublic ? Eye : EyeOff}
                      size={16}
                      className="text-muted-foreground"
                    />
                    <Text className="text-sm text-foreground">
                      {isPublic ? "Public" : "Private"}
                    </Text>
                  </View>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={handleTogglePrivacy}
                    disabled={updatePrivacyMutation.isPending}
                  />
                </View>
                <Button
                  onPress={handleEdit}
                  variant="outline"
                  size="sm"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  testID="activity-plan-edit-button"
                >
                  <Icon as={Edit} size={16} className="text-foreground" />
                  <Text className="text-foreground text-sm">Edit</Text>
                </Button>
                <Button
                  onPress={handleDelete}
                  variant="outline"
                  size="sm"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  disabled={deleteMutation.isPending}
                  testID="activity-plan-delete-button"
                >
                  <Icon as={Trash2} size={16} className="text-destructive" />
                  <Text className="text-destructive text-sm">
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Text>
                </Button>
              </View>
            )}
          </View>
          <View className="mb-6">
            <ActivityPlanContentPreview
              plan={activityPlan}
              route={route}
              intensityFactor={intensityFactor}
              testIDPrefix="activity-plan-content-preview"
            />
          </View>
          <View className="bg-card border border-border rounded-xl p-4 mb-6 gap-4">
            <View>
              <Text className="font-semibold text-foreground mb-1">
                Comments ({social.commentCount})
              </Text>
              <Text className="text-sm text-muted-foreground">
                Ask questions or leave context for anyone reusing this activity.
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Textarea
                className="min-h-11 flex-1"
                placeholder="Add a comment..."
                value={social.newComment}
                onChangeText={social.setNewComment}
              />
              <Button
                onPress={social.handleAddComment}
                disabled={!social.newComment.trim() || social.addCommentPending}
                size="icon"
                testID="activity-plan-add-comment-button"
              >
                <Icon as={Send} size={18} className="text-primary-foreground" />
              </Button>
            </View>
            {social.comments.length > 0 ? (
              <View className="gap-3 border-t border-border pt-4">
                {social.comments.map((comment: any) => (
                  <View
                    key={comment.id}
                    className="rounded-lg border border-border/60 bg-background p-3"
                  >
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="font-medium text-sm text-foreground">
                        {comment.profile?.username || "Unknown User"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text className="text-sm text-foreground">{comment.content}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-muted-foreground">No comments yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>
      {activityPlan && <ScheduleActivityModal {...scheduling.scheduleModalProps} />}
    </View>
  );
}
