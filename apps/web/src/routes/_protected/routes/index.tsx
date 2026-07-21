import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import {
  DetailPageIntro,
  RouteListCard,
} from "../../../components/protected/activity-route-primitives";
import {
  parseOptionalNonnegativeNumber,
  RouteLibraryControls,
  type RouteLibraryFilters,
  type RouteOwnerScope,
  type RouteSort,
  routeSortValues,
} from "../../../components/routes/route-library-controls";
import { api } from "../../../lib/api/client";

const ownerScopes: RouteOwnerScope[] = ["own", "public", "system", "all"];

export function validateRouteLibrarySearch(search: Record<string, unknown>) {
  const page = Number(search.page);
  return {
    search: typeof search.search === "string" ? search.search : "",
    ownerScope: ownerScopes.includes(search.ownerScope as RouteOwnerScope)
      ? (search.ownerScope as RouteOwnerScope)
      : "own",
    sort: routeSortValues.includes(search.sort as RouteSort)
      ? (search.sort as RouteSort)
      : "newest",
    minDistanceKm: parseOptionalNonnegativeNumber(search.minDistanceKm),
    maxDistanceKm: parseOptionalNonnegativeNumber(search.maxDistanceKm),
    minAscentM: parseOptionalNonnegativeNumber(search.minAscentM),
    maxAscentM: parseOptionalNonnegativeNumber(search.maxAscentM),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export const Route = createFileRoute("/_protected/routes/")({
  validateSearch: validateRouteLibrarySearch,
  component: RoutesLibraryPage,
});

const PAGE_SIZE = 12;

function toOptionalNumber(value: string, multiplier = 1) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * multiplier : undefined;
}

function RoutesLibraryPage() {
  const navigate = Route.useNavigate();
  const routeSearch = Route.useSearch();
  const filters: RouteLibraryFilters = routeSearch;
  const routesQuery = api.routes.list.useQuery({
    limit: PAGE_SIZE,
    cursor: routeSearch.page > 1 ? `index:${(routeSearch.page - 1) * PAGE_SIZE}` : undefined,
    ownerScope: routeSearch.ownerScope,
    search: routeSearch.search.trim() || undefined,
    sort_by: routeSearch.sort,
    min_distance_m: toOptionalNumber(routeSearch.minDistanceKm, 1000),
    max_distance_m: toOptionalNumber(routeSearch.maxDistanceKm, 1000),
    min_ascent_m: toOptionalNumber(routeSearch.minAscentM),
    max_ascent_m: toOptionalNumber(routeSearch.maxAscentM),
  });
  const routes = routesQuery.data?.items ?? [];

  const replaceFilters = (nextFilters: RouteLibraryFilters) =>
    void navigate({
      search: { ...nextFilters, page: 1 },
      replace: true,
    });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => void navigate({ to: "/routes/upload" })} type="button">
            <Upload className="mr-2 h-4 w-4" />
            Upload route
          </Button>
        }
        description="Search, compare, and reuse GPX, TCX, and XML routes for training and events."
        eyebrow="Route library"
        title="Routes"
      />

      <Card>
        <CardHeader>
          <CardTitle>Find a route</CardTitle>
        </CardHeader>
        <CardContent>
          <RouteLibraryControls
            filters={filters}
            onChange={replaceFilters}
            onClear={() =>
              replaceFilters({
                search: "",
                ownerScope: "own",
                sort: "newest",
                minDistanceKm: "",
                maxDistanceKm: "",
                minAscentM: "",
                maxAscentM: "",
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page {routeSearch.page}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {routesQuery.isLoading ? (
            <p className="py-10 text-center text-muted-foreground" role="status">
              Loading routes...
            </p>
          ) : routesQuery.isError ? (
            <div className="space-y-3 py-10 text-center" role="alert">
              <p className="text-destructive">Routes could not be loaded.</p>
              <Button onClick={() => void routesQuery.refetch()} type="button" variant="outline">
                Try again
              </Button>
            </div>
          ) : routes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
              No routes match these filters.
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
          {!routesQuery.isLoading && !routesQuery.isError ? (
            <nav aria-label="Route pages" className="flex items-center justify-between gap-3">
              <Button
                disabled={routeSearch.page === 1}
                onClick={() =>
                  void navigate({ search: { ...routeSearch, page: routeSearch.page - 1 } })
                }
                type="button"
                variant="outline"
              >
                Previous page
              </Button>
              <span className="text-sm text-muted-foreground">Page {routeSearch.page}</span>
              <Button
                disabled={!routesQuery.data?.nextCursor}
                onClick={() =>
                  void navigate({ search: { ...routeSearch, page: routeSearch.page + 1 } })
                }
                type="button"
                variant="outline"
              >
                Next page
              </Button>
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
