import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Import } from "lucide-react";
import {
  ActivityListCard,
  DetailPageIntro,
} from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/activities/")({
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const navigate = Route.useNavigate();
  const activitiesQuery = api.activities.listPaginated.useInfiniteQuery(
    {
      limit: 20,
      sort_by: "date",
      sort_order: "desc",
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const activities = activitiesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = activitiesQuery.data?.pages[0]?.total ?? 0;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => void navigate({ to: "/activities/import" })} type="button">
            <Import className="mr-2 h-4 w-4" />
            Import FIT
          </Button>
        }
        description="Completed activities, manual imports, and links into deeper effort analysis."
        eyebrow="Activity history"
        title="Activities"
      />

      <Card>
        <CardHeader>
          <CardTitle>{total} saved activities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
              Recorded and imported activities will appear here.
            </div>
          ) : (
            activities.map((activity) => (
              <ActivityListCard
                key={activity.id}
                activity={activity}
                onOpen={() =>
                  void navigate({
                    to: "/activities/$activityId",
                    params: { activityId: activity.id },
                  })
                }
              />
            ))
          )}
          {activitiesQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                disabled={activitiesQuery.isFetchingNextPage}
                onClick={() => void activitiesQuery.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {activitiesQuery.isFetchingNextPage ? "Loading more..." : "Load more activities"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
