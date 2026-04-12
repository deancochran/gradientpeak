import { invalidateRelationshipQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RelationshipList } from "../../../../components/protected/relationship-list";
import { useAuth } from "../../../../components/providers/auth-provider";
import { api } from "../../../../lib/api/client";

type FollowerProfile = {
  avatar_url: string | null;
  follow_status?: string | null;
  id: string;
  is_public: boolean | null;
  username: string | null;
};

export const Route = createFileRoute("/_protected/user/$userId/followers")({
  component: FollowersPage,
});

function FollowersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userId } = Route.useParams();
  const utils = api.useUtils();
  const [page, setPage] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Record<number, FollowerProfile[]>>({});
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;
  const followersQuery = api.social.getFollowers.useQuery(
    { user_id: userId, limit, offset: page * limit },
    { enabled: Boolean(userId) },
  );

  useEffect(() => {
    setPage(0);
    setLoadedPages({});
    setTotal(0);
    setHasMore(false);
  }, [userId]);

  useEffect(() => {
    if (!followersQuery.data) {
      return;
    }

    setLoadedPages((previous) => ({
      ...previous,
      [page]: followersQuery.data.users,
    }));
    setTotal(followersQuery.data.total);
    setHasMore(followersQuery.data.hasMore);
  }, [followersQuery.data, page]);

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

    return Object.keys(loadedPages)
      .map(Number)
      .sort((left, right) => left - right)
      .flatMap((pageIndex) => loadedPages[pageIndex] ?? [])
      .filter((profile) => {
        if (seenUserIds.has(profile.id)) {
          return false;
        }

        seenUserIds.add(profile.id);
        return true;
      });
  }, [loadedPages]);

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => navigate({ to: "/user/$userId", params: { userId } })}>
          Back
        </Button>
      </div>

      <RelationshipList
        title="{count} followers"
        total={total}
        emptyMessage="No followers yet"
        users={users}
        isLoading={followersQuery.isLoading}
        isFetching={followersQuery.isFetching}
        hasMore={hasMore}
        onLoadMore={() => {
          if (hasMore && !followersQuery.isFetching) {
            setPage((currentPage) => currentPage + 1);
          }
        }}
        onOpenProfile={(profileUserId) => navigate({ to: "/user/$userId", params: { userId: profileUserId } })}
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
          );
        }}
      />
    </div>
  );
}
