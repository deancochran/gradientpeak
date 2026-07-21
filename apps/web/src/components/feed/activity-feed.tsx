import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { api } from "../../lib/api/client";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Duration unavailable";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export function ActivityFeed() {
  const feedQuery = api.feed.getFeed.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
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
            <Card key={activity.id} data-testid={`feed-activity-${activity.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      @{activity.profile.username ?? "athlete"}
                    </p>
                    <CardTitle className="mt-1 text-lg">{activity.name}</CardTitle>
                  </div>
                  <Badge variant="secondary">
                    {activity.activity_kind === "multisport"
                      ? "Multisport"
                      : (activity.type ?? "Activity")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{new Date(activity.started_at).toLocaleDateString()}</span>
                  <span>{formatDuration(activity.duration_seconds)}</span>
                  <span>{(activity.distance_meters / 1000).toFixed(1)} km</span>
                  <span>{activity.likes_count} likes</span>
                  <span>{activity.comments_count} comments</span>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/activities/$activityId" params={{ activityId: activity.id }}>
                    View activity
                  </Link>
                </Button>
              </CardContent>
            </Card>
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
