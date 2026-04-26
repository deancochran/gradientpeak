import { invalidateActivityPlanQueries } from "@repo/api/react";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ellipsis, Heart, MessageCircle } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import { RouteCard } from "@/components/shared/RouteCard";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import {
  getActivityPlanRoute,
  getAuthoritativeActivityPlanMetrics,
} from "@/lib/activityPlanMetrics";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
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
  const { data: routeFull } = api.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: !!routeId },
  );

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

  const renderOptionsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="activity-plan-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem onPress={handleRecordNow} testID="activity-plan-options-start">
          <Text>Start Activity</Text>
        </DropdownMenuItem>
        {!isEventContext ? (
          <DropdownMenuItem
            onPress={
              scheduling.isScheduled ? scheduling.handleReschedule : scheduling.handleSchedule
            }
            testID="activity-plan-options-schedule"
          >
            <Text>{primaryScheduleLabel}</Text>
          </DropdownMenuItem>
        ) : null}
        {!isEventContext && eventId ? (
          <DropdownMenuItem
            onPress={() => navigateTo(ROUTES.PLAN.EVENT_DETAIL(eventId) as never)}
            testID="activity-plan-options-open-event"
          >
            <Text>Open Scheduled Event</Text>
          </DropdownMenuItem>
        ) : null}
        {!isEventContext && scheduling.isScheduled && eventId ? (
          <DropdownMenuItem
            onPress={scheduling.handleRemoveSchedule}
            testID="activity-plan-options-remove-schedule"
          >
            <Text>Remove Schedule</Text>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onPress={scheduling.handleDuplicate}
          disabled={scheduling.duplicatePending}
          testID="activity-plan-options-duplicate"
        >
          <Text>{scheduling.duplicatePending ? "Duplicating..." : "Duplicate"}</Text>
        </DropdownMenuItem>
        {isOwnedByUser ? (
          <DropdownMenuItem onPress={handleEdit} testID="activity-plan-options-edit">
            <Text>Edit Activity Plan</Text>
          </DropdownMenuItem>
        ) : null}
        {isOwnedByUser ? (
          <DropdownMenuItem
            onPress={handleDelete}
            variant="destructive"
            testID="activity-plan-options-delete"
          >
            <Text>Delete Activity Plan</Text>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
            <ActivityPlanSummary
              activityCategory={activityPlan.activity_category}
              description={activityPlan.description}
              estimatedDuration={authoritativeMetrics.estimated_duration ?? null}
              estimatedTss={tss}
              headerAccessory={
                <Pressable
                  onPress={social.handleToggleLike}
                  className="rounded-full border border-border bg-background px-3 py-2"
                  testID="activity-plan-like-button"
                >
                  <View className="flex-row items-center gap-1.5">
                    <Icon
                      as={Heart}
                      size={16}
                      className={
                        social.isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"
                      }
                    />
                    <Text
                      className={
                        social.isLiked
                          ? "text-red-500 text-sm font-medium"
                          : "text-muted-foreground text-sm"
                      }
                    >
                      {social.likesCount > 0
                        ? social.likesCount
                        : social.isLiked
                          ? "Liked"
                          : "Like"}
                    </Text>
                  </View>
                </Pressable>
              }
              intensityFactor={intensityFactor}
              routeName={route?.name}
              routeProvided={!!routeId}
              structure={activityPlan.structure}
              title={activityPlan.name}
              variant="standalone"
            />
            {scheduling.isScheduled ? (
              <View className="mt-4 rounded-2xl bg-primary/10 px-4 py-3">
                <Text className="text-sm font-semibold text-primary">Scheduled activity</Text>
                <Text className="mt-0.5 text-xs text-primary/80">
                  {format(new Date(scheduling.scheduledDate), "EEEE, MMMM d, yyyy")}
                </Text>
              </View>
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
            helperText="Ask questions or leave context for anyone reusing this activity."
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
      {activityPlan && <ScheduleActivityModal {...scheduling.scheduleModalProps} />}
    </View>
  );
}
