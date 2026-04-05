import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

interface UseTrainingPlanHeaderSocialActionsParams {
  plan: any;
  router: { replace: (value: any) => void };
  utils: ReturnType<typeof api.useUtils>;
}

export function useTrainingPlanHeaderSocialActions({
  plan,
  router,
  utils,
}: UseTrainingPlanHeaderSocialActionsParams) {
  const React = require("react") as typeof import("react");

  const [isPublic, setIsPublic] = React.useState(plan?.template_visibility === "public");
  React.useEffect(() => {
    setIsPublic(plan?.template_visibility === "public");
  }, [plan?.template_visibility]);

  const [isLiked, setIsLiked] = React.useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = React.useState(plan?.likes_count ?? 0);
  React.useEffect(() => {
    setIsLiked(plan?.has_liked ?? false);
    setLikesCount(plan?.likes_count ?? 0);
  }, [plan?.has_liked, plan?.likes_count]);

  const duplicatePlanMutation = api.trainingPlans.duplicate.useMutation({
    onSuccess: async (result: { id: string }) => {
      await invalidateTrainingPlanQueries(utils);
      Alert.alert("Duplicated", "Training plan added to your plans.", [
        {
          text: "Open",
          onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.id) as any),
        },
      ]);
    },
    onError: (error: { message?: string }) => {
      Alert.alert("Duplicate failed", error.message || "Could not duplicate this training plan");
    },
  });

  const updateVisibilityMutation = api.trainingPlans.update.useMutation({
    onSuccess: async () => invalidateTrainingPlanQueries(utils),
    onError: (error) => {
      setIsPublic(plan?.template_visibility === "public");
      Alert.alert("Update Failed", error.message || "Failed to update visibility");
    },
  });

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleTogglePrivacy = () => {
    if (!plan) return;
    const newVisibility = !isPublic;
    setIsPublic(newVisibility);
    updateVisibilityMutation.mutate({
      id: plan.id,
      template_visibility: newVisibility ? "public" : "private",
    });
  };

  const handleToggleLike = () => {
    if (!plan?.id) return;
    if (!isValidUuid(plan.id)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({ entity_id: plan.id, entity_type: "training_plan" });
  };

  const handleDuplicate = () => {
    if (!plan?.id) {
      Alert.alert("Duplicate failed", "No plan ID was found.");
      return;
    }
    duplicatePlanMutation.mutate({
      id: plan.id,
      newName: `${plan.name} (Copy)`,
    });
  };

  return {
    duplicatePending: duplicatePlanMutation.isPending,
    handleDuplicate,
    handleToggleLike,
    handleTogglePrivacy,
    isLiked,
    isPublic,
    likesCount,
    visibilityPending: updateVisibilityMutation.isPending,
  };
}
