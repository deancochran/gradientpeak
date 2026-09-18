import { Badge } from "@repo/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import {
  DiscoveryExplorer,
  type WebDiscoverScope,
} from "../../components/discover/discovery-explorer";

const DISCOVERY_SCOPES = new Set<WebDiscoverScope>([
  "activityPlans",
  "trainingPlans",
  "routes",
  "users",
  "groups",
]);

export const Route = createFileRoute("/_protected/search")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; scope?: WebDiscoverScope; minDistanceKm?: string; maxDistanceKm?: string } => {
    const minDistanceKm = optionalNonnegativeNumber(search.minDistanceKm);
    const maxDistanceKm = optionalNonnegativeNumber(search.maxDistanceKm);
    return {
      ...(typeof search.q === "string" ? { q: search.q.slice(0, 80) } : {}),
      ...(typeof search.scope === "string" && DISCOVERY_SCOPES.has(search.scope as WebDiscoverScope)
        ? { scope: search.scope as WebDiscoverScope }
        : {}),
      ...(minDistanceKm !== undefined &&
      maxDistanceKm !== undefined &&
      minDistanceKm > maxDistanceKm
        ? {}
        : {
            ...(minDistanceKm !== undefined ? { minDistanceKm: String(minDistanceKm) } : {}),
            ...(maxDistanceKm !== undefined ? { maxDistanceKm: String(maxDistanceKm) } : {}),
          }),
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { maxDistanceKm, minDistanceKm, q, scope } = Route.useSearch();
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Compass className="h-5 w-5" />
          <Badge variant="outline">Discover</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Discover training, routes, profiles, and groups
        </h1>
        <p className="mt-2 text-muted-foreground">
          Search persisted activity plans, training plans, routes, profiles, and groups.
        </p>
      </header>
      <DiscoveryExplorer
        initialMaxDistanceKm={maxDistanceKm ?? ""}
        initialMinDistanceKm={minDistanceKm ?? ""}
        initialQuery={q ?? ""}
        {...(scope ? { initialScope: scope } : {})}
      />
    </div>
  );
}

function optionalNonnegativeNumber(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
