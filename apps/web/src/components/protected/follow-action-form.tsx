import { invalidateRelationshipQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useRef, useState } from "react";

import { api } from "../../lib/api/client";
import { contractEpochFormInputProps } from "../../lib/contract-epoch";
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
  const utils = api.useUtils();
  const [isPendingSubmit, setIsPendingSubmit] = useState(false);
  const pendingSubmitRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const action = isFollowing || isPending ? unfollowUserAction : followUserAction;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingSubmitRef.current) return;

    pendingSubmitRef.current = true;
    setIsPendingSubmit(true);
    setSubmitError(null);

    try {
      if (isFollowing || isPending) {
        await unfollowUser({ data: { redirectTo, target_user_id: targetUserId } });
        return;
      }

      await followUser({ data: { redirectTo, target_user_id: targetUserId } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to update follow state");
    } finally {
      pendingSubmitRef.current = false;
      setIsPendingSubmit(false);
      // Server actions change the profile query's relationship status. Refresh the
      // tRPC cache so the control reflects the persisted follow state immediately.
      void invalidateRelationshipQueries(utils, [targetUserId]);
    }
  };

  return (
    <form action={action.url} method="post" onSubmit={handleSubmit}>
      <input {...contractEpochFormInputProps} />
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
            Unfollow
          </>
        ) : isPending ? (
          <>
            <UserMinus className="mr-2 h-4 w-4" />
            Cancel request
          </>
        ) : (
          <>
            <UserPlus className="mr-2 h-4 w-4" />
            Follow
          </>
        )}
      </Button>
      {submitError ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
    </form>
  );
}
