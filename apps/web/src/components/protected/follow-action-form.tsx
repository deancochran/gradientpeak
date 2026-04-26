import { Button } from "@repo/ui/components/button";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";

import { followUserAction, unfollowUserAction } from "../../lib/social/server-actions";

type FollowActionFormProps = {
  isFollowing: boolean;
  isPending: boolean;
  redirectTo: string;
  targetUserId: string;
};

export function FollowActionForm({
  isFollowing,
  isPending,
  redirectTo,
  targetUserId,
}: FollowActionFormProps) {
  const followUser = useServerFn(followUserAction);
  const unfollowUser = useServerFn(unfollowUserAction);
  const [isPendingSubmit, setIsPendingSubmit] = useState(false);

  const action = isFollowing || isPending ? unfollowUserAction : followUserAction;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    setIsPendingSubmit(true);

    try {
      event.preventDefault();

      if (isFollowing || isPending) {
        await unfollowUser({ data: { redirectTo, target_user_id: targetUserId } });
        return;
      }

      await followUser({ data: { redirectTo, target_user_id: targetUserId } });
    } finally {
      setIsPendingSubmit(false);
    }
  };

  return (
    <form action={action.url} method="post" onSubmit={handleSubmit}>
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Button
        variant={isFollowing ? "outline" : isPending ? "secondary" : "default"}
        size="sm"
        disabled={isPendingSubmit}
        className="w-32"
        type="submit"
      >
        {isFollowing ? (
          <>
            <UserCheck className="mr-2 h-4 w-4" />
            Following
          </>
        ) : isPending ? (
          <>
            <UserMinus className="mr-2 h-4 w-4" />
            Requested
          </>
        ) : (
          <>
            <UserPlus className="mr-2 h-4 w-4" />
            Follow
          </>
        )}
      </Button>
    </form>
  );
}
