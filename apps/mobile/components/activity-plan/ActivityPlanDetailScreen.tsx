import { invalidateActivityPlanQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  View,
} from "react-native";
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
import { RouteCard } from "@/components/shared/RouteCard";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import {
  getActivityPlanRoute,
  getAuthoritativeActivityPlanMetrics,
} from "@/lib/activityPlanMetrics";
import { api } from "@/lib/api";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";
import { ROUTES } from "@/lib/constants/routes";
import { useRecordingLifecycle } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { returnToRecordScreen } from "@/lib/navigation/recordingNavigation";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useOptionalSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
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

type RouteSeedPlan = {
  route_id?: string | null;
};

function parseRouteSeedPlan(template?: string, activityPlanParam?: string): RouteSeedPlan | null {
  if (template) {
    try {
      return JSON.parse(template) as RouteSeedPlan;
    } catch (error) {
      console.error("Failed to parse template:", error);
    }
  }

  if (activityPlanParam) {
    try {
      return JSON.parse(activityPlanParam) as RouteSeedPlan;
    } catch (error) {
      console.error("Failed to parse activityPlan:", error);
    }
  }

  return null;
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
  const recorderService = useOptionalSharedActivityRecorder();
  const recordingLifecycle = useRecordingLifecycle(recorderService);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [shouldLoadRouteGeometry, setShouldLoadRouteGeometry] = React.useState(false);

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

  const routeSeedPlan = React.useMemo(
    () => parseRouteSeedPlan(template, activityPlanParam),
    [activityPlanParam, template],
  );
  const routeId =
    fetchedPlan?.route_id ?? plannedActivity?.activity_plan?.route_id ?? routeSeedPlan?.route_id;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });
  const { data: routeFull, isFetching: isFetchingRouteFull } = api.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: !!routeId && shouldLoadRouteGeometry },
  );

  React.useEffect(() => {
    setShouldLoadRouteGeometry(false);
    if (!routeId) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      setShouldLoadRouteGeometry(true);
    });

    return () => task.cancel();
  }, [routeId]);

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
    isScheduled,
    plannedActivity,
    profile,
    route,
    template,
  });

  const activityPlan = vm.activityPlan;
  const authoritativeMetrics = getAuthoritativeActivityPlanMetrics(activityPlan);
  const planRoute = getActivityPlanRoute(activityPlan);
  const activityConfig = activityPlan?.activity_category?.includes("_")
    ? getActivityConfig(activityPlan.activity_category)
    : getActivityCategoryConfig(activityPlan?.activity_category ?? "other");

  const recordingCandidate = React.useMemo<RecordingObjectActionCandidate | null>(() => {
    if (!activityPlan) return null;
    return {
      objectKind: "activity_plan",
      objectId: activityPlan.id,
      label: activityPlan.name,
      category: activityPlan.activity_category,
      plan: activityPlan,
      planRouteId: activityPlan.route_id ?? null,
    };
  }, [activityPlan]);

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

  const social = useActivityPlanSocialController({
    initialHasLiked: activityPlan?.has_liked,
    initialLikesCount: activityPlan?.likes_count,
    planId: planId || activityPlan?.id,
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

  const tss = vm.tss;
  const intensityFactor = vm.intensityFactor;
  const isOwnedByUser = vm.isOwnedByUser;
  const isEventContext = !!eventId;
  const primaryScheduleLabel = scheduling.primaryScheduleLabel;
  const { Stack } = require("expo-router") as typeof import("expo-router");

  const renderOptionsMenu = () => {
    const actions: DetailOverflowMenuAction[] = [
      {
        disabled: recordingAction?.primaryAction === "disabled" || !recordingAction?.command,
        label: recordingAction?.label ?? "Start Activity",
        onPress: handleRecordNow,
        testID: "activity-plan-options-start",
      },
    ];

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

    actions.push({
      disabled: scheduling.duplicatePending,
      label: scheduling.duplicatePending ? "Duplicating..." : "Duplicate",
      onPress: scheduling.handleDuplicate,
      testID: "activity-plan-options-duplicate",
    });

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
              categoryIcon={activityConfig.icon}
              categoryIconClassName={activityConfig.color}
              categoryLabel={activityConfig.name}
              fallbackLabel="GradientPeak"
              owner={
                (
                  activityPlan as {
                    owner?: {
                      id?: string | null;
                      username?: string | null;
                      avatar_url?: string | null;
                    } | null;
                  }
                ).owner ?? null
              }
              timestamp={
                (
                  activityPlan as {
                    created_at?: string | Date | null;
                    updated_at?: string | Date | null;
                  }
                ).created_at ??
                (activityPlan as { updated_at?: string | Date | null }).updated_at ??
                null
              }
            />

            <ActivityPlanSummary
              activityCategory={activityPlan.activity_category}
              description={activityPlan.description}
              estimatedDuration={authoritativeMetrics.estimated_duration ?? null}
              estimatedTss={tss}
              intensityFactor={intensityFactor}
              routeName={route?.name}
              routeProvided={!!routeId}
              structure={activityPlan.structure}
              title={activityPlan.name}
              variant="standalone"
              showAttribution={false}
            />
            {scheduling.isScheduled ? (
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
            {activityPlan.notes ? (
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
          {route ? (
            <RouteCard
              route={route}
              routeFull={routeFull}
              onPress={
                routeId
                  ? () =>
                      navigateTo({
                        pathname: "/(internal)/(standard)/route-detail",
                        params: { id: routeId },
                      } as never)
                  : undefined
              }
            />
          ) : null}
          {routeId && (!shouldLoadRouteGeometry || isFetchingRouteFull) ? (
            <View className="items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-5">
              <ActivityIndicator size="small" className="text-primary" />
              <Text className="text-sm text-muted-foreground">Loading route preview...</Text>
            </View>
          ) : routeId && !route?.polyline && !routeFull?.coordinates?.length ? (
            <View className="items-center gap-2 rounded-2xl border border-border bg-muted/20 px-4 py-5">
              <Text className="text-sm font-medium text-foreground">No route preview</Text>
              <Text className="text-center text-sm text-muted-foreground">
                This attached route does not include map geometry to preview.
              </Text>
            </View>
          ) : null}
          <ActivityPlanContentPreview
            size="large"
            plan={activityPlan}
            route={
              route
                ? route
                : planRoute
                  ? {
                      total_ascent: planRoute.ascent ?? null,
                      total_descent: planRoute.descent ?? null,
                      total_distance: planRoute.distance ?? null,
                    }
                  : null
            }
            routeFull={routeFull}
            showRoutePreview={false}
            onRoutePress={
              routeId
                ? () =>
                    navigateTo({
                      pathname: "/(internal)/(standard)/route-detail",
                      params: { id: routeId },
                    } as never)
                : null
            }
            intensityFactor={intensityFactor}
            tss={tss}
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
