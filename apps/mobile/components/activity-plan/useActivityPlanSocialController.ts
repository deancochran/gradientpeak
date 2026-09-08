import { Alert, Share } from "react-native";
import { api } from "@/lib/api";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { getPublicShareUrl } from "@/lib/share/public-share-url";

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

interface UseActivityPlanSocialControllerParams {
  contentVisibility?: "private" | "followers" | "public" | null;
  initialHasLiked?: boolean;
  initialLikesCount?: number;
  planId?: string;
}

export function useActivityPlanSocialController({
  contentVisibility,
  initialHasLiked,
  initialLikesCount,
  planId,
}: UseActivityPlanSocialControllerParams) {
  const React = require("react") as typeof import("react");
  const actualPlanId = planId?.trim() ?? "";
  const isCommentEntityIdValid = isValidUuid(actualPlanId);

  const [isLiked, setIsLiked] = React.useState(initialHasLiked ?? false);
  const [isLikePending, setIsLikePending] = React.useState(false);
  const [likesCount, setLikesCount] = React.useState(initialLikesCount ?? 0);
  const likePendingRef = React.useRef(false);

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

  const handleToggleLike = async () => {
    if (likePendingRef.current || toggleLikeMutation.isPending) return;
    if (!actualPlanId || !isValidUuid(actualPlanId)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }

    const newLikedState = !isLiked;
    likePendingRef.current = true;
    setIsLikePending(true);
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    try {
      await toggleLikeMutation.mutateAsync({
        entity_id: actualPlanId,
        entity_type: "activity_plan",
      });
    } catch {
      // The mutation callback restores the optimistic state with the server projection.
    } finally {
      likePendingRef.current = false;
      setIsLikePending(false);
    }
  };

  const handleShare = async () => {
    if (!actualPlanId) return;
    if (contentVisibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public activity plans have a share link. Change visibility to Public first.",
      );
      return;
    }

    const url = getPublicShareUrl(`/share/activity-plans/${actualPlanId}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Share failed", "Could not open the share sheet. Please try again.");
    }
  };

  return {
    comments: comments.comments,
    commentsError: comments.commentsError,
    commentCount: comments.commentCount,
    handleAddComment: comments.handleAddComment,
    handleShare,
    handleToggleLike,
    hasMoreComments: comments.hasMoreComments,
    isLoadingComments: comments.isLoadingComments,
    isLoadingMoreComments: comments.isLoadingMoreComments,
    isLiked,
    isLikePending,
    likesCount,
    loadMoreComments: comments.loadMoreComments,
    newComment: comments.newComment,
    setNewComment: comments.setNewComment,
    addCommentPending: comments.addCommentPending,
  };
}
