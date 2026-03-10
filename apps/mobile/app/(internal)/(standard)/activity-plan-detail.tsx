import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Switch } from "@/components/ui/switch";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";
import { getDurationMs } from "@/lib/utils/durationConversion";
import { skipToken } from "@tanstack/react-query";
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
  CalendarX,
  Copy,
  Edit,
  Eye,
  EyeOff,
  Heart,
  Library,
  MessageCircle,
  Send,
  Share2,
  Smartphone,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export default function ActivityPlanDetailPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const params = useLocalSearchParams();
  const planId = params.planId as string | undefined;
  const eventId = params.eventId as string | undefined;
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const utils = trpc.useUtils();
  const { beginRedirect, isRedirecting, redirectOnNotFound } =
    useDeletedDetailRedirect({
      onRedirect: () => router.replace(ROUTES.PLAN.CALENDAR),
    });

  // Fetch plan from database if planId is provided
  const { data: fetchedPlan, isLoading: loadingPlan } =
    trpc.activityPlans.getById.useQuery({ id: planId! }, { enabled: !!planId });

  // Fetch planned activity if eventId is provided
  const {
    data: plannedActivity,
    error: plannedActivityError,
    isLoading: loadingPlannedActivity,
  } = trpc.events.getById.useQuery(
    { id: eventId! },
    { enabled: !!eventId && !isRedirecting },
  );

  React.useEffect(() => {
    redirectOnNotFound(plannedActivityError);
  }, [plannedActivityError, redirectOnNotFound]);

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
      gpsRecordingEnabled: true,
      plan: activityPlan,
      eventId: plannedActivity?.id,
    };

    activitySelectionStore.setSelection(payload);
    router.push("/record");
  };

  const handleSchedule = () => {
    if (!activityPlan) return;
    if (!planId && !activityPlan.id) {
      Alert.alert(
        "Scheduling unavailable",
        "Save or duplicate this activity plan first, then schedule it from its detail screen.",
      );
      return;
    }
    setShowScheduleModal(true);
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;
    setShowScheduleModal(true);
  };

  const handleRemoveSchedule = () => {
    if (!plannedActivity) return;

    Alert.alert(
      "Remove Scheduled Activity",
      "This will remove the scheduled session from your calendar.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeScheduleMutation.mutate({ id: plannedActivity.id });
          },
        },
      ],
    );
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
      console.error("Delete error:", {
        message: error.message,
        code: error.data?.code,
        fullError: error,
      });
      Alert.alert(
        "Error",
        error.message ||
          "Failed to delete activity plan. It may be used in scheduled activities.",
      );
    },
  });

  // Privacy update mutation
  const updatePrivacyMutation = trpc.activityPlans.update.useMutation({
    onSuccess: async () => {
      await utils.activityPlans.getById.invalidate({ id: planId });
      await utils.activityPlans.list.invalidate();
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

  const removeScheduleMutation = trpc.events.delete.useMutation({
    onSuccess: () => {
      beginRedirect();
      setShowScheduleModal(false);
      void Promise.all([
        utils.events.list.invalidate(),
        utils.events.getToday.invalidate(),
        utils.trainingPlans.invalidate(),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        "Error",
        error.message || "Failed to remove scheduled activity",
      );
    },
  });

  const saveToLibraryMutation = trpc.library.add.useMutation({
    onSuccess: async () => {
      await utils.library.listActivityPlans.invalidate();
      Alert.alert("Saved", "Activity plan added to your library.");
    },
    onError: (error) => {
      Alert.alert("Save failed", error.message || "Could not save to library");
    },
  });

  const handleSaveToLibrary = () => {
    const actualPlanId = planId || activityPlan?.id;
    if (!actualPlanId) {
      Alert.alert("Save failed", "No activity plan ID was found.");
      return;
    }

    saveToLibraryMutation.mutate({
      item_type: "activity_plan",
      item_id: actualPlanId,
    });
  };

  const handleDelete = () => {
    if (!activityPlan) return;

    // Get the actual plan ID - could be from planId param or activityPlan.id
    const actualPlanId = planId || activityPlan.id;

    if (!actualPlanId) {
      Alert.alert("Error", "Cannot delete this activity plan - no ID found");
      return;
    }

    // Check ownership before allowing delete
    if (activityPlan.profile_id !== profile?.id) {
      Alert.alert(
        "Error",
        "You don't have permission to delete this activity plan",
      );
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
          onPress: () => {
            console.log("Deleting activity plan:", {
              actualPlanId,
              profileId: profile?.id,
              planProfileId: activityPlan.profile_id,
            });
            deleteMutation.mutate({ id: actualPlanId });
          },
        },
      ],
    );
  };

  // Like state and mutation
  const actualPlanId = (planId || activityPlan?.id)?.trim();
  const [isLiked, setIsLiked] = useState(activityPlan?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(activityPlan?.likes_count ?? 0);

  // Helper to validate UUID format
  const isValidUUID = (id: string | undefined): boolean => {
    if (!id) return false;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  const toggleLikeMutation = trpc.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(activityPlan?.has_liked ?? false);
      setLikesCount(activityPlan?.likes_count ?? 0);
    },
  });

  const handleToggleLike = () => {
    if (!actualPlanId || !isValidUUID(actualPlanId)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: actualPlanId,
      entity_type: "activity_plan",
    });
  };

  // Update like state when plan data loads
  React.useEffect(() => {
    if (activityPlan) {
      setIsLiked(activityPlan.has_liked ?? false);
      setLikesCount(activityPlan.likes_count ?? 0);
    }
  }, [activityPlan?.has_liked, activityPlan?.likes_count]);

  // Comments state
  const [newComment, setNewComment] = useState("");
  const commentEntityId = actualPlanId ?? "";
  const isCommentEntityIdValid = isValidUuid(commentEntityId);

  // Fetch comments
  const { data: commentsData, refetch: refetchComments } =
    trpc.social.getComments.useQuery(
      isCommentEntityIdValid
        ? {
            entity_id: commentEntityId,
            entity_type: "activity_plan",
          }
        : skipToken,
    );

  // Add comment mutation
  const addCommentMutation = trpc.social.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      refetchComments();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to add comment: ${error.message}`);
    },
  });

  const handleAddComment = () => {
    const planIdToUse = (planId || activityPlan?.id)?.trim();
    if (!planIdToUse || !isValidUuid(planIdToUse) || !newComment.trim()) return;
    addCommentMutation.mutate({
      entity_id: planIdToUse,
      entity_type: "activity_plan",
      content: newComment.trim(),
    });
  };

  // Update privacy state when plan data loads
  React.useEffect(() => {
    if (activityPlan) {
      setIsPublic(activityPlan.template_visibility === "public");
    }
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
                onPress={isScheduled ? handleReschedule : handleSchedule}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
              >
                <Icon as={Calendar} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">
                  {isScheduled ? "Reschedule" : "Schedule"}
                </Text>
              </Button>
            </View>

            {isScheduled && eventId && (
              <View className="flex-row gap-2">
                <Button
                  onPress={handleRemoveSchedule}
                  variant="outline"
                  size="sm"
                  className="flex-1 flex-row items-center justify-center gap-1.5"
                  disabled={removeScheduleMutation.isPending}
                >
                  <Icon as={CalendarX} size={16} className="text-destructive" />
                  <Text className="text-destructive text-sm">
                    {removeScheduleMutation.isPending
                      ? "Removing..."
                      : "Remove Schedule"}
                  </Text>
                </Button>
              </View>
            )}

            {/* Secondary Actions Row */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleToggleLike}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-border bg-card"
              >
                <Icon
                  as={Heart}
                  size={16}
                  className={
                    isLiked
                      ? "text-red-500 fill-red-500"
                      : "text-muted-foreground"
                  }
                />
                <Text
                  className={
                    isLiked
                      ? "text-red-500 text-sm font-medium"
                      : "text-muted-foreground text-sm"
                  }
                >
                  {likesCount > 0 ? likesCount : "Like"}
                </Text>
                {(commentsData?.total ?? 0) > 0 && (
                  <>
                    <Text className="text-muted-foreground text-sm">·</Text>
                    <Icon
                      as={MessageCircle}
                      size={14}
                      className="text-muted-foreground"
                    />
                    <Text className="text-muted-foreground text-sm">
                      {commentsData?.total}
                    </Text>
                  </>
                )}
              </Pressable>

              <Button
                onPress={handleSaveToLibrary}
                variant="outline"
                size="sm"
                className="flex-1 flex-row items-center justify-center gap-1.5"
                disabled={saveToLibraryMutation.isPending}
              >
                <Icon as={Library} size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">
                  {saveToLibraryMutation.isPending ? "Saving..." : "Save"}
                </Text>
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

            {isOwnedByUser && (
              <View className="flex-row gap-2">
                {/* Privacy Toggle */}
                <View className="flex-1 flex-row items-center justify-between px-3 py-2 rounded-lg border border-border bg-card">
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
              </View>
            )}
          </View>

          {/* Comments Section */}
          {commentsData && commentsData.comments.length > 0 && (
            <View className="mb-4 border-t border-border pt-4">
              <Text className="font-semibold text-foreground mb-3">
                Comments ({commentsData.total})
              </Text>
              {commentsData.comments.map((comment: any) => (
                <View key={comment.id} className="mb-3">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="font-medium text-sm text-foreground">
                      {comment.profile?.username || "Unknown User"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text className="text-sm text-foreground">
                    {comment.content}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Add Comment Input */}
          <View className="flex-row items-center gap-2 mb-6">
            <TextInput
              className="flex-1 border border-border rounded-lg px-3 py-2 text-foreground"
              placeholder="Add a comment..."
              placeholderTextColor="#9ca3af"
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <Button
              onPress={handleAddComment}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              size="icon"
            >
              <Icon as={Send} size={18} className="text-primary-foreground" />
            </Button>
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
          activityPlanId={eventId ? undefined : planId}
          activityPlan={!planId && !eventId ? activityPlan : undefined}
          eventId={eventId}
          onSuccess={() => {
            setShowScheduleModal(false);
            utils.events.invalidate();
            utils.trainingPlans.invalidate();
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
