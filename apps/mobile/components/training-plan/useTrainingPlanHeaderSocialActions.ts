import { invalidateTrainingPlanQueries } from "@repo/api/react";
import type { ContentVisibility } from "@repo/core";
import { Alert, Share } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

const VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  private: "Private",
  followers: "Followers",
  public: "Public",
};

function resolvePlanVisibility(
  plan: {
    content_visibility?: string | null;
    template_visibility?: string | null;
  } | null,
): ContentVisibility {
  const visibility = plan?.content_visibility ?? plan?.template_visibility;
  return visibility === "public" || visibility === "followers" || visibility === "private"
    ? visibility
    : "private";
}

function getPublicShareUrl(path: string) {
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? "https://gradientpeak.app").replace(/\/$/, "");
  return `${origin}${path}`;
}

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

interface UseTrainingPlanHeaderSocialActionsParams {
  plan: {
    id: string;
    name?: string;
    structure_hash: string;
    content_visibility?: string | null;
    template_visibility?: string | null;
    has_liked?: boolean;
    likes_count?: number;
  } | null;
  router: { replace: (value: any) => void };
  utils: ReturnType<typeof api.useUtils>;
}

export function useTrainingPlanHeaderSocialActions({
  plan,
  router,
  utils,
}: UseTrainingPlanHeaderSocialActionsParams) {
  const React = require("react") as typeof import("react");

  const [contentVisibility, setContentVisibility] = React.useState<ContentVisibility>(
    resolvePlanVisibility(plan),
  );
  React.useEffect(() => {
    setContentVisibility(resolvePlanVisibility(plan));
  }, [plan?.content_visibility, plan?.template_visibility]);

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
    onError: async (error) => {
      if (error.data?.code === "CONFLICT") await invalidateTrainingPlanQueries(utils);
      setContentVisibility(resolvePlanVisibility(plan));
      Alert.alert("Update Failed", error.message || "Failed to update visibility");
    },
  });

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleChangeVisibility = () => {
    if (!plan) return;
    Alert.alert(
      "Change visibility",
      `Current visibility is ${VISIBILITY_LABELS[contentVisibility]}.`,
      [
        {
          text: "Private",
          onPress: () => {
            setContentVisibility("private");
            updateVisibilityMutation.mutate({
              id: plan.id,
              expectedStructureHash: plan.structure_hash,
              template_visibility: "private",
            });
          },
        },
        {
          text: "Followers",
          onPress: () => {
            setContentVisibility("followers");
            updateVisibilityMutation.mutate({
              id: plan.id,
              expectedStructureHash: plan.structure_hash,
              template_visibility: "followers",
            });
          },
        },
        {
          text: "Public",
          onPress: () => {
            setContentVisibility("public");
            updateVisibilityMutation.mutate({
              id: plan.id,
              expectedStructureHash: plan.structure_hash,
              template_visibility: "public",
            });
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleShare = () => {
    if (!plan?.id) return;
    if (contentVisibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public training plans have a share link. Change visibility to Public first.",
      );
      return;
    }
    const url = getPublicShareUrl(`/share/training-plans/${plan.id}`);
    void Share.share({ message: url, url });
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
    contentVisibility,
    handleDuplicate,
    handleChangeVisibility,
    handleShare,
    handleToggleLike,
    isLiked,
    likesCount,
    visibilityPending: updateVisibilityMutation.isPending,
  };
}
