import { MAX_ROUTE_LIST_OFFSET } from "@repo/core/route-files";
import { Button } from "@repo/ui/components/button";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { ErrorStateCard } from "@repo/ui/components/error-state-card";
import { InlineLoadingStatus } from "@repo/ui/components/loading";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { loadRouteQuery } from "../../../lib/api/route-loading";

const ownerScopes: RouteOwnerScope[] = ["own", "public", "system", "all"];

export function validateRouteLibrarySearch(search: Record<string, unknown>) {
  const page = Number(search.page);
  const maxPage = Math.floor(MAX_ROUTE_LIST_OFFSET / PAGE_SIZE) + 1;
  const minDistanceKm = parseOptionalNonnegativeNumber(search.minDistanceKm);
  const maxDistanceKm = parseOptionalNonnegativeNumber(search.maxDistanceKm);
  const minAscentM = parseOptionalNonnegativeNumber(search.minAscentM);
  const maxAscentM = parseOptionalNonnegativeNumber(search.maxAscentM);
  return {
    search: typeof search.search === "string" ? search.search : "",
    ownerScope: ownerScopes.includes(search.ownerScope as RouteOwnerScope)
      ? (search.ownerScope as RouteOwnerScope)
      : "own",
    sort: routeSortValues.includes(search.sort as RouteSort)
      ? (search.sort as RouteSort)
      : "newest",
    minDistanceKm:
      minDistanceKm && maxDistanceKm && Number(minDistanceKm) > Number(maxDistanceKm)
        ? ""
        : minDistanceKm,
    maxDistanceKm:
      minDistanceKm && maxDistanceKm && Number(minDistanceKm) > Number(maxDistanceKm)
        ? ""
        : maxDistanceKm,
    minAscentM:
      minAscentM && maxAscentM && Number(minAscentM) > Number(maxAscentM) ? "" : minAscentM,
    maxAscentM:
      minAscentM && maxAscentM && Number(minAscentM) > Number(maxAscentM) ? "" : maxAscentM,
    page: Number.isInteger(page) && page > 0 && page <= maxPage ? page : 1,
  };
}

export const Route = createFileRoute("/_protected/routes/")({
  validateSearch: validateRouteLibrarySearch,
  loaderDeps: ({ search }) => ({
    maxAscentM: search.maxAscentM,
    maxDistanceKm: search.maxDistanceKm,
    minAscentM: search.minAscentM,
    minDistanceKm: search.minDistanceKm,
    ownerScope: search.ownerScope,
    page: search.page,
    search: search.search,
    sort: search.sort,
  }),
  loader: ({ context, deps }) => {
    const input = getRouteListInput(deps);
    return loadRouteQuery(
      () => context.apiUtils.routes.list.getData(input),
      () => context.apiUtils.routes.list.fetch(input),
    );
  },
  component: RoutesLibraryPage,
});

const PAGE_SIZE = 12;

function toOptionalNumber(value: string, multiplier = 1) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * multiplier : undefined;
}

function getRouteListInput(search: ReturnType<typeof validateRouteLibrarySearch>) {
  return {
    limit: PAGE_SIZE,
    cursor: search.page > 1 ? `index:${(search.page - 1) * PAGE_SIZE}` : undefined,
    ownerScope: search.ownerScope,
    search: search.search.trim() || undefined,
    sort_by: search.sort,
    min_distance_m: toOptionalNumber(search.minDistanceKm, 1000),
    max_distance_m: toOptionalNumber(search.maxDistanceKm, 1000),
    min_ascent_m: toOptionalNumber(search.minAscentM),
    max_ascent_m: toOptionalNumber(search.maxAscentM),
  };
}

function RoutesLibraryPage() {
  const navigate = Route.useNavigate();
  const routeSearch = Route.useSearch();
  const filters: RouteLibraryFilters = routeSearch;
  const routesQuery = api.routes.list.useQuery(getRouteListInput(routeSearch));
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
        description="Manage routes in your library. Use Discover to search routes shared by the wider community."
        title="Routes"
      />

      <Link
        className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
        search={{ scope: "routes" }}
        to="/search"
      >
        Discover shared routes
      </Link>

      <section aria-label="Find a route">
        <h2 className="mb-3 text-sm font-medium">Find a route</h2>
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
      </section>

      <section aria-label="Route results" className="space-y-4">
        {routesQuery.isLoading ? (
          <InlineLoadingStatus label="Loading routes..." />
        ) : routesQuery.isError ? (
          <ErrorStateCard
            compact
            title="Routes could not be loaded."
            onRetry={() => void routesQuery.refetch()}
            retryLabel="Try again"
          />
        ) : routes.length === 0 ? (
          <EmptyStateCard compact title="No routes match these filters." />
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
      </section>
    </div>
  );
}
