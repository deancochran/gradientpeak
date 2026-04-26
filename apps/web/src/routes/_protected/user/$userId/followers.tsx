import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { FollowActionForm } from "../../../../components/protected/follow-action-form";
import { RelationshipList } from "../../../../components/protected/relationship-list";
import { useAuth } from "../../../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../../../components/route-flash-toast";
import { api } from "../../../../lib/api/client";

type FollowerProfile = {
  avatar_url: string | null;
  follow_status?: string | null;
  id: string;
  is_public: boolean | null;
  username: string | null;
};

export const Route = createFileRoute("/_protected/user/$userId/followers")({
  validateSearch: (search: Record<string, unknown>) => ({
    cursor: typeof search.cursor === "string" ? search.cursor : undefined,
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: FollowersPage,
});

function FollowersPage() {
  const navigate = Route.useNavigate();
  const { cursor, flash, flashType } = Route.useSearch();
  const { user } = useAuth();
  const { userId } = Route.useParams();
  const limit = 20;
  const followersQuery = api.social.getFollowers.useQuery(
    { user_id: userId, limit, cursor },
    { enabled: Boolean(userId) },
  );

  const users = useMemo(() => followersQuery.data?.users ?? [], [followersQuery.data]);

  const total = followersQuery.data?.total ?? 0;
  const hasMore = Boolean(followersQuery.data?.nextCursor);

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/user/$userId/followers",
            params: { userId },
            search: { cursor, flash: undefined, flashType: undefined },
            replace: true,
          })
        }
      />
      <div className="flex justify-end">
        <Button asChild variant="ghost">
          <Link
            to="/user/$userId"
            params={{ userId }}
            search={{ flash: undefined, flashType: undefined }}
          >
            Back
          </Link>
        </Button>
      </div>

      <RelationshipList
        title="{count} followers"
        total={total}
        emptyMessage="No followers yet"
        users={users}
        isLoading={followersQuery.isLoading}
        hasMore={hasMore}
        loadMoreLink={
          followersQuery.data?.nextCursor ? (
            <Button asChild variant="outline">
              <Link
                to="/user/$userId/followers"
                params={{ userId }}
                search={{
                  cursor: followersQuery.data.nextCursor,
                  flash: undefined,
                  flashType: undefined,
                }}
              >
                Load more
              </Link>
            </Button>
          ) : undefined
        }
        getProfileLink={(profileUserId) => ({
          to: "/user/$userId",
          params: { userId: profileUserId },
          search: { flash: undefined, flashType: undefined },
        })}
        action={(profile) => {
          const isCurrentUser = user?.id === profile.id;
          const isFollowing = profile.follow_status === "accepted";
          const isPending = profile.follow_status === "pending";

          if (isCurrentUser) {
            return null;
          }

          const redirectTo = cursor
            ? `/user/${userId}/followers?cursor=${encodeURIComponent(cursor)}`
            : `/user/${userId}/followers`;

          return (
            <FollowActionForm
              isFollowing={isFollowing}
              isPending={isPending}
              redirectTo={redirectTo}
              targetUserId={profile.id}
            />
          );
        }}
      />
    </div>
  );
}
