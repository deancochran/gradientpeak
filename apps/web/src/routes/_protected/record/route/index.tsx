import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2, Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../../../lib/api/client";
import { formatDistance, validateRecordingSearch } from "../../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/route/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordRoutePage,
});

function RecordRoutePage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const [searchText, setSearchText] = useState("");
  const routesQuery = api.routes.list.useInfiniteQuery(
    { limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const routes = useMemo(
    () => routesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [routesQuery.data?.pages],
  );

  const filteredRoutes = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return routes.filter((route) => {
      const matchesQuery =
        query.length === 0 ||
        route.name.toLowerCase().includes(query) ||
        route.description?.toLowerCase().includes(query);

      return Boolean(matchesQuery);
    });
  }, [routes, searchText]);

  const detachRoute = () => {
    void navigate({
      to: "/record",
      search: {
        ...launcher,
        routeId: undefined,
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Choose a route</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Preview any saved route before attaching it to the launcher.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/record" search={launcher}>
            Back to launcher
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Search your saved route library.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search routes"
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
          {launcher.routeId ? (
            <Button variant="ghost" className="px-0 text-destructive" onClick={detachRoute}>
              Detach current route
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {routesQuery.isLoading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!routesQuery.isLoading && routesQuery.error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <RouteIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Routes could not be loaded</p>
              <p className="text-sm text-muted-foreground">
                Try again after refreshing the page or come back once the route library is
                available.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!routesQuery.isLoading && !routesQuery.error && filteredRoutes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <RouteIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No matching routes</p>
              <p className="text-sm text-muted-foreground">
                Try a different filter or upload more routes when the route-library lane lands.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {filteredRoutes.map((route) => {
          const isSelected = launcher.routeId === route.id;

          return (
            <Card key={route.id} className={isSelected ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <CardTitle className="text-xl">{route.name}</CardTitle>
                    <CardDescription>
                      {route.description || "Saved route ready for preview and attachment."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{formatDistance(route.total_distance)}</Badge>
                    {isSelected ? <Badge>Attached</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Open the preview to confirm the route shape before attaching it to this session.
                </p>
                <Button asChild>
                  <Link
                    to="/record/route-preview/$routeId"
                    params={{ routeId: route.id }}
                    search={launcher}
                  >
                    {isSelected ? <Check className="mr-2 h-4 w-4" /> : null}
                    Preview route
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {routesQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void routesQuery.fetchNextPage()}
            disabled={routesQuery.isFetchingNextPage}
          >
            {routesQuery.isFetchingNextPage ? "Loading more routes..." : "Load more routes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
