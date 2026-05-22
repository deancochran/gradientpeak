import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type ResourceLikeEntityType = "activity" | "activity_plan" | "route" | "training_plan";

type UseResourceLikeOptions = {
  entityId: string;
  entityType: ResourceLikeEntityType;
  initialCount?: number | null;
  initialLiked?: boolean | null;
  onToggle?: (liked: boolean) => void;
};

export function useResourceLike({
  entityId,
  entityType,
  initialCount = 0,
  initialLiked = false,
  onToggle,
}: UseResourceLikeOptions) {
  const resolvedInitialCount = initialCount ?? 0;
  const resolvedInitialLiked = Boolean(initialLiked);
  const [isLiked, setIsLiked] = useState(resolvedInitialLiked);
  const [likeCount, setLikeCount] = useState(resolvedInitialCount);

  useEffect(() => {
    setIsLiked(resolvedInitialLiked);
    setLikeCount(resolvedInitialCount);
  }, [resolvedInitialCount, resolvedInitialLiked]);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(resolvedInitialLiked);
      setLikeCount(resolvedInitialCount);
    },
    onSuccess: (data) => {
      setIsLiked(data.liked);
      onToggle?.(data.liked);
    },
  });

  const toggleLike = useCallback(() => {
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikeCount((currentCount) => (nextLiked ? currentCount + 1 : Math.max(currentCount - 1, 0)));
    toggleLikeMutation.mutate({
      entity_id: entityId,
      entity_type: entityType,
    });
  }, [entityId, entityType, isLiked, toggleLikeMutation]);

  return {
    isLiked,
    isPending: toggleLikeMutation.isPending,
    likeCount,
    toggleLike,
  };
}
