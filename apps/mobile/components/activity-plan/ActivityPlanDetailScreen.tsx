import { invalidateActivityPlanQueries } from "@repo/api/react";
import { deriveActivityPlanPresentation } from "@repo/core/activity-plan";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  type DetailOverflowMenuAction,
} from "@/components/shared/detail";
import {
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import { api } from "@/lib/api";
import { getUniqueActivityCategoryConfigs } from "@/lib/constants/activities";
import { ROUTES } from "@/lib/constants/routes";
import { useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { returnToRecordScreen } from "@/lib/navigation/recordingNavigation";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useOptionalActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";
import {
  handleRecordingObjectAction,
  type RecordingObjectActionCandidate,
  resolveRecordingObjectAction,
} from "@/lib/recording/recordingObjectActions";
import { ActivityPlanContentPreview } from "./ActivityPlanContentPreview";
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
  const router = require("expo-router").useRouter();
  const navigateTo = useAppNavigate();
  const recorderService = useOptionalActivityRecorderService();
  const sessionView = useSessionView(recorderService);
  const recordingLifecycle = recorderService?.recordingLifecycle ?? (sessionView ? "idle" : "idle");
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const utils = api.useUtils();
  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });

  const { data: fetchedPlan, isLoading: loadingPlan } = api.activityPlans.getById.useQuery(
    { id: planId ?? "" },
    { enabled: !!planId },
  );

  const {
    data: plannedActivity,
    error: plannedActivityError,
    isLoading: loadingPlannedActivity,
  } = api.events.getById.useQuery({ id: eventId ?? "" }, { enabled: !!eventId && !isRedirecting });

  React.useEffect(() => {
    redirectOnNotFound(plannedActivityError);
  }, [plannedActivityError, redirectOnNotFound]);

  const activePlannedActivity = eventId ? plannedActivity : null;

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const isScheduled = !!activePlannedActivity?.scheduled_date;

  const vm = useActivityPlanDetailViewModel({
    activityPlanParam,
    fetchedPlan: fetchedPlan?.detail,
    formatDuration,
    isScheduled,
    plannedActivity: activePlannedActivity,
    profile,
    template,
  });

  const activityPlan = vm.activityPlan;
  const presentation = React.useMemo(
    () => deriveActivityPlanPresentation(activityPlan?.structure),
    [activityPlan?.structure],
  );
  const planCategory = activityPlan?.activityCategory ?? "other";
  const quantitySummary = getActivityPlanQuantitySummary(activityPlan);
  const categoryItems = getUniqueActivityCategoryConfigs([
    presentation?.activity_category ?? planCategory,
  ]).map((activity_category) => ({
    icon: activity_category.icon,
    iconClassName: activity_category.color,
    label: activity_category.name,
  }));

  const recordingCandidate = React.useMemo<RecordingObjectActionCandidate | null>(() => {
    if (!activityPlan) return null;
    return {
      objectKind: "activity_plan",
      objectId: activityPlan.id,
      label: activityPlan.name,
      activity_category: planCategory,
      plan: {
        id: activityPlan.id,
        name: activityPlan.name,
        activity_category: activityPlan.activityCategory,
        structure: activityPlan.structure,
      },
    };
  }, [activityPlan, planCategory]);

  const recordingAction = recordingCandidate
    ? resolveRecordingObjectAction({
        candidate: recordingCandidate,
        lifecycle: recordingLifecycle,
        service: recorderService,
      })
    : null;

  const handleRecordNow = async () => {
    if (!recordingCandidate || !recordingAction) return;
    await handleRecordingObjectAction({
      candidate: recordingCandidate,
      command: recordingAction.command,
      navigateToRecord: () => returnToRecordScreen(router),
      service: recorderService,
    });
  };
  const scheduling = useActivityPlanSchedulingActions({
    action,
    activityPlan,
    beginRedirect,
    eventId,
    plannedActivity,
    planId,
    queryClient,
    router,
    utils,
    canCreateNewPlanWork: Boolean(activityPlan),
  });

  const handleEdit = () => {
    if (!activityPlan) return;
    navigateTo({
      pathname: "/create-activity-plan",
      params: { planId: planId || activityPlan.id },
    });
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

  const handleDelete = () => {
    if (!activityPlan) return;
    const actualPlanId = planId || activityPlan.id;
    if (!actualPlanId) {
      Alert.alert("Error", "Cannot delete this activity plan - no ID found");
      return;
    }
    if (!activityPlan.capabilities.canDelete) {
      Alert.alert("Error", "You don't have permission to delete this activity plan");
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (!activityPlan) return;
    const actualPlanId = planId || activityPlan.id;
    if (!actualPlanId) {
      setShowDeleteConfirm(false);
      Alert.alert("Error", "Cannot delete this activity plan - no ID found");
      return;
    }
    deleteMutation.mutate({ id: actualPlanId });
  };

  const socialPlanId = planId ?? activityPlan?.id;
  const social = useActivityPlanSocialController({
    ...(activityPlan?.engagement.viewerHasLiked === undefined
      ? {}
      : { initialHasLiked: activityPlan.engagement.viewerHasLiked }),
    ...(activityPlan?.engagement.likes === undefined
      ? {}
      : { initialLikesCount: activityPlan.engagement.likes }),
    ...(socialPlanId === undefined ? {} : { planId: socialPlanId }),
  });

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

  const isOwnedByUser = vm.isOwnedByUser;
  const isEventContext = !!eventId;
  const primaryScheduleLabel = scheduling.primaryScheduleLabel;
  const { Stack } = require("expo-router") as typeof import("expo-router");

  const renderOptionsMenu = () => {
    const actions: DetailOverflowMenuAction[] = [];

    if (activityPlan) {
      actions.push({
        disabled: recordingAction?.primaryAction === "disabled" || !recordingAction?.command,
        label: recordingAction?.label ?? "Start Activity",
        onPress: handleRecordNow,
        testID: "activity-plan-options-start",
      });
    }

    if (!isEventContext) {
      actions.push({
        label: primaryScheduleLabel,
        onPress: scheduling.isScheduled ? scheduling.handleReschedule : scheduling.handleSchedule,
        testID: "activity-plan-options-schedule",
      });
    }

    if (!isEventContext && scheduling.isScheduled && eventId) {
      actions.push({
        label: "Remove Schedule",
        onPress: scheduling.handleRemoveSchedule,
        testID: "activity-plan-options-remove-schedule",
      });
    }

    if (activityPlan) {
      actions.push({
        disabled: scheduling.duplicatePending,
        label: scheduling.duplicatePending ? "Duplicating..." : "Duplicate",
        onPress: scheduling.handleDuplicate,
        testID: "activity-plan-options-duplicate",
      });
    }

    if (isOwnedByUser) {
      actions.push(
        {
          label: "Edit Activity Plan",
          onPress: handleEdit,
          testID: "activity-plan-options-edit",
        },
        {
          label: "Delete Activity Plan",
          onPress: handleDelete,
          testID: "activity-plan-options-delete",
          variant: "destructive",
        },
      );
    }

    return <DetailOverflowMenu actions={actions} testID="activity-plan-options-trigger" />;
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: renderOptionsMenu,
        }}
      />
      <ScrollView className="flex-1">
        <View className="gap-6 p-4">
          <View className="rounded-3xl border border-border bg-card p-4">
            <ResourceOwnerActionRow
              actions={
                <ResourceLikeButton
                  isLiked={social.isLiked}
                  likeCount={social.likesCount}
                  onPress={social.handleToggleLike}
                  testID="activity-plan-like-button"
                />
              }
              categoryItems={categoryItems}
              fallbackLabel="GradientPeak"
              owner={
                activityPlan.owner
                  ? {
                      id: activityPlan.owner.id,
                      username: activityPlan.owner.username,
                      avatar_url: activityPlan.owner.avatarUrl,
                    }
                  : null
              }
              timestamp={activityPlan.createdAt}
            />

            <ActivityPlanSummary
              description={activityPlan.description}
              estimatedDuration={quantitySummary.durationSeconds}
              presentation={presentation}
              projectionMetrics={activityPlan.metrics}
              structure={activityPlan.structure}
              title={activityPlan.name}
              variant="standalone"
              showAttribution={false}
            />
            {recordingAction?.primaryAction === "disabled" && recordingAction.disabledReason ? (
              <View
                className="mt-4 rounded-2xl bg-muted/30 px-4 py-3"
                testID="activity-plan-mobile-recording-unavailable"
              >
                <Text className="text-sm font-semibold">Mobile recording unavailable</Text>
                <Text className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {recordingAction.disabledReason}
                </Text>
              </View>
            ) : null}
            {scheduling.isScheduled && scheduling.scheduledDate ? (
              <Pressable
                className="mt-4 rounded-2xl bg-primary/10 px-4 py-3"
                disabled={isEventContext || !eventId}
                onPress={() => {
                  if (!eventId) return;
                  navigateTo(ROUTES.PLAN.EVENT_DETAIL(eventId) as never);
                }}
                testID="activity-plan-open-scheduled-event"
              >
                <Text className="text-sm font-semibold text-primary">Scheduled activity</Text>
                <Text className="mt-0.5 text-xs text-primary/80">
                  {format(new Date(scheduling.scheduledDate), "EEEE, MMMM d, yyyy")}
                </Text>
              </Pressable>
            ) : null}
            {activityPlan.contractVersion === "activity-plan-detail-v1" && activityPlan.notes ? (
              <View className="mt-4 rounded-2xl bg-muted/30 px-4 py-3">
                <Text className="text-sm leading-5 text-muted-foreground">
                  {activityPlan.notes}
                </Text>
              </View>
            ) : null}
            {social.commentCount > 0 ? (
              <View className="mt-4 flex-row items-center gap-1.5">
                <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">
                  {social.commentCount} comments
                </Text>
              </View>
            ) : null}
          </View>
          <ActivityPlanContentPreview
            size="large"
            plan={activityPlan}
            presentation={presentation}
            testIDPrefix="activity-plan-content-preview"
          />
          <EntityCommentsSection
            addCommentPending={social.addCommentPending}
            commentCount={social.commentCount}
            comments={social.comments}
            hasMoreComments={social.hasMoreComments}
            isLoadingMoreComments={social.isLoadingMoreComments}
            newComment={social.newComment}
            onAddComment={social.handleAddComment}
            onChangeNewComment={social.setNewComment}
            onLoadMoreComments={social.loadMoreComments}
            testIDPrefix="activity-plan"
          />
        </View>
      </ScrollView>
      {showDeleteConfirm ? (
        <DetailDeleteConfirmModal
          entityLabel="Activity Plan"
          entityName={activityPlan.name}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          pending={deleteMutation.isPending}
          testIDPrefix="activity-plan"
        />
      ) : null}
    </View>
  );
}
