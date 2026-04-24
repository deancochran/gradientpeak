import { invalidateRelationshipQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { RelationshipList } from "../../../../components/protected/relationship-list";
import { useAuth } from "../../../../components/providers/auth-provider";
import { api } from "../../../../lib/api/client";

type FollowingProfile = {
  avatar_url: string | null;
  follow_status?: string | null;
  id: string;
  is_public: boolean | null;
  username: string | null;
};

export const Route = createFileRoute("/_protected/user/$userId/following")({
  component: FollowingPage,
});

function FollowingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userId } = Route.useParams();
  const utils = api.useUtils();
  const limit = 20;
  const followingQuery = api.social.getFollowing.useInfiniteQuery(
    { user_id: userId, limit },
    { enabled: Boolean(userId), getNextPageParam: (lastPage: any) => lastPage.nextCursor },
  );

  const followMutation = api.social.followUser.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateRelationshipQueries(utils, [userId, user?.id, variables.target_user_id]);
      toast.success("Followed user");
    },
    onError: (error) => toast.error(error.message),
  });

  const unfollowMutation = api.social.unfollowUser.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateRelationshipQueries(utils, [userId, user?.id, variables.target_user_id]);
      toast.success("Unfollowed user");
    },
    onError: (error) => toast.error(error.message),
  });

  const users = useMemo(() => {
    const seenUserIds = new Set<string>();

    return (followingQuery.data?.pages.flatMap((page) => page.users) ?? []).filter((profile) => {
      if (seenUserIds.has(profile.id)) {
        return false;
      }

      seenUserIds.add(profile.id);
      return true;
    });
  }, [followingQuery.data]);

  const total = followingQuery.data?.pages[0]?.total ?? 0;
  const hasMore = followingQuery.hasNextPage ?? false;

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/user/$userId", params: { userId } })}
        >
          Back
        </Button>
      </div>

      <RelationshipList
        title="{count} following"
        total={total}
        emptyMessage="Not following anyone yet"
        users={users}
        isLoading={followingQuery.isLoading}
        isFetching={followingQuery.isFetching}
        hasMore={hasMore}
        onLoadMore={() => {
          if (hasMore && !followingQuery.isFetching) {
            void followingQuery.fetchNextPage();
          }
        }}
        onOpenProfile={(profileUserId) =>
          navigate({ to: "/user/$userId", params: { userId: profileUserId } })
        }
        action={(profile) => {
          const isCurrentUser = user?.id === profile.id;
          const isFollowing = profile.follow_status === "accepted";
          const isPending = profile.follow_status === "pending";

          if (isCurrentUser) {
            return null;
          }

          return (
            <Button
              variant={isFollowing ? "outline" : isPending ? "secondary" : "default"}
              size="sm"
              onClick={() => {
                if (isFollowing || isPending) {
                  unfollowMutation.mutate({ target_user_id: profile.id });
                  return;
                }

                followMutation.mutate({ target_user_id: profile.id });
              }}
              disabled={followMutation.isPending || unfollowMutation.isPending}
            >
              {isFollowing ? (
                <>
                  <UserMinus className="mr-2 h-4 w-4" />
                  Following
                </>
              ) : isPending ? (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Requested
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Follow
                </>
              )}
            </Button>
          );
        }}
      />
    </div>
  );
}
