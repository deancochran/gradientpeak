import { invalidateActivityPlanQueries } from "@repo/api/react";
import {
  buildActivityPlanPrintModel,
  consolidateActivityPlanText,
  deriveActivityPlanPresentation,
  getActivityPlanPrintFormatLabel,
  getActivityPlanPrintFormats,
  resolveActivityPlanSessionFlow,
} from "@repo/core/activity-plan";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageCircle, Share2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from "react-native";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import {
  DetailDeleteConfirmModal,
  DetailOverflowMenu,
  type DetailOverflowMenuAction,
} from "@/components/shared/detail";
import {
  ResourceCardActionButton,
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { useEntityCommentsSheet } from "@/components/social/EntityCommentsSheetProvider";
import {
  printActivityPlanPdf,
  shareActivityPlanPdf,
} from "@/lib/activity-plan-export/activity-plan-pdf";
import { api } from "@/lib/api";
import { getUniqueActivityCategoryConfigs } from "@/lib/constants/activities";
import { ROUTES } from "@/lib/constants/routes";
import { useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { returnToRecordScreen } from "@/lib/navigation/recordingNavigation";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useOptionalActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";
import {
  handleRecordingObjectAction,
  type RecordingObjectActionCandidate,
  resolveRecordingObjectAction,
} from "@/lib/recording/recordingObjectActions";
import { getPublicShareUrl } from "@/lib/share/public-share-url";
import { ActivityPlanContentPreview } from "./ActivityPlanContentPreview";
import { useActivityPlanDetailViewModel } from "./useActivityPlanDetailViewModel";
import { useActivityPlanSchedulingActions } from "./useActivityPlanSchedulingActions";

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
  const [personalizationChoice, setPersonalizationChoice] = React.useState<boolean | null>(null);
  const entityCommentsSheet = useEntityCommentsSheet();

  const utils = api.useUtils();
  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });

  const {
    data: fetchedPlan,
    isLoading: loadingPlan,
    error: planError,
    refetch: refetchPlan,
  } = api.activityPlans.getById.useQuery(
    { id: planId ?? "", personalize: false },
    { enabled: !!planId },
  );

  const {
    data: plannedActivity,
    error: plannedActivityError,
    isLoading: loadingPlannedActivity,
  } = api.events.getById.useQuery(
    { id: eventId ?? "", personalize: false },
    { enabled: !!eventId && !isRedirecting },
  );
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
    fetchedPlan: fetchedPlan?.detail,
    formatDuration,
    isScheduled,
    plannedActivity: activePlannedActivity,
    profile,
    ...(activityPlanParam ? { activityPlanParam } : {}),
    ...(template ? { template } : {}),
  });
  const { data: viewerReadModel, isLoading: viewerReadModelLoading } =
    api.athleteIntelligence.getReadModel.useQuery(
      { sections: { publishedState: true } },
      { enabled: Boolean(profile), refetchOnWindowFocus: false },
    );

  const activityPlan = vm.activityPlan;
  const activityPlanNotes =
    activityPlan?.contractVersion === "activity-plan-detail-v1" ? activityPlan.notes : null;
  const performanceTargets = viewerReadModel?.publishedState?.performanceTargets;
  const personalizationEligibility = React.useMemo(
    () =>
      resolveActivityPlanSessionFlow({
        structure: activityPlan?.structure,
        ...(performanceTargets ? { performanceTargets } : {}),
        personalize: false,
      }).eligibility,
    [activityPlan?.structure, performanceTargets],
  );
  const personalizeTargets = Boolean(
    personalizationEligibility.eligible && (personalizationChoice ?? true),
  );
  const printModel = activityPlan
    ? buildActivityPlanPrintModel({
        format: "full-page",
        ...(activityPlan.description !== undefined
          ? { description: activityPlan.description }
          : {}),
        ...(activityPlanNotes !== null ? { notes: activityPlanNotes } : {}),
        ...(performanceTargets ? { performanceTargets } : {}),
        personalizeTargets,
        structure: activityPlan.structure,
        title: activityPlan.name,
      })
    : null;
  React.useEffect(() => {
    setPersonalizationChoice(null);
  }, [eventId, planId]);

  const presentation = React.useMemo(
    () => deriveActivityPlanPresentation(activityPlan?.structure),
    [activityPlan?.structure],
  );
  const planCategory = activityPlan?.activityCategory ?? "other";
  const categoryItems = getUniqueActivityCategoryConfigs([
    presentation?.activity_category ?? planCategory,
  ]).map((activity_category) => ({
    icon: activity_category.icon,
    iconClassName: activity_category.color,
    label: activity_category.name,
  }));

  const recordingCandidate = React.useMemo<RecordingObjectActionCandidate | null>(() => {
    if (!activityPlan || !presentation?.structure || !activityPlan.capabilities.canRecord) {
      return null;
    }
    return {
      objectKind: "activity_plan",
      objectId: activityPlan.id,
      label: activityPlan.name,
      activity_category: planCategory,
      plan: {
        id: activityPlan.id,
        name: activityPlan.name,
        activity_category: activityPlan.activityCategory,
        structure: presentation.structure,
      },
    };
  }, [activityPlan, planCategory, presentation]);

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
    activityPlan,
    beginRedirect,
    plannedActivity,
    planId,
    queryClient,
    router,
    utils,
    canDuplicatePlan: Boolean(activityPlan?.capabilities.canDuplicate),
    canSchedulePlan: Boolean(activityPlan?.capabilities.canSchedule),
    ...(action ? { action } : {}),
    ...(eventId ? { eventId } : {}),
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

  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: activityPlan?.id ?? "",
    entityType: "activity_plan",
    ...(activityPlan?.engagement.likes !== undefined
      ? { initialCount: activityPlan.engagement.likes }
      : {}),
    ...(activityPlan?.engagement.viewerHasLiked !== undefined
      ? { initialLiked: activityPlan.engagement.viewerHasLiked }
      : {}),
  });
  const handleShare = async () => {
    if (!activityPlan || activityPlan.visibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public activity plans have a share link. Change visibility to Public first.",
      );
      return;
    }

    const url = getPublicShareUrl(`/share/activity-plans/${activityPlan.id}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Share failed", "Could not open the share sheet. Please try again.");
    }
  };

  const handleExportPdf = () => {
    if (!printModel) return;
    const chooseAction = (format: typeof printModel.format) => {
      const selectedModel = { ...printModel, format };
      Alert.alert(getActivityPlanPrintFormatLabel(format), "Choose what to do with this PDF.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Share PDF",
          onPress: () =>
            void shareActivityPlanPdf(selectedModel).catch(() =>
              Alert.alert("Share failed", "The activity-plan PDF could not be shared."),
            ),
        },
        {
          text: "Print",
          onPress: () =>
            void printActivityPlanPdf(selectedModel).catch(() =>
              Alert.alert("Print failed", "The activity-plan PDF could not be printed."),
            ),
        },
      ]);
    };
    const formats = getActivityPlanPrintFormats(printModel.activityCategory);
    if (formats.length === 1) {
      chooseAction(formats[0] ?? "full-page");
      return;
    }
    Alert.alert("Export activity-plan PDF", "Choose a printable format.", [
      { text: "Cancel", style: "cancel" },
      ...formats.map((format) => ({
        text: getActivityPlanPrintFormatLabel(format),
        onPress: () => chooseAction(format),
      })),
    ]);
  };

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
        <Text accessibilityRole={planError ? "alert" : undefined} className="text-muted-foreground">
          {planError ? "Activity plan could not be loaded." : "Activity plan not found"}
        </Text>
        {planError ? (
          <Button onPress={() => void refetchPlan()}>
            <Text>Retry plan</Text>
          </Button>
        ) : null}
      </View>
    );
  }

  const isOwnedByUser = vm.isOwnedByUser;
  const isEventContext = !!eventId;
  const primaryScheduleLabel = scheduling.primaryScheduleLabel;
  const { Stack } = require("expo-router") as typeof import("expo-router");

  const renderOptionsMenu = () => {
    const actions: DetailOverflowMenuAction[] = [];

    if (recordingCandidate) {
      actions.push({
        disabled: recordingAction?.primaryAction === "disabled" || !recordingAction?.command,
        label: recordingAction?.label ?? "Start Activity",
        onPress: handleRecordNow,
        testID: "activity-plan-options-start",
      });
    }

    if (!isEventContext && activityPlan.capabilities.canSchedule) {
      actions.push({
        label: primaryScheduleLabel,
        onPress: scheduling.isScheduled ? scheduling.handleReschedule : scheduling.handleSchedule,
        testID: "activity-plan-options-schedule",
      });
    }

    if (printModel) {
      actions.push({
        label: "Export Activity Plan PDF",
        onPress: handleExportPdf,
        testID: "activity-plan-options-export-pdf",
      });
    }

    if (!isEventContext && scheduling.isScheduled && eventId) {
      actions.push({
        label: "Remove Schedule",
        onPress: scheduling.handleRemoveSchedule,
        testID: "activity-plan-options-remove-schedule",
      });
    }

    if (activityPlan.capabilities.canDuplicate) {
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
                <ResourceCardActionButton
                  accessibilityLabel="Share activity plan"
                  onPress={() => void handleShare()}
                  testID="activity-plan-share-button"
                >
                  <Icon as={Share2} size={20} className="text-foreground" />
                </ResourceCardActionButton>
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
              description={consolidateActivityPlanText(
                activityPlan.description,
                activityPlanNotes,
                "Notes",
              )}
              presentation={presentation}
              projectionMetrics={activityPlan.metrics}
              structure={activityPlan.structure}
              title={activityPlan.name}
              variant="standalone"
              showAttribution={false}
            />
            <View className="mt-4 flex-row items-center gap-2">
              <ResourceLikeButton
                disabled={isLikePending}
                isLiked={isLiked}
                likeCount={likeCount}
                onPress={toggleLike}
                testID="activity-plan-like-button"
              />
              <ResourceCardActionButton
                accessibilityLabel="Comments"
                onPress={() =>
                  entityCommentsSheet?.openEntityComments({
                    entityId: activityPlan.id,
                    entityType: "activity_plan",
                  })
                }
                testID="activity-plan-comments-button"
              >
                <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
                  <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
                  <Text className="ml-1 text-xs font-medium text-muted-foreground">Comments</Text>
                </View>
              </ResourceCardActionButton>
            </View>
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
          </View>
          {presentation?.structure ? (
            <ActivityPlanContentPreview
              personalizeTargets={personalizeTargets}
              personalizationFactsLoading={viewerReadModelLoading}
              performanceTargets={performanceTargets ?? null}
              onPersonalizeTargetsChange={setPersonalizationChoice}
              showPersonalizationControl={Boolean(profile)}
              size="large"
              plan={activityPlan}
              presentation={presentation}
              testIDPrefix="activity-plan-content-preview"
            />
          ) : null}
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
