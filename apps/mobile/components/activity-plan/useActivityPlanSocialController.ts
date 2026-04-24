import { skipToken } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

interface UseActivityPlanSocialControllerParams {
  initialHasLiked?: boolean;
  initialLikesCount?: number;
  planId?: string;
}

export function useActivityPlanSocialController({
  initialHasLiked,
  initialLikesCount,
  planId,
}: UseActivityPlanSocialControllerParams) {
  const React = require("react") as typeof import("react");
  const actualPlanId = planId?.trim() ?? "";
  const isCommentEntityIdValid = isValidUuid(actualPlanId);

  const [isLiked, setIsLiked] = React.useState(initialHasLiked ?? false);
  const [likesCount, setLikesCount] = React.useState(initialLikesCount ?? 0);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(initialHasLiked ?? false);
      setLikesCount(initialLikesCount ?? 0);
    },
  });

  const comments = useEntityCommentsController({
    entityId: isCommentEntityIdValid ? actualPlanId : undefined,
    entityType: "activity_plan",
  });

  React.useEffect(() => {
    setIsLiked(initialHasLiked ?? false);
    setLikesCount(initialLikesCount ?? 0);
  }, [initialHasLiked, initialLikesCount]);

  const handleToggleLike = () => {
    if (!actualPlanId || !isValidUuid(actualPlanId)) {
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

  return {
    comments: comments.comments,
    commentCount: comments.commentCount,
    handleAddComment: comments.handleAddComment,
    handleToggleLike,
    hasMoreComments: comments.hasMoreComments,
    isLoadingMoreComments: comments.isLoadingMoreComments,
    isLiked,
    likesCount,
    loadMoreComments: comments.loadMoreComments,
    newComment: comments.newComment,
    setNewComment: comments.setNewComment,
    addCommentPending: comments.addCommentPending,
  };
}
