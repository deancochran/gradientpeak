import { Badge } from "@repo/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import { DiscoveryExplorer } from "../../components/discover/discovery-explorer";

export const Route = createFileRoute("/_protected/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : undefined,
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Compass className="h-5 w-5" />
          <Badge variant="outline">Discover</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Discover training and community</h1>
        <p className="mt-2 text-muted-foreground">
          Search persisted activity plans, training plans, routes, profiles, and groups.
        </p>
      </header>
      <DiscoveryExplorer initialQuery={q ?? ""} />
    </div>
  );
}
