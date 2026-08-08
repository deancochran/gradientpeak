import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { type ContentVisibility, formatDateOnlyInTimeZone } from "@repo/core";
import { trainingPlanSchema } from "@repo/core/schemas";
import type { Router } from "expo-router";
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
  } | null,
): ContentVisibility {
  const visibility = plan?.content_visibility;
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
    description?: string | null;
    structure?: unknown;
    structure_hash: string;
    content_visibility?: string | null;
    has_liked?: boolean;
    likes_count?: number;
    editor?: {
      revision: number;
      structureHash: string;
    } | null;
  } | null;
  router: Pick<Router, "replace">;
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
  }, [plan?.content_visibility]);

  const [isLiked, setIsLiked] = React.useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = React.useState(plan?.likes_count ?? 0);
  React.useEffect(() => {
    setIsLiked(plan?.has_liked ?? false);
    setLikesCount(plan?.likes_count ?? 0);
  }, [plan?.has_liked, plan?.likes_count]);

  const commitPlanMutation = api.trainingPlans.commit.useMutation();

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleChangeVisibility = () => {
    if (!plan) return;
    const commitVisibility = async (visibility: ContentVisibility) => {
      setContentVisibility(visibility);
      try {
        const profile = await utils.profiles.get.fetch();
        const state = await utils.athleteIntelligence.getReadModel.fetch({
          profileId: profile.id,
          sections: { status: true },
        });
        const parsed = trainingPlanSchema.parse(plan.structure);
        if (state.publishedRevision === null || !plan.editor)
          throw new Error("Refresh the plan and athlete state before saving.");
        const { id: _planId, ...structure } = parsed;
        const result = await commitPlanMutation.mutateAsync({
          kind: "update",
          basePublishedRevision: state.publishedRevision,
          draft: {
            planId: plan.id,
            expectedRevision: plan.editor.revision,
            expectedStructureHash: plan.editor.structureHash,
            name: plan.name ?? "Training plan",
            description: plan.description ?? null,
            contentVisibility: visibility,
            structure,
            previewStartDate: formatDateOnlyInTimeZone(
              new Date(),
              profile.planning_timezone ?? "UTC",
            ),
          },
        });
        if (result.status !== "saved") throw new Error("The plan changed. Refresh and retry.");
        await invalidateTrainingPlanQueries(utils);
      } catch (error) {
        setContentVisibility(resolvePlanVisibility(plan));
        Alert.alert(
          "Update Failed",
          error instanceof Error ? error.message : "Failed to update visibility",
        );
      }
    };
    Alert.alert(
      "Change visibility",
      `Current visibility is ${VISIBILITY_LABELS[contentVisibility]}.`,
      [
        {
          text: "Private",
          onPress: () => void commitVisibility("private"),
        },
        {
          text: "Followers",
          onPress: () => void commitVisibility("followers"),
        },
        {
          text: "Public",
          onPress: () => void commitVisibility("public"),
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

  const handleDuplicate = async () => {
    if (!plan?.id) {
      Alert.alert("Duplicate failed", "No plan ID was found.");
      return;
    }
    try {
      const profile = await utils.profiles.get.fetch();
      if (!profile?.id) throw new Error("Refresh your profile before duplicating.");
      const state = await utils.athleteIntelligence.getReadModel.fetch({
        profileId: profile.id,
        sections: { status: true },
      });
      if (state.publishedRevision === null) {
        throw new Error("Refresh athlete state before duplicating this plan.");
      }
      const result = await commitPlanMutation.mutateAsync({
        kind: "duplicate",
        basePublishedRevision: state.publishedRevision,
        draft: {
          sourcePlanId: plan.id,
          name: `${plan.name} (Copy)`,
          previewStartDate: formatDateOnlyInTimeZone(
            new Date(),
            profile.planning_timezone ?? "UTC",
          ),
        },
      });
      if (result.status !== "saved")
        throw new Error("The plan or athlete state changed. Refresh and retry.");
      await invalidateTrainingPlanQueries(utils);
      Alert.alert("Duplicated", "Training plan added to your plans.", [
        {
          text: "Open",
          onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.planId)),
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Duplicate failed",
        error instanceof Error ? error.message : "Could not duplicate",
      );
    }
  };

  return {
    duplicatePending: commitPlanMutation.isPending,
    contentVisibility,
    handleDuplicate,
    handleChangeVisibility,
    handleShare,
    handleToggleLike,
    isLiked,
    likesCount,
    visibilityPending: commitPlanMutation.isPending,
  };
}
