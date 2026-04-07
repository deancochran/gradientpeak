"use client";

import { invalidateRelationshipQueries } from "@repo/api/react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Loader2, Lock, UserMinus, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { api } from "@/lib/api/client";

type FollowingProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

export default function FollowingPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { user } = useAuth();
  const utils = api.useUtils();

  const [page, setPage] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Record<number, FollowingProfile[]>>({});
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  const {
    data: followingData,
    isLoading,
    isFetching,
  } = api.social.getFollowing.useQuery(
    { user_id: userId, limit, offset: page * limit },
    { enabled: !!userId },
  );

  useEffect(() => {
    setPage(0);
    setLoadedPages({});
    setTotal(0);
    setHasMore(false);
  }, [userId]);

  useEffect(() => {
    if (!followingData) {
      return;
    }

    setLoadedPages((prev) => ({
      ...prev,
      [page]: followingData.users,
    }));
    setTotal(followingData.total);
    setHasMore(followingData.hasMore);
  }, [followingData, page]);

  const unfollowMutation = api.social.unfollowUser.useMutation({
    onSuccess: async (_data, variables) => {
      setLoadedPages((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([pageIndex, users]) => [
            pageIndex,
            users.filter((profile) => profile.id !== variables.target_user_id),
          ]),
        ),
      );
      setTotal((currentTotal) => Math.max(currentTotal - 1, 0));
      await invalidateRelationshipQueries(utils, [userId, user?.id, variables.target_user_id]);
      toast.success("Unfollowed user");
    },
    onError: (err) => toast.error(err.message),
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

  const handleUserClick = (profileUserId: string) => {
    router.push(`/user/${profileUserId}`);
  };

  const handleUnfollow = (profileUserId: string) => {
    unfollowMutation.mutate({ target_user_id: profileUserId });
  };

  const handleLoadMore = () => {
    if (hasMore && !isFetching) {
      setPage((prev) => prev + 1);
    }
  };

  if (!userId) {
    return (
      <div className="container py-8 max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-semibold mb-2">Invalid user</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading && users.length === 0) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">{total} following</h1>
            <Button variant="ghost" onClick={() => router.back()}>
              Back
            </Button>
          </div>

          {users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Not following anyone yet</p>
          ) : (
            <div className="space-y-4">
              {users.map((profile: FollowingProfile) => {
                const isCurrentUser = user?.id === profile.id;

                return (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <button
                      className="flex items-center gap-3 flex-1"
                      onClick={() => handleUserClick(profile.id)}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={profile.avatar_url || ""}
                          alt={profile.username || "User"}
                        />
                        <AvatarFallback>
                          <UserRound className="h-6 w-6" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <div className="font-medium">{profile.username || "Unknown user"}</div>
                        {profile.is_public === false && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            Private
                          </div>
                        )}
                      </div>
                    </button>

                    {!isCurrentUser && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnfollow(profile.id)}
                        disabled={unfollowMutation.isPending}
                      >
                        <UserMinus className="mr-2 h-4 w-4" />
                        Following
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={handleLoadMore} disabled={isFetching}>
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
