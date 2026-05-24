import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import {
  DetailPageIntro,
  RouteListCard,
} from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/routes/")({
  component: RoutesLibraryPage,
});

function RoutesLibraryPage() {
  const navigate = Route.useNavigate();
  const routesQuery = api.routes.list.useInfiniteQuery(
    {
      limit: 20,
      ownerScope: "own",
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const routes = routesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => void navigate({ to: "/routes/upload" })} type="button">
            <Upload className="mr-2 h-4 w-4" />
            Upload GPX
          </Button>
        }
        description="Saved route library for your own training, reuse, and browser-native uploads."
        eyebrow="Route library"
        title="Routes"
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {routes.length}
            {routesQuery.hasNextPage ? "+" : ""} routes loaded
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {routes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
              Upload a GPX route to start building your route library.
            </div>
          ) : (
            routes.map((route) => (
              <RouteListCard
                key={route.id}
                onOpen={() =>
                  void navigate({
                    to: "/routes/$routeId",
                    params: { routeId: route.id },
                  })
                }
                route={route}
              />
            ))
          )}
          {routesQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                disabled={routesQuery.isFetchingNextPage}
                onClick={() => void routesQuery.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {routesQuery.isFetchingNextPage ? "Loading more..." : "Load more routes"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
