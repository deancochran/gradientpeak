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

  const { data: commentsData, refetch: refetchComments } = api.social.getComments.useQuery(
    canQueryComments ? { entity_id: actualEntityId, entity_type: entityType } : skipToken,
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
    commentCount: commentsData?.total ?? 0,
    comments: commentsData?.comments ?? [],
    handleAddComment,
    newComment,
    setNewComment,
  };
}
