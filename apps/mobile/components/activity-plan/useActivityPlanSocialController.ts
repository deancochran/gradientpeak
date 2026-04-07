import { skipToken } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";

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
  const [newComment, setNewComment] = React.useState("");

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(initialHasLiked ?? false);
      setLikesCount(initialLikesCount ?? 0);
    },
  });

  const { data: commentsData, refetch: refetchComments } = api.social.getComments.useQuery(
    isCommentEntityIdValid ? { entity_id: actualPlanId, entity_type: "activity_plan" } : skipToken,
  );

  const addCommentMutation = api.social.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      refetchComments();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to add comment: ${error.message}`);
    },
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

  const handleAddComment = () => {
    if (!actualPlanId || !isValidUuid(actualPlanId) || !newComment.trim()) {
      return;
    }

    addCommentMutation.mutate({
      entity_id: actualPlanId,
      entity_type: "activity_plan",
      content: newComment.trim(),
    });
  };

  return {
    comments: commentsData?.comments ?? [],
    commentCount: commentsData?.total ?? 0,
    handleAddComment,
    handleToggleLike,
    isLiked,
    likesCount,
    newComment,
    setNewComment,
    addCommentPending: addCommentMutation.isPending,
  };
}
