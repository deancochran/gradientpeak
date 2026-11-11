import type { AppRouter } from "@repo/api/client";
import { invalidateTrainingPlanQueries } from "@repo/api/react";
import { type ContentVisibility, formatDateOnlyInTimeZone } from "@repo/core";
import type { inferRouterInputs } from "@trpc/server";
import { randomUUID } from "expo-crypto";
import type { ImperativeRouter } from "expo-router";
import { Alert, Share } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { getPublicShareUrl } from "@/lib/share/public-share-url";

type TrainingPlanCommitRequest = Extract<
  inferRouterInputs<AppRouter>["trainingPlans"]["commit"],
  { kind: "duplicate" }
>;

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

  const contentVisibility = resolvePlanVisibility(plan);

  const [isLiked, setIsLiked] = React.useState(plan?.has_liked ?? false);
  const [likesCount, setLikesCount] = React.useState(plan?.likes_count ?? 0);
  const likePendingRef = React.useRef(false);
  React.useEffect(() => {
    setIsLiked(plan?.has_liked ?? false);
    setLikesCount(plan?.likes_count ?? 0);
  }, [plan?.has_liked, plan?.likes_count]);

  const commitPlanMutation = api.trainingPlans.commit.useMutation();
  const retainedCommitRequestRef = React.useRef<TrainingPlanCommitRequest | null>(null);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
    },
  });

  const handleShare = async () => {
    if (!plan?.id) return;
    if (contentVisibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public training plans have a share link. Use Edit plan to set visibility to Public.",
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
      const retainedCommitRequest = retainedCommitRequestRef.current;
      if (retainedCommitRequest) {
        const result = await commitPlanMutation.mutateAsync(retainedCommitRequest);
        if (result.status === "operation_conflict") {
          retainedCommitRequestRef.current = null;
          throw new Error("This duplicate conflicts with another operation. Review and retry.");
        }
        if (result.status !== "saved") {
          retainedCommitRequestRef.current = null;
          throw new Error("The plan or athlete state changed. Refresh and retry.");
        }
        retainedCommitRequestRef.current = null;
        await invalidateTrainingPlanQueries(utils);
        Alert.alert("Duplicated", "Training plan added to your plans.", [
          {
            text: "Open",
            onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.planId)),
          },
        ]);
        return;
      }
      const profile = await utils.profiles.get.fetch();
      if (!profile?.id) throw new Error("Refresh your profile before duplicating.");
      const draft = {
        sourcePlanId: plan.id,
        name: `${plan.name} (Copy)`,
        previewStartDate: formatDateOnlyInTimeZone(new Date(), profile.planning_timezone ?? "UTC"),
      };
      const preview = await utils.trainingPlans.preview.fetch({ kind: "duplicate", draft });
      if (preview.status !== "available") throw new Error("Refresh the plan before duplicating.");
      const commitRequest = {
        kind: "duplicate",
        operationId: randomUUID(),
        basePublishedRevision: preview.basePublishedRevision,
        previewFingerprint: preview.previewFingerprint,
        draft,
      } satisfies TrainingPlanCommitRequest;
      retainedCommitRequestRef.current = commitRequest;
      const result = await commitPlanMutation.mutateAsync(commitRequest);
      if (result.status === "operation_conflict") {
        retainedCommitRequestRef.current = null;
        throw new Error("This duplicate conflicts with another operation. Review and retry.");
      }
      if (result.status !== "saved") {
        retainedCommitRequestRef.current = null;
        throw new Error("The plan or athlete state changed. Refresh and retry.");
      }
      retainedCommitRequestRef.current = null;
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
    handleShare,
    handleToggleLike,
    isLiked,
    likesCount,
  };
}
