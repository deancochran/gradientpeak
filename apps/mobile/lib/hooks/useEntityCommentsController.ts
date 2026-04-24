import { skipToken } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";

export type SocialCommentEntityType =
  | "activity"
  | "training_plan"
  | "activity_plan"
  | "route"
  | "event";

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

interface UseEntityCommentsControllerParams {
  entityId?: string;
  entityType: SocialCommentEntityType;
}

export function useEntityCommentsController({
  entityId,
  entityType,
}: UseEntityCommentsControllerParams) {
  const React = require("react") as typeof import("react");
  const actualEntityId = entityId?.trim() ?? "";
  const canQueryComments = isValidUuid(actualEntityId);
  const [newComment, setNewComment] = React.useState("");

  const commentsQuery = api.social.getComments.useInfiniteQuery(
    canQueryComments
      ? {
          entity_id: actualEntityId,
          entity_type: entityType,
          limit: 25,
        }
      : skipToken,
    {
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const addCommentMutation = api.social.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      void commentsQuery.refetch();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to add comment: ${error.message}`);
    },
  });

  const handleAddComment = () => {
    if (!canQueryComments || !newComment.trim()) {
      return;
    }

    addCommentMutation.mutate({
      entity_id: actualEntityId,
      entity_type: entityType,
      content: newComment.trim(),
    });
  };

  return {
    addCommentPending: addCommentMutation.isPending,
    commentCount: commentsQuery.data?.pages[0]?.total ?? 0,
    comments: commentsQuery.data?.pages.flatMap((page: any) => page.comments) ?? [],
    handleAddComment,
    hasMoreComments: commentsQuery.hasNextPage ?? false,
    isLoadingMoreComments: commentsQuery.isFetchingNextPage,
    loadMoreComments: () => {
      if (commentsQuery.hasNextPage && !commentsQuery.isFetchingNextPage) {
        void commentsQuery.fetchNextPage();
      }
    },
    newComment,
    setNewComment,
  };
}
