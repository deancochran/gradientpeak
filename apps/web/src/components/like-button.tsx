"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

interface LikeButtonProps {
  entityId: string;
  entityType: "activity" | "training_plan" | "activity_plan";
  initialLikesCount?: number;
  initialHasLiked?: boolean;
}

export function LikeButton({
  entityId,
  entityType,
  initialLikesCount = 0,
  initialHasLiked = false,
}: LikeButtonProps) {
  const [likesCount, setLikesCount] = useState(initialLikesCount);
  const [hasLiked, setHasLiked] = useState(initialHasLiked);

  const toggleMutation = api.social.toggleLike.useMutation({
    onMutate: async () => {
      // Optimistic update
      setHasLiked(!hasLiked);
      setLikesCount(hasLiked ? Math.max(0, likesCount - 1) : likesCount + 1);
    },
    onError: (err) => {
      // Revert on error
      setHasLiked(hasLiked);
      setLikesCount(likesCount);
      toast.error("Failed to update like status");
    },
    onSuccess: (data) => {
      setHasLiked(data.liked);
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex items-center gap-1.5 px-2 hover:bg-transparent"
      onClick={() => toggleMutation.mutate({ entity_id: entityId, entity_type: entityType })}
      disabled={toggleMutation.isPending}
    >
      <Heart
        className={cn(
          "h-5 w-5 transition-colors",
          hasLiked ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-foreground",
        )}
      />
      <span
        className={cn("text-sm", hasLiked ? "text-red-500 font-medium" : "text-muted-foreground")}
      >
        {likesCount}
      </span>
    </Button>
  );
}
