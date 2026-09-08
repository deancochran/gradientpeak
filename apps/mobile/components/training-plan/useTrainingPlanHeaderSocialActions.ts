import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { type ContentVisibility, formatDateOnlyInTimeZone } from "@repo/core";
import { trainingPlanSchema } from "@repo/core/schemas";
import type { ImperativeRouter } from "expo-router";
import { Alert, Share } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { getPublicShareUrl } from "@/lib/share/public-share-url";

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
  router: Pick<ImperativeRouter, "replace">;
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
  const [visibilityPending, setVisibilityPending] = React.useState(false);
  const visibilityPendingRef = React.useRef(false);
  React.useEffect(() => {
    if (!visibilityPendingRef.current) {
      setContentVisibility(resolvePlanVisibility(plan));
    }
  }, [plan?.content_visibility]);

  const [isLiked, setIsLiked] = React.useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = React.useState(plan?.likes_count ?? 0);
  const likePendingRef = React.useRef(false);
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
    if (!plan || visibilityPendingRef.current) return;
    const commitVisibility = async (visibility: ContentVisibility) => {
      if (visibilityPendingRef.current) return;
      visibilityPendingRef.current = true;
      setVisibilityPending(true);
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
        setContentVisibility(visibility);
      } catch (error) {
        setContentVisibility(resolvePlanVisibility(plan));
        Alert.alert(
          "Update Failed",
          error instanceof Error ? error.message : "Failed to update visibility",
        );
      } finally {
        visibilityPendingRef.current = false;
        setVisibilityPending(false);
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

  const handleShare = async () => {
    if (!plan?.id) return;
    if (visibilityPendingRef.current) {
      Alert.alert(
        "Updating visibility",
        "Wait for the visibility update to finish before sharing.",
      );
      return;
    }
    if (contentVisibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public training plans have a share link. Change visibility to Public first.",
      );
      return;
    }
    const url = getPublicShareUrl(`/share/training-plans/${plan.id}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Share failed", "Could not open the share sheet. Please try again.");
    }
  };

  const handleToggleLike = async () => {
    if (likePendingRef.current || toggleLikeMutation.isPending) return;
    if (!plan?.id) return;
    if (!isValidUuid(plan.id)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    likePendingRef.current = true;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    try {
      await toggleLikeMutation.mutateAsync({ entity_id: plan.id, entity_type: "training_plan" });
    } catch {
      // The mutation callback restores the optimistic state with the server projection.
    } finally {
      likePendingRef.current = false;
    }
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
    visibilityPending,
  };
}
