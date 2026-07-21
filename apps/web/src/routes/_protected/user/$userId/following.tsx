import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { FollowActionForm } from "../../../../components/protected/follow-action-form";
import { RelationshipList } from "../../../../components/protected/relationship-list";
import { useAuth } from "../../../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../../../components/route-flash-toast";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/user/$userId/following")({
  validateSearch: (search: Record<string, unknown>) => ({
    cursor: typeof search.cursor === "string" ? search.cursor : undefined,
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: FollowingPage,
});

function FollowingPage() {
  const navigate = Route.useNavigate();
  const { cursor, flash, flashType } = Route.useSearch();
  const { user } = useAuth();
  const { userId } = Route.useParams();
  const limit = 20;
  const followingQuery = api.social.getFollowing.useQuery(
    { user_id: userId, limit, cursor },
    { enabled: Boolean(userId) },
  );

  const users = useMemo(() => followingQuery.data?.users ?? [], [followingQuery.data]);

  const total = followingQuery.data?.total ?? 0;
  const hasMore = Boolean(followingQuery.data?.nextCursor);

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/user/$userId/following",
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
        title="{count} following"
        total={total}
        emptyMessage="Not following anyone yet"
        {...(followingQuery.error ? { errorMessage: "Unable to load following" } : {})}
        users={users}
        isLoading={followingQuery.isLoading}
        hasMore={hasMore}
        loadMoreLink={
          followingQuery.data?.nextCursor ? (
            <Button asChild variant="outline">
              <Link
                to="/user/$userId/following"
                params={{ userId }}
                search={{
                  cursor: followingQuery.data.nextCursor,
                  flash: undefined,
                  flashType: undefined,
                }}
              >
                Load more
              </Link>
            </Button>
          ) : undefined
        }
        onRetry={() => void followingQuery.refetch()}
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
            ? `/user/${userId}/following?cursor=${encodeURIComponent(cursor)}`
            : `/user/${userId}/following`;

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
      {cursor ? (
        <div className="text-center">
          <Button asChild variant="ghost">
            <Link
              to="/user/$userId/following"
              params={{ userId }}
              search={{ cursor: undefined, flash: undefined, flashType: undefined }}
            >
              Back to first page
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
