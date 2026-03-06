import { TrainingPlanSummaryHeader } from "@/components/training-plan/TrainingPlanSummaryHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import {
  TPV_NEXT_STEP_INTENTS,
  normalizeTrainingPlanNextStep,
} from "@/lib/constants/trainingPlanIntents";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import { skipToken } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Library,
  MessageCircle,
  Send,
  Trash2,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export default function TrainingPlanOverview() {
  const router = useRouter();
  const { profile } = useAuth();
  const utils = trpc.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const isSystemTemplateId = id?.startsWith("00000000-0000-0000-0000-00000000")
    ? true
    : false;

  const { data: templatePlan, isLoading: isLoadingTemplate } =
    trpc.trainingPlans.getTemplate.useQuery(
      isSystemTemplateId && id ? { id } : skipToken,
      {
        enabled: isSystemTemplateId && !!id,
      },
    );

  const { data: rawActivePlan } = trpc.trainingPlans.getActivePlan.useQuery();
  const activePlan = rawActivePlan as any;

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const snapshot = useTrainingPlanSnapshot({
    planId: isSystemTemplateId ? undefined : id,
    includeWeeklySummaries: false,
  });

  const plan = (isSystemTemplateId ? templatePlan : snapshot.plan) as any;
  const loadingPlan = isSystemTemplateId
    ? isLoadingTemplate
    : snapshot.isLoadingSharedDependencies;

  const [refreshing, setRefreshing] = React.useState(false);
  const [templateStartDate, setTemplateStartDate] = React.useState("");
  const [templateGoalDate, setTemplateGoalDate] = React.useState("");
  const [showApplyModal, setShowApplyModal] = React.useState(false);
  const [showConcurrencyWarning, setShowConcurrencyWarning] =
    React.useState(false);
  const [pendingApplyDates, setPendingApplyDates] = React.useState<{
    startDate: string;
    goalDate: string;
  } | null>(null);

  const saveToLibraryMutation = trpc.library.add.useMutation({
    onSuccess: async () => {
      await utils.library.listTrainingPlans.invalidate();
      Alert.alert("Saved", "Training plan added to your library.");
    },
    onError: (error) => {
      Alert.alert("Save failed", error.message || "Could not save to library");
    },
  });

  const applyTemplateMutation = trpc.trainingPlans.applyTemplate.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.trainingPlans.invalidate(),
        utils.events.invalidate(),
        utils.library.listTrainingPlans.invalidate(),
      ]);
      Alert.alert(
        "Template Applied",
        `Created ${result.created_event_count} scheduled session${result.created_event_count === 1 ? "" : "s"}.`,
        [
          {
            text: "OK",
            onPress: () => router.replace(ROUTES.PLAN.INDEX),
          },
        ],
      );
    },
    onError: (error) => {
      Alert.alert(
        "Apply failed",
        error.message || "Could not apply this training plan template",
      );
    },
  });

  const deletePlanMutation = useReliableMutation(trpc.trainingPlans.delete, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Plan Deleted", "Your training plan has been deleted", [
        {
          text: "OK",
          onPress: () => router.replace(ROUTES.PLAN.INDEX),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Delete Failed", error.message || "Failed to delete plan");
    },
  });

  const [isPublic, setIsPublic] = useState(
    plan?.template_visibility === "public",
  );

  const updateVisibilityMutation = trpc.trainingPlans.update.useMutation({
    onSuccess: () => {
      utils.trainingPlans.invalidate();
    },
    onError: (error) => {
      setIsPublic(plan?.template_visibility === "public");
      Alert.alert(
        "Update Failed",
        error.message || "Failed to update visibility",
      );
    },
  });

  const handleTogglePrivacy = useCallback(() => {
    if (!plan) return;
    const newVisibility = !isPublic;
    setIsPublic(newVisibility);
    updateVisibilityMutation.mutate({
      id: plan.id,
      template_visibility: newVisibility ? "public" : "private",
    });
  }, [isPublic, plan, updateVisibilityMutation]);

  const [isLiked, setIsLiked] = useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(plan?.likes_count ?? 0);
  const [newComment, setNewComment] = useState("");

  const toggleLikeMutation = trpc.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleToggleLike = useCallback(() => {
    if (!plan?.id) return;
    if (!isValidUuid(plan.id)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: plan.id,
      entity_type: "training_plan",
    });
  }, [plan?.id, isLiked, toggleLikeMutation]);

  const { data: commentsData, refetch: refetchComments } =
    trpc.social.getComments.useQuery(
      { entity_id: id || "", entity_type: "training_plan" },
      { enabled: !!id && isValidUuid(id) },
    );

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
    if (!id || !isValidUuid(id) || !newComment.trim()) return;
    addCommentMutation.mutate({
      entity_id: id,
      entity_type: "training_plan",
      content: newComment.trim(),
    });
  };

  const handleOpenSettings = useCallback(() => {
    router.push({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "plan" },
    });
  }, [plan?.id, router]);

  const handleOpenActivity = useCallback(() => {
    if (typeof activityId !== "string") return;
    router.push(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  }, [activityId, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await snapshot.refetchAll();
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  };

  const handleEditStructure = useCallback(() => {
    router.push({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "goals" },
    });
  }, [plan?.id, router]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) return;
    Alert.alert(
      "Delete Training Plan?",
      "This action cannot be undone. All planned activities associated with this training plan will also be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePlanMutation.mutateAsync({ id: plan.id });
          },
        },
      ],
    );
  }, [deletePlanMutation, plan]);

  const handleSaveToLibrary = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Save failed", "No plan ID was found.");
      return;
    }
    saveToLibraryMutation.mutate({
      item_type: "training_plan",
      item_id: plan.id,
    });
  }, [plan?.id, saveToLibraryMutation]);

  const executeApplyTemplate = (
    normalizedStartDate: string,
    normalizedGoalDate: string,
  ) => {
    applyTemplateMutation.mutate({
      template_type: "training_plan",
      template_id: plan!.id,
      start_date: normalizedStartDate || undefined,
      target_date: normalizedGoalDate || undefined,
    });
  };

  const handleApplyTemplate = useCallback(() => {
    if (!plan?.id) {
      Alert.alert("Apply failed", "No plan ID was found.");
      return;
    }

    const normalizedStartDate = templateStartDate.trim();
    const normalizedGoalDate = templateGoalDate.trim();

    if (
      normalizedStartDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedStartDate)
    ) {
      Alert.alert("Invalid start date", "Use YYYY-MM-DD format.");
      return;
    }

    if (normalizedGoalDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedGoalDate)) {
      Alert.alert("Invalid goal date", "Use YYYY-MM-DD format.");
      return;
    }

    if (activePlan && (activePlan as any).id !== plan.id) {
      setPendingApplyDates({
        startDate: normalizedStartDate,
        goalDate: normalizedGoalDate,
      });
      setShowConcurrencyWarning(true);
    } else {
      executeApplyTemplate(normalizedStartDate, normalizedGoalDate);
      setShowApplyModal(false);
    }
  }, [
    activePlan,
    applyTemplateMutation,
    plan,
    templateGoalDate,
    templateStartDate,
  ]);

  const handleConfirmConcurrencyWarning = () => {
    if (pendingApplyDates) {
      executeApplyTemplate(
        pendingApplyDates.startDate,
        pendingApplyDates.goalDate,
      );
    }
    setShowConcurrencyWarning(false);
    setShowApplyModal(false);
    setPendingApplyDates(null);
  };

  const focusContext = useMemo(() => {
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REFINE) {
      return {
        title: "Refine Plan",
        description:
          "Your plan is ready. Open edit to adjust constraints, targets, and plan details.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.EDIT) {
      return {
        title: "Edit Plan Structure",
        description:
          "Tune weekly targets and constraints in edit mode before your next scheduling cycle.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.MANAGE) {
      return {
        title: "Manage Plan",
        description:
          "Review status, activation, and defaults in edit so the execution tab stays focused.",
        ctaLabel: "Manage Plan",
        onPress: handleOpenSettings,
      };
    }
    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REVIEW_ACTIVITY &&
      typeof activityId === "string"
    ) {
      return {
        title: "Review Planned Activity",
        description:
          "Open the linked activity to inspect details and make focused adjustments.",
        ctaLabel: "Open Activity",
        onPress: handleOpenActivity,
      };
    }
    return null;
  }, [
    activityId,
    handleEditStructure,
    handleOpenActivity,
    handleOpenSettings,
    normalizedNextStepIntent,
  ]);

  React.useEffect(() => {
    if (!loadingPlan && !plan && !id) {
      router.replace(ROUTES.PLAN.TRAINING_PLAN.CREATE as any);
    }
  }, [id, loadingPlan, plan, router]);

  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading training plan...
        </Text>
      </View>
    );
  }

  if (snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
        <Text className="text-muted-foreground text-center">
          Unable to load training plan right now.
        </Text>
        <TouchableOpacity
          onPress={() => void snapshot.refetch()}
          className="px-4 py-2 rounded-full border border-border bg-card"
          activeOpacity={0.8}
        >
          <Text className="text-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!plan) {
    if (!id) {
      return (
        <View className="flex-1 bg-background items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">
            Opening plan creation...
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="flex-1 p-6 gap-6">
          <Card className="mt-8">
            <CardContent className="p-8">
              <View className="items-center">
                <View className="bg-primary/10 rounded-full p-6 mb-6">
                  <Icon as={Activity} size={64} className="text-primary" />
                </View>
                <Text className="text-2xl font-bold mb-3 text-center">
                  No Training Plan
                </Text>
                <Text className="text-base text-muted-foreground text-center mb-6">
                  A training plan helps you build fitness systematically, track
                  your progress, and prevent overtraining through structured
                  activities and recovery.
                </Text>
                <View className="w-full gap-3">
                  <Button size="lg" onPress={handleCreatePlan}>
                    <Text className="text-primary-foreground font-semibold">
                      Create Training Plan
                    </Text>
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>

          <View className="gap-4 mt-4">
            <Text className="text-lg font-semibold">
              Benefits of a Training Plan:
            </Text>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={TrendingUp} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Track Your Fitness</Text>
                <Text className="text-sm text-muted-foreground">
                  Monitor CTL, ATL, and TSB to understand your fitness trends
                  and form.
                </Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Calendar} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">
                  Structured Scheduling
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Weekly TSS targets and constraint validation ensure balanced
                  training.
                </Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Activity} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Prevent Overtraining</Text>
                <Text className="text-sm text-muted-foreground">
                  Recovery rules and intensity distribution keep you healthy and
                  improving.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  const isOwnedByUser = plan.profile_id === profile?.id;

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View className="flex-1 p-4 gap-4">
        <View className="mb-4">
          {focusContext && (
            <Card className="border-primary/40 bg-primary/5 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm text-primary font-semibold">
                  {focusContext.title}
                </Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  {focusContext.description}
                </Text>
                <TouchableOpacity
                  onPress={focusContext.onPress}
                  className="self-start mt-2 px-3 py-1.5 rounded-full bg-primary"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-primary-foreground">
                    {focusContext.ctaLabel}
                  </Text>
                </TouchableOpacity>
              </CardContent>
            </Card>
          )}

          <TrainingPlanSummaryHeader
            title={plan.name}
            description={plan.description || undefined}
            isActive={false}
            inactiveLabel="Template"
            createdAt={plan.created_at}
            showStatusDot={false}
            formatStartedDate={(date) =>
              date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
            rightAccessory={
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleToggleLike}
                  className="flex-row items-center bg-primary/10 rounded-full px-3 py-2 gap-1"
                >
                  <Icon
                    as={Heart}
                    size={18}
                    className={
                      isLiked ? "text-red-500 fill-red-500" : "text-primary"
                    }
                  />
                  {likesCount > 0 && (
                    <Text className="text-sm font-medium text-primary">
                      {likesCount}
                    </Text>
                  )}
                </Pressable>
                {isOwnedByUser && (
                  <TouchableOpacity
                    onPress={handleOpenSettings}
                    className="ml-1"
                  >
                    <View className="bg-primary/10 rounded-full p-2">
                      <Icon
                        as={ChevronRight}
                        size={24}
                        className="text-primary"
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            }
          />

          <Card className="mt-3">
            <CardContent className="p-3 gap-3">
              <View className="gap-1">
                <Text className="text-sm font-semibold">Template Actions</Text>
                <Text className="text-xs text-muted-foreground">
                  Save this plan for quick reuse, or apply it to create a new
                  scheduled copy.
                </Text>
                {!isOwnedByUser ? (
                  <Text className="text-xs text-muted-foreground">
                    This is a shared template. Applying creates your own private
                    plan copy.
                  </Text>
                ) : null}
              </View>

              {isOwnedByUser && (
                <View className="flex-row items-center justify-between bg-muted/30 rounded-lg p-3">
                  <View className="flex-row items-center gap-2">
                    <Icon
                      as={isPublic ? Eye : EyeOff}
                      size={18}
                      className="text-muted-foreground"
                    />
                    <View>
                      <Text className="text-sm font-medium">
                        {isPublic ? "Public" : "Private"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {isPublic
                          ? "Anyone can find and use this template"
                          : "Only you can see this template"}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={handleTogglePrivacy}
                    disabled={updateVisibilityMutation.isPending}
                  />
                </View>
              )}

              <Button
                variant="outline"
                onPress={handleSaveToLibrary}
                disabled={saveToLibraryMutation.isPending}
                className="flex-row items-center justify-center gap-2"
              >
                <Icon as={Library} size={16} className="text-foreground" />
                <Text className="text-foreground font-medium">
                  {saveToLibraryMutation.isPending
                    ? "Saving..."
                    : "Save to Library"}
                </Text>
              </Button>

              <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <Text className="text-primary-foreground font-semibold">
                      Apply Template
                    </Text>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Apply Training Plan</DialogTitle>
                    <DialogDescription>
                      Configure when you want to start this plan and set an
                      optional target date.
                    </DialogDescription>
                  </DialogHeader>
                  <View className="gap-4 py-4">
                    <View className="gap-2">
                      <Text className="text-sm font-medium">Start Date</Text>
                      <Input
                        value={templateStartDate}
                        onChangeText={setTemplateStartDate}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                      />
                    </View>
                    <View className="gap-2">
                      <Text className="text-sm font-medium">
                        Target Date (Optional)
                      </Text>
                      <Input
                        value={templateGoalDate}
                        onChangeText={setTemplateGoalDate}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">
                        <Text className="text-foreground font-medium">
                          Cancel
                        </Text>
                      </Button>
                    </DialogClose>
                    <Button
                      onPress={handleApplyTemplate}
                      disabled={applyTemplateMutation.isPending}
                    >
                      <Text className="text-primary-foreground font-semibold">
                        {applyTemplateMutation.isPending
                          ? "Applying..."
                          : "Apply"}
                      </Text>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardContent className="p-3 gap-3">
              <View className="flex-row items-center gap-2">
                <Icon as={MessageCircle} size={18} className="text-primary" />
                <Text className="text-sm font-semibold">
                  Comments ({commentsData?.comments?.length ?? 0})
                </Text>
              </View>

              {commentsData?.comments && commentsData.comments.length > 0 ? (
                <View className="gap-2">
                  {commentsData.comments.map((comment: any) => (
                    <View
                      key={comment.id}
                      className="bg-muted/30 rounded-lg p-2"
                    >
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-xs font-semibold">
                          {comment.profile?.username || "User"}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text className="text-sm">{comment.content}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-xs text-muted-foreground">
                  No comments yet. Be the first to comment!
                </Text>
              )}

              <View className="flex-row items-center gap-2 mt-2">
                <TextInput
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Add a comment..."
                  className="flex-1 bg-muted/30 rounded-lg px-3 py-2 text-sm"
                  placeholderTextColor="muted-foreground"
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="bg-primary rounded-full p-2"
                >
                  <Icon
                    as={Send}
                    size={18}
                    className="text-primary-foreground"
                  />
                </TouchableOpacity>
              </View>
            </CardContent>
          </Card>
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Training Plan Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {plan.structure && (
                <>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Weekly TSS Target
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_weekly_tss_min} -{" "}
                      {(plan.structure as any).target_weekly_tss_max}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Activities per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_activities_per_week}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Max Consecutive Days
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).max_consecutive_days}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Min Rest Days per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).min_rest_days_per_week}
                    </Text>
                  </View>
                  {(plan.structure as any).periodization_template && (
                    <>
                      <View className="h-px bg-border" />
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Periodization
                        </Text>
                        <Text className="font-semibold">
                          {
                            (plan.structure as any).periodization_template
                              .starting_ctl
                          }{" "}
                          →{" "}
                          {
                            (plan.structure as any).periodization_template
                              .target_ctl
                          }{" "}
                          CTL
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Target Date
                        </Text>
                        <Text className="font-semibold">
                          {new Date(
                            (plan.structure as any).periodization_template
                              .target_date,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                    </>
                  )}
                  {isOwnedByUser && (
                    <>
                      <View className="h-px bg-border" />
                      <TouchableOpacity
                        onPress={handleEditStructure}
                        className="pt-1"
                      >
                        <Text className="text-sm font-semibold text-primary">
                          Edit structure in composer
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>
          </CardContent>
        </Card>

        {isOwnedByUser && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">
                  Deleting this training plan will permanently remove its
                  structure and all associated planned activities.
                </Text>
                <Button
                  variant="destructive"
                  onPress={handleDeletePlan}
                  disabled={deletePlanMutation.isPending}
                >
                  <Icon as={Trash2} size={18} className="text-white mr-2" />
                  <Text className="text-white font-semibold">
                    {deletePlanMutation.isPending
                      ? "Deleting..."
                      : "Delete Training Plan"}
                  </Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}
      </View>

      <Dialog
        open={showConcurrencyWarning}
        onOpenChange={setShowConcurrencyWarning}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Plan Exists</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            You already have an active training plan. Applying this plan will
            set it as your new active plan and pause the current one.
          </DialogDescription>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button
                variant="outline"
                onPress={() => setPendingApplyDates(null)}
              >
                <Text className="text-foreground font-medium">Cancel</Text>
              </Button>
            </DialogClose>
            <Button
              onPress={handleConfirmConcurrencyWarning}
              disabled={applyTemplateMutation.isPending}
            >
              <Text className="text-primary-foreground font-semibold">
                {applyTemplateMutation.isPending ? "Applying..." : "Apply"}
              </Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollView>
  );
}
