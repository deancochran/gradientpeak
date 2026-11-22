import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { api } from "../../lib/api/client";
import { ActivityListCard } from "../protected/activity-route-primitives";

export function ActivityFeed() {
  const navigate = useNavigate();
  const feedQuery = api.feed.getFeed.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, retry: false },
  );
  const activities = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (feedQuery.isLoading) {
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        Loading activity feed...
      </p>
    );
  }

  if (feedQuery.isError && activities.length === 0) {
    return (
      <Card role="alert">
        <CardContent className="space-y-4 py-8 text-center">
          <p>We could not load your activity feed.</p>
          <Button type="button" onClick={() => void feedQuery.refetch()}>
            Retry feed
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="activity-feed-title" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="activity-feed-title" className="text-2xl font-semibold">
            Activity feed
          </h2>
          <p className="text-sm text-muted-foreground">
            Recent activities shared by you and athletes you follow.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={feedQuery.isRefetching}
          onClick={() => void feedQuery.refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {feedQuery.isRefetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No activities are in your feed yet. Follow athletes or record an activity to get
            started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} data-testid={`feed-activity-${activity.id}`}>
              <ActivityListCard
                activity={activity}
                onOpen={() =>
                  void navigate({
                    to: "/activities/$activityId",
                    params: { activityId: activity.id },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      {feedQuery.isError && activities.length > 0 ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-destructive/40 p-3 text-sm"
        >
          <span>More activities could not be loaded.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void feedQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {feedQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={feedQuery.isFetchingNextPage}
            onClick={() => void feedQuery.fetchNextPage()}
          >
            {feedQuery.isFetchingNextPage ? "Loading more..." : "Load more activities"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
